import { ErrorBoundary } from "@dust-tt/front/components/error_boundary/ErrorBoundary";
import { ValidationPage } from "@dust-tt/front/components/pages/email/ValidationPage";
import { RegionProvider } from "@dust-tt/front/lib/auth/RegionContext";
import { GlobalErrorFallback } from "@spa/app/components/GlobalErrorFallback";

export default function EmailApp() {
  return (
    <RegionProvider>
      <ErrorBoundary fallback={<GlobalErrorFallback />}>
        <ValidationPage />
      </ErrorBoundary>
    </RegionProvider>
  );
}
