import { ErrorBoundary } from "@dust-tt/front/components/error_boundary/ErrorBoundary";
import { ValidationPage } from "@dust-tt/front/components/pages/email/ValidationPage";
import { GlobalErrorFallback } from "@spa/app/components/GlobalErrorFallback";

export default function EmailApp() {
  return (
    <ErrorBoundary fallback={<GlobalErrorFallback />}>
      <ValidationPage />
    </ErrorBoundary>
  );
}
