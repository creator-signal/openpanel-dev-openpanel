export interface CreatorSignalUiPolicy {
  showDeleteAccount: boolean;
  showOpenPanelTwoFactor: boolean;
  showSupporterPrompt: boolean;
}

export function getCreatorSignalUiPolicy({
  only,
}: {
  only: boolean;
}): CreatorSignalUiPolicy {
  return {
    showDeleteAccount: !only,
    showOpenPanelTwoFactor: !only,
    showSupporterPrompt: !only,
  };
}
