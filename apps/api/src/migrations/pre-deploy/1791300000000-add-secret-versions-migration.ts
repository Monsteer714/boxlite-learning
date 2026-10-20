import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSecretVersions1791300000000 implements MigrationInterface {
  name = 'AddSecretVersions1791300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "secret_version" ("secretId" uuid NOT NULL, "version" integer NOT NULL, "value" text NOT NULL, "createdBy" character varying, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "secret_version_secretId_version_pk" PRIMARY KEY ("secretId", "version"), CONSTRAINT "secret_version_secretId_fk" FOREIGN KEY ("secretId") REFERENCES "secret"("id") ON DELETE CASCADE)`,
    )
    // No route writes `secret` before this release, so the table is empty and
    // the value moves without a backfill. Should a row exist, the NOT NULL
    // column below fails the migration rather than drop its value.
    await queryRunner.query(`ALTER TABLE "secret" ADD "currentVersion" integer NOT NULL`)
    await queryRunner.query(`ALTER TABLE "secret" DROP COLUMN "value"`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // A version's value is sealed to that version, so the single-value store
    // could not open it. Like up, this fails rather than lose a row's value.
    await queryRunner.query(`ALTER TABLE "secret" ADD "value" text NOT NULL`)
    await queryRunner.query(`ALTER TABLE "secret" DROP COLUMN "currentVersion"`)
    await queryRunner.query(`DROP TABLE "secret_version"`)
  }
}
