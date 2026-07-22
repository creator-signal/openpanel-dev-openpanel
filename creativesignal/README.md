# Creator Signal extensions

All Creator Signal-owned OpenPanel feature code lives in this workspace package.
Upstream files contain only the smallest integration hooks needed to register
the feature with OpenPanel, build it into the images, and expose the login UI.

## Layout

- `oidc/core.ts`: discovery, PKCE, signed ID-token and required-role validation.
- `oidc/api-callback.ts`: account lookup, locked JIT provisioning and sessions.
- `oidc/client.tsx`: provider-agnostic login button and automatic redirect UI.
- `oidc/public-config.ts`: safe dashboard-only display configuration.
- `oidc/registration.ts`: self-hosted registration and invitation policy.
- `oidc/*.test.ts`: security and registration policy coverage.
- `ui/policy.ts`: Creator Signal UI visibility policy for externally managed identity.
- `ui/*.test.ts`: UI policy coverage.
- `.env.example`: the deployment environment contract.

## Deliberate upstream touchpoints

| Upstream path | Required bridge |
|---|---|
| `pnpm-workspace.yaml` | Registers this workspace package. |
| `packages/trpc/package.json` and `packages/trpc/src/routers/auth.ts` | Starts the OIDC authorisation flow. |
| `apps/api/package.json`, `apps/api/src/app.ts` and `apps/api/src/routes/oauth-callback.router.ts` | Validates startup configuration and registers the callback. |
| `apps/api/tsdown.config.ts` | Bundles the Creator Signal package into the API image. |
| `apps/start/package.json` and the login/onboarding/config files | Exposes safe OIDC settings and the login control. |
| `apps/start/src/routes/_app.$organizationId.tsx` and account route files | Apply the isolated UI policy to the supporter prompt and account controls. |
| `apps/api/Dockerfile` and `apps/start/Dockerfile` | Makes the workspace package available during container builds. |
| `.github/workflows/docker-build.yml` | Builds reviewed multi-architecture images and publishes only from `main`. |
| `pnpm-lock.yaml` | Locks this workspace package and its dependencies. |

No Creator Signal implementation should be added under `packages/` or embedded
in an upstream controller. Future fork features belong under `creativesignal/`
and should follow the same thin-bridge pattern.

When `OIDC_ONLY=true`, account authentication and lifecycle are owned by the
identity provider. The UI policy therefore hides OpenPanel's supporter prompt,
account-deletion control and local two-factor route. These controls remain
unchanged for upstream-compatible deployments where OIDC-only mode is off.

## Published images

Pull requests build all images without publishing them. A commit reaching
`main` publishes:

- `ghcr.io/creator-signal/openpanel-api:sha-<40-character-commit-sha>`
- `ghcr.io/creator-signal/openpanel-dashboard:sha-<40-character-commit-sha>`
- `ghcr.io/creator-signal/openpanel-worker:sha-<40-character-commit-sha>`

`main` and `latest` are convenience tags. Deployments must use a digest from
the successful workflow summary.

## ZITADEL contract

Provision a confidential web OIDC application using authorisation code flow,
PKCE and client-secret basic authentication. Register the callback on the API
origin, not the dashboard origin:

- local: `http://localhost:48211/oauth/oidc/callback`
- production: `https://replay-api.creatorsignal.me/oauth/oidc/callback`

Use [`creativesignal/.env.example`](./.env.example) as the complete variable
contract. The dashboard receives only `OIDC_ENABLED`, `OIDC_DISPLAY_NAME`,
`OIDC_LOGIN_MODE` and `OIDC_ONLY`; the client secret remains API-only.

`OIDC_ALLOW_REGISTRATION=true` permits JIT creation only after signature,
issuer, audience, expiry, nonce, verified-email and required-role validation.
It does not reopen email or social registration. Leave
`OIDC_ALLOW_EMAIL_LINKING=false` except during a controlled account migration.
