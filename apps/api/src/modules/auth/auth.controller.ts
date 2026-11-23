import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentSchoolActor, Public } from '../../common/decorators.js';
import type { SchoolActor } from '../../common/request-context.js';
import { loadConfig, SESSION_COOKIE } from '../../config/env.js';
import { AuthService } from './auth.service.js';
import { clearSessionCookie, setSessionCookie } from './cookies.js';
import { ChangePasswordDto, LoginDto } from './dto.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: () => loadConfig().loginRateLimitPerMinute, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in to a school. Sets an httpOnly session cookie.' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { token, expiresAt } = await this.auth.login(dto, { ip: req.ip, userAgent: req.header('user-agent')?.slice(0, 255) });
    setSessionCookie(res, SESSION_COOKIE, token, expiresAt);
    return { expiresAt };
  }

  @Post('logout')
  @HttpCode(204)
  @ApiCookieAuth()
  async logout(@CurrentSchoolActor() actor: SchoolActor, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(actor);
    clearSessionCookie(res, SESSION_COOKIE);
  }

  @Get('me')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Current user, school, roles, effective permissions and teaching assignments' })
  me(@CurrentSchoolActor() actor: SchoolActor) {
    return this.auth.me(actor);
  }

  @Post('change-password')
  @HttpCode(204)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Change password. Signs out all other sessions.' })
  async changePassword(@CurrentSchoolActor() actor: SchoolActor, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(actor, dto);
  }
}
