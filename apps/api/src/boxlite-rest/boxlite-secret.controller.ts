/*
 * Copyright 2026 BoxLite AI
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { Audit, TypedRequest } from '../audit/decorators/audit.decorator'
import { AuditAction } from '../audit/enums/audit-action.enum'
import { AuditTarget } from '../audit/enums/audit-target.enum'
import { CombinedAuthGuard } from '../auth/combined-auth.guard'
import { AuthContext } from '../common/decorators/auth-context.decorator'
import { AuthenticatedRateLimitGuard } from '../common/guards/authenticated-rate-limit.guard'
import { OrganizationAuthContext } from '../common/interfaces/auth-context.interface'
import { RequiredOrganizationResourcePermissions } from '../organization/decorators/required-organization-resource-permissions.decorator'
import { OrganizationResourcePermission } from '../organization/enums/organization-resource-permission.enum'
import { OrganizationResourceActionGuard } from '../organization/guards/organization-resource-action.guard'
import { Secret } from '../secret/entities/secret.entity'
import { SecretsService } from '../secret/services/secrets.service'
import { CreateSecretDto, UpdateSecretDto } from './dto/secret.dto'

type RestSecret = {
  name: string
  hosts: string[]
  placeholder: string | null
  current_version: number
  created_by: string | null
  created_at: string
  updated_at: string
}

// Named fields, never the body: the body carries the value.
const auditedFields = (req: TypedRequest<CreateSecretDto | UpdateSecretDto>) => ({
  name: (req.body as CreateSecretDto | undefined)?.name ?? req.params?.name,
  hosts: req.body?.hosts,
  placeholder: req.body?.placeholder,
})

/**
 * An organization's stored secrets on the box API, addressed by name.
 *
 * Secrets have no permission of their own yet, so the writes ride on the box
 * permissions: a key with none is refused every write, as the GHSA-2qqv rule
 * in `boxlite-rest-permissions.spec.ts` requires. No answer or audit record
 * carries a value.
 */
@Controller(['v1/secrets', 'v1/:prefix/secrets'])
@ApiExcludeController()
@UseGuards(CombinedAuthGuard, OrganizationResourceActionGuard, AuthenticatedRateLimitGuard)
export class BoxliteSecretController {
  constructor(private readonly secrets: SecretsService) {}

  @Get()
  async list(@AuthContext() authContext: OrganizationAuthContext): Promise<{ secrets: RestSecret[] }> {
    const secrets = await this.secrets.list(authContext.organizationId)
    return { secrets: secrets.map(toRestSecret) }
  }

  @Post()
  @RequiredOrganizationResourcePermissions([OrganizationResourcePermission.WRITE_BOXES])
  @Audit({
    action: AuditAction.CREATE,
    targetType: AuditTarget.SECRET,
    targetIdFromResult: (result: RestSecret) => result?.name,
    requestMetadata: { body: auditedFields },
  })
  async create(
    @AuthContext() authContext: OrganizationAuthContext,
    @Body() request: CreateSecretDto,
  ): Promise<RestSecret> {
    const created = await this.secrets.create(authContext.organizationId, authContext.userId ?? null, request)
    return toRestSecret(created)
  }

  @Patch(':name')
  @RequiredOrganizationResourcePermissions([OrganizationResourcePermission.WRITE_BOXES])
  @Audit({
    action: AuditAction.UPDATE,
    targetType: AuditTarget.SECRET,
    targetIdFromRequest: (req) => req.params.name,
    requestMetadata: { body: auditedFields },
  })
  async update(
    @AuthContext() authContext: OrganizationAuthContext,
    @Param('name') name: string,
    @Body() request: UpdateSecretDto,
  ): Promise<RestSecret> {
    const updated = await this.secrets.update(authContext.organizationId, name, authContext.userId ?? null, request)
    return toRestSecret(updated)
  }

  @Delete(':name')
  @HttpCode(204)
  @RequiredOrganizationResourcePermissions([OrganizationResourcePermission.DELETE_BOXES])
  @Audit({
    action: AuditAction.DELETE,
    targetType: AuditTarget.SECRET,
    targetIdFromRequest: (req) => req.params.name,
  })
  async remove(@AuthContext() authContext: OrganizationAuthContext, @Param('name') name: string): Promise<void> {
    await this.secrets.delete(authContext.organizationId, name)
  }
}

function toRestSecret(secret: Secret): RestSecret {
  return {
    name: secret.name,
    hosts: secret.hosts,
    placeholder: secret.placeholder,
    current_version: secret.currentVersion,
    created_by: secret.createdBy,
    created_at: secret.createdAt.toISOString(),
    updated_at: secret.updatedAt.toISOString(),
  }
}
