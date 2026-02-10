import { Button, ExclamationCircleIcon, Icon } from "@dust-tt/sparkle";

import Custom404 from "@dust-tt/front/pages/404";
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
              {error.error.message}
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
            Connection error
          </p>
          <p className="copy-sm text-muted-foreground dark:text-muted-foreground-night">
            We couldn't reach the server. Please check your connection and try
            again.
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
