import { Controller, Get, Header, Req } from '@nestjs/common';
import type { Request } from 'express';
import { buildPublicOpenApiDocument } from './public-openapi';

@Controller()
export class DocsController {
  @Get('openapi.json')
  @Header('Cache-Control', 'public, max-age=300')
  @Header('Content-Type', 'application/json; charset=utf-8')
  getPublicOpenApi(@Req() req: Request) {
    const envBase = process.env.NEXT_PUBLIC_PUBLIC_API_BASE?.trim();
    const proto =
      (req.headers['x-forwarded-proto'] as string | undefined)
        ?.split(',')[0]
        ?.trim() ||
      req.protocol ||
      'https';
    const host =
      (req.headers['x-forwarded-host'] as string | undefined)
        ?.split(',')[0]
        ?.trim() || req.get('host');

    const baseUrl = envBase || (host ? `${proto}://${host}` : 'https://panel.civonex.ir');
    return buildPublicOpenApiDocument(baseUrl);
  }
}
