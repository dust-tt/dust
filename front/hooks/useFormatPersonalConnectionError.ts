import type { FormattedError } from "@app/lib/api_error_messages";
import { formatError } from "@app/lib/api_error_messages";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { PersonalConnectionError } from "@app/lib/swr/mcp_servers";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";

/**
 * @cc [owner:sfriquet,label:error-handling;react] format-personal-connection-error
 * The returned function MUST return `formatError(error.error, { hasLocalisation })` for an
 * `oauth_failed` error, with `hasLocalisation` the `localisation` feature flag of the current
 * workspace, and a translated `description` without `details` for the other errors.
 */
export const useFormatPersonalConnectionError = () => {
  const { t } = useLingui();
  const { hasFeature } = useFeatureFlags();
  const hasLocalisation = hasFeature("localisation");

  return useCallback(
    (error: PersonalConnectionError): FormattedError => {
      switch (error.type) {
        case "workspace_connection_required": {
          const { mcpServerDisplayName } = error;
          return {
            description: t`A workspace admin must first connect ${mcpServerDisplayName} at the workspace level before users can connect their personal accounts. Please contact your workspace administrator to set up the workspace connection.`,
          };
        }
        case "oauth_failed":
          return formatError(error.error, { hasLocalisation });
        case "unexpected":
          return {
            description: t`Unexpected error trying to connect to your provider. Please try again.`,
          };
        default:
          return assertNever(error);
      }
    },
    [hasLocalisation, t]
  );
};
