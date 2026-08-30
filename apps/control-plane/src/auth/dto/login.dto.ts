import { IsString, IsNotEmpty, IsIn, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitiateLoginDto {
  @ApiProperty({ description: 'Email, phone number, or Telegram @username' })
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
  @IsString()
  @IsNotEmpty()
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
