import { formatError } from "@app/lib/api_error_messages";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useCallback } from "react";

/**
 * @cc [owner:Nils-Fedrigo,label:error-handling;react] format-error-description-hook
 * The returned function MUST return the `description` of `formatError(error, { hasLocalisation })`,
 * with `hasLocalisation` the `localisation` feature flag of the current workspace. Outside an
 * `AuthContext` (no workspace) feature flags are empty, so `hasLocalisation` is false.
 */
export const useFormatErrorDescription = () => {
  const { hasFeature } = useFeatureFlags();
  const hasLocalisation = hasFeature("localisation");

  return useCallback(
    (error: unknown) => formatError(error, { hasLocalisation }).description,
    [hasLocalisation]
  );
};
