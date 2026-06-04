import { CONTEXT_WINDOW_DOC_URL } from "@app/lib/api/assistant/errors";
import { useSubmitFunction } from "@app/lib/client/utils";
import type { GenericErrorContent } from "@app/types/assistant/agent";
import { isAgentErrorCategory } from "@app/types/assistant/agent";
import {
  Button,
  ContentMessage,
  InfoCircleV2,
  RefreshCw02V2,
} from "@dust-tt/sparkle";

interface ErrorMessageProps {
  error: GenericErrorContent;
  retryHandler: () => void;
}

export function ErrorMessage({ error, retryHandler }: ErrorMessageProps) {
  const isContextWindowExceeded =
    isAgentErrorCategory(error.metadata?.category) &&
    error.metadata?.category === "context_window_exceeded";

  const errorIsRetryable =
    isAgentErrorCategory(error.metadata?.category) &&
    (error.metadata?.category === "retryable_model_error" ||
      error.metadata?.category === "stream_error" ||
      error.metadata?.category === "empty_content");

  const { submit: retry, isSubmitting: isRetrying } = useSubmitFunction(
    async () => retryHandler()
  );

  return (
    <ContentMessage
      title={`${error.metadata?.errorTitle ?? "Something went wrong"}`}
      variant={errorIsRetryable ? "golden" : "warning"}
      className="flex flex-col gap-3"
      icon={InfoCircleV2}
    >
      <div className="whitespace-normal break-words">
        {error.message}
        {isContextWindowExceeded && (
          <>
            {" "}
            <a
              href={CONTEXT_WINDOW_DOC_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground dark:hover:text-foreground-night"
            >
              Learn more
            </a>
          </>
        )}
      </div>
      <div className="flex flex-col gap-2 pt-3 sm:flex-row">
        <Button
          variant="outline"
          size="xs"
          icon={RefreshCw02V2}
          label="Retry"
          onClick={retry}
          disabled={isRetrying}
        />
      </div>
    </ContentMessage>
  );
}
