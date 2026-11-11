import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Query,
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
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
} from 'class-validator';
import { GatewayService } from './gateway.service';
import { ProxyCredentialsService } from '../proxy-credentials/proxy-credentials.service';
import { WalletService } from '../wallet/wallet.service';
import { PricingService } from '../wallet/pricing.service';

export class FetchRequestDto {
  @ApiProperty({
    description: 'آدرس کامل مقصد جهت ارسال درخواست (Target URL)',
    example: 'https://api.ipify.org?format=json',
  })
  @IsString()
  @IsNotEmpty()
  url: string;

  @ApiPropertyOptional({
    description: 'متد HTTP (پیش‌فرض: GET)',
    example: 'GET',
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'],
    default: 'GET',
  })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional({
    description:
      'هدرهای سفارشی جهت ارسال به مقصد. هدر Authorization به طور کامل به سرور مقصد تحویل داده می‌شود.',
    example: {
      Authorization: 'Bearer YOUR_UPSTREAM_TOKEN',
      'User-Agent': 'ProxyNetClient/1.0',
    },
  })
  @IsOptional()
  headers?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'بدنه درخواست در متدهای POST/PUT (متن معمولی یا Base64)',
    example: '{"key": "value"}',
  })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({
    description: 'آیا بدنه ارسالی (body) به صورت Base64 انکود شده است؟',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isBase64?: boolean;

  @ApiPropertyOptional({
    description:
      'فرمت دریافت پاسخ: "auto" (تشخیص خودکار محتوای باینری)، "utf8" یا "base64"',
    enum: ['auto', 'utf8', 'base64'],
    default: 'auto',
  })
  @IsOptional()
  @IsString()
  responseEncoding?: 'utf8' | 'base64' | 'auto';

  @ApiPropertyOptional({
    description: 'دنبال کردن خودکار تغییر مسیرهای ۳۰۱، ۳۰۲، ۳۰۳، ۳۰۷ و ۳۰۸',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  followRedirects?: boolean;

  @ApiPropertyOptional({
    description: 'حداکثر دفعات دنبال کردن ریدایرکت (بین ۱ تا ۱۰)',
    example: 5,
    default: 5,
  })
  @IsOptional()
  @IsNumber()
  maxRedirects?: number;

  @ApiPropertyOptional({
    description:
      'نادیده گرفتن خطاهای گواهی SSL (جهت سرورهای دارای Self-Signed SSL)',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  insecure?: boolean;

  @ApiPropertyOptional({
    description: 'مهلت زمانی پاسخ به میلی‌ثانیه (بین ۱,۰۰۰ تا ۶۰,۰۰۰ میلی‌ثانیه)',
    example: 30000,
    default: 30000,
  })
  @IsOptional()
  @IsNumber()
  timeoutMs?: number;

  @ApiPropertyOptional({
    description:
      'در صورت خطای یک نود، به‌صورت خودکار نودهای سالم بعدی امتحان شوند.',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  failover?: boolean;

  @ApiPropertyOptional({
    description: 'حداکثر تعداد نودهای امتحان‌شده در حالت failover (۱ تا ۵)',
    example: 3,
    default: 3,
  })
  @IsOptional()
  @IsNumber()
  maxAttempts?: number;

  @ApiPropertyOptional({
    description: 'اجبار به خروج از یک کشور مشخص (مثلاً DE)',
    example: 'DE',
  })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({
    description:
      'در حالت auto، اگر همه نودها خطا دادند از خروجی مستقیم سرور پنل استفاده شود. برای کارهای حساس به IP خاموش بماند.',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  allowLocalFallback?: boolean;
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
    @Headers('x-api-key') apiKeyHeader: string,
    @Body() body: FetchRequestDto,
  ) {
    const { uuid, userId } = await this.authenticate(authHeader, apiKeyHeader);

    if (!body?.url) {
      throw new BadRequestException('url is required');
    }

    // Pre-flight balance check
    const pricing = await this.pricing.get();
    const hasBalance = await this.wallet.hasMinBalance(userId, pricing.minBalanceToman);
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
      failover: body.failover,
      maxAttempts: body.maxAttempts,
      country: body.country,
      allowLocalFallback: body.allowLocalFallback,
      userId,
    });

    // Post-charge (fire-and-forget so a metering failure never breaks the response)
    const cost = this.pricing.computeRequestCost(pricing);
    this.wallet
      .chargeSilently(userId, cost, 'gateway_call', `${body.method ?? 'GET'} ${body.url}`.slice(0, 200), {
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

  @Get('nodes')
  @ApiOperation({
    summary: 'وضعیت نودهای قابل استفاده',
    description:
      'نودهای سالم/فعال قابل استفاده برای این API Key را برمی‌گرداند تا کلاینت بداند کدام نودها در دسترس هستند.',
  })
  async nodes(
    @Headers('authorization') authHeader: string,
    @Headers('x-api-key') apiKeyHeader: string,
    @Query('country') country?: string,
  ) {
    const { userId } = await this.authenticate(authHeader, apiKeyHeader);
    return this.gateway.listNodes(userId, country ?? null);
  }

  private async authenticate(
    authHeader?: string,
    apiKeyHeader?: string,
  ): Promise<{ uuid: string; userId: bigint }> {
    let token: string | undefined;

    if (authHeader?.startsWith('Basic ')) {
      token = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    } else if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (apiKeyHeader?.trim()) {
      token = apiKeyHeader.trim();
    }

    if (!token) {
      throw new UnauthorizedException(
        'API key required: use Basic, Bearer <uuid:secret>, or X-Api-Key',
      );
    }

    let decoded = token;
    if (!decoded.includes(':')) {
      try {
        const base64Decoded = Buffer.from(token, 'base64').toString('utf8');
        if (base64Decoded.includes(':')) decoded = base64Decoded;
      } catch {
        /* keep raw token */
      }
    }

    const colon = decoded.indexOf(':');
    if (colon < 1) {
      throw new UnauthorizedException('Malformed API key (expected uuid:secret)');
    }

    const uuid = decoded.slice(0, colon);
    const secret = decoded.slice(colon + 1);
    const verified = await this.credentials.verify(uuid, secret);
    if (!verified.valid) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }
    return { uuid, userId: verified.userId };
  }
}
