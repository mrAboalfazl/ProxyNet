import { createGuardrails, generate, generateSecret } from 'otplib';
import { TotpService } from './totp.service';

describe('TOTP deployment compatibility', () => {
  const legacy = createGuardrails({ MIN_SECRET_BYTES: 10 });
  function setup(secret: string) {
    const prisma = { userCredential: { findFirst: jest.fn().mockResolvedValue({ id: 1n, credentialHash: secret }), update: jest.fn() } };
    return { service: new TotpService(prisma as any), prisma };
  }
  it('accepts a generated code and rejects a different six-digit code', async () => {
    const secret = generateSecret();
    const token = await generate({ secret });
    const { service } = setup(secret);
    expect(await service.verify(1n, token)).toBe(true);
    const incorrect = token[0] === '0' ? '1' + token.slice(1) : '0' + token.slice(1);
    expect(await service.verify(1n, incorrect)).toBe(false);
  });
  it('continues accepting legacy 10-byte authenticator secrets', async () => {
    const secret = generateSecret({ length: 10 });
    expect(secret).toHaveLength(16);
    const token = await generate({ secret, guardrails: legacy });
    expect(await setup(secret).service.verify(1n, token)).toBe(true);
  });
  it('rejects malformed input and never enables an invalid setup', async () => {
    const { service, prisma } = setup(generateSecret());
    expect(await service.verify(1n, 'invalid')).toBe(false);
    await expect(service.confirmSetup(1n, 'invalid')).rejects.toThrow('Invalid TOTP code');
    expect(prisma.userCredential.update).not.toHaveBeenCalled();
  });
});
