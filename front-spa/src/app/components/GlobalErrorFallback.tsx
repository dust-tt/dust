import { AlertCircle, Icon, NewButton } from "@dust-tt/sparkle";

export function GlobalErrorFallback() {
  return (
    <div className="flex h-dvh items-center justify-center">
      <div className="flex flex-col gap-3 text-center">
        <div className="flex flex-col items-center">
          <Icon visual={AlertCircle} size="lg" className="text-warning-400" />
          <p className="heading-xl text-foreground">Something went wrong</p>
          <p className="copy-sm text-muted-foreground">
            An unexpected error occurred. Please try again.
          </p>
        </div>
        <div>
          <NewButton
            variant="outline"
            label="Try again"
            onClick={() => window.location.reload()}
          />
        </div>
      </div>
    </div>
  );
}
