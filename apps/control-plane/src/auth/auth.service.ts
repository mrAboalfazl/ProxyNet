import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from './otp.service';
import { TotpService } from './totp.service';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private otp: OtpService,
    private totp: TotpService,
  ) {}

  async initiateLogin(identifier: string): Promise<{ availableMethods: string[] }> {
    const user = await this.findUserByIdentifier(identifier);
    if (!user) {
      // Return same shape regardless; do not leak whether identifier exists
      return { availableMethods: [] };
    }

    const credentials = await this.prisma.userCredential.findMany({
      where: { userId: user.id, enabled: true },
      select: { method: true, isPrimary: true },
    });

    return {
      availableMethods: credentials.map((c) => c.method),
    };
  }

  async sendOtp(
    identifier: string,
    method: 'email_otp' | 'sms_otp' | 'telegram_otp',
  ): Promise<{ sent: boolean }> {
    const user = await this.findUserByIdentifier(identifier);
    if (!user) {
      if (method === 'sms_otp') throw new BadRequestException('شماره موبایل در سیستم ثبت نشده / Phone not registered');
      return { sent: false };
    }

    const cred = await this.prisma.userCredential.findFirst({
      where: { userId: user.id, method, enabled: true },
    });
    if (!cred) {
      if (method === 'sms_otp') throw new BadRequestException('پیامک برای این حساب فعال نیست / SMS OTP not enabled for this account');
      throw new BadRequestException('Method not available');
    }

    const code = this.otp.generateCode();
    await this.otp.storeCode(user.id.toString(), method, code);
    await this.otp.deliver(method, cred, code);

    return { sent: true };
  }

  async verifyOtp(
    identifier: string,
    method: string,
    code: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string }> {
    const user = await this.findUserByIdentifier(identifier);
    if (!user) throw new UnauthorizedException();

    if (method === 'totp') {
      const valid = await this.totp.verify(user.id, code);
      if (!valid) throw new UnauthorizedException('Invalid or expired TOTP code');
      return this.issueSession(user.id, ipAddress, userAgent);
    }

    const valid = await this.otp.verifyCode(user.id.toString(), method, code);
    if (!valid) throw new UnauthorizedException('Invalid or expired code');

    return this.issueSession(user.id, ipAddress, userAgent);
  }

  async totpSetup(userId: bigint): Promise<{ otpauthUrl: string; manualKey: string }> {
    return this.totp.generateSetup(userId);
  }

  async totpConfirm(userId: bigint, code: string): Promise<void> {
    return this.totp.confirmSetup(userId, code);
  }

  async totpDisable(userId: bigint): Promise<void> {
    return this.totp.disable(userId);
  }

  async verifyPassword(
    identifier: string,
    password: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string }> {
    const user = await this.findUserByIdentifier(identifier);
    if (!user) throw new UnauthorizedException();

    const cred = await this.prisma.userCredential.findFirst({
      where: { userId: user.id, method: 'password', enabled: true },
    });
    if (!cred?.credentialHash) throw new UnauthorizedException();

    const valid = await bcrypt.compare(password, cred.credentialHash);
    if (!valid) throw new UnauthorizedException();

    return this.issueSession(user.id, ipAddress, userAgent);
  }

  async register(
    displayName: string,
    email: string,
    password: string,
    phone?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string }> {
    const existing = await this.prisma.user.findFirst({ where: { email } });
    if (existing) throw new BadRequestException('Email already in use');

    if (phone) {
      const existingPhone = await this.prisma.user.findFirst({ where: { phone } });
      if (existingPhone) throw new BadRequestException('Phone already in use');
    }

    const hash = await bcrypt.hash(password, 10);
    const credentialsToCreate: Array<{
      method: 'password' | 'sms_otp';
      credentialHash?: string;
      email?: string;
      phone?: string;
      isPrimary: boolean;
      enabled: boolean;
    }> = [
      { method: 'password', credentialHash: hash, email, isPrimary: true, enabled: true },
    ];

    if (phone) {
      credentialsToCreate.push({ method: 'sms_otp', phone, isPrimary: false, enabled: true });
    }

    const user = await this.prisma.user.create({
      data: {
        displayName,
        email,
        phone: phone || null,
        credentials: { create: credentialsToCreate },
      },
    });

    return this.issueSession(user.id, ipAddress, userAgent);
  }

  async validateJwtPayload(payload: { sub: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(payload.sub) },
      select: { id: true, status: true, role: true },
    });
    if (!user || user.status !== 'active') return null;
    return user;
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(
    userId: bigint,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string }> {
    const userRecord = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    const token = randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(token, 10);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await this.prisma.userSession.create({
      data: { userId, tokenHash, ipAddress, userAgent, expiresAt },
    });

    const accessToken = await this.jwt.signAsync({
      sub: userId.toString(),
      token,
      role: userRecord?.role || 'user',
    });

    return { accessToken };
  }

  private async findUserByIdentifier(identifier: string) {
    return this.prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { phone: identifier },
          { telegramId: identifier },
        ],
        status: 'active',
      },
    });
  }
}
