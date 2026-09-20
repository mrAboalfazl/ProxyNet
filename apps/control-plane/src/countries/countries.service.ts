import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CountriesService {
  constructor(private prisma: PrismaService) {}

  findAll(enabledOnly = true) {
    return this.prisma.country.findMany({
      where: enabledOnly ? { enabled: true } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async getPoolStatus() {
    const countries = await this.prisma.country.findMany({
      where: { enabled: true },
      include: {
        nodes: {
          where: { roles: { has: 'exit' } },
          select: { status: true },
        },
      },
    });

    return countries.map((c) => ({
      code: c.code,
      name: c.name,
      healthy: c.nodes.filter((n) => n.status === 'healthy').length,
      active: c.nodes.filter((n) => n.status === 'active').length,
      degraded: c.nodes.filter((n) => n.status === 'degraded').length,
      unhealthy: c.nodes.filter((n) => n.status === 'unhealthy').length,
      total: c.nodes.length,
      // Node selection accepts healthy nodes and newly enrolled active nodes.
      // Degraded nodes remain visible for diagnostics but are not selected.
      available: c.nodes.some(
        (n) => n.status === 'healthy' || n.status === 'active',
      ),
    }));
  }

  async upsert(code: string, name: string) {
    return this.prisma.country.upsert({
      where: { code },
      create: { code, name },
      update: { name },
    });
  }

  async setEnabled(code: string, enabled: boolean) {
    return this.prisma.country.update({ where: { code }, data: { enabled } });
  }
}
