import {
  ArrowPathIcon,
  Button,
  ContentMessage,
  DocumentPileIcon,
  EyeIcon,
  Popover,
} from "@dust-tt/sparkle";

import { useSubmitFunction } from "@app/lib/client/utils";
import type { AgentErrorContent } from "@app/types";
import { isAgentErrorCategory } from "@app/types";

interface ErrorMessageProps {
  error: AgentErrorContent;
  retryHandler: () => void;
}

function getErrorTitle(error: AgentErrorContent): string | undefined {
  if (!isAgentErrorCategory(error.metadata?.category)) {
    return undefined;
  }

  switch (error.metadata?.category) {
    case "retryable_model_error":
      return "Model Error";
    case "context_window_exceeded":
      return "Context Window Exceeded";
    case "provider_internal_error":
      return "Provider Internal Error";
    case "stream_error":
      return "Stream Error";
    case "unknown_error":
      return "Unknown Error";
    case "invalid_response_format_configuration":
      return "Invalid Response Format Configuration";
    default:
      return undefined;
  }
}

export function ErrorMessage({ error, retryHandler }: ErrorMessageProps) {
  const fullMessage =
    error.message + (error.code ? ` (code: ${error.code})` : "");

  const errorIsRetryable =
    isAgentErrorCategory(error.metadata?.category) &&
    (error.metadata?.category === "retryable_model_error" ||
      error.metadata?.category === "stream_error");

  const { submit: retry, isSubmitting: isRetrying } = useSubmitFunction(
    async () => retryHandler()
  );

  const errorTitle = getErrorTitle(error) || "Error";

  return (
    <ContentMessage
      title={errorTitle}
      variant={errorIsRetryable ? "golden" : "warning"}
      className="flex flex-col gap-3"
    >
      <div className="whitespace-normal break-words">{fullMessage}</div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="outline"
          size="sm"
          icon={ArrowPathIcon}
          label="Retry"
          onClick={retry}
          disabled={isRetrying}
        />
        <Popover
          popoverTriggerAsChild
          trigger={
            <Button
              variant="outline"
              size="sm"
              icon={EyeIcon}
              label="See the error"
            />
          }
          content={
            <div className="flex flex-col gap-3">
              <div className="whitespace-normal break-words text-sm font-normal text-warning-800">
                {fullMessage}
              </div>
              <div className="self-end">
                <Button
                  variant="ghost"
                  size="xs"
                  icon={DocumentPileIcon}
                  label={"Copy"}
                  onClick={() =>
                    void navigator.clipboard.writeText(fullMessage)
                  }
                />
              </div>
            </div>
          }
        />
      </div>
    </ContentMessage>
  );
}
