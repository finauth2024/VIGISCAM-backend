import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { RequestContext } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Public } from '../../common/auth/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';

function contextOf(req: Request): RequestContext {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an account and its personal tenant' })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, contextOf(req));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, contextOf(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a fresh token pair' })
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, contextOf(req));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a refresh token' })
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current user and tenant memberships' })
  me(@CurrentUser('userId') userId: string) {
    return this.auth.getProfile(userId);
  }
}
