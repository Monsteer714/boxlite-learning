import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSecretStore1791200000000 implements MigrationInterface {
  name = 'AddSecretStore1791200000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // A new table, so the running API ignores it. `value` holds SecretCipher
    // ciphertext only.
    await queryRunner.query(
      `CREATE TABLE "secret" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organizationId" uuid NOT NULL, "name" character varying(255) NOT NULL, "hosts" text array NOT NULL, "placeholder" character varying(255), "value" text NOT NULL, "createdBy" character varying, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "secret_id_pk" PRIMARY KEY ("id"))`,
    )
    await queryRunner.query(`CREATE UNIQUE INDEX "secret_org_name_unique" ON "secret" ("organizationId", "name")`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "secret_org_name_unique"`)
    await queryRunner.query(`DROP TABLE "secret"`)
  }
}
