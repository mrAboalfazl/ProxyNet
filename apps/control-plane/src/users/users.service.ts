import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

export interface CreateUserDto {
  displayName: string;
  email?: string;
  phone?: string;
  telegramId?: string;
  password?: string;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          dto.email ? { email: dto.email } : undefined,
          dto.phone ? { phone: dto.phone } : undefined,
          dto.telegramId ? { telegramId: dto.telegramId } : undefined,
        ].filter(Boolean),
      },
    });
    if (existing) throw new ConflictException('User already exists with this identifier');

    const user = await this.prisma.user.create({
      data: {
        displayName: dto.displayName,
        email: dto.email,
        phone: dto.phone,
        telegramId: dto.telegramId,
      },
    });

    if (dto.password) {
      const hash = await bcrypt.hash(dto.password, 12);
      await this.prisma.userCredential.create({
        data: {
          userId: user.id,
          method: 'password',
          credentialHash: hash,
          isPrimary: true,
        },
      });
    }

    await this.prisma.userRoutingPreference.create({
      data: { userId: user.id },
    });

    return this.findById(user.id);
  }

  async findById(id: bigint) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        subscriptions: {
          where: { status: 'active' },
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        routingPreference: true,
        usageAccount: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findMany(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.user.count(),
    ]);
    return { users, total, page, limit };
  }

  async updateStatus(id: bigint, status: 'active' | 'suspended' | 'banned') {
    return this.prisma.user.update({ where: { id }, data: { status } });
  }

  async updateRoutingPreference(
    userId: bigint,
    preference: { routingMode?: string; preferredCountry?: string },
  ) {
    return this.prisma.userRoutingPreference.upsert({
      where: { userId },
      create: { userId, ...preference },
      update: preference,
    });
  }
}
