import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { createHash } from 'crypto';
import { Request, Response } from 'express';
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
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (1-100, default 50)' })
  async search(
    @Req() req: Request,
    @Res() res: Response,
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('category') category?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    const result = await this.registry.search({ q, type, category, page, limit });
    const body = JSON.stringify(result);
    const etag = `"${createHash('sha256').update(body).digest('hex')}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=60');
    // RFC 5988 Link header — clients walk pages without parsing the body.
    const linkParts: string[] = [];
    const baseQuery = new URLSearchParams();
    if (q) baseQuery.set('q', q);
    if (type) baseQuery.set('type', type);
    if (category) baseQuery.set('category', category);
    baseQuery.set('limit', String(result.limit));
    if (result.hasMore) {
      const nextQ = new URLSearchParams(baseQuery);
      nextQ.set('page', String(result.page + 1));
      linkParts.push(`</api/v1/registry/search?${nextQ.toString()}>; rel="next"`);
    }
    if (result.page > 1) {
      const prevQ = new URLSearchParams(baseQuery);
      prevQ.set('page', String(result.page - 1));
      linkParts.push(`</api/v1/registry/search?${prevQ.toString()}>; rel="prev"`);
    }
    if (linkParts.length > 0) {
      res.setHeader('Link', linkParts.join(', '));
    }

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }
    res.setHeader('Content-Type', 'application/json');
    return res.send(body);
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
