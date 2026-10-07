import { AppI18nProvider } from "@dust-tt/front/components/app/AppI18nProvider";
import { ErrorBoundary } from "@dust-tt/front/components/error_boundary/ErrorBoundary";
import { ValidationPage } from "@dust-tt/front/components/pages/email/ValidationPage";
import { CellProvider } from "@dust-tt/front/lib/auth/CellContext";
import { GlobalErrorFallback } from "@spa/app/components/GlobalErrorFallback";

export default function EmailApp() {
  return (
    <CellProvider>
      <AppI18nProvider>
        <ErrorBoundary fallback={<GlobalErrorFallback />}>
          <ValidationPage />
        </ErrorBoundary>
      </AppI18nProvider>
    </CellProvider>
  );
}
