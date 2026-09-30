/*
 * Copyright 2026 BoxLite AI
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Logger } from '@nestjs/common'
import { getTelemetryServiceType } from './app-mode'

export type BusinessEventName = 'user.registration' | 'box.create' | 'box.stop' | 'box.delete'

export type BusinessEventActorKind = 'user' | 'admin' | 'auto_stop' | 'auto_delete' | 'org_suspension' | 'warm_pool'

interface BusinessEventBase {
  name: BusinessEventName
  // The user id for a registration, the box id for a box event.
  correlationId: string
  orgId?: string
  actorKind?: BusinessEventActorKind
}

export type BusinessEvent =
  | (BusinessEventBase & { outcome: 'requested' | 'success' })
  | (BusinessEventBase & { outcome: 'exception'; exceptionType: string; exceptionMessage?: string })

// Error text is unbounded (runner errors can carry whole stack traces), and
// every log attribute is stored as one ClickHouse string, so cap what one
// record can carry.
const MAX_EXCEPTION_MESSAGE_LENGTH = 1024

const logger = new Logger('BusinessEvent')

/**
 * Emits one business event as a structured log record. The attributes reach
 * OTLP through nestjs-pino and PinoInstrumentation (see tracing.ts), where
 * alerts query them by name.
 */
export function recordBusinessEvent(event: BusinessEvent): void {
  const message = `${event.name} ${event.outcome}`
  const attributes = toLogAttributes(event)

  if (event.outcome === 'exception') {
    logger.error(message, attributes)
    return
  }
  logger.log(message, attributes)
}

function toLogAttributes(event: BusinessEvent): Record<string, string> {
  const attributes: Record<string, string> = {
    'event.name': event.name,
    'event.outcome': event.outcome,
    'correlation.id': event.correlationId,
    'service.type': getTelemetryServiceType(),
    'event.timestamp': new Date().toISOString(),
  }

  if (event.orgId) {
    attributes['org.id'] = event.orgId
  }
  if (event.actorKind) {
    attributes['actor.kind'] = event.actorKind
  }
  if (event.outcome === 'exception') {
    attributes['exception.type'] = event.exceptionType
    if (event.exceptionMessage) {
      attributes['exception.message'] = event.exceptionMessage.slice(0, MAX_EXCEPTION_MESSAGE_LENGTH)
    }
  }

  return attributes
}
