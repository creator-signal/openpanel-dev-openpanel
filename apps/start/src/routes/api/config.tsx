import type { OidcPublicConfiguration } from '@creativesignal/openpanel/oidc/public-config';
import { createFileRoute } from '@tanstack/react-router';
import { getServerEnvs } from '@/server/get-envs';

export interface ConfigResonse {
  apiUrl: string;
  dashboardUrl: string;
  isSelfHosted: boolean;
  isMaintenance: boolean;
  isDemo: boolean;
  oidc: OidcPublicConfiguration;
}
// Nothing sensitive here, its client environment variables which is good for debugging
export const Route = createFileRoute('/api/config')({
  server: {
    handlers: {
      GET: async () => {
        const envs = await getServerEnvs();
        return Response.json(envs);
      },
    },
  },
});
