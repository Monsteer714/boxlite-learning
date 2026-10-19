/*
 * Copyright 2026 BoxLite AI
 * SPDX-License-Identifier: AGPL-3.0
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto'

const PREFIX = 'enc:v1:'
const KEY_INFO = 'boxlite box secret v1'
const IV_BYTES = 12
const TAG_BYTES = 16

/**
 * Seals secret values for storage with AES-256-GCM. The caller's context is
 * authenticated with each value, so a ciphertext copied to another row or name
 * fails to open. `v1` in the prefix names the key, which leaves room to rotate.
 *
 * Unlike EncryptionService, a wrong key or a tampered value throws instead of
 * coming back as the input.
 */
export class SecretCipher {
  private constructor(private readonly key: Buffer) {}

  /** Derives the key from the API's existing encryption settings (RFC 5869 HKDF). */
  static fromSettings(secret: string | undefined, salt: string | undefined): SecretCipher {
    if (!secret || !salt) {
      throw new Error('ENCRYPTION_KEY and ENCRYPTION_SALT are required to seal secrets')
    }
    return new SecretCipher(Buffer.from(hkdfSync('sha256', secret, salt, KEY_INFO, 32)))
  }

  static isSealed(stored: string): boolean {
    return stored.startsWith(PREFIX)
  }

  seal(value: string, context: string): string {
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    cipher.setAAD(Buffer.from(context))
    const sealed = Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()])
    return PREFIX + sealed.toString('base64')
  }

  /** Opens a sealed value. A value without the prefix predates sealing and is returned as stored. */
  open(stored: string, context: string): string {
    if (!SecretCipher.isSealed(stored)) {
      return stored
    }
    const sealed = Buffer.from(stored.slice(PREFIX.length), 'base64')
    const decipher = createDecipheriv('aes-256-gcm', this.key, sealed.subarray(0, IV_BYTES), {
      authTagLength: TAG_BYTES,
    })
    decipher.setAAD(Buffer.from(context))
    decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES))
    const body = sealed.subarray(IV_BYTES, sealed.length - TAG_BYTES)
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
  }
}
