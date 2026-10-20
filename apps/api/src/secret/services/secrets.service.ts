/*
 * Copyright 2026 BoxLite AI
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { Repository } from 'typeorm'
import { SecretCipher } from '../../encryption/secret-cipher'
import { SecretVersion } from '../entities/secret-version.entity'
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

/** Ties a sealed value to its secret and version, so a value copied elsewhere fails to open. */
export function secretVersionContext(secretId: string, version: number): string {
  return `secret:${secretId}:version:${version}`
}

/**
 * An organization's stored secrets. A value is sealed the moment it arrives
 * and is never returned: each value is a version row of its own, and what
 * comes back, and what can be listed, is the secret row, which has no value.
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
      await this.secrets.manager.transaction(async (manager) => {
        await manager.insert(Secret, {
          id,
          organizationId,
          name: params.name,
          hosts: params.hosts,
          placeholder: params.placeholder ?? null,
          currentVersion: 1,
          createdBy,
        })
        await manager.insert(SecretVersion, this.sealedVersion(id, 1, params.value, createdBy))
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

  /** A new value becomes the next version; hosts and placeholder change in place. */
  async update(
    organizationId: string,
    name: string,
    updatedBy: string | null,
    params: UpdateSecretParams,
  ): Promise<Secret> {
    return this.secrets.manager.transaction(async (manager) => {
      // Locked so two concurrent updates cannot both claim the next version.
      const secret = await manager.findOne(Secret, {
        where: { organizationId, name },
        lock: { mode: 'pessimistic_write' },
      })
      if (!secret) {
        throw new NotFoundException(`Secret ${name} not found`)
      }
      if (params.value !== undefined) {
        const version = secret.currentVersion + 1
        await manager.insert(SecretVersion, this.sealedVersion(secret.id, version, params.value, updatedBy))
        secret.currentVersion = version
      }
      if (params.hosts !== undefined) {
        secret.hosts = params.hosts
      }
      if (params.placeholder !== undefined) {
        secret.placeholder = params.placeholder
      }
      return manager.save(Secret, secret)
    })
  }

  /** Removes the secret and, by cascade, every version of it. */
  async delete(organizationId: string, name: string): Promise<void> {
    const result = await this.secrets.delete({ organizationId, name })
    if (!result.affected) {
      throw new NotFoundException(`Secret ${name} not found`)
    }
  }

  private sealedVersion(
    secretId: string,
    version: number,
    value: string,
    createdBy: string | null,
  ): Partial<SecretVersion> {
    return {
      secretId,
      version,
      value: this.cipher.seal(value, secretVersionContext(secretId, version)),
      createdBy,
    }
  }
}
