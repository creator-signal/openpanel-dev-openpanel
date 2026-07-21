import { KeyRound } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { OidcPublicConfiguration } from './public-config';

export function OidcSignInButton({
  config,
  isLastUsed,
  isPending,
  onSignIn,
  type,
}: {
  config: OidcPublicConfiguration;
  isLastUsed?: boolean;
  isPending: boolean;
  onSignIn: () => void;
  type: 'sign-in' | 'sign-up';
}) {
  const autoRedirectStarted = useRef(false);
  const hasCallbackError =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('error');
  const shouldAutoRedirect =
    config.enabled && config.loginMode === 'auto' && !hasCallbackError;

  useEffect(() => {
    if (!shouldAutoRedirect || autoRedirectStarted.current) {
      return;
    }
    autoRedirectStarted.current = true;
    onSignIn();
  }, [onSignIn, shouldAutoRedirect]);

  if (!config.enabled) {
    return null;
  }

  const title =
    type === 'sign-in'
      ? `Sign in with ${config.displayName}`
      : `Sign up with ${config.displayName}`;

  return (
    <div className="relative">
      <button
        className="inline-flex h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-def-300 bg-background px-4 py-2 font-medium text-foreground text-sm shadow-sm transition-all duration-200 hover:bg-def-100 hover:shadow-md disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0"
        disabled={isPending}
        onClick={onSignIn}
        type="button"
      >
        <KeyRound className="size-4" />
        {shouldAutoRedirect ? 'Redirecting to sign in…' : title}
      </button>
      {isLastUsed && (
        <span className="absolute -top-2 right-3 rounded-full bg-highlight px-1.5 py-0.5 font-medium text-[10px] text-white leading-none">
          Used last time
        </span>
      )}
    </div>
  );
}
