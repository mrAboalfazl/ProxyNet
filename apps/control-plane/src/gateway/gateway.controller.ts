import {
  Controller,
  Post,
  Body,
  Headers,
  UnauthorizedException,
  BadRequestException,
  HttpCode,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GatewayService } from './gateway.service';
import { ProxyCredentialsService } from '../proxy-credentials/proxy-credentials.service';
import { WalletService } from '../wallet/wallet.service';
import { PricingService } from '../wallet/pricing.service';

@ApiTags('gateway')
@Controller('gateway')
export class GatewayController {
  constructor(
    private readonly gateway: GatewayService,
    private readonly credentials: ProxyCredentialsService,
    private readonly wallet: WalletService,
    private readonly pricing: PricingService,
  ) {}

  /**
   * HTTP fetch proxy — route an outbound HTTP request through this server.
   *
   * Auth: Basic <base64(uuid:secret)>
   * Body: { url, method?, headers?, body? }
   *
   * Charges the user's wallet: perRequest + ceil((bytesIn+bytesOut)/MB) * perMB toman.
   * Returns 402 Payment Required if wallet is below the minimum before the call runs.
   */
  @Post('fetch')
  @HttpCode(HttpStatus.OK)
  async fetch(
    @Headers('authorization') authHeader: string,
    @Body() body: { url: string; method?: string; headers?: Record<string, string>; body?: string },
  ) {
    if (!authHeader?.startsWith('Basic ')) {
      throw new UnauthorizedException('Basic authentication required (uuid:secret)');
    }

    let uuid: string;
    let secret: string;
    try {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
      const colon = decoded.indexOf(':');
      if (colon < 1) throw new Error();
      uuid = decoded.slice(0, colon);
      secret = decoded.slice(colon + 1);
    } catch {
      throw new UnauthorizedException('Malformed Basic auth header');
    }

    const verified = await this.credentials.verify(uuid, secret);
    if (!verified.valid) {
      throw new UnauthorizedException('Invalid or revoked proxy credential');
    }
    if (!body?.url) {
      throw new BadRequestException('url is required');
    }

    // Pre-flight balance check
    const pricing = await this.pricing.get();
    const hasBalance = await this.wallet.hasMinBalance(verified.userId, pricing.minBalanceToman);
    if (!hasBalance) {
      throw new HttpException(
        {
          error: 'insufficient_balance',
          message: 'Top up your wallet to continue',
          minBalanceToman: pricing.minBalanceToman.toString(),
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    const result = await this.gateway.fetch({
      url: body.url,
      method: body.method,
      headers: body.headers,
      body: body.body,
      userId: verified.userId,
    });

    // Post-charge (fire-and-forget so a metering failure never breaks the response)
    const cost = this.pricing.computeCost(result.bytesIn, result.bytesOut, pricing);
    this.wallet
      .chargeSilently(verified.userId, cost, 'gateway_call', `${body.method ?? 'GET'} ${body.url}`.slice(0, 200), {
        requestUrl: body.url,
        bytesIn: result.bytesIn,
        bytesOut: result.bytesOut,
        credentialUuid: uuid,
        nodeId: result.viaNodeId,
      });

    return {
      ...result,
      costToman: cost.toString(),
    };
  }
}
