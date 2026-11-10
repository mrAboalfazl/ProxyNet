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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiBasicAuth,
} from '@nestjs/swagger';
import { GatewayService } from './gateway.service';
import { ProxyCredentialsService } from '../proxy-credentials/proxy-credentials.service';
import { WalletService } from '../wallet/wallet.service';
import { PricingService } from '../wallet/pricing.service';

export class FetchRequestDto {
  @ApiProperty({
    description: 'آدرس کامل مقصد جهت ارسال درخواست (Target URL)',
    example: 'https://api.ipify.org?format=json',
  })
  url: string;

  @ApiPropertyOptional({
    description: 'متد HTTP (پیش‌فرض: GET)',
    example: 'GET',
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'],
    default: 'GET',
  })
  method?: string;

  @ApiPropertyOptional({
    description:
      'هدرهای سفارشی جهت ارسال به مقصد. هدر Authorization به طور کامل به سرور مقصد تحویل داده می‌شود.',
    example: {
      Authorization: 'Bearer YOUR_UPSTREAM_TOKEN',
      'User-Agent': 'ProxyNetClient/1.0',
    },
  })
  headers?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'بدنه درخواست در متدهای POST/PUT (متن معمولی یا Base64)',
    example: '{"key": "value"}',
  })
  body?: string;

  @ApiPropertyOptional({
    description: 'آیا بدنه ارسالی (body) به صورت Base64 انکود شده است؟',
    example: false,
    default: false,
  })
  isBase64?: boolean;

  @ApiPropertyOptional({
    description:
      'فرمت دریافت پاسخ: "auto" (تشخیص خودکار محتوای باینری)، "utf8" یا "base64"',
    enum: ['auto', 'utf8', 'base64'],
    default: 'auto',
  })
  responseEncoding?: 'utf8' | 'base64' | 'auto';

  @ApiPropertyOptional({
    description: 'دنبال کردن خودکار تغییر مسیرهای ۳۰۱، ۳۰۲، ۳۰۳، ۳۰۷ و ۳۰۸',
    example: true,
    default: true,
  })
  followRedirects?: boolean;

  @ApiPropertyOptional({
    description: 'حداکثر دفعات دنبال کردن ریدایرکت (بین ۱ تا ۱۰)',
    example: 5,
    default: 5,
  })
  maxRedirects?: number;

  @ApiPropertyOptional({
    description:
      'نادیده گرفتن خطاهای گواهی SSL (جهت سرورهای دارای Self-Signed SSL)',
    example: false,
    default: false,
  })
  insecure?: boolean;

  @ApiPropertyOptional({
    description: 'مهلت زمانی پاسخ به میلی‌ثانیه (بین ۱,۰۰۰ تا ۶۰,۰۰۰ میلی‌ثانیه)',
    example: 30000,
    default: 30000,
  })
  timeoutMs?: number;
}

@ApiTags('gateway')
@ApiBasicAuth()
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
   * Body: FetchRequestDto
   *
   * Charges the user's wallet once per observable request.
   * Returns 402 Payment Required if wallet is below the minimum before the call runs.
   */
  @Post('fetch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'درگاه ارسال درخواست خروج (HTTP Outbound Gateway)',
    description:
      'ارسال درخواست‌های HTTP/HTTPS از طریق نودهای خروج پروکسی‌نت با پشتیبانی از احراز هویت مقصد، فایل‌های باینری، ریدایرکت و SSL خودامضا.',
  })
  @ApiResponse({
    status: 200,
    description: 'درخواست با موفقیت توسط نود خروج انجام شد و پاسخ بازگردانده شد.',
  })
  @ApiResponse({
    status: 401,
    description: 'عدم احراز هویت اعتبارنامه کاربری (نیازمند Basic Auth معتبر).',
  })
  @ApiResponse({
    status: 402,
    description: 'موجودی کیف پول برای ارسال درخواست کافی نیست.',
  })
  async fetch(
    @Headers('authorization') authHeader: string,
    @Body() body: FetchRequestDto,
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
      isBase64: body.isBase64,
      responseEncoding: body.responseEncoding,
      followRedirects: body.followRedirects,
      maxRedirects: body.maxRedirects,
      insecure: body.insecure,
      timeoutMs: body.timeoutMs,
      userId: verified.userId,
    });

    // Post-charge (fire-and-forget so a metering failure never breaks the response)
    const cost = this.pricing.computeRequestCost(pricing);
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
