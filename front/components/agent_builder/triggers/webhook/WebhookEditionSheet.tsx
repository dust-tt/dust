import type { AgentBuilderWebhookTriggerType } from "@app/components/agent_builder/agentBuilderFormSchema";
import { RecentWebhookRequests } from "@app/components/agent_builder/triggers/RecentWebhookRequests";
import { TriggerPodSelector } from "@app/components/agent_builder/triggers/TriggerPodSelector";
import { TriggerPoolSelector } from "@app/components/agent_builder/triggers/TriggerPoolSelector";
import { TriggerStatusToggle } from "@app/components/agent_builder/triggers/TriggerStatusToggle";
import type { TriggerViewsSheetFormValues } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import { WebhookEditionFilters } from "@app/components/agent_builder/triggers/webhook/WebhookEditionFilters";
import { useAuth } from "@app/lib/auth/AuthContext";
import { WEBHOOK_PRESETS } from "@app/lib/triggers/webhook_presets";
import { isCreditPricedPlan } from "@app/types/plan";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import type {
  WebhookEventMetadata,
  WebhookPresetMetadata,
} from "@app/types/triggers/webhooks_source_preset";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Checkbox,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Input,
  Label,
  LinkWrapper,
  Separator,
  TextArea,
} from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import { useController, useFormContext } from "react-hook-form";

interface WebhookEditionNameInputProps {
  isEditor: boolean;
}

function WebhookEditionNameInput({ isEditor }: WebhookEditionNameInputProps) {
  const { t } = useLingui();
  const { control } = useFormContext<TriggerViewsSheetFormValues>();
  const {
    field,
    fieldState: { error },
  } = useController({ control, name: "webhook.name" });

  return (
    <div className="flex-grow space-y-1">
      <Label htmlFor="webhook-name">
        <Trans>Name</Trans>
      </Label>
      <Input
        id="webhook-name"
        placeholder={t`Enter trigger name`}
        disabled={!isEditor}
        {...field}
        isError={!!error}
        message={error?.message}
        messageStatus="error"
      />
    </div>
  );
}

function getQuotaDescription({
  isCreditPooled,
  executionMode,
  t,
}: {
  isCreditPooled: boolean;
  executionMode: "user_pool" | "workspace_pool";
  t: (descriptor: MessageDescriptor) => string;
}) {
  if (isCreditPooled) {
    switch (executionMode) {
      case "user_pool":
        return t(msg`This will count towards your personal credit pool.`);
      case "workspace_pool":
        return t(msg`This will count towards your workspace's credit pool.`);
      default:
        return assertNever(executionMode);
    }
  } else {
    switch (executionMode) {
      case "user_pool":
        return t(msg`This will count towards your personal fair use limits.`);
      case "workspace_pool":
        return t(
          msg`This will count towards your workspace's programmatic usage.`
        );
      default:
        return assertNever(executionMode);
    }
  }
}

interface WebhookEditionExecutionLimitProps {
  isEditor: boolean;
}

function WebhookEditionExecutionLimit({
  isEditor,
}: WebhookEditionExecutionLimitProps) {
  const { t } = useLingui();
  const { control } = useFormContext<TriggerViewsSheetFormValues>();
  const { subscription } = useAuth();
  const {
    field: limitField,
    fieldState: { error },
  } = useController({
    control,
    name: "webhook.executionPerDayLimitOverride",
  });
  const {
    field: { value: executionMode },
  } = useController({ control, name: "webhook.executionMode" });

  return (
    <div className="flex flex-col space-y-1">
      <Label htmlFor="execution-limit">
        <Trans>Rate limits</Trans>
      </Label>
      <p className="text-sm text-muted-foreground">
        <Trans>Maximum number of runs over a 24-hour window.</Trans>{" "}
        {getQuotaDescription({
          isCreditPooled: isCreditPricedPlan(subscription.plan),
          executionMode,
          t,
        })}{" "}
        <Trans>
          (
          <LinkWrapper
            href="https://docs.dust.tt/docs/user-documentation/agents/triggers/credits-usage"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Learn more
          </LinkWrapper>
          )
        </Trans>
      </p>
      <Input
        id="execution-limit"
        type="number"
        className="w-32"
        disabled={!isEditor}
        name={limitField.name}
        value={String(limitField.value)}
        onChange={(event) => limitField.onChange(event.target.valueAsNumber)}
        onBlur={limitField.onBlur}
        isError={!!error}
        message={error?.message}
        messageStatus="error"
      />
    </div>
  );
}

interface WebhookEditionEventSelectorProps {
  isEditor: boolean;
  selectedPreset: WebhookPresetMetadata | null;
  availableEvents: WebhookEventMetadata[];
}

function WebhookEditionEventSelector({
  isEditor,
  selectedPreset,
  availableEvents,
}: WebhookEditionEventSelectorProps) {
  const { t } = useLingui();
  const { control } = useFormContext<TriggerViewsSheetFormValues>();
  const {
    field: { value: selectedEvent, onChange: setSelectedEvent },
    fieldState: { error },
  } = useController({ control, name: "webhook.event" });

  if (!selectedPreset || availableEvents.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col space-y-1">
      <Label htmlFor="webhook-event">
        <Trans>Listen for</Trans>
      </Label>
      <p className="text-sm text-muted-foreground">
        <Trans>External event that will trigger a run of this agent.</Trans>
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            id="webhook-event"
            variant="outline"
            isSelect
            className="w-fit"
            disabled={!isEditor}
            label={
              availableEvents.find((e) => e.value === selectedEvent)?.name ??
              t`Select event`
            }
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel
            label={t({ message: "Select", context: "dropdown menu heading" })}
          />
          {availableEvents.map((event) => (
            <DropdownMenuItem
              key={event.value}
              label={event.name}
              disabled={!isEditor}
              onClick={() => setSelectedEvent(event.value)}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {error && <p className="text-sm text-warning">{error.message}</p>}
    </div>
  );
}

interface WebhookEditionIncludePayloadProps {
  isEditor: boolean;
}

function WebhookEditionIncludePayload({
  isEditor,
}: WebhookEditionIncludePayloadProps) {
  const { control } = useFormContext<TriggerViewsSheetFormValues>();
  const {
    field: { value: includePayload, onChange: setIncludePayload },
  } = useController({ control, name: "webhook.includePayload" });

  return (
    <div className="flex items-center gap-2">
      <Checkbox
        checked={includePayload}
        onClick={() => setIncludePayload(!includePayload)}
        disabled={!isEditor}
      />
      <Label>
        <Trans>Include webhook payload</Trans>
      </Label>
    </div>
  );
}

interface WebhookEditionMessageInputProps {
  isEditor: boolean;
}

function WebhookEditionMessageInput({
  isEditor,
}: WebhookEditionMessageInputProps) {
  const { control } = useFormContext<TriggerViewsSheetFormValues>();
  const { field } = useController({ control, name: "webhook.customPrompt" });

  return (
    <div className="space-y-1">
      <Label htmlFor="webhook-prompt">
        <Trans>Message (optional)</Trans>
      </Label>
      <p className="text-sm text-muted-foreground">
        <Trans>Message for the agent when the trigger runs.</Trans>
      </p>
      <TextArea
        id="webhook-prompt"
        minRows={4}
        disabled={!isEditor}
        {...field}
      />
    </div>
  );
}

interface WebhookEditionPodSelectorProps {
  isEditor: boolean;
  owner: LightWorkspaceType;
}

function WebhookEditionPodSelector({
  isEditor,
  owner,
}: WebhookEditionPodSelectorProps) {
  const { control } = useFormContext<TriggerViewsSheetFormValues>();
  const { field } = useController({ control, name: "webhook.spaceId" });

  return (
    <div className="space-y-1">
      <Label>
        <Trans>Where to create this conversation? (optional)</Trans>
      </Label>
      <p className="text-sm text-muted-foreground">
        <Trans>Run this trigger's conversation inside a Pod instead.</Trans>
      </p>
      <TriggerPodSelector
        owner={owner}
        value={field.value}
        onChange={field.onChange}
        disabled={!isEditor}
      />
    </div>
  );
}

interface WebhookEditionSheetContentProps {
  owner: LightWorkspaceType;
  trigger: AgentBuilderWebhookTriggerType | null;
  agentConfigurationId: string | null;
  webhookSourceView: WebhookSourceViewType | null;
  isEditor: boolean;
}

export function WebhookEditionSheetContent({
  owner,
  trigger,
  agentConfigurationId,
  webhookSourceView,
  isEditor,
}: WebhookEditionSheetContentProps) {
  const { t } = useLingui();
  const selectedPreset = useMemo((): WebhookPresetMetadata | null => {
    if (!webhookSourceView || webhookSourceView.provider === null) {
      return null;
    }
    return WEBHOOK_PRESETS[webhookSourceView.provider];
  }, [webhookSourceView]);

  const availableEvents = useMemo(() => {
    if (!selectedPreset || !webhookSourceView) {
      return [];
    }

    return selectedPreset.events.filter((event) =>
      webhookSourceView.subscribedEvents.includes(event.value)
    );
  }, [selectedPreset, webhookSourceView]);

  const editorName = trigger?.editorName ?? t`another user`;

  return (
    <>
      {trigger && !isEditor && (
        <ContentMessage variant="info">
          <Trans>
            You cannot edit this trigger. It is managed by{" "}
            <span className="font-semibold">{editorName}</span>.
          </Trans>
        </ContentMessage>
      )}
      <div className="space-y-8">
        <div className="flex flex-row items-center justify-between gap-4">
          <WebhookEditionNameInput isEditor={isEditor} />
          <TriggerStatusToggle name="webhook.status" isEditor={isEditor} />
        </div>

        <WebhookEditionEventSelector
          isEditor={isEditor}
          selectedPreset={selectedPreset}
          availableEvents={availableEvents}
        />

        <WebhookEditionFilters
          isEditor={isEditor}
          webhookSourceView={webhookSourceView}
          selectedPreset={selectedPreset}
          availableEvents={availableEvents}
          workspace={owner}
        />

        <Separator />

        <div className="space-y-4">
          <WebhookEditionMessageInput isEditor={isEditor} />
          <WebhookEditionIncludePayload isEditor={isEditor} />
        </div>

        <Separator />

        <TriggerPoolSelector
          name="webhook.executionMode"
          currentExecutionMode={trigger?.executionMode ?? null}
          isEditor={isEditor}
        />

        <WebhookEditionExecutionLimit isEditor={isEditor} />

        <Separator />

        <WebhookEditionPodSelector isEditor={isEditor} owner={owner} />

        {trigger && (
          <div className="space-y-1">
            <RecentWebhookRequests
              owner={owner}
              agentConfigurationId={agentConfigurationId}
              trigger={trigger}
            />
          </div>
        )}
      </div>
    </>
  );
}
