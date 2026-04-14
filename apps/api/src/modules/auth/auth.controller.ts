import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RequestResetDto } from './dto/request-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignupDto } from './dto/signup.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('logout')
  logout() {
    return this.authService.logout();
  }

  @Post('request-password-reset')
  requestPasswordReset(@Body() dto: RequestResetDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request & { user?: { sub: string } }) {
    const userId = req.user?.sub ?? '';
    return this.authService.me(userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(
    @Req() req: Request & { user?: { sub: string } },
    @Body() dto: ChangePasswordDto,
  ) {
    const userId = req.user?.sub ?? '';
    return this.authService.changePassword(userId, dto);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth(@Req() req: any) {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req: any, @Res() res: Response) {
    const result = await this.authService.validateOAuthUser(req.user);
    return this.handleSocialRedirect(result, res);
  }

  @Get('microsoft')
  @UseGuards(AuthGuard('microsoft'))
  async microsoftAuth(@Req() req: any) {}

  @Get('microsoft/callback')
  @UseGuards(AuthGuard('microsoft'))
  async microsoftAuthRedirect(@Req() req: any, @Res() res: Response) {
    const result = await this.authService.validateOAuthUser({
      email: req.user.email,
      name: req.user.name,
      provider: 'microsoft',
      providerId: req.user.providerId,
    });
    return this.handleSocialRedirect(result, res);
  }

  private handleSocialRedirect(result: any, res: Response) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    if (!result.active) {
      return res.redirect(`${frontendUrl}/auth/login?error=inactive`);
    }
    return res.redirect(`${frontendUrl}/auth/callback?token=${result.access_token}`);
  }
}
