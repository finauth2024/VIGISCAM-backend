import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { DevicesService } from './devices.service';
import { EnrollDeviceDto } from './dto/enroll-device.dto';

@ApiTags('Devices')
@ApiBearerAuth()
@Controller({ path: 'devices', version: '1' })
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post()
  @ApiOperation({ summary: 'Enroll a device' })
  enroll(@CurrentUser() user: AuthenticatedUser, @Body() dto: EnrollDeviceDto) {
    return this.devices.enroll(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my devices' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.devices.listForUser(user);
  }

  @Post(':id/heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record a device heartbeat' })
  heartbeat(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.devices.heartbeat(user, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke a device' })
  revoke(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.devices.revoke(user, id);
  }
}
