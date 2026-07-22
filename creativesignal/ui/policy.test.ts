import { describe, expect, it } from 'vitest';
import { getCreatorSignalUiPolicy } from './policy';

describe('Creator Signal UI policy', () => {
  it('delegates identity controls and hides the supporter prompt in OIDC-only mode', () => {
    expect(getCreatorSignalUiPolicy({ only: true })).toEqual({
      showDeleteAccount: false,
      showOpenPanelTwoFactor: false,
      showSupporterPrompt: false,
    });
  });

  it('preserves upstream controls when OIDC-only mode is disabled', () => {
    expect(getCreatorSignalUiPolicy({ only: false })).toEqual({
      showDeleteAccount: true,
      showOpenPanelTwoFactor: true,
      showSupporterPrompt: true,
    });
  });
});
