/*
 * Copyright 2026 BoxLite AI
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Global, Module } from '@nestjs/common'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { TypedConfigService } from '../../config/typed-config.service'
import { EncryptionModule } from '../../encryption/encryption.module'
import { SecretCipher } from '../../encryption/secret-cipher'
import { BoxModule } from '../box.module'
import { Job } from '../entities/job.entity'
import { BoxRepository } from '../repositories/box.repository'
import { JobService } from '../services/job.service'
import { RunnerAdapterFactory } from './runnerAdapter'

const settings: Record<string, string> = { 'encryption.key': 'test-encryption-key', 'encryption.salt': 'test-salt' }

// TypedConfigModule is global in the app, so EncryptionModule's factory finds
// the config service without importing it.
@Global()
@Module({
  providers: [
    {
      provide: TypedConfigService,
      useValue: { get: (key: string) => settings[key], getOrThrow: (key: string) => settings[key] },
    },
  ],
  exports: [TypedConfigService],
})
class TestConfigModule {}

// The factory builds adapters with ModuleRef.create, so a SecretCipher that
// BoxModule cannot resolve fails every box create and recover at run time,
// not at boot.
describe('RunnerAdapterFactory', () => {
  it.each(['0', '2'])('builds a v%s adapter with the configured secret cipher', async (apiVersion) => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestConfigModule, EncryptionModule],
      providers: [
        RunnerAdapterFactory,
        { provide: BoxRepository, useValue: {} },
        { provide: getRepositoryToken(Job), useValue: {} },
        { provide: JobService, useValue: {} },
      ],
    }).compile()

    const adapter = await moduleRef
      .get(RunnerAdapterFactory)
      .create({ apiVersion, apiUrl: 'http://runner.invalid', apiKey: 'key' } as any)

    const sealed = SecretCipher.fromSettings('test-encryption-key', 'test-salt').seal('sk-test', 'aad')
    expect((adapter as any).secretCipher.open(sealed, 'aad')).toBe('sk-test')
  })

  it('is provided by a module that imports EncryptionModule', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BoxModule)).toContain(RunnerAdapterFactory)
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, BoxModule)).toContain(EncryptionModule)
  })
})
