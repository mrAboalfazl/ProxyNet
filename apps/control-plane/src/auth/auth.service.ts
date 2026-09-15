import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from './otp.service';
import { TotpService } from './totp.service';

const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function randomSlug(length: number): string {
  const bytes = randomBytes(length);
  let value = '';
  for (let index = 0; index < length; index += 1) value += B62[bytes[index] % B62.length];
  return value;
}

export function normalizeIranPhone(value: string): string {
  const digits = value
    .trim()
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[\s()-]/g, '');
  const national = digits
    .replace(/^\+/, '')
    .replace(/^0098/, '')
    .replace(/^98/, '')
    .replace(/^0/, '');

  if (!/^9\d{9}$/.test(national)) {
    throw new BadRequestException('Enter a valid Iranian mobile number');
  }

  return `+98${national}`;
}

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
    if (!user) return { availableMethods: [] };

    const credentials = await this.prisma.userCredential.findMany({
      where: { userId: user.id, enabled: true },
      select: { method: true, isPrimary: true },
    });
    return { availableMethods: credentials.map((credential) => credential.method) };
  }

  async sendOtp(
    identifier: string,
    method: 'email_otp' | 'sms_otp' | 'telegram_otp',
  ): Promise<{ sent: boolean }> {
    const user = await this.findUserByIdentifier(identifier);
    if (!user) {
      if (method === 'sms_otp') throw new BadRequestException('Phone number is not registered');
      return { sent: false };
    }

    const credential = await this.prisma.userCredential.findFirst({
      where: { userId: user.id, method, enabled: true },
    });
    if (!credential) throw new BadRequestException('Verification method is not available');

    const code = this.otp.generateCode();
    await this.otp.storeCode(user.id.toString(), method, code);
    await this.otp.deliver(method, credential, code);
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
      if (!await this.totp.verify(user.id, code)) {
        throw new UnauthorizedException('Invalid or expired TOTP code');
      }
      return this.issueSession(user.id, ipAddress, userAgent);
    }

    if (!await this.otp.verifyCode(user.id.toString(), method, code)) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    return this.issueSession(user.id, ipAddress, userAgent);
  }

  async startRegistration(
    displayName: string,
    email: string,
    phone: string,
    password: string,
    ipAddress?: string,
  ): Promise<{ registrationId: string; expiresInSeconds: number }> {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = normalizeIranPhone(phone);
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: normalizedEmail }, { phone: normalizedPhone }] },
    });
    if (existing) {
      throw new BadRequestException('An account with this email or phone number already exists');
    }

    return this.otp.beginRegistration({
      displayName: displayName.trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      passwordHash: await bcrypt.hash(password, 10),
    }, ipAddress);
  }

  async confirmRegistration(
    registrationId: string,
    code: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string }> {
    const registration = await this.otp.consumeVerifiedRegistration(registrationId, code);
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: registration.email }, { phone: registration.phone }] },
    });
    if (existing) {
      throw new BadRequestException('An account with this email or phone number already exists');
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          displayName: registration.displayName,
          email: registration.email,
          phone: registration.phone,
          publicSlug: randomSlug(12),
          credentials: {
            create: [
              {
                method: 'password',
                credentialHash: registration.passwordHash,
                email: registration.email,
                isPrimary: true,
                enabled: true,
              },
              {
                method: 'sms_otp',
                phone: registration.phone,
                isPrimary: false,
                enabled: true,
              },
            ],
          },
        },
      });
      return this.issueSession(user.id, ipAddress, userAgent);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('An account with this email or phone number already exists');
      }
      throw error;
    }
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

    const credential = await this.prisma.userCredential.findFirst({
      where: { userId: user.id, method: 'password', enabled: true },
    });
    if (!credential?.credentialHash || !await bcrypt.compare(password, credential.credentialHash)) {
      throw new UnauthorizedException();
    }
    return this.issueSession(user.id, ipAddress, userAgent);
  }

  async validateJwtPayload(payload: { sub: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(payload.sub) },
      select: { id: true, status: true, role: true, publicSlug: true },
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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    const token = randomBytes(32).toString('hex');
    await this.prisma.userSession.create({
      data: {
        userId,
        tokenHash: await bcrypt.hash(token, 10),
        ipAddress,
        userAgent,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    return {
      accessToken: await this.jwt.signAsync({
        sub: userId.toString(),
        token,
        role: user?.role || 'user',
      }),
    };
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
