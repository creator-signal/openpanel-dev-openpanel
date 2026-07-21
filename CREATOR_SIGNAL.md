# Creator Signal fork operations

This fork adds generic, discovery-based OIDC so OpenPanel can use the shared
Creator Signal ZITADEL login directly. It also publishes reviewed OpenPanel
images from `main`.

## Published images

The `Validate and publish OpenPanel images` workflow builds all images on pull
requests without publishing them. After a commit reaches `main`, it publishes:

- `ghcr.io/creator-signal/openpanel-api:sha-<40-character-commit-sha>`
- `ghcr.io/creator-signal/openpanel-dashboard:sha-<40-character-commit-sha>`
- `ghcr.io/creator-signal/openpanel-worker:sha-<40-character-commit-sha>`

`main` and `latest` are convenience tags. Deployments must resolve and pin the
reviewed digest recorded in the workflow summary rather than following a
mutable tag.

## ZITADEL application contract

Provision a confidential web OIDC application using authorisation code flow,
PKCE and client-secret basic authentication. Register the callback on the
OpenPanel **API** origin:

- local: `http://localhost:48211/oauth/oidc/callback`
- production: `https://replay-api.creatorsignal.me/oauth/oidc/callback`

The provisioner must deliver these API environment values:

```dotenv
OIDC_ENABLED=true
OIDC_ISSUER=https://auth.example.com
OIDC_CLIENT_ID=<generated-client-id>
OIDC_CLIENT_SECRET=<generated-client-secret>
OIDC_REDIRECT_URI=https://replay-api.creatorsignal.me/oauth/oidc/callback
OIDC_DISPLAY_NAME=Creator Signal
OIDC_LOGIN_MODE=auto
OIDC_ONLY=true
OIDC_EXTRA_SCOPES=urn:zitadel:iam:org:project:role:platform:operator
OIDC_REQUIRED_CLAIM=urn:zitadel:iam:org:project:roles
OIDC_REQUIRED_VALUE=platform:operator
OIDC_ALLOW_REGISTRATION=true
OIDC_ALLOW_EMAIL_LINKING=false
```

The dashboard requires only the non-secret display controls:
`OIDC_ENABLED`, `OIDC_DISPLAY_NAME`, `OIDC_LOGIN_MODE` and `OIDC_ONLY`.
The client secret must remain confined to the API service.

`OIDC_ALLOW_REGISTRATION=true` does not reopen email or social registration.
It permits just-in-time creation only after the signed ID token, issuer,
audience, expiry, nonce, verified email and required operator claim pass.

For a controlled migration of an existing OpenPanel account, temporarily set
`OIDC_ALLOW_EMAIL_LINKING=true`, complete the verified operator login, then set
it back to `false`. New installations should leave it disabled.
