import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

export const getServerEnvs = createServerFn().handler(() => {
  // The dashboard receives only public display controls. Secrets and full
  // configuration validation remain confined to the API process.
  const oidcEnabled = process.env.OIDC_ENABLED === 'true';

  const envs = {
    apiUrl: String(process.env.API_URL || process.env.NEXT_PUBLIC_API_URL),
    dashboardUrl: String(
      process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL
    ),
    isSelfHosted: process.env.SELF_HOSTED !== undefined,
    isMaintenance: process.env.MAINTENANCE === '1',
    isDemo: process.env.DEMO_USER_ID !== undefined,
    oidc: {
      enabled: oidcEnabled,
      displayName: process.env.OIDC_DISPLAY_NAME || 'Single Sign-On',
      loginMode:
        process.env.OIDC_LOGIN_MODE === 'auto'
          ? ('auto' as const)
          : ('button' as const),
      only: oidcEnabled && process.env.OIDC_ONLY === 'true',
    },
  };

  return envs;
});

export const getServerEnvsQueryOptions = queryOptions({
  queryKey: ['server-envs'],
  queryFn: getServerEnvs,
  staleTime: Number.POSITIVE_INFINITY,
});
