import { useSubmitFunction } from "@app/lib/client/utils";
import type { GenericErrorContent } from "@app/types/assistant/agent";
import { isAgentErrorCategory } from "@app/types/assistant/agent";
import {
  Button,
  ContentMessage,
} from "@dust-tt/sparkle";
import { Info, RotateCcw } from "@app/components/assistant/conversation/icons";

interface ErrorMessageProps {
  error: GenericErrorContent;
  retryHandler: () => void;
}

export function ErrorMessage({ error, retryHandler }: ErrorMessageProps) {
  const errorIsRetryable =
    isAgentErrorCategory(error.metadata?.category) &&
    (error.metadata?.category === "retryable_model_error" ||
      error.metadata?.category === "stream_error");

  const { submit: retry, isSubmitting: isRetrying } = useSubmitFunction(
    async () => retryHandler()
  );

  return (
    <ContentMessage
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      title={`${error.metadata?.errorTitle || "Agent error"}`}
      variant={errorIsRetryable ? "golden" : "warning"}
      className="flex flex-col gap-3"
      icon={Info}
    >
      <div className="whitespace-normal break-words">{error.message}</div>
      <div className="flex flex-col gap-2 pt-3 sm:flex-row">
        <Button
          variant="outline"
          size="xs"
          icon={RotateCcw}
          label="Retry"
          onClick={retry}
          disabled={isRetrying}
        />
      </div>
    </ContentMessage>
  );
}
