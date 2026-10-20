/*
 * Copyright 2026 BoxLite AI
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { Repository } from 'typeorm'
import { SecretCipher } from '../../encryption/secret-cipher'
import { Secret } from '../entities/secret.entity'

const PG_UNIQUE_VIOLATION = '23505'

export interface CreateSecretParams {
  name: string
  value: string
  hosts: string[]
  placeholder?: string
}

export interface UpdateSecretParams {
  value?: string
  hosts?: string[]
  placeholder?: string | null
}

/** Ties a sealed value to its secret, so a value copied to another row fails to open. */
export function secretContext(secretId: string): string {
  return `secret:${secretId}`
}

/**
 * An organization's stored secrets. A value is sealed the moment it arrives
 * and is never returned: the value column is left out of every load.
 */
@Injectable()
export class SecretsService {
  constructor(
    @InjectRepository(Secret)
    private readonly secrets: Repository<Secret>,
    private readonly cipher: SecretCipher,
  ) {}

  list(organizationId: string): Promise<Secret[]> {
    return this.secrets.find({ where: { organizationId }, order: { name: 'ASC' } })
  }

  async create(organizationId: string, createdBy: string | null, params: CreateSecretParams): Promise<Secret> {
    const id = randomUUID()
    try {
      await this.secrets.insert({
        id,
        organizationId,
        name: params.name,
        hosts: params.hosts,
        placeholder: params.placeholder ?? null,
        value: this.cipher.seal(params.value, secretContext(id)),
        createdBy,
      })
    } catch (error) {
      if ((error as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException({
          message: `A secret named ${params.name} already exists; update it instead`,
          code: 'already_exists',
        })
      }
      throw error
    }
    return this.secrets.findOneByOrFail({ id })
  }

  async update(organizationId: string, name: string, params: UpdateSecretParams): Promise<Secret> {
    const secret = await this.secrets.findOneBy({ organizationId, name })
    if (!secret) {
      throw new NotFoundException(`Secret ${name} not found`)
    }
    const changes: Partial<Secret> = {}
    if (params.value !== undefined) {
      changes.value = this.cipher.seal(params.value, secretContext(secret.id))
    }
    if (params.hosts !== undefined) {
      changes.hosts = params.hosts
    }
    if (params.placeholder !== undefined) {
      changes.placeholder = params.placeholder
    }
    // TypeORM refuses an update with nothing to set.
    if (Object.keys(changes).length === 0) {
      return secret
    }
    await this.secrets.update({ id: secret.id }, changes)
    return this.secrets.findOneByOrFail({ id: secret.id })
  }

  async delete(organizationId: string, name: string): Promise<void> {
    const result = await this.secrets.delete({ organizationId, name })
    if (!result.affected) {
      throw new NotFoundException(`Secret ${name} not found`)
    }
  }
}
