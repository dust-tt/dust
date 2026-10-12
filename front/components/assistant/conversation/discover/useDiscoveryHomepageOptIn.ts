import { useSendApiErrorNotification } from "@app/hooks/useNotification";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useUserMetadata } from "@app/lib/swr/user";
import { setUserMetadataFromClient } from "@app/lib/user";
import { useLingui } from "@lingui/react/macro";

const DISCOVERY_HOMEPAGE_OPT_IN_METADATA_KEY = "discoveryHomepageOptIn";

/**
 * @cc [owner:adrsimon,label:product] discovery-homepage-user-opt-in
 * The discovery homepage MUST show when the workspace has the `discovery_homepage` flag or the user
 * opted in through their own metadata. Every opt-in surface (sidebar banner, settings toggle) MUST
 * only show once the metadata has loaded and the workspace flag is off.
 */
export function useDiscoveryHomepageOptIn() {
  const { t } = useLingui();
  const { hasFeature } = useFeatureFlags();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const hasWorkspaceFlag = hasFeature("discovery_homepage");

  const { metadata, isMetadataLoading, isMetadataError, mutateMetadata } =
    useUserMetadata(DISCOVERY_HOMEPAGE_OPT_IN_METADATA_KEY, {
      disabled: hasWorkspaceFlag,
    });
  const hasOptedIn = metadata?.value === "true";

  const setOptedIn = async (optedIn: boolean) => {
    const value = String(optedIn);
    try {
      await setUserMetadataFromClient({
        key: DISCOVERY_HOMEPAGE_OPT_IN_METADATA_KEY,
        value,
      });
      await mutateMetadata(
        { metadata: { key: DISCOVERY_HOMEPAGE_OPT_IN_METADATA_KEY, value } },
        { revalidate: false }
      );
    } catch (error) {
      sendApiErrorNotification({
        title: t`Could not switch homepage`,
        error,
      });
    }
  };

  return {
    isDiscoveryHomepage: hasWorkspaceFlag || hasOptedIn,
    canToggleHomepage:
      !hasWorkspaceFlag && !isMetadataLoading && !isMetadataError,
    hasOptedIn,
    setOptedIn,
  };
}
