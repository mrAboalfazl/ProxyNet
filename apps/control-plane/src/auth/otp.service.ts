import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UserCredential } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomInt } from 'crypto';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

const OTP_TTL_SECONDS = 5 * 60;
const REGISTRATION_MAX_ATTEMPTS = 5;
const REGISTRATION_SEND_COOLDOWN_SECONDS = 60;

export interface PendingRegistration {
  displayName: string;
  email: string;
  phone: string;
  passwordHash: string;
}

interface StoredRegistration extends PendingRegistration {
  codeHash: string;
  attempts: number;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(@Inject(REDIS_CLIENT) private redis: Redis) {}

  generateCode(): string {
    return randomInt(100000, 1000000).toString();
  }

  async storeCode(userId: string, method: string, code: string): Promise<void> {
    await this.redis.set(`otp:${userId}:${method}`, code, 'EX', OTP_TTL_SECONDS);
  }

  async verifyCode(userId: string, method: string, submitted: string): Promise<boolean> {
    const key = `otp:${userId}:${method}`;
    const stored = await this.redis.get(key);
    if (!stored || stored !== submitted) return false;
    await this.redis.del(key);
    return true;
  }

  async beginRegistration(
    registration: PendingRegistration,
    ipAddress?: string,
  ): Promise<{ registrationId: string; expiresInSeconds: number }> {
    const cooldownKeys = [
      `registration:cooldown:phone:${this.hashIdentifier(registration.phone)}`,
      ...(ipAddress ? [`registration:cooldown:ip:${this.hashIdentifier(ipAddress)}`] : []),
    ];

    for (const key of cooldownKeys) {
      const accepted = await this.redis.set(
        key,
        '1',
        'EX',
        REGISTRATION_SEND_COOLDOWN_SECONDS,
        'NX',
      );
      if (!accepted) {
        throw new BadRequestException('Please wait before requesting another verification code');
      }
    }

    const registrationId = randomBytes(32).toString('hex');
    const code = this.generateCode();
    const pending: StoredRegistration = {
      ...registration,
      codeHash: await bcrypt.hash(code, 10),
      attempts: 0,
    };
    const key = this.registrationKey(registrationId);

    await this.redis.set(key, JSON.stringify(pending), 'EX', OTP_TTL_SECONDS);
    try {
      await this.sendKavenegarSms(registration.phone, code);
    } catch (error) {
      await this.redis.del(key);
      await Promise.all(cooldownKeys.map((cooldownKey) => this.redis.del(cooldownKey)));
      throw error;
    }

    return { registrationId, expiresInSeconds: OTP_TTL_SECONDS };
  }

  async consumeVerifiedRegistration(
    registrationId: string,
    submittedCode: string,
  ): Promise<PendingRegistration> {
    const key = this.registrationKey(registrationId);
    const raw = await this.redis.get(key);
    if (!raw) throw new BadRequestException('Verification code is invalid or expired');

    let pending: StoredRegistration;
    try {
      pending = JSON.parse(raw) as StoredRegistration;
    } catch {
      await this.redis.del(key);
      throw new BadRequestException('Verification code is invalid or expired');
    }

    if (pending.attempts >= REGISTRATION_MAX_ATTEMPTS) {
      await this.redis.del(key);
      throw new BadRequestException('Too many invalid verification attempts');
    }

    if (!await bcrypt.compare(submittedCode, pending.codeHash)) {
      pending.attempts += 1;
      if (pending.attempts >= REGISTRATION_MAX_ATTEMPTS) {
        await this.redis.del(key);
      } else {
        await this.redis.set(key, JSON.stringify(pending), 'KEEPTTL');
      }
      throw new BadRequestException('Verification code is invalid or expired');
    }

    if (!await this.redis.del(key)) {
      throw new BadRequestException('Verification code is invalid or expired');
    }

    return {
      displayName: pending.displayName,
      email: pending.email,
      phone: pending.phone,
      passwordHash: pending.passwordHash,
    };
  }

  async deliver(
    method: string,
    credential: Partial<UserCredential>,
    code: string,
  ): Promise<void> {
    if (method === 'sms_otp' && credential.phone) {
      await this.sendKavenegarSms(credential.phone, code);
      return;
    }

    if (method === 'email_otp' && credential.email) {
      this.logger.log(`Email OTP requested for ${credential.email}`);
      return;
    }

    if (method === 'telegram_otp' && credential.telegramId) {
      this.logger.log(`Telegram OTP requested for ${credential.telegramId}`);
      return;
    }

    throw new BadRequestException('Unsupported verification method');
  }

  private async sendKavenegarSms(phone: string, code: string): Promise<void> {
    const apiKey = process.env.KAVENEGAR_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException('SMS verification is temporarily unavailable');
    }

    const url = `https://api.kavenegar.com/v1/${apiKey}/sms/send.json`;
    const body = new URLSearchParams({
      receptor: phone,
      message: `Civonex verification code: ${code}`,
      sender: process.env.KAVENEGAR_SENDER ?? '',
    });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!res.ok) {
        this.logger.error(`KaveNegar SMS delivery failed with status ${res.status}`);
        throw new ServiceUnavailableException('SMS verification is temporarily unavailable');
      }
      this.logger.log(`KaveNegar SMS sent to ${phone}`);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.error(`KaveNegar network error: ${error}`);
      throw new ServiceUnavailableException('SMS verification is temporarily unavailable');
    }
  }

  private registrationKey(registrationId: string): string {
    return `registration:pending:${registrationId}`;
  }

  private hashIdentifier(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
