/*
 * Copyright 2026 BoxLite AI
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EncryptionModule } from '../encryption/encryption.module'
import { SecretVersion } from './entities/secret-version.entity'
import { Secret } from './entities/secret.entity'
import { SecretsService } from './services/secrets.service'

// An organization's stored secrets. The entities are registered here because
// the app uses `autoLoadEntities`; EncryptionModule provides the cipher that
// seals each value.
@Module({
  imports: [EncryptionModule, TypeOrmModule.forFeature([Secret, SecretVersion])],
  providers: [SecretsService],
  exports: [SecretsService],
})
export class SecretModule {}
