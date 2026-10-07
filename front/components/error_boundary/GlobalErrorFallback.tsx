import { AlertCircle, Button, Icon } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

interface GlobalErrorFallbackProps {
  message?: string;
}

export function GlobalErrorFallback({ message }: GlobalErrorFallbackProps) {
  const { t } = useLingui();

  return (
    <div className="flex h-dvh items-center justify-center">
      <div className="flex flex-col gap-3 text-center">
        <div className="flex flex-col items-center">
          <Icon visual={AlertCircle} size="lg" className="text-warning-400" />
          <p className="heading-xl text-foreground">
            <Trans>Something went wrong</Trans>
          </p>
          <p className="copy-sm text-muted-foreground">
            {message ?? t`An unexpected error occurred. Please try again.`}
          </p>
        </div>
        <div>
          <Button
            variant="outline"
            label={t`Try again`}
            onClick={() => window.location.reload()}
          />
        </div>
      </div>
    </div>
  );
}
