/*
 * Copyright 2026 BoxLite AI
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

// A secret an organization stores once and boxes use by name.
@Entity()
@Index('secret_org_name_unique', ['organizationId', 'name'], { unique: true })
export class Secret {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid' })
  organizationId: string

  @Column({ type: 'varchar', length: 255 })
  name: string

  // Where the value may go: the proxy substitutes it only in requests to
  // these hosts. They belong to the secret, so whoever manages the key also
  // decides where it is sent.
  @Column({ type: 'text', array: true })
  hosts: string[]

  // Null takes the runtime's default, `<BOXLITE_SECRET:{name}>`, as an inline
  // secret without one does.
  @Column({ type: 'varchar', length: 255, nullable: true })
  placeholder: string | null

  // Sealed by SecretCipher with `secretContext`, never plaintext. Left out of
  // every load unless a query selects it, so listing or returning a secret
  // cannot carry its value.
  @Column({ type: 'text', select: false })
  value: string

  // The user's identity provider subject, as on `registry_credential`.
  @Column({ type: 'varchar', nullable: true })
  createdBy: string | null

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date
}
