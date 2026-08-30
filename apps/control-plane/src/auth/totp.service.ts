import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { authenticator } from 'otplib';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TotpService {
  constructor(private prisma: PrismaService) {}

  async generateSetup(userId: bigint): Promise<{ otpauthUrl: string; manualKey: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });

    const label = user?.email ?? user?.displayName ?? userId.toString();
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(label, 'ProxyPlatform', secret);

    await this.prisma.userCredential.upsert({
      where: {
        userId_method: { userId, method: 'totp' },
      },
      update: {
        credentialHash: secret,
        enabled: false,
      },
      create: {
        userId,
        method: 'totp',
        credentialHash: secret,
        enabled: false,
      },
    });

    return { otpauthUrl, manualKey: secret };
  }

  async confirmSetup(userId: bigint, code: string): Promise<void> {
    const cred = await this.prisma.userCredential.findFirst({
      where: { userId, method: 'totp' },
    });

    if (!cred || !cred.credentialHash) {
      throw new NotFoundException('TOTP setup not initiated');
    }

    const isValid = authenticator.verify({ token: code, secret: cred.credentialHash });
    if (!isValid) {
      throw new BadRequestException('Invalid TOTP code');
    }

    await this.prisma.userCredential.update({
      where: { id: cred.id },
      data: { enabled: true },
    });
  }

  async verify(userId: bigint, code: string): Promise<boolean> {
    const cred = await this.prisma.userCredential.findFirst({
      where: { userId, method: 'totp', enabled: true },
    });

    if (!cred || !cred.credentialHash) {
      return false;
    }

    return authenticator.verify({ token: code, secret: cred.credentialHash });
  }

  async disable(userId: bigint): Promise<void> {
    await this.prisma.userCredential.deleteMany({
      where: { userId, method: 'totp' },
    });
  }
}
