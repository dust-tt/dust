import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { isDegradedModelFailure } from "@app/components/model_picker/modelPickerUtils";
import { CONTEXT_WINDOW_DOC_URL } from "@app/lib/api/assistant/errors";
import { useSubmitFunction } from "@app/lib/client/utils";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { useModels } from "@app/lib/swr/models";
import type { GenericErrorContent } from "@app/types/assistant/agent";
import { isAgentErrorCategory } from "@app/types/assistant/agent";
import {
  getModelMaker,
  getModelMakerDisplayName,
} from "@app/types/assistant/models/providers";
import type {
  ModelSelectionType,
  ResolvedRequestedModel,
} from "@app/types/assistant/models/types";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ContentMessage,
  InfoCircle,
  RefreshCw02,
} from "@dust-tt/sparkle";
import { useContext, useEffect } from "react";

interface ErrorMessageProps {
  error: GenericErrorContent;
  owner: LightWorkspaceType;
  retryHandler: (modelSelection?: ModelSelectionType) => Promise<void>;
  failedModel?: ResolvedRequestedModel;
  canSwitchModel?: boolean;
}

export function ErrorMessage({
  error,
  owner,
  retryHandler,
  failedModel,
  canSwitchModel = true,
}: ErrorMessageProps) {
  const { openModelPickerRef, shownModelSelectionRef } =
    useContext(InputBarContext);
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
  const { degradedModelIds, revalidateModels, isModelsLoading } = useModels({
    owner,
    disabled: !failedModel,
  });
  const isDegradedFailure = isDegradedModelFailure({
    failedModelId: failedModel?.modelId,
    errorCategory: error.metadata?.category,
    degradedModelIds,
  });
  const showModelSwitcher = isDegradedFailure && canSwitchModel;
  const failedModelConfig = failedModel
    ? getSupportedModelConfig(failedModel)
    : null;
  const failedProviderName = failedModelConfig
    ? getModelMakerDisplayName(getModelMaker(failedModelConfig))
    : failedModel?.providerId;

  useEffect(() => {
    if (failedModel) {
      void revalidateModels();
    }
  }, [failedModel, revalidateModels]);

  // A degraded retry follows what the picker displays. Other retries omit the
  // selection and preserve the original message's resolved model.
  const { submit: retry, isSubmitting: isRetrying } = useSubmitFunction(
    async () =>
      retryHandler(
        showModelSwitcher
          ? (shownModelSelectionRef.current ?? undefined)
          : undefined
      )
  );

  return (
    <ContentMessage
      title={
        isDegradedFailure
          ? `${failedProviderName} couldn't answer`
          : `${error.metadata?.errorTitle ?? "Something went wrong"}`
      }
      variant={errorIsRetryable || isDegradedFailure ? "golden" : "warning"}
      className="flex flex-col gap-3"
      icon={InfoCircle}
    >
      <div className="whitespace-normal break-words">
        {isDegradedFailure
          ? `Dust has detected degraded performance from ${failedProviderName} over the last few minutes.${
              showModelSwitcher
                ? " Retry will use the model currently selected in the input bar."
                : ""
            }`
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
        {showModelSwitcher && (
          <Button
            variant="outline"
            size="xs"
            label="Switch model"
            disabled={isRetrying}
            onClick={() => openModelPickerRef.current?.()}
          />
        )}
        <Button
          variant="outline"
          size="xs"
          icon={RefreshCw02}
          label="Retry"
          onClick={() => void retry()}
          isLoading={isRetrying || isModelsLoading}
          disabled={isRetrying || isModelsLoading}
        />
      </div>
    </ContentMessage>
  );
}
