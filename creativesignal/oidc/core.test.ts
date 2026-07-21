import { createServer, type Server } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  getOidcConfiguration,
  oidcClaimContainsValue,
  verifyOidcIdToken,
} from './core';

const originalEnvironment = { ...process.env };
let server: Server;
let issuer: string;
let privateKey: CryptoKey;

beforeAll(async () => {
  const keys = await generateKeyPair('RS256');
  privateKey = keys.privateKey;
  const publicJwk = await exportJWK(keys.publicKey);

  server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/.well-known/openid-configuration') {
      response.end(
        JSON.stringify({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
          id_token_signing_alg_values_supported: ['RS256'],
        })
      );
      return;
    }
    if (request.url === '/jwks') {
      response.end(
        JSON.stringify({ keys: [{ ...publicJwk, alg: 'RS256', kid: 'test' }] })
      );
      return;
    }
    response.statusCode = 404;
    response.end('{}');
  });

  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve())
  );
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('OIDC test server did not bind to a TCP port');
  }
  issuer = `http://127.0.0.1:${address.port}`;

  Object.assign(process.env, {
    OIDC_ENABLED: 'true',
    OIDC_ISSUER: issuer,
    OIDC_CLIENT_ID: 'openpanel-test',
    OIDC_CLIENT_SECRET: 'test-secret',
    OIDC_REDIRECT_URI: 'http://localhost:3333/oauth/oidc/callback',
    OIDC_REQUIRED_CLAIM: 'urn:zitadel:iam:org:project:roles',
    OIDC_REQUIRED_VALUE: 'platform:operator',
  });
});

afterAll(async () => {
  process.env = originalEnvironment;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

async function signToken(overrides: Record<string, unknown> = {}) {
  return new SignJWT({
    email: 'operator@example.com',
    email_verified: true,
    nonce: 'expected-nonce',
    'urn:zitadel:iam:org:project:roles': {
      'platform:operator': { organization: 'Creator Signal' },
    },
    ...overrides,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(issuer)
    .setAudience('openpanel-test')
    .setSubject('operator-id')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

describe('OIDC configuration', () => {
  it('uses discovery and adds configured scopes', () => {
    process.env.OIDC_EXTRA_SCOPES =
      'urn:zitadel:iam:org:project:role:platform:operator';
    const config = getOidcConfiguration();
    expect(config.discoveryUrl).toBe(
      `${issuer}/.well-known/openid-configuration`
    );
    expect(config.scopes).toContain('openid');
    expect(config.scopes).toContain(
      'urn:zitadel:iam:org:project:role:platform:operator'
    );
  });

  it('recognises roles in ZITADEL claim objects', () => {
    expect(
      oidcClaimContainsValue(
        { 'platform:operator': { organization: 'Creator Signal' } },
        'platform:operator'
      )
    ).toBe(true);
  });
});

describe('OIDC ID token verification', () => {
  it('accepts a signed operator token with the expected nonce', async () => {
    await expect(
      verifyOidcIdToken(await signToken(), 'expected-nonce')
    ).resolves.toMatchObject({
      email: 'operator@example.com',
      email_verified: true,
      sub: 'operator-id',
    });
  });

  it('rejects a nonce mismatch', async () => {
    await expect(
      verifyOidcIdToken(await signToken(), 'different-nonce')
    ).rejects.toThrow('nonce mismatch');
  });

  it('rejects an unverified email', async () => {
    await expect(
      verifyOidcIdToken(
        await signToken({ email_verified: false }),
        'expected-nonce'
      )
    ).rejects.toThrow('email is not verified');
  });

  it('rejects a user without the required role', async () => {
    await expect(
      verifyOidcIdToken(
        await signToken({ 'urn:zitadel:iam:org:project:roles': {} }),
        'expected-nonce'
      )
    ).rejects.toThrow('required claim');
  });

  it('rejects a token issued to a different client', async () => {
    const token = await new SignJWT({
      email: 'operator@example.com',
      email_verified: true,
      nonce: 'expected-nonce',
      'urn:zitadel:iam:org:project:roles': {
        'platform:operator': {},
      },
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(issuer)
      .setAudience('another-client')
      .setSubject('operator-id')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    await expect(verifyOidcIdToken(token, 'expected-nonce')).rejects.toThrow();
  });
});
