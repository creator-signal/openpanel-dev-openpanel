import '@fastify/cookie';
import {
  createSession,
  generateSessionToken,
  setLastAuthProviderCookie,
  setSessionTokenCookie,
} from '@openpanel/auth';
import { connectUserToOrganization, db } from '@openpanel/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  exchangeOidcAuthorizationCode,
  isOidcEnabled,
  type OidcUser,
} from './core';
import { getIsRegistrationAllowed } from './registration';

class OidcCallbackError extends Error {
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'OidcCallbackError';
    this.details = details;
  }
}

interface OpenPanelAccount {
  id: string;
  userId: string;
}

function getCookieSetter(
  reply: FastifyReply
): Parameters<typeof setSessionTokenCookie>[0] {
  return (name, value, options) => reply.setCookie(name, value, options);
}

async function connectInvite({
  inviteId,
  reply,
  userId,
}: {
  inviteId?: string | null;
  reply: FastifyReply;
  userId: string;
}) {
  if (!inviteId) {
    return;
  }

  try {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    await connectUserToOrganization({ user, inviteId });
  } catch (error) {
    reply.log.error(
      { error, inviteId, userId },
      'error connecting OIDC user to organization'
    );
  }
}

async function finishSignIn({
  account,
  inviteId,
  oidcUser,
  reply,
}: {
  account: OpenPanelAccount;
  inviteId?: string | null;
  oidcUser: OidcUser;
  reply: FastifyReply;
}) {
  await db.account.update({
    where: { id: account.id },
    data: {
      provider: 'oidc',
      providerId: oidcUser.id,
      email: oidcUser.email,
    },
  });
  await connectInvite({ inviteId, reply, userId: account.userId });

  const sessionToken = generateSessionToken();
  const session = await createSession(sessionToken, account.userId);
  const setCookie = getCookieSetter(reply);
  setSessionTokenCookie(setCookie, sessionToken, session.expiresAt);
  setLastAuthProviderCookie(setCookie, 'oidc');
  return reply.redirect(
    process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL!
  );
}

async function provisionAndSignIn({
  inviteId,
  oidcUser,
  reply,
}: {
  inviteId?: string | null;
  oidcUser: OidcUser;
  reply: FastifyReply;
}) {
  const existingUser = await db.user.findFirst({
    where: { email: oidcUser.email },
  });
  if (existingUser) {
    throw new OidcCallbackError(
      'Please sign in using your original authentication method',
      { existingUserId: existingUser.id, oidcSubject: oidcUser.id }
    );
  }

  const user = await db.user.create({
    data: {
      email: oidcUser.email,
      firstName: oidcUser.firstName,
      lastName: oidcUser.lastName,
      accounts: {
        create: {
          provider: 'oidc',
          providerId: oidcUser.id,
        },
      },
    },
  });
  await connectInvite({ inviteId, reply, userId: user.id });

  const sessionToken = generateSessionToken();
  const session = await createSession(sessionToken, user.id);
  const setCookie = getCookieSetter(reply);
  setSessionTokenCookie(setCookie, sessionToken, session.expiresAt);
  setLastAuthProviderCookie(setCookie, 'oidc');
  return reply.redirect(
    process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL!
  );
}

function validateCallback(req: FastifyRequest) {
  const query = z
    .object({ code: z.string(), state: z.string() })
    .safeParse(req.query);
  if (!query.success) {
    throw new OidcCallbackError('Invalid callback query params', query.error);
  }

  const storedState = req.cookies.oidc_oauth_state;
  const codeVerifier = req.cookies.oidc_code_verifier;
  const nonce = req.cookies.oidc_nonce;
  if (!(storedState && codeVerifier && nonce)) {
    throw new OidcCallbackError('Missing OIDC callback parameters');
  }
  if (query.data.state !== storedState) {
    throw new OidcCallbackError('OAuth state mismatch');
  }

  return { code: query.data.code, codeVerifier, nonce };
}

function redirectWithError(reply: FastifyReply, error: unknown) {
  const url = new URL(
    process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL!
  );
  url.pathname = '/login';
  url.searchParams.set(
    'error',
    error instanceof OidcCallbackError ? error.message : 'An error occurred'
  );
  url.searchParams.set('correlationId', reply.request.id);
  return reply.redirect(url.toString());
}

export async function oidcCallback(req: FastifyRequest, reply: FastifyReply) {
  try {
    if (!isOidcEnabled()) {
      throw new OidcCallbackError('OIDC is not configured on this instance');
    }

    const callback = validateCallback(req);
    const inviteId = req.cookies.inviteId;
    const oidcUser = await exchangeOidcAuthorizationCode(callback);
    const allowEmailLinking = process.env.OIDC_ALLOW_EMAIL_LINKING === 'true';
    const existingAccount = await db.account.findFirst({
      where: {
        OR: [
          { provider: 'oidc', providerId: oidcUser.id },
          ...(allowEmailLinking
            ? [
                {
                  provider: 'oidc',
                  providerId: null,
                  email: oidcUser.email,
                },
                { user: { email: oidcUser.email } },
              ]
            : []),
        ],
      },
    });

    reply.clearCookie('oidc_code_verifier');
    reply.clearCookie('oidc_nonce');
    reply.clearCookie('oidc_oauth_state');

    if (existingAccount) {
      return await finishSignIn({
        account: existingAccount,
        inviteId,
        oidcUser,
        reply,
      });
    }

    const oidcRegistrationAllowed =
      process.env.OIDC_ALLOW_REGISTRATION === 'true';
    if (
      !(oidcRegistrationAllowed || (await getIsRegistrationAllowed(inviteId)))
    ) {
      throw new OidcCallbackError('Registrations are not allowed');
    }

    return await provisionAndSignIn({ inviteId, oidcUser, reply });
  } catch (error) {
    req.log.error(error);
    return redirectWithError(reply, error);
  }
}
