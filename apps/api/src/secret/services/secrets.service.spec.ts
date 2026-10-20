/*
 * Copyright 2026 BoxLite AI
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ConflictException, NotFoundException } from '@nestjs/common'
import { getMetadataArgsStorage, Repository } from 'typeorm'
import { SecretCipher } from '../../encryption/secret-cipher'
import { Secret } from '../entities/secret.entity'
import { SecretsService, secretContext } from './secrets.service'

const ORG = '0aaa0000-0000-4000-8000-000000000001'
const cipher = SecretCipher.fromSettings('test-encryption-key', 'test-salt')

function build(stored: Partial<Secret> | null = null) {
  const secrets = {
    find: jest.fn(async () => []),
    findOneBy: jest.fn(async () => (stored ? { ...stored } : null)),
    findOneByOrFail: jest.fn(async ({ id }: { id: string }) => ({ id })),
    insert: jest.fn<Promise<void>, [Record<string, unknown>]>(async () => undefined),
    update: jest.fn<Promise<void>, [unknown, Record<string, unknown>]>(async () => undefined),
    delete: jest.fn(async () => ({ affected: stored ? 1 : 0 })),
  }
  const service = new SecretsService(secrets as unknown as Repository<Secret>, cipher)
  return { service, secrets }
}

describe('SecretsService', () => {
  it('never loads the value column unless a query asks for it', () => {
    const column = getMetadataArgsStorage().columns.find((c) => c.target === Secret && c.propertyName === 'value')

    expect(column?.options.select).toBe(false)
  })

  describe('create', () => {
    it('stores the value sealed to the new secret', async () => {
      const { service, secrets } = build()

      await service.create(ORG, 'user-1', { name: 'openai', value: 'sk-test', hosts: ['api.openai.com'] })

      const [row] = secrets.insert.mock.calls[0]
      expect(row).toMatchObject({ organizationId: ORG, name: 'openai', placeholder: null, createdBy: 'user-1' })
      expect(SecretCipher.isSealed(row.value as string)).toBe(true)
      expect(cipher.open(row.value as string, secretContext(row.id as string))).toBe('sk-test')
    })

    it('answers a taken name with 409 already_exists', async () => {
      const { service, secrets } = build()
      secrets.insert.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }))

      const created = service.create(ORG, null, { name: 'openai', value: 'sk-test', hosts: ['api.openai.com'] })

      await expect(created).rejects.toBeInstanceOf(ConflictException)
      await expect(created).rejects.toMatchObject({ response: { code: 'already_exists' } })
    })
  })

  describe('update', () => {
    const stored = { id: 'secret-1', organizationId: ORG, name: 'openai', hosts: ['api.openai.com'] }

    it('seals a new value to the same secret', async () => {
      const { service, secrets } = build(stored)

      await service.update(ORG, 'openai', { value: 'sk-rotated' })

      const [, changes] = secrets.update.mock.calls[0]
      expect(SecretCipher.isSealed(changes.value as string)).toBe(true)
      expect(cipher.open(changes.value as string, secretContext('secret-1'))).toBe('sk-rotated')
    })

    it('changes hosts without touching the value', async () => {
      const { service, secrets } = build(stored)

      await service.update(ORG, 'openai', { hosts: ['*.openai.com'] })

      expect(Object.keys(secrets.update.mock.calls[0][1])).toEqual(['hosts'])
    })

    it('returns the secret unchanged when nothing is given', async () => {
      const { service, secrets } = build(stored)

      await expect(service.update(ORG, 'openai', {})).resolves.toMatchObject({ id: 'secret-1' })
      expect(secrets.update).not.toHaveBeenCalled()
    })

    it('answers an unknown name with 404', async () => {
      const { service } = build()

      await expect(service.update(ORG, 'missing', { value: 'x' })).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('delete', () => {
    it('answers an unknown name with 404', async () => {
      const { service } = build()

      await expect(service.delete(ORG, 'missing')).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})
