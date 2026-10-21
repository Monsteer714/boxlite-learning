/*
 * Copyright 2026 BoxLite AI
 * SPDX-License-Identifier: AGPL-3.0
 */

import { PATH_METADATA } from '@nestjs/common/constants'
import { Reflector } from '@nestjs/core'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { AUDIT_CONTEXT_KEY, AuditContext } from '../audit/decorators/audit.decorator'
import { SecretsService } from '../secret/services/secrets.service'
import { BoxliteSecretController } from './boxlite-secret.controller'
import { CreateSecretDto, UpdateSecretDto } from './dto/secret.dto'

const reflector = new Reflector()
const route = (name: keyof BoxliteSecretController) => BoxliteSecretController.prototype[name]
const VALUE = 'sk-not-a-real-key'
const BODY = { name: 'openai', value: VALUE, hosts: ['api.openai.com'], placeholder: '<OPENAI>' }

describe('BoxliteSecretController', () => {
  const createdAt = new Date('2026-10-20T00:00:00.000Z')
  const caller = { organizationId: 'org-1', userId: 'user-1' } as never
  // A row as the repository holds it, with the fields an answer must not carry.
  const row = {
    id: '0aaa0000-0000-4000-8000-000000000001',
    organizationId: 'org-1',
    name: 'openai',
    hosts: ['api.openai.com'],
    placeholder: null,
    currentVersion: 2,
    createdBy: 'user-1',
    createdAt,
    updatedAt: createdAt,
  }
  const answered = {
    name: 'openai',
    hosts: ['api.openai.com'],
    placeholder: null,
    current_version: 2,
    created_by: 'user-1',
    created_at: createdAt.toISOString(),
    updated_at: createdAt.toISOString(),
  }

  function createController() {
    const secrets = {
      list: jest.fn().mockResolvedValue([row]),
      create: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue(row),
      delete: jest.fn().mockResolvedValue(undefined),
    }
    return { controller: new BoxliteSecretController(secrets as unknown as SecretsService), secrets }
  }

  const auditedBody = (name: 'create' | 'update', request: { body: unknown; params?: unknown }) =>
    reflector.get<AuditContext>(AUDIT_CONTEXT_KEY, route(name)).requestMetadata?.body(request as never)

  it('is mounted with and without a routing prefix, like the other box API routes', () => {
    expect(Reflect.getMetadata(PATH_METADATA, BoxliteSecretController)).toEqual(['v1/secrets', 'v1/:prefix/secrets'])
  })

  it('lists secrets in snake_case without an id or value', async () => {
    const { controller, secrets } = createController()

    await expect(controller.list(caller)).resolves.toEqual({ secrets: [answered] })
    expect(secrets.list).toHaveBeenCalledWith('org-1')
  })

  it('stores a secret for the caller and answers without its value', async () => {
    const { controller, secrets } = createController()

    const created = await controller.create(caller, plainToInstance(CreateSecretDto, BODY))

    expect(secrets.create).toHaveBeenCalledWith('org-1', 'user-1', expect.objectContaining({ value: VALUE }))
    expect(created).toEqual(answered)
  })

  it('passes a change through by name, with the caller as the version creator', async () => {
    const { controller, secrets } = createController()

    await controller.update(caller, 'openai', plainToInstance(UpdateSecretDto, { value: VALUE }))

    expect(secrets.update).toHaveBeenCalledWith('org-1', 'openai', 'user-1', expect.objectContaining({ value: VALUE }))
  })

  it.each(['create', 'update'] as const)('records %s without the value', (name) => {
    const recorded = auditedBody(name, { body: BODY, params: { name: 'openai' } })

    expect(recorded).toEqual({ name: 'openai', hosts: ['api.openai.com'], placeholder: '<OPENAI>' })
    expect(JSON.stringify(recorded)).not.toContain(VALUE)
  })

  it('names the secret from the path when an update body has no name', () => {
    expect(auditedBody('update', { body: { value: VALUE }, params: { name: 'openai' } })).toMatchObject({
      name: 'openai',
    })
  })

  // The global ValidationPipe keeps unknown fields, so an update body can
  // carry a name; the route changes the secret in the path.
  it('names the secret from the path even when an update body names another', () => {
    expect(auditedBody('update', { body: { name: 'other', value: VALUE }, params: { name: 'openai' } })).toMatchObject({
      name: 'openai',
    })
  })

  describe('request bodies', () => {
    const errorsOf = async (dto: new () => object, body: object) =>
      (await validate(plainToInstance(dto, body))).flatMap((error) => Object.values(error.constraints ?? {}))

    it('accepts a secret with a name, value and hosts', async () => {
      await expect(errorsOf(CreateSecretDto, BODY)).resolves.toEqual([])
    })

    it.each([
      ['no hosts', { ...BODY, hosts: [] }],
      ['an empty host', { ...BODY, hosts: [''] }],
      ['an empty placeholder', { ...BODY, placeholder: '' }],
      ['an empty value', { ...BODY, value: '' }],
    ])('refuses %s', async (_case, body) => {
      await expect(errorsOf(CreateSecretDto, body)).resolves.not.toEqual([])
    })

    it('refuses an update that empties the hosts', async () => {
      await expect(errorsOf(UpdateSecretDto, { hosts: [] })).resolves.not.toEqual([])
    })

    // `null` is not "leave unchanged": it would reach a NOT NULL column or the
    // cipher, so it is a 400 like any other bad input.
    it.each(['value', 'hosts', 'placeholder'])('refuses an update that sets %s to null', async (field) => {
      await expect(errorsOf(UpdateSecretDto, { [field]: null })).resolves.not.toEqual([])
    })

    it('never repeats the value in a refusal', async () => {
      const messages = await errorsOf(CreateSecretDto, { ...BODY, hosts: [], name: '' })

      expect(messages).not.toEqual([])
      expect(messages.join('\n')).not.toContain(VALUE)
    })
  })
})
