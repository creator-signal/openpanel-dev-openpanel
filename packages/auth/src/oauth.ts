import { GitHub, Google, OAuth2Client } from 'arctic';
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from 'jose';

export type { OAuth2Tokens } from 'arctic';
export * as Arctic from 'arctic';

export const github = new GitHub(
  process.env.GITHUB_CLIENT_ID ?? '',
  process.env.GITHUB_CLIENT_SECRET ?? '',
  process.env.GITHUB_REDIRECT_URI ?? ''
);

export const google = new Google(
  process.env.GOOGLE_CLIENT_ID ?? '',
  process.env.GOOGLE_CLIENT_SECRET ?? '',
  process.env.GOOGLE_REDIRECT_URI ?? ''
);

export const googleGsc = new Google(
  process.env.GOOGLE_CLIENT_ID ?? '',
  process.env.GOOGLE_CLIENT_SECRET ?? '',
  process.env.GSC_GOOGLE_REDIRECT_URI ?? ''
);

export interface OidcConfiguration {
  clientId: string;
  clientSecret: string;
  discoveryUrl: string;
  issuer: string;
  redirectUri: string;
  requiredClaim?: string;
  requiredValue?: string;
  scopes: string[];
}

export interface OidcMetadata {
  authorizationEndpoint: string;
  issuer: string;
  jwksUri: string;
  signingAlgorithms?: string[];
  tokenEndpoint: string;
}

export interface VerifiedOidcClaims extends JWTPayload {
  email: string;
  email_verified: true;
  sub: string;
}

const metadataCache = new Map<string, Promise<OidcMetadata>>();
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when OIDC_ENABLED=true`);
  }
  return value;
}

function normalizeIssuer(value: string): string {
  return value.replace(/\/+$/, '');
}

function assertSecureUrl(value: string, name: string): URL {
  const url = new URL(value);
  const local =
    url.hostname === 'localhost' ||
    url.hostname.endsWith('.localhost') ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '::1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error(`${name} must use HTTPS outside localhost`);
  }
  return url;
}

export function isOidcEnabled(): boolean {
  return process.env.OIDC_ENABLED === 'true';
}

export function getOidcConfiguration(): OidcConfiguration {
  if (!isOidcEnabled()) {
    throw new Error('OIDC is not enabled on this instance');
  }

  const issuer = normalizeIssuer(requiredEnvironment('OIDC_ISSUER'));
  assertSecureUrl(issuer, 'OIDC_ISSUER');

  const discoveryUrl =
    process.env.OIDC_DISCOVERY_URL?.trim() ||
    `${issuer}/.well-known/openid-configuration`;
  assertSecureUrl(discoveryUrl, 'OIDC_DISCOVERY_URL');

  const redirectUri = requiredEnvironment('OIDC_REDIRECT_URI');
  assertSecureUrl(redirectUri, 'OIDC_REDIRECT_URI');

  const requiredClaim = process.env.OIDC_REQUIRED_CLAIM?.trim() || undefined;
  const requiredValue = process.env.OIDC_REQUIRED_VALUE?.trim() || undefined;
  if (!!requiredClaim !== !!requiredValue) {
    throw new Error(
      'OIDC_REQUIRED_CLAIM and OIDC_REQUIRED_VALUE must be configured together'
    );
  }

  const extraScopes = (process.env.OIDC_EXTRA_SCOPES ?? '')
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  return {
    clientId: requiredEnvironment('OIDC_CLIENT_ID'),
    clientSecret: requiredEnvironment('OIDC_CLIENT_SECRET'),
    discoveryUrl,
    issuer,
    redirectUri,
    requiredClaim,
    requiredValue,
    scopes: [...new Set(['openid', 'profile', 'email', ...extraScopes])],
  };
}

function parseMetadata(
  value: unknown,
  config: OidcConfiguration
): OidcMetadata {
  if (!value || typeof value !== 'object') {
    throw new Error('OIDC discovery returned an invalid document');
  }

  const document = value as Record<string, unknown>;
  const issuer =
    typeof document.issuer === 'string' ? normalizeIssuer(document.issuer) : '';
  const authorizationEndpoint = document.authorization_endpoint;
  const tokenEndpoint = document.token_endpoint;
  const jwksUri = document.jwks_uri;

  if (issuer !== config.issuer) {
    throw new Error('OIDC discovery issuer does not match OIDC_ISSUER');
  }
  if (
    typeof authorizationEndpoint !== 'string' ||
    typeof tokenEndpoint !== 'string' ||
    typeof jwksUri !== 'string'
  ) {
    throw new Error('OIDC discovery is missing required endpoints');
  }

  assertSecureUrl(authorizationEndpoint, 'authorization_endpoint');
  assertSecureUrl(tokenEndpoint, 'token_endpoint');
  assertSecureUrl(jwksUri, 'jwks_uri');

  const signingAlgorithms = Array.isArray(
    document.id_token_signing_alg_values_supported
  )
    ? document.id_token_signing_alg_values_supported.filter(
        (algorithm): algorithm is string => typeof algorithm === 'string'
      )
    : undefined;

  return {
    authorizationEndpoint,
    issuer,
    jwksUri,
    signingAlgorithms,
    tokenEndpoint,
  };
}

export async function getOidcMetadata(): Promise<OidcMetadata> {
  const config = getOidcConfiguration();
  let promise = metadataCache.get(config.discoveryUrl);
  if (!promise) {
    promise = (async () => {
      const response = await fetch(config.discoveryUrl, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        throw new Error(`OIDC discovery failed with HTTP ${response.status}`);
      }
      return parseMetadata(await response.json(), config);
    })();
    metadataCache.set(config.discoveryUrl, promise);
    promise.catch(() => metadataCache.delete(config.discoveryUrl));
  }
  return promise;
}

export function oidcClaimContainsValue(
  claim: unknown,
  expectedValue: string
): boolean {
  if (typeof claim === 'string') {
    return claim === expectedValue;
  }
  if (Array.isArray(claim)) {
    return claim.some((value) => oidcClaimContainsValue(value, expectedValue));
  }
  if (claim && typeof claim === 'object') {
    const record = claim as Record<string, unknown>;
    return (
      Object.hasOwn(record, expectedValue) ||
      Object.values(record).some((value) =>
        oidcClaimContainsValue(value, expectedValue)
      )
    );
  }
  return false;
}

export async function verifyOidcIdToken(
  idToken: string,
  expectedNonce: string
): Promise<VerifiedOidcClaims> {
  const config = getOidcConfiguration();
  const metadata = await getOidcMetadata();
  let jwks = jwksCache.get(metadata.jwksUri);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(metadata.jwksUri));
    jwksCache.set(metadata.jwksUri, jwks);
  }

  const { payload } = await jwtVerify(idToken, jwks, {
    algorithms: metadata.signingAlgorithms,
    audience: config.clientId,
    clockTolerance: 5,
    issuer: config.issuer,
  });

  if (payload.nonce !== expectedNonce) {
    throw new Error('OIDC ID token nonce mismatch');
  }
  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('OIDC ID token is missing sub');
  }
  if (typeof payload.email !== 'string' || !payload.email) {
    throw new Error('OIDC ID token is missing email');
  }
  if (payload.email_verified !== true) {
    throw new Error('OIDC email is not verified');
  }
  if (
    config.requiredClaim &&
    config.requiredValue &&
    !oidcClaimContainsValue(payload[config.requiredClaim], config.requiredValue)
  ) {
    throw new Error('OIDC user does not have the required claim');
  }

  return payload as VerifiedOidcClaims;
}

export const oidc = new OAuth2Client(
  process.env.OIDC_CLIENT_ID ?? '',
  process.env.OIDC_CLIENT_SECRET ?? '',
  process.env.OIDC_REDIRECT_URI ?? ''
);
