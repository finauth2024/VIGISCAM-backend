import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../common/auth/public.decorator';
import { CreateRegistryAppealDto } from './dto/create-registry-appeal.dto';
import { RegistryAppealService } from './registry-appeal.service';
import { RegistryService } from './registry.service';

@ApiTags('Public Registry')
@Controller({ path: 'registry', version: '1' })
export class RegistryController {
  constructor(
    private readonly registry: RegistryService,
    private readonly appeals: RegistryAppealService,
  ) {}

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

  @Public()
  @Post(':id/appeal')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Contest a published registry entry — file a correction / appeal' })
  fileAppeal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRegistryAppealDto,
    @Req() req: Request,
  ) {
    return this.appeals.fileAppeal(id, dto, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }
}
