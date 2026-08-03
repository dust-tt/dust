import Custom404 from "@dust-tt/front/components/pages/Custom404";
import type { APIErrorResponse } from "@dust-tt/front/types/error";
import { isAPIErrorResponse } from "@dust-tt/front/types/error";
import { AlertCircle, Button, Icon } from "@dust-tt/sparkle";

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
            <Icon visual={AlertCircle} size="lg" className="text-warning-400" />
            <p className="heading-xl text-foreground">Something went wrong</p>
            <p className="copy-sm text-muted-foreground">
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
          <Icon visual={AlertCircle} size="lg" className="text-warning-400" />
          <p className="heading-xl text-foreground">Connection error</p>
          <p className="copy-sm text-muted-foreground">
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
