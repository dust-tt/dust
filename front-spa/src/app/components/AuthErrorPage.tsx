import { ConnectionErrorFallback } from "@dust-tt/front/components/error_boundary/ConnectionErrorFallback";
import { GlobalErrorFallback } from "@dust-tt/front/components/error_boundary/GlobalErrorFallback";
import Custom404 from "@dust-tt/front/components/pages/Custom404";
import type { APIErrorResponse } from "@dust-tt/front/types/error";
import { isAPIErrorResponse } from "@dust-tt/front/types/error";

interface AuthErrorPageProps {
  error: APIErrorResponse | Error;
}

export function AuthErrorPage({ error }: AuthErrorPageProps) {
  if (isAPIErrorResponse(error)) {
    if (error.error.type === "workspace_not_found") {
      return <Custom404 />;
    }

    return <GlobalErrorFallback message={error.error.message} />;
  }

  return <ConnectionErrorFallback />;
}
