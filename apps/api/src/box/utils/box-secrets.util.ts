/*
 * Copyright 2026 BoxLite AI
 * SPDX-License-Identifier: AGPL-3.0
 */

import { SecretCipher } from '../../encryption/secret-cipher'
import { BoxSecret } from '../dto/box.dto'

/** Ties a stored value to its box and name. */
function secretContext(boxId: string, name: string): string {
  return `box:${boxId}:secret:${name}`
}

/** Seals each value for this box, in the form `openBoxSecrets` opens. */
export function sealBoxSecrets(cipher: SecretCipher, boxId: string, secrets: BoxSecret[]): BoxSecret[] {
  return secrets.map((secret) => ({ ...secret, value: cipher.seal(secret.value, secretContext(boxId, secret.name)) }))
}

/** The secrets a runner request carries, each value opened. */
export function openBoxSecrets(cipher: SecretCipher, boxId: string, secrets?: BoxSecret[]): BoxSecret[] | undefined {
  return secrets?.map((secret) => ({
    name: secret.name,
    value: cipher.open(secret.value, secretContext(boxId, secret.name)),
    hosts: secret.hosts,
    placeholder: secret.placeholder,
  }))
}
