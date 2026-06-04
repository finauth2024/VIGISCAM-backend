import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CollisionSearchDto } from './dto/collision-search.dto';
import { IdentityCollisionService } from './identity-collision.service';

/**
 * Identity Collision Graph™ — **consumer** surface (CP-13).
 *
 * Mounted at `/api/v1/identity-collision/*`. Unlike the reviewer-only
 * `/api/v1/identity-graph/*` controller, this carries NO `@Roles()` guard, so
 * any authenticated principal (an `INDIVIDUAL` consumer included) may call it.
 * Safe to open up because the service returns only masked, presentation-level
 * fields — never victim PII or internal-only fields.
 *
 * Tightly throttled (10 req/min/IP) on top of the global limiter — graph
 * traversal is more expensive than a typical read and we don't want it abused
 * for identifier enumeration.
 */
@ApiTags('Identity Collision Graph')
@ApiBearerAuth()
@Controller({ path: 'identity-collision', version: '1' })
export class IdentityCollisionController {
  constructor(private readonly service: IdentityCollisionService) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Cross-reference an identifier against the fraud-actor graph and return a masked collision cluster. Consumer-safe: no victim PII, no internal fields.',
  })
  search(@Body() dto: CollisionSearchDto) {
    return this.service.search(dto);
  }
}
