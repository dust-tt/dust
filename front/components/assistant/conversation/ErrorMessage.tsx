import {
  buildTierSelection,
  getModelTier,
  getPinnedModelRetryTier,
} from "@app/components/model_picker/modelPickerUtils";
import { CONTEXT_WINDOW_DOC_URL } from "@app/lib/api/assistant/errors";
import { useSubmitFunction } from "@app/lib/client/utils";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import type { GenericErrorContent } from "@app/types/assistant/agent";
import { isAgentErrorCategory } from "@app/types/assistant/agent";
import {
  getModelMaker,
  getModelMakerDisplayName,
  getProviderDisplayName,
} from "@app/types/assistant/models/providers";
import type {
  ModelResolutionMethodType,
  ModelSelectionType,
  ResolvedRequestedModel,
} from "@app/types/assistant/models/types";
import {
  Button,
  ContentMessage,
  InfoCircle,
  RefreshCw02,
} from "@dust-tt/sparkle";

interface ErrorMessageProps {
  error: GenericErrorContent;
  retryHandler: (modelSelection?: ModelSelectionType) => Promise<void>;
  failedModel?: ResolvedRequestedModel;
  modelResolutionMethod?: ModelResolutionMethodType | null;
}

export function ErrorMessage({
  error,
  retryHandler,
  failedModel,
  modelResolutionMethod,
}: ErrorMessageProps) {
  const isContextWindowExceeded =
    isAgentErrorCategory(error.metadata?.category) &&
    error.metadata?.category === "context_window_exceeded";

  const errorIsRetryable =
    isAgentErrorCategory(error.metadata?.category) &&
    (error.metadata?.category === "retryable_model_error" ||
      error.metadata?.category === "provider_internal_error" ||
      error.metadata?.category === "stream_error" ||
      error.metadata?.category === "empty_content" ||
      error.metadata?.category === "credits_exhausted");
  const retryTier = getPinnedModelRetryTier({
    failedModel,
    modelResolutionMethod,
    errorCategory: error.metadata?.category,
  });
  const retryTierName = retryTier ? getModelTier(retryTier).name : null;
  const failedModelConfig = failedModel
    ? getSupportedModelConfig(failedModel)
    : null;
  const failedProviderName = failedModelConfig
    ? getModelMakerDisplayName(getModelMaker(failedModelConfig))
    : failedModel
      ? getProviderDisplayName(failedModel.providerId)
      : undefined;

  // A pinned-model retry sends that model's tier. Other retries omit the
  // selection and preserve the original message's resolved model.
  const { submit: retry, isSubmitting: isRetrying } = useSubmitFunction(
    async () =>
      retryHandler(retryTier ? buildTierSelection(retryTier) : undefined)
  );

  return (
    <ContentMessage
      title={
        retryTierName
          ? `${failedProviderName} couldn't answer`
          : `${error.metadata?.errorTitle ?? "Something went wrong"}`
      }
      variant={
        errorIsRetryable || retryTierName !== null ? "golden" : "warning"
      }
      className="flex flex-col gap-3"
      icon={InfoCircle}
    >
      <div className="whitespace-normal break-words">
        {retryTierName
          ? `${failedProviderName} couldn't complete this reply. Retry will use ${retryTierName}.`
          : error.message}
        {isContextWindowExceeded && (
          <>
            {" "}
            <a
              href={CONTEXT_WINDOW_DOC_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
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
          icon={RefreshCw02}
          label={retryTierName ? `Retry with ${retryTierName}` : "Retry"}
          onClick={() => void retry()}
          isLoading={isRetrying}
          disabled={isRetrying}
        />
      </div>
    </ContentMessage>
  );
}
