import { AppI18nProvider } from "@dust-tt/front/components/app/AppI18nProvider";
import { ErrorBoundary } from "@dust-tt/front/components/error_boundary/ErrorBoundary";
import { GlobalErrorFallback } from "@dust-tt/front/components/error_boundary/GlobalErrorFallback";
import { ValidationPage } from "@dust-tt/front/components/pages/email/ValidationPage";
import { CellProvider } from "@dust-tt/front/lib/auth/CellContext";

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
