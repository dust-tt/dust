import { formatAgentError } from "@app/components/assistant/conversation/agentErrorMessages";
import {
  buildTierSelection,
  getModelTier,
  getPinnedModelRetryTier,
} from "@app/components/model_picker/modelPickerUtils";
import { CONTEXT_WINDOW_DOC_URL } from "@app/lib/api/assistant/errors";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
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
import type { LightWorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContentMessage,
  InfoCircle,
  RefreshCw02,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

interface ErrorMessageProps {
  owner: LightWorkspaceType;
  error: GenericErrorContent;
  retryHandler: (modelSelection?: ModelSelectionType) => Promise<void>;
  retryLabel?: string;
  failedModel?: ResolvedRequestedModel;
  modelResolutionMethod?: ModelResolutionMethodType | null;
}

export function ErrorMessage({
  owner,
  error,
  retryHandler,
  retryLabel,
  failedModel,
  modelResolutionMethod,
}: ErrorMessageProps) {
  const { t } = useLingui();
  const { hasFeature } = useFeatureFlags();
  const formattedError = formatAgentError(error, {
    hasLocalisation: hasFeature("localisation"),
    viewerIsAdmin: isAdmin(owner),
  });
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
  const retryTierName = retryTier ? t(getModelTier(retryTier).name) : null;
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
          ? t`${failedProviderName} did not respond in time`
          : formattedError.title
      }
      variant={
        errorIsRetryable || retryTierName !== null ? "golden" : "warning"
      }
      className="flex flex-col gap-3"
      icon={InfoCircle}
    >
      <div className="whitespace-normal break-words">
        {retryTierName
          ? t`This model did not respond in time. Retry will use the ${retryTierName} model tier.`
          : formattedError.description}
        {isContextWindowExceeded && (
          <>
            {" "}
            <a
              href={CONTEXT_WINDOW_DOC_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              <Trans>Learn more</Trans>
            </a>
          </>
        )}
      </div>
      {formattedError.details && (
        <Collapsible>
          <CollapsibleTrigger>
            <span className="copy-xs">
              <Trans>Details</Trans>
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="copy-xs mt-1 max-h-40 select-text overflow-auto whitespace-pre-wrap break-words font-mono opacity-80">
              {formattedError.details}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      )}
      <div className="flex flex-col gap-2 pt-3 sm:flex-row">
        <Button
          variant="outline"
          size="xs"
          icon={RefreshCw02}
          label={
            retryTierName
              ? t`Retry with ${retryTierName} model tier`
              : (retryLabel ?? t`Retry`)
          }
          onClick={() => void retry()}
          isLoading={isRetrying}
          disabled={isRetrying}
        />
      </div>
    </ContentMessage>
  );
}
