import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator';
import { PublicAlertService } from './public-alert.service';

/**
 * Public-facing alert feed (PDF §43 "regional public alert systems"). No
 * authentication; PUBLISHED alerts only; filterable by region and minimum
 * severity. Cached server-side and ETag-able by future enhancement.
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
  list(
    @Query('region') region?: string,
    @Query('minSeverity') minSeverity?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.alerts.listPublic({ region, minSeverity, limit });
  }
}
