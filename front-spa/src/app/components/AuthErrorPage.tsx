import { ConnectionErrorFallback } from "@dust-tt/front/components/error_boundary/ConnectionErrorFallback";
import { GlobalErrorFallback } from "@dust-tt/front/components/error_boundary/GlobalErrorFallback";
import Custom404 from "@dust-tt/front/components/pages/Custom404";
import { formatError } from "@dust-tt/front/lib/api_error_messages";
import type { APIErrorResponse } from "@dust-tt/front/types/error";
import { isAPIErrorResponse } from "@dust-tt/front/types/error";

interface AuthErrorPageProps {
  error: APIErrorResponse | Error;
  hasLocalisation: boolean;
}

/**
 * @cc [owner:sfriquet,label:error-handling;product] auth-error-description-from-code
 * For an API error other than `workspace_not_found`, the page MUST show the `description` and
 * `details` of `formatError(error, { hasLocalisation })`. Callers MUST pass the `hasLocalisation`
 * of `useNoWorkspaceUserLocale` when the page renders in the locale that hook resolves, and `false`
 * when no user locale applies (poke, or the no-workspace auth context itself failed).
 */
export function AuthErrorPage({ error, hasLocalisation }: AuthErrorPageProps) {
  if (isAPIErrorResponse(error)) {
    if (error.error.type === "workspace_not_found") {
      return <Custom404 />;
    }

    const { description, details } = formatError(error, { hasLocalisation });
    return <GlobalErrorFallback message={description} details={details} />;
  }

  return <ConnectionErrorFallback />;
}
