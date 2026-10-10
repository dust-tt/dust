import { LocaleSync } from "@dust-tt/front/components/app/LocaleSync";
import { SparkleLocaleProvider } from "@dust-tt/front/components/app/SparkleLocaleProvider";
import { ErrorBoundary } from "@dust-tt/front/components/error_boundary/ErrorBoundary";
import { GlobalErrorFallback } from "@dust-tt/front/components/error_boundary/GlobalErrorFallback";
import { ValidationPage } from "@dust-tt/front/components/pages/email/ValidationPage";
import { CellProvider } from "@dust-tt/front/lib/auth/CellContext";
import { i18n } from "@dust-tt/front/lib/i18n/i18n";
import { I18nProvider } from "@lingui/react";

export default function EmailApp() {
  return (
    <CellProvider>
      <I18nProvider i18n={i18n}>
        <SparkleLocaleProvider>
          <LocaleSync locale={null} />
          <ErrorBoundary fallback={<GlobalErrorFallback />}>
            <ValidationPage />
          </ErrorBoundary>
        </SparkleLocaleProvider>
      </I18nProvider>
    </CellProvider>
  );
}
