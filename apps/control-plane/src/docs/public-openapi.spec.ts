import type { OpenAPIObject } from '@nestjs/swagger';
import {
  buildPublicOpenApiDocument,
  filterPublicSwaggerDocument,
  isPublicOpenApiPath,
} from './public-openapi';

describe('Public OpenAPI specification', () => {
  it('generates a valid OpenAPI 3.0.3 spec containing all developer endpoints', () => {
    const doc = buildPublicOpenApiDocument('https://panel.civonex.ir/');
    expect(doc.openapi).toBe('3.0.3');
    expect(doc.servers?.[0]?.url).toBe('https://panel.civonex.ir');

    const paths = Object.keys(doc.paths);
    expect(paths).toContain('/api/f/{userSlug}/{forwarderSlug}/{path}');
    expect(paths).toContain('/api/forwarders');
    expect(paths).toContain('/api/upstreams/available');
    expect(paths).toContain('/api/gateway/fetch');
    expect(paths).toContain('/api/proxy-credentials');
    expect(paths).toContain('/api/projects');
    expect(paths).toContain('/api/health');

    for (const p of paths) {
      expect(isPublicOpenApiPath(p)).toBe(true);
      expect(p.startsWith('/api/admin')).toBe(false);
      expect(p.startsWith('/api/nodes')).toBe(false);
    }
  });

  it('strips /api suffix from NEXT_PUBLIC_PUBLIC_API_BASE so paths are never double-prefixed', () => {
    const doc1 = buildPublicOpenApiDocument('https://panel.civonex.ir/api');
    const doc2 = buildPublicOpenApiDocument('https://panel.civonex.ir/api/');
    expect(doc1.servers?.[0]?.url).toBe('https://panel.civonex.ir');
    expect(doc2.servers?.[0]?.url).toBe('https://panel.civonex.ir');
  });

  it('filters out all admin, node, and internal endpoints from raw Swagger documents', () => {
    const raw: OpenAPIObject = {
      openapi: '3.0.0',
      info: { title: 'Raw', version: '1.0' },
      paths: {
        '/api/health': { get: { responses: { '200': { description: 'ok' } } } },
        '/api/forwarders': { get: { responses: { '200': { description: 'ok' } } } },
        '/api/admin/upstreams': { get: { responses: { '200': { description: 'secret' } } } },
        '/api/admin/users/{id}': { get: { responses: { '200': { description: 'secret' } } } },
        '/api/nodes/{id}/upstreams': { get: { responses: { '200': { description: 'secret' } } } },
        '/api/metering/ingest': { post: { responses: { '200': { description: 'secret' } } } },
      },
    };

    const filtered = filterPublicSwaggerDocument(raw);
    const paths = Object.keys(filtered.paths);
    expect(paths).toEqual(['/api/health', '/api/forwarders']);
  });
});
