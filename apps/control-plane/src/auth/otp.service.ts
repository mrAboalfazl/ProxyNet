import { Injectable, Inject, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '../redis/redis.module';
import { UserCredential } from '@prisma/client';
import type Redis from 'ioredis';
import { randomInt } from 'crypto';

const OTP_TTL_SECONDS = 5 * 60;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(@Inject(REDIS_CLIENT) private redis: Redis) {}

  generateCode(): string {
    return randomInt(100000, 999999).toString();
  }

  async storeCode(userId: string, method: string, code: string): Promise<void> {
    const key = `otp:${userId}:${method}`;
    await this.redis.set(key, code, 'EX', OTP_TTL_SECONDS);
  }

  async verifyCode(userId: string, method: string, submitted: string): Promise<boolean> {
    const key = `otp:${userId}:${method}`;
    const stored = await this.redis.get(key);
    if (!stored || stored !== submitted) return false;
    await this.redis.del(key);
    return true;
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
      // TODO Phase 2: SMTP/SendGrid
      this.logger.log(`[OTP] email_otp code=${code} to=${credential.email}`);
      return;
    }

    if (method === 'telegram_otp' && credential.telegramId) {
      // TODO Phase 2: Telegram Bot API
      this.logger.log(`[OTP] telegram_otp code=${code} to=${credential.telegramId}`);
      return;
    }

    this.logger.log(
      `[OTP] method=${method} code=${code} to=${credential.email ?? credential.phone ?? credential.telegramId}`,
    );
  }

  private async sendKavenegarSms(phone: string, code: string): Promise<void> {
    const apiKey = process.env.KAVENEGAR_API_KEY;
    if (!apiKey) throw new Error('KAVENEGAR_API_KEY is not set');
    const url = `https://api.kavenegar.com/v1/${apiKey}/sms/send.json`;
    const message = `کد تأیید پروکسی‌نت: ${code}`;
    const body = new URLSearchParams({ receptor: phone, message, sender: '' });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const text = await res.text();
      if (!res.ok) {
        this.logger.error(`KaveNegar error: ${res.status} ${text}`);
        throw new Error(`SMS delivery failed (${res.status})`);
      }
      this.logger.log(`KaveNegar SMS sent to ${phone}`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('SMS delivery failed')) throw err;
      this.logger.error(`KaveNegar network error: ${err}`);
      throw new Error('SMS delivery failed — network error');
    }
  }
}
