import { Body, Controller, Delete, GoneException, HttpCode, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  ConfirmRegistrationDto,
  InitiateLoginDto,
  PasswordLoginDto,
  SendOtpDto,
  StartRegistrationDto,
  VerifyOtpDto,
} from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Deprecated: registration requires phone verification' })
  register() {
    throw new GoneException('Use /auth/registration/start and /auth/registration/confirm');
  }

  @Post('registration/start')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a phone verification code for a new account' })
  startRegistration(@Body() dto: StartRegistrationDto, @Request() req) {
    return this.auth.startRegistration(dto.displayName, dto.email, dto.phone, dto.password, req.ip);
  }

  @Post('registration/confirm')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a new account after successful phone verification' })
  confirmRegistration(@Body() dto: ConfirmRegistrationDto, @Request() req) {
    return this.auth.confirmRegistration(dto.registrationId, dto.code, req.ip, req.headers['user-agent']);
  }

  @Post('initiate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get available login methods for an identifier' })
  initiate(@Body() dto: InitiateLoginDto) {
    return this.auth.initiateLogin(dto.identifier);
  }

  @Post('otp/send')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send an OTP code via the specified method' })
  sendOtp(@Body() dto: SendOtpDto) {
    return this.auth.sendOtp(dto.identifier, dto.method);
  }

  @Post('otp/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify OTP and receive an access token' })
  verifyOtp(@Body() dto: VerifyOtpDto, @Request() req) {
    return this.auth.verifyOtp(dto.identifier, dto.method, dto.code, req.ip, req.headers['user-agent']);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login with username and password' })
  passwordLogin(@Body() dto: PasswordLoginDto, @Request() req) {
    return this.auth.verifyPassword(dto.identifier, dto.password, req.ip, req.headers['user-agent']);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke current session' })
  logout(@Request() req) {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    return this.auth.revokeSession(token);
  }

  @Post('totp/setup')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate TOTP setup URL and manual key' })
  totpSetup(@Request() req) {
    return this.auth.totpSetup(req.user.id);
  }

  @Post('totp/confirm')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm TOTP setup with a valid code' })
  totpConfirm(@Request() req, @Body() body: { code: string }) {
    return this.auth.totpConfirm(req.user.id, body.code);
  }

  @Delete('totp')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable and remove TOTP for the current user' })
  totpDisable(@Request() req) {
    return this.auth.totpDisable(req.user.id);
  }
}
