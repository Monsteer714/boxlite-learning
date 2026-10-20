import { randomUUID } from 'node:crypto'
import { DataSource, QueryRunner } from 'typeorm'
import { AddSecretStore1791200000000 } from './1791200000000-add-secret-store-migration'
import { AddSecretVersions1791300000000 } from './1791300000000-add-secret-versions-migration'

const describeIfDatabase = process.env.DB_HOST ? describe : describe.skip
const schemaName = `secret_versions_${process.pid}_${randomUUID().replaceAll('-', '')}`

const ORG_ID = randomUUID()

describeIfDatabase('AddSecretVersions1791300000000 (integration, real Postgres)', () => {
  let dataSource: DataSource
  let queryRunner: QueryRunner
  const migration = new AddSecretVersions1791300000000()

  const columns = async (table: string): Promise<string[]> =>
    (
      await queryRunner.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY column_name`,
        [schemaName, table],
      )
    ).map((column: { column_name: string }) => column.column_name)

  const insertSecret = async (): Promise<string> => {
    const [{ id }] = await queryRunner.query(
      `INSERT INTO "secret" ("organizationId", "name", "hosts", "currentVersion") VALUES ($1, 'openai', ARRAY['api.openai.com'], 1) RETURNING "id"`,
      [ORG_ID],
    )
    return id
  }

  const insertVersion = (secretId: string, version: number) =>
    queryRunner.query(`INSERT INTO "secret_version" ("secretId", "version", "value") VALUES ($1, $2, 'enc:v1:x')`, [
      secretId,
      version,
    ])

  beforeAll(async () => {
    dataSource = await new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      entities: [],
      synchronize: false,
    }).initialize()
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`)
    queryRunner = dataSource.createQueryRunner()
    await queryRunner.connect()
    // `public` stays on the path for `uuid_generate_v4`, which the uuid-ossp
    // extension installs there.
    await queryRunner.query(`SET search_path TO "${schemaName}", public`)
    await new AddSecretStore1791200000000().up(queryRunner)
    await migration.up(queryRunner)
  })

  afterAll(async () => {
    if (!dataSource?.isInitialized) return
    try {
      await queryRunner?.release()
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
    } finally {
      await dataSource.destroy()
    }
  })

  beforeEach(() => queryRunner.query(`DELETE FROM "secret"`))

  it('moves the value off the secret row and onto its versions', async () => {
    expect(await columns('secret')).not.toContain('value')
    expect(await columns('secret')).toContain('currentVersion')
    expect(await columns('secret_version')).toEqual(['createdAt', 'createdBy', 'secretId', 'value', 'version'])
  })

  it('refuses a second row for the same version of a secret', async () => {
    const id = await insertSecret()
    await insertVersion(id, 1)

    await expect(insertVersion(id, 1)).rejects.toMatchObject({ code: '23505' })
  })

  it('refuses a version of a secret that does not exist', async () => {
    await expect(insertVersion(randomUUID(), 1)).rejects.toMatchObject({
      code: '23503',
      constraint: 'secret_version_secretId_fk',
    })
  })

  it('deletes every version with its secret', async () => {
    const id = await insertSecret()
    await insertVersion(id, 1)
    await insertVersion(id, 2)

    await queryRunner.query(`DELETE FROM "secret" WHERE "id" = $1`, [id])

    const [{ count }] = await queryRunner.query(`SELECT count(*)::int AS count FROM "secret_version"`)
    expect(count).toBe(0)
  })

  it('refuses to run over a secret row rather than drop its value', async () => {
    await migration.down(queryRunner)
    try {
      await queryRunner.query(
        `INSERT INTO "secret" ("organizationId", "name", "hosts", "value") VALUES ($1, 'openai', ARRAY['api.openai.com'], 'enc:v1:x')`,
        [ORG_ID],
      )

      // In a transaction, as TypeORM runs migrations, so the failed up leaves
      // nothing behind.
      await queryRunner.startTransaction()
      try {
        await expect(migration.up(queryRunner)).rejects.toMatchObject({ code: '23502' })
      } finally {
        await queryRunner.rollbackTransaction()
      }
    } finally {
      await queryRunner.query(`DELETE FROM "secret"`)
      await migration.up(queryRunner)
    }
  })

  it('restores the single-value store on rollback', async () => {
    await migration.down(queryRunner)
    try {
      expect(await columns('secret')).toContain('value')
      expect(await columns('secret')).not.toContain('currentVersion')
      expect(await columns('secret_version')).toEqual([])
    } finally {
      await migration.up(queryRunner)
    }
  })
})
