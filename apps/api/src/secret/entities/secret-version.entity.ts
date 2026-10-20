/*
 * Copyright 2026 BoxLite AI
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm'
import { Secret } from './secret.entity'

// One value a secret has held. A new value adds a version and never edits an
// old one, so a box can report which value it was given.
@Entity()
export class SecretVersion {
  @PrimaryColumn({ type: 'uuid' })
  secretId: string

  @PrimaryColumn({ type: 'int' })
  version: number

  @ManyToOne(() => Secret, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'secretId' })
  secret?: Secret

  // Sealed by SecretCipher with `secretVersionContext`, never plaintext.
  @Column({ type: 'text' })
  value: string

  @Column({ type: 'varchar', nullable: true })
  createdBy: string | null

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date
}
