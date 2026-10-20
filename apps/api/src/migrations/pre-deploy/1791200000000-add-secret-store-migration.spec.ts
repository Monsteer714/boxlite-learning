import { randomUUID } from 'node:crypto'
import { DataSource, QueryRunner } from 'typeorm'
import { AddSecretStore1791200000000 } from './1791200000000-add-secret-store-migration'

const describeIfDatabase = process.env.DB_HOST ? describe : describe.skip
const schemaName = `secret_store_${process.pid}_${randomUUID().replaceAll('-', '')}`

const ORG_ID = randomUUID()
const OTHER_ORG_ID = randomUUID()

describeIfDatabase('AddSecretStore1791200000000 (integration, real Postgres)', () => {
  let dataSource: DataSource
  let queryRunner: QueryRunner
  const migration = new AddSecretStore1791200000000()

  const insert = (row: { organizationId?: string; name?: string }) =>
    queryRunner.query(
      `INSERT INTO "secret" ("organizationId", "name", "hosts", "value") VALUES ($1, $2, ARRAY['api.openai.com'], 'enc:v1:x')`,
      [row.organizationId ?? ORG_ID, row.name ?? 'openai'],
    )

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

  it('refuses a second secret with the same name in one organization', async () => {
    await insert({})

    await expect(insert({})).rejects.toMatchObject({ code: '23505', constraint: 'secret_org_name_unique' })
  })

  it('allows the same name in another organization', async () => {
    await insert({})
    await insert({ organizationId: OTHER_ORG_ID })

    const [{ count }] = await queryRunner.query(`SELECT count(*)::int AS count FROM "secret"`)
    expect(count).toBe(2)
  })

  it('stores hosts as an array and leaves placeholder and createdBy optional', async () => {
    await insert({})

    const [row] = await queryRunner.query(`SELECT "hosts", "placeholder", "createdBy" FROM "secret"`)
    expect(row).toEqual({ hosts: ['api.openai.com'], placeholder: null, createdBy: null })
  })

  it('removes the table on rollback', async () => {
    await migration.down(queryRunner)
    try {
      const remaining = await queryRunner.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'secret'`,
        [schemaName],
      )
      expect(remaining).toEqual([])
    } finally {
      await migration.up(queryRunner)
    }
  })
})
