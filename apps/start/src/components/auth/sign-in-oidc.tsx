import { OidcSignInButton } from '@creativesignal/openpanel/oidc/client';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTRPC } from '@/integrations/trpc/react';
import { getServerEnvsQueryOptions } from '@/server/get-envs';

export function SignInOidc({
  type,
  inviteId,
  isLastUsed,
}: {
  type: 'sign-in' | 'sign-up';
  inviteId?: string;
  isLastUsed?: boolean;
}) {
  const { data: envs } = useSuspenseQuery(getServerEnvsQueryOptions);
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.auth.signInOAuth.mutationOptions({
      onSuccess(res) {
        if (res.url) {
          window.location.href = res.url;
        }
      },
    })
  );
  const { isPending, mutate } = mutation;
  const signIn = useCallback(() => {
    mutate({ provider: 'oidc', inviteId });
  }, [inviteId, mutate]);

  return (
    <OidcSignInButton
      config={envs.oidc}
      isLastUsed={isLastUsed}
      isPending={isPending}
      onSignIn={signIn}
      type={type}
    />
  );
}
