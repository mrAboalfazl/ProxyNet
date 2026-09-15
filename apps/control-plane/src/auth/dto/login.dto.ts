import { IsEmail, IsIn, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InitiateLoginDto {
  @ApiProperty({ description: 'Email, phone number, or Telegram username' })
  @IsString()
  @IsNotEmpty()
  identifier: string;
}

export class SendOtpDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  identifier: string;

  @ApiProperty({ enum: ['email_otp', 'sms_otp', 'telegram_otp'] })
  @IsIn(['email_otp', 'sms_otp', 'telegram_otp'])
  method: 'email_otp' | 'sms_otp' | 'telegram_otp';
}

export class VerifyOtpDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  identifier: string;

  @ApiProperty({ enum: ['email_otp', 'sms_otp', 'telegram_otp', 'totp'] })
  @IsString()
  method: string;

  @ApiProperty({ description: '6-digit OTP code' })
  @Matches(/^\d{6}$/)
  code: string;
}

export class PasswordLoginDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  identifier: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class StartRegistrationDto {
  @IsString()
  @IsNotEmpty()
  displayName: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @MinLength(6)
  password: string;
}

export class ConfirmRegistrationDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  registrationId: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}
