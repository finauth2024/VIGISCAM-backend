import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { UpdateProtectionSettingsDto } from './dto/update-protection-settings.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { ProtectionSettingsService } from './protection-settings.service';

@ApiTags('Protection Settings')
@ApiBearerAuth()
@Controller({ version: '1' })
export class ProtectionSettingsController {
  constructor(private readonly service: ProtectionSettingsService) {}

  @Get('protection-settings')
  @ApiOperation({ summary: 'Get my protection settings (created with defaults on first read).' })
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getSettings(user);
  }

  @Put('protection-settings')
  @ApiOperation({ summary: 'Update my protection settings (Elder Mode, trusted-contact policy, thresholds).' })
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProtectionSettingsDto,
  ) {
    return this.service.updateSettings(user, dto);
  }

  @Get('user-profile')
  @ApiOperation({ summary: 'Get my user profile / accessibility preferences.' })
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getProfile(user);
  }

  @Put('user-profile')
  @ApiOperation({ summary: 'Update my user profile / accessibility preferences.' })
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateUserProfileDto,
  ) {
    return this.service.updateProfile(user, dto);
  }
}
