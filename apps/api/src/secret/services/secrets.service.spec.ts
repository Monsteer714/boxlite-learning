/*
 * Copyright 2026 BoxLite AI
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ConflictException, NotFoundException } from '@nestjs/common'
import { Repository } from 'typeorm'
import { SecretCipher } from '../../encryption/secret-cipher'
import { SecretVersion } from '../entities/secret-version.entity'
import { Secret } from '../entities/secret.entity'
import { SecretsService, secretVersionContext } from './secrets.service'

const ORG = '0aaa0000-0000-4000-8000-000000000001'
const cipher = SecretCipher.fromSettings('test-encryption-key', 'test-salt')

function build(stored: Partial<Secret> | null = null) {
  const manager = {
    insert: jest.fn<Promise<void>, [unknown, unknown]>(async () => undefined),
    findOne: jest.fn(async () => (stored ? { ...stored } : null)),
    save: jest.fn(async (_entity: unknown, row: unknown) => row),
  }
  const secrets = {
    find: jest.fn(async () => []),
    findOneByOrFail: jest.fn(async ({ id }: { id: string }) => ({ id })),
    delete: jest.fn(async () => ({ affected: stored ? 1 : 0 })),
    manager: { transaction: jest.fn(async (callback: (m: typeof manager) => unknown) => callback(manager)) },
  }
  const service = new SecretsService(secrets as unknown as Repository<Secret>, cipher)
  const inserted = (entity: unknown) =>
    manager.insert.mock.calls.filter(([target]) => target === entity).map(([, row]) => row as Record<string, unknown>)
  return { service, manager, secrets, inserted }
}

describe('SecretsService', () => {
  describe('create', () => {
    it('stores version 1 sealed to that version and keeps the value off the secret row', async () => {
      const { service, inserted } = build()

      await service.create(ORG, 'user-1', { name: 'openai', value: 'sk-test', hosts: ['api.openai.com'] })

      const [secret] = inserted(Secret)
      expect(secret).toMatchObject({ organizationId: ORG, name: 'openai', currentVersion: 1, placeholder: null })
      expect(secret).not.toHaveProperty('value')
      const [version] = inserted(SecretVersion)
      expect(version).toMatchObject({ secretId: secret.id, version: 1, createdBy: 'user-1' })
      expect(SecretCipher.isSealed(version.value as string)).toBe(true)
      expect(cipher.open(version.value as string, secretVersionContext(secret.id as string, 1))).toBe('sk-test')
    })

    it('answers a taken name with 409 already_exists', async () => {
      const { service, manager } = build()
      manager.insert.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }))

      const created = service.create(ORG, null, { name: 'openai', value: 'sk-test', hosts: ['api.openai.com'] })

      await expect(created).rejects.toBeInstanceOf(ConflictException)
      await expect(created).rejects.toMatchObject({ response: { code: 'already_exists' } })
    })
  })

  describe('update', () => {
    const stored = { id: 'secret-1', organizationId: ORG, name: 'openai', hosts: ['api.openai.com'], currentVersion: 1 }

    it('adds a new value as the next version and makes it current', async () => {
      const { service, manager, inserted } = build(stored)

      const updated = await service.update(ORG, 'openai', 'user-2', { value: 'sk-rotated' })

      const [version] = inserted(SecretVersion)
      expect(version).toMatchObject({ secretId: 'secret-1', version: 2, createdBy: 'user-2' })
      expect(SecretCipher.isSealed(version.value as string)).toBe(true)
      expect(cipher.open(version.value as string, secretVersionContext('secret-1', 2))).toBe('sk-rotated')
      expect(updated.currentVersion).toBe(2)
      expect(manager.findOne).toHaveBeenCalledWith(
        Secret,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      )
    })

    it('changes hosts in place without adding a version', async () => {
      const { service, inserted } = build(stored)

      const updated = await service.update(ORG, 'openai', null, { hosts: ['*.openai.com'] })

      expect(inserted(SecretVersion)).toHaveLength(0)
      expect(updated).toMatchObject({ hosts: ['*.openai.com'], currentVersion: 1 })
    })

    it('adds no version and keeps the secret when nothing is given', async () => {
      const { service, inserted } = build(stored)

      const updated = await service.update(ORG, 'openai', null, {})

      expect(inserted(SecretVersion)).toHaveLength(0)
      expect(updated).toMatchObject({ id: 'secret-1', currentVersion: 1 })
    })

    it('answers an unknown name with 404', async () => {
      const { service } = build()

      await expect(service.update(ORG, 'missing', null, { value: 'x' })).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('delete', () => {
    it('answers an unknown name with 404', async () => {
      const { service } = build()

      await expect(service.delete(ORG, 'missing')).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})
