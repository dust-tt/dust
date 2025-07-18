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

export function ErrorMessage({ error, retryHandler }: ErrorMessageProps) {
  const errorIsRetryable =
    isAgentErrorCategory(error.metadata?.category) &&
    (error.metadata?.category === "retryable_model_error" ||
      error.metadata?.category === "stream_error");

  const debugInfo = [
    error.metadata?.category ? `category: ${error.metadata?.category}` : "",
    error.code ? `code: ${error.code}` : "",
  ]
    .filter((s) => s.length > 0)
    .join(", ");

  const { submit: retry, isSubmitting: isRetrying } = useSubmitFunction(
    async () => retryHandler()
  );

  return (
    <ContentMessage
      title={`${error.metadata?.errorTitle || "Agent error"}`}
      variant={errorIsRetryable ? "golden" : "warning"}
      className="flex flex-col gap-3"
    >
      <div className="whitespace-normal break-words">{error.message}</div>
      <div className="flex flex-col gap-2 pt-3 sm:flex-row">
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
              <div className="whitespace-normal text-sm font-normal text-warning-800">
                {debugInfo}
              </div>
              <div className="self-end">
                <Button
                  variant="ghost"
                  size="xs"
                  icon={DocumentPileIcon}
                  label={"Copy"}
                  onClick={() =>
                    void navigator.clipboard.writeText(
                      error.message + debugInfo ? ` (${debugInfo})` : ""
                    )
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
