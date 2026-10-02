import { ErrorBoundary } from "@dust-tt/front/components/error_boundary/ErrorBoundary";
import { ValidationPage } from "@dust-tt/front/components/pages/email/ValidationPage";
import { CellProvider } from "@dust-tt/front/lib/auth/CellContext";
import { i18n } from "@dust-tt/front/lib/i18n/i18n";
import { I18nProvider } from "@lingui/react";
import { GlobalErrorFallback } from "@spa/app/components/GlobalErrorFallback";

export default function EmailApp() {
  return (
    <CellProvider>
      <I18nProvider i18n={i18n}>
        <ErrorBoundary fallback={<GlobalErrorFallback />}>
          <ValidationPage />
        </ErrorBoundary>
      </I18nProvider>
    </CellProvider>
  );
}
