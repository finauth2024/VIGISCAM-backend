import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { createHash } from 'crypto';
import { Request, Response } from 'express';
import { Public } from '../../common/auth/public.decorator';
import { PublicAlertService } from './public-alert.service';

/**
 * Public-facing alert feed (PDF §43 "regional public alert systems"). No
 * authentication; PUBLISHED alerts only; filterable by region and minimum
 * severity. Mirrors the 7A registry-search HTTP semantics — ETag + 304 +
 * Cache-Control for CDN/global-scale friendliness.
 */
@ApiTags('Public Alerts')
@Controller({ path: 'alerts', version: '1' })
export class PublicAlertPublicController {
  constructor(private readonly alerts: PublicAlertService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List currently published public alerts' })
  @ApiQuery({ name: 'region', required: false, description: 'ISO country code or region label' })
  @ApiQuery({ name: 'minSeverity', required: false, description: 'INFO | WARNING | CRITICAL' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max items (1-200, default 50)' })
  async list(
    @Req() req: Request,
    @Res() res: Response,
    @Query('region') region?: string,
    @Query('minSeverity') minSeverity?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    const items = await this.alerts.listPublic({ region, minSeverity, limit });
    const body = JSON.stringify(items);
    const etag = `"${createHash('sha256').update(body).digest('hex')}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=60');
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }
    res.setHeader('Content-Type', 'application/json');
    return res.send(body);
  }
}
