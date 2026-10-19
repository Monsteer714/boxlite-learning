/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { EncryptionService } from './encryption.service'
import { SecretCipher } from './secret-cipher'
import { TypedConfigService } from '../config/typed-config.service'

@Module({
  providers: [
    EncryptionService,
    {
      provide: SecretCipher,
      inject: [TypedConfigService],
      useFactory: (config: TypedConfigService) =>
        SecretCipher.fromSettings(config.get('encryption.key'), config.get('encryption.salt')),
    },
  ],
  exports: [EncryptionService, SecretCipher],
})
export class EncryptionModule {}
