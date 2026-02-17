import { Button, ExclamationCircleIcon, Icon } from "@dust-tt/sparkle";

export function GlobalErrorFallback() {
  return (
    <div className="flex h-dvh items-center justify-center">
      <div className="flex flex-col gap-3 text-center">
        <div className="flex flex-col items-center">
          <Icon
            visual={ExclamationCircleIcon}
            size="lg"
            className="text-warning-400"
          />
          <p className="heading-xl text-foreground dark:text-foreground-night">
            Something went wrong
          </p>
          <p className="copy-sm text-muted-foreground dark:text-muted-foreground-night">
            An unexpected error occurred. Please try again.
          </p>
        </div>
        <div>
          <Button
            variant="outline"
            label="Try again"
            onClick={() => window.location.reload()}
          />
        </div>
      </div>
    </div>
  );
}
