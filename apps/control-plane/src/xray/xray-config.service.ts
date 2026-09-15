import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { PrismaService } from '../prisma/prisma.service';

const execAsync = promisify(exec);
const XRAY_CONFIG_PATH = process.env.XRAY_CONFIG_PATH ?? '/root/xray.json';
const XRAY_FLOW = 'xtls-rprx-vision';

@Injectable()
export class XrayConfigService implements OnApplicationBootstrap {
  private readonly logger = new Logger(XrayConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    await this.syncAll();
  }

  // ── Private helpers ─────────────────────────────────────────

  private readConfig(): Record<string, unknown> | null {
    if (!existsSync(XRAY_CONFIG_PATH)) {
      this.logger.warn(`xray config not found at ${XRAY_CONFIG_PATH} — skipping sync`);
      return null;
    }
    try {
      return JSON.parse(readFileSync(XRAY_CONFIG_PATH, 'utf8'));
    } catch (e) {
      this.logger.error(`Failed to parse xray config: ${e}`);
      return null;
    }
  }

  private writeConfig(config: Record<string, unknown>): boolean {
    try {
      writeFileSync(XRAY_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
      return true;
    } catch (e) {
      this.logger.error(`Failed to write xray config: ${e}`);
      return false;
    }
  }

  private async reloadXray(): Promise<void> {
    try {
      // Try pm2 first, fall back to SIGHUP
      await execAsync('pm2 reload xray-core --silent 2>/dev/null || kill -HUP $(pgrep -f "xray run") 2>/dev/null || true');
      this.logger.log('xray reloaded');
    } catch (e) {
      this.logger.warn(`xray reload warning: ${e}`);
    }
  }

  private getEdgeInbound(config: Record<string, unknown>) {
    const inbounds = config.inbounds as Array<Record<string, unknown>>;
    return inbounds?.find((i) => i.tag === 'inbound-edge') ?? inbounds?.[0] ?? null;
  }

  // ── Public API ───────────────────────────────────────────────

  async addClient(uuid: string): Promise<void> {
    const config = this.readConfig();
    if (!config) return;

    const inbound = this.getEdgeInbound(config);
    if (!inbound) return;

    const settings = inbound.settings as Record<string, unknown>;
    const clients = (settings.clients as Array<{ id: string; flow: string }>) ?? [];

    if (clients.find((c) => c.id === uuid)) return; // already present

    clients.push({ id: uuid, flow: XRAY_FLOW });
    settings.clients = clients;

    if (this.writeConfig(config)) {
      await this.reloadXray();
      this.logger.log(`xray: added client ${uuid}`);
    }
  }

  async removeClient(uuid: string): Promise<void> {
    const config = this.readConfig();
    if (!config) return;

    const inbound = this.getEdgeInbound(config);
    if (!inbound) return;

    const settings = inbound.settings as Record<string, unknown>;
    const clients = (settings.clients as Array<{ id: string }>) ?? [];
    const before = clients.length;

    settings.clients = clients.filter((c) => c.id !== uuid);
    if ((settings.clients as unknown[]).length === before) return; // nothing changed

    if (this.writeConfig(config)) {
      await this.reloadXray();
      this.logger.log(`xray: removed client ${uuid}`);
    }
  }

  async syncAll(): Promise<void> {
    const config = this.readConfig();
    if (!config) return;

    // Fetch all active (non-revoked) credential UUIDs from DB
    const credentials = await this.prisma.proxyCredential.findMany({
      where: { enabled: true, revokedAt: null },
      select: { uuid: true },
    });

    const inbound = this.getEdgeInbound(config);
    if (!inbound) return;

    const settings = inbound.settings as Record<string, unknown>;
    settings.clients = credentials.map((c) => ({ id: c.uuid, flow: XRAY_FLOW }));

    if (this.writeConfig(config)) {
      await this.reloadXray();
      this.logger.log(`xray: synced ${credentials.length} clients`);
    }
  }
}
