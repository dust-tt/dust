import { useSendApiErrorNotification } from "@app/hooks/useNotification";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useUserMetadata } from "@app/lib/swr/user";
import { setUserMetadataFromClient } from "@app/lib/user";
import { useLingui } from "@lingui/react/macro";

const DISCOVERY_HOMEPAGE_OPT_IN_METADATA_KEY = "discoveryHomepageOptIn";

function slideHomeAgents(pseudoElement: string, direction: PlaybackDirection) {
  document.documentElement.animate(
    [
      { opacity: 1, transform: "none" },
      { opacity: 0, transform: "translateY(64px)" },
    ],
    {
      duration: 320,
      easing:
        direction === "normal"
          ? "cubic-bezier(0.4, 0, 1, 1)"
          : "cubic-bezier(0, 0, 0.2, 1)",
      direction,
      fill: "both",
      pseudoElement,
    }
  );
}

/**
 * @cc [owner:adrsimon,label:product] discovery-homepage-user-opt-in
 * Discovery homepage features (homepage, agent suggested prompts) MUST be on when the workspace has
 * the `discovery_homepage` flag or the user opted in through their own metadata: client code MUST
 * read `isDiscoveryHomepage` from this hook, not the flag. The homepage opt-in line MUST only show
 * once the metadata has loaded and the workspace flag is off.
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
    const applyLocally = (localValue: string) =>
      mutateMetadata(
        {
          metadata: {
            key: DISCOVERY_HOMEPAGE_OPT_IN_METADATA_KEY,
            value: localValue,
          },
        },
        { revalidate: false }
      );

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (document.startViewTransition && !prefersReducedMotion) {
      const transition = document.startViewTransition(() =>
        applyLocally(value)
      );
      await transition.ready;
      slideHomeAgents("::view-transition-old(home-agents)", "normal");
      slideHomeAgents("::view-transition-new(home-agents)", "reverse");
      await transition.finished;
    } else {
      await applyLocally(value);
    }

    try {
      await setUserMetadataFromClient({
        key: DISCOVERY_HOMEPAGE_OPT_IN_METADATA_KEY,
        value,
      });
    } catch (error) {
      await applyLocally(String(!optedIn));
      sendApiErrorNotification({
        title: t`Could not switch homepage`,
        error,
      });
    }
  };

  return {
    isDiscoveryHomepage: hasWorkspaceFlag || hasOptedIn,
    isDiscoveryHomepageLoading: !hasWorkspaceFlag && isMetadataLoading,
    canToggleHomepage:
      !hasWorkspaceFlag && !isMetadataLoading && !isMetadataError,
    hasOptedIn,
    setOptedIn,
  };
}
