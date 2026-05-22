import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator';
import { RegistryService } from './registry.service';

@ApiTags('Public Registry')
@Controller({ path: 'registry', version: '1' })
export class RegistryController {
  constructor(private readonly registry: RegistryService) {}

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'Search the verified public-safe scam registry (no login)' })
  @ApiQuery({ name: 'q', required: false, description: 'Indicator value to look up' })
  @ApiQuery({ name: 'type', required: false, description: 'Indicator type (e.g. DOMAIN)' })
  @ApiQuery({ name: 'category', required: false, description: 'Scam category code' })
  search(
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('category') category?: string,
  ) {
    return this.registry.search({ q, type, category });
  }
}
