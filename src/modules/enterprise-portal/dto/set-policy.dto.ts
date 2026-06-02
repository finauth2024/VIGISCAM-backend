import { ApiProperty } from '@nestjs/swagger';
import { IsDefined } from 'class-validator';

/**
 * The `value` field's shape varies per policy key — concrete validation
 * lives in the policy registry, not in this DTO. This DTO just enforces
 * that a value was provided.
 */
export class SetPolicyDto {
  @ApiProperty({ description: 'Policy value (shape depends on the key — see /policies registry).' })
  @IsDefined()
  value!: unknown;
}
