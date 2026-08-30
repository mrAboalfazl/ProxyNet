/**
 * Integration tests for the control-plane NestJS application.
 * Bootstraps the full AppModule and exercises key endpoints via supertest.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
// supertest exports a function as default; use require() to avoid ESM interop issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');
import { AppModule } from './app.module';

// Set required env vars before the module loads
process.env['DATABASE_URL'] =
  process.env['DATABASE_URL'] ||
  'postgresql://platform:platform_dev@localhost:15432/platform';
process.env['REDIS_URL'] = process.env['REDIS_URL'] || 'redis://localhost:6379';
process.env['JWT_SECRET'] =
  process.env['JWT_SECRET'] ||
  'dev-jwt-secret-change-in-production-at-least-32-chars';
process.env['JWT_EXPIRES_IN'] = process.env['JWT_EXPIRES_IN'] || '30d';
process.env['APP_PORT'] = process.env['APP_PORT'] || '3001';
process.env['NODE_ENV'] = 'test';
process.env['QUOTA_TOKEN_SECRET'] =
  process.env['QUOTA_TOKEN_SECRET'] ||
  'dev-quota-secret-change-in-production-at-least-32-chars';

describe('Control-Plane Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // -----------------------------------------------------------------------
  // Health
  // -----------------------------------------------------------------------
  describe('GET /api/health', () => {
    it('returns { status: "ok" }', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'ok' });
    });
  });

  // -----------------------------------------------------------------------
  // Plans — protected by JWT
  // -----------------------------------------------------------------------
  describe('GET /api/plans', () => {
    it('returns 401 when no auth token is provided', async () => {
      const res = await request(app.getHttpServer()).get('/api/plans');
      expect(res.status).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // Auth — initiate login
  // -----------------------------------------------------------------------
  describe('POST /api/auth/initiate', () => {
    it('returns { availableMethods: [] } for an unknown identifier', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/initiate')
        .send({ identifier: 'nonexistent-user-abc123@nowhere.invalid' })
        .set('Content-Type', 'application/json');

      // Should succeed with 200 and return empty methods (no user leakage)
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ availableMethods: [] });
    });
  });

  // -----------------------------------------------------------------------
  // Nodes — enroll with invalid token
  // -----------------------------------------------------------------------
  describe('POST /api/nodes/enroll', () => {
    it('returns null body (200) or client error for an invalid token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/nodes/enroll')
        .send({ token: 'totally-invalid-token-that-does-not-exist' })
        .set('Content-Type', 'application/json');

      // consumeEnrollmentToken returns null when token not found.
      // NestJS POST defaults to 201; null body returns 201. 400/404 on validation failure.
      expect([200, 201, 400, 404]).toContain(res.status);
    });
  });

  // -----------------------------------------------------------------------
  // Routing snapshot — protected by JWT
  // -----------------------------------------------------------------------
  describe('GET /api/routing/snapshot', () => {
    it('returns 401 when no auth token is provided', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/routing/snapshot',
      );
      expect(res.status).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // Proxy credentials — protected by JWT
  // -----------------------------------------------------------------------
  describe('GET /api/proxy-credentials', () => {
    it('returns 401 when no auth token is provided', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/proxy-credentials',
      );
      expect(res.status).toBe(401);
    });
  });
});
