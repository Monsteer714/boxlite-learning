/*
 * Copyright 2026 BoxLite AI
 * SPDX-License-Identifier: AGPL-3.0
 */

import { SecretCipher } from './secret-cipher'

describe('SecretCipher', () => {
  const cipher = SecretCipher.fromSettings('test-encryption-key', 'test-salt')

  it('round-trips a value and never stores it in the clear', () => {
    const sealed = cipher.seal('sk-test-value', 'box:b1:secret:openai')

    expect(SecretCipher.isSealed(sealed)).toBe(true)
    expect(sealed).not.toContain('sk-test-value')
    expect(cipher.open(sealed, 'box:b1:secret:openai')).toBe('sk-test-value')
  })

  it('uses a fresh IV for every seal', () => {
    expect(cipher.seal('v', 'ctx')).not.toBe(cipher.seal('v', 'ctx'))
  })

  // The context is authenticated: a value copied to another box or name, a
  // different key, or a flipped byte must fail rather than decrypt to garbage.
  it('refuses a moved, re-keyed, or tampered value', () => {
    const sealed = cipher.seal('sk-test-value', 'box:b1:secret:openai')
    const other = SecretCipher.fromSettings('another-key', 'test-salt')
    const bytes = Buffer.from(sealed.slice('enc:v1:'.length), 'base64')
    bytes[14] ^= 0xff
    const tampered = 'enc:v1:' + bytes.toString('base64')

    expect(() => cipher.open(sealed, 'box:b2:secret:openai')).toThrow()
    expect(() => other.open(sealed, 'box:b1:secret:openai')).toThrow()
    expect(() => cipher.open(tampered, 'box:b1:secret:openai')).toThrow()
  })

  it('returns a value stored before sealing as it is', () => {
    expect(cipher.open('sk-legacy-plaintext', 'box:b1:secret:openai')).toBe('sk-legacy-plaintext')
  })

  it('requires both encryption settings', () => {
    expect(() => SecretCipher.fromSettings(undefined, 'salt')).toThrow('ENCRYPTION_KEY')
    expect(() => SecretCipher.fromSettings('key', '')).toThrow('ENCRYPTION_SALT')
  })
})
