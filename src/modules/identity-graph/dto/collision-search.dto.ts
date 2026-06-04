import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * The nine identifier kinds the consumer Identity Collision Graph page
 * (`app/dashboard/identity-graph`) lets an individual search by. These are
 * the FRONTEND-facing taxonomy, not the Prisma `FraudGraphNodeType` /
 * `IndicatorType` enums — the service maps them onto the graph schema.
 */
export const COLLISION_SEARCH_TYPES = [
  'name',
  'phone',
  'email',
  'wallet',
  'domain',
  'handle',
  'image',
  'voice',
  'phrase',
] as const;

export type CollisionSearchType = (typeof COLLISION_SEARCH_TYPES)[number];

/**
 * Consumer-facing collision search input. Deliberately minimal: a free-text
 * identifier plus the kind of identifier it is. No node-type / pagination
 * knobs are exposed — consumers get a single best-match cluster, masked.
 */
export class CollisionSearchDto {
  @ApiProperty({
    description:
      'The identifier to cross-reference against the fraud-actor graph — a name, phone, email, wallet, handle, domain, image hash, voice fingerprint, or script phrase.',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  query!: string;

  @ApiProperty({
    enum: COLLISION_SEARCH_TYPES,
    description: 'Which kind of identifier `query` is. Narrows the graph search.',
  })
  @IsString()
  @IsIn(COLLISION_SEARCH_TYPES as unknown as string[])
  searchType!: CollisionSearchType;
}
