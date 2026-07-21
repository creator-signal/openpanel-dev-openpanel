export interface OidcPublicConfiguration {
  displayName: string;
  enabled: boolean;
  loginMode: 'auto' | 'button';
  only: boolean;
}

export function getOidcPublicConfiguration(): OidcPublicConfiguration {
  const enabled = process.env.OIDC_ENABLED === 'true';

  return {
    displayName: process.env.OIDC_DISPLAY_NAME || 'Single Sign-On',
    enabled,
    loginMode: process.env.OIDC_LOGIN_MODE === 'auto' ? 'auto' : 'button',
    only: enabled && process.env.OIDC_ONLY === 'true',
  };
}
