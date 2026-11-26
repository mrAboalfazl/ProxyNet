import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';

const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function randomSlug(len: number): string {
  const buf = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += B62[buf[i] % B62.length];
  return out;
}

export interface CreateProjectDto {
  name: string;
  defaultMode?: string;
}

export interface UpdateProjectDto {
  name?: string;
  defaultMode?: string;
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every user gets a Default project on first use so existing forwarders and
   * credentials (created before projects existed) have a home.
   */
  async ensureDefault(userId: bigint): Promise<void> {
    const count = await this.prisma.project.count({ where: { userId } });
    if (count > 0) return;

    const project = await this.prisma.project.create({
      data: { userId, name: 'Default', slug: randomSlug(12) },
    });

    await this.prisma.forwarder.updateMany({
      where: { userId, projectId: null },
      data: { projectId: project.id },
    });
    await this.prisma.proxyCredential.updateMany({
      where: { userId, projectId: null },
      data: { projectId: project.id },
    });
  }

  async list(userId: bigint) {
    let projects = await this.prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    if (projects.length === 0) {
      await this.ensureDefault(userId);
      projects = await this.prisma.project.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
    }

    const [forwarders, credentials] = await Promise.all([
      this.prisma.forwarder.findMany({
        where: { userId },
        select: { projectId: true, enabled: true },
      }),
      this.prisma.proxyCredential.findMany({
        where: { userId, revokedAt: null },
        select: { projectId: true, enabled: true },
      }),
    ]);

    return projects.map((p) => {
      const fwds = forwarders.filter((f) => f.projectId === p.id);
      const creds = credentials.filter((c) => c.projectId === p.id);
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        defaultMode: p.defaultMode,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        recordCount: fwds.length + creds.length,
        activeCount:
          fwds.filter((f) => f.enabled).length +
          creds.filter((c) => c.enabled).length,
        forwarderCount: fwds.length,
        credentialCount: creds.length,
      };
    });
  }

  async create(userId: bigint, dto: CreateProjectDto) {
    const name = (dto.name ?? '').trim();
    if (!name || name.length > 80) {
      throw new BadRequestException('name is required (max 80 chars)');
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.project.create({
          data: {
            userId,
            name,
            slug: randomSlug(12),
            defaultMode: dto.defaultMode === 'country' ? 'country' : 'auto',
          },
        });
      } catch (e: unknown) {
        if ((e as { code?: string })?.code === 'P2002' && attempt < 4) continue;
        throw e;
      }
    }
    throw new Error('failed to generate a unique project slug');
  }

  async detail(userId: bigint, id: bigint) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { user: { select: { publicSlug: true } } },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.userId !== userId) throw new ForbiddenException('You do not own this project');

    const [forwarders, credentials] = await Promise.all([
      this.prisma.forwarder.findMany({
        where: { userId, projectId: id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.proxyCredential.findMany({
        where: { userId, projectId: id, revokedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const records = [
      ...forwarders.map((f) => ({
        id: `f-${f.id}`,
        rawId: f.id,
        type: 'forwarder' as const,
        label: f.label,
        enabled: f.enabled,
        routingMode: f.countryCodes.length ? 'country' : 'auto',
        countryCode: f.countryCodes[0] ?? f.countryCode ?? null,
        countryCodes: f.countryCodes,
        exitNodeId: f.exitNodeId,
        targetUrl: f.targetUrl,
        slug: f.slug,
        preservePath: f.preservePath,
        preserveQuery: f.preserveQuery,
        forwardAuthHeader: f.forwardAuthHeader,
        callCount: f.callCount,
        bytesIn: f.bytesIn,
        bytesOut: f.bytesOut,
        lastUsedAt: f.lastUsedAt,
        createdAt: f.createdAt,
      })),
      ...credentials.map((c) => ({
        id: `c-${c.id}`,
        rawId: c.id,
        type: 'socks5' as const,
        label: c.label ?? 'SOCKS5',
        enabled: c.enabled,
        routingMode: c.routingMode,
        countryCode: c.countryCode,
        countryCodes: c.countryCode ? [c.countryCode] : [],
        uuid: c.uuid,
        exitNodeId: c.exitNodeId,
        callCount: c.callCount ?? 0n,
        bytesIn: c.bytesIn ?? 0n,
        bytesOut: c.bytesOut ?? 0n,
        lastUsedAt: c.lastUsedAt ?? null,
        createdAt: c.createdAt,
      })),
    ];

    records.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    return {
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        defaultMode: project.defaultMode,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
      userSlug: project.user?.publicSlug ?? '',
      records,
    };
  }

  async update(userId: bigint, id: bigint, dto: UpdateProjectDto) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.userId !== userId) throw new ForbiddenException('You do not own this project');

    if (dto.name !== undefined && (dto.name.trim().length === 0 || dto.name.length > 80)) {
      throw new BadRequestException('name must be 1-80 chars');
    }

    return this.prisma.project.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name.trim() : undefined,
        defaultMode:
          dto.defaultMode !== undefined
            ? dto.defaultMode === 'country'
              ? 'country'
              : 'auto'
            : undefined,
      },
    });
  }

  async remove(userId: bigint, id: bigint): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.userId !== userId) throw new ForbiddenException('You do not own this project');
    await this.prisma.project.delete({ where: { id } });
  }
}
