/*
 * Copyright 2026 BoxLite AI
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ArrayNotEmpty, IsArray, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator'

// Hosts must be non-empty because the proxy substitutes a secret only for the
// hosts it lists; a placeholder must be non-empty because an empty one would
// splice the value into every header byte. Every validator keeps to its
// default message, which names the field and never the value.

/** A new stored secret, in the box API's snake_case. */
export class CreateSecretDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string

  @IsString()
  @IsNotEmpty()
  value: string

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  hosts: string[]

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  placeholder?: string
}

// Validates every field that is present, `null` included. @IsOptional would
// skip a `null`, which then reaches a NOT NULL column or the cipher.
const isGiven = (_: unknown, value: unknown) => value !== undefined

/** A change to a stored secret: a new value becomes its next version. */
export class UpdateSecretDto {
  @ValidateIf(isGiven)
  @IsString()
  @IsNotEmpty()
  value?: string

  @ValidateIf(isGiven)
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  hosts?: string[]

  @ValidateIf(isGiven)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  placeholder?: string
}
