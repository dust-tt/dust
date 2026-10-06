import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";
import { setQueryParam } from "@app/lib/utils/router";
import { useCallback } from "react";

/**
 * Returns a callback opening the user profile panel for a given user, or `null` when the
 * user_profile feature is disabled, so touchpoints stay non-interactive for everyone else.
 * `source` identifies the touchpoint in analytics.
 */
export function useOpenUserProfile(
  source: string
): ((userId: string) => void) | null {
  const router = useAppRouter();
  const { hasFeature } = useFeatureFlags();
  const isEnabled = hasFeature("user_profile");

  const openUserProfile = useCallback(
    (userId: string) => {
      trackEvent({
        area: TRACKING_AREAS.WORKSPACE,
        object: "user_profile_open",
        action: TRACKING_ACTIONS.CLICK,
        extra: { source },
      });
      setQueryParam(router, "userDetails", userId);
    },
    [router, source]
  );

  return isEnabled ? openUserProfile : null;
}
