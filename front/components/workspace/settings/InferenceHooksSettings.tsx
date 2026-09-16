import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { GovernanceSettingSection } from "@app/components/pages/workspace/governance/GovernanceSettingSection";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import {
  useDeleteInferenceHook,
  useInferenceHook,
  useUpsertInferenceHook,
} from "@app/lib/swr/inference_hooks";
import type {
  InferenceHookEnforcementMode,
  InferenceHookFailMode,
  InferenceHookProviderId,
} from "@app/types/inference_hook";
import {
  INFERENCE_HOOK_ENFORCEMENT_MODE_DEFAULT,
  INFERENCE_HOOK_FAIL_MODE_DEFAULT,
  INFERENCE_HOOK_PROVIDER_IDS,
  INFERENCE_HOOK_PROVIDERS,
  INFERENCE_HOOK_TIMEOUT_MS_DEFAULT,
  INFERENCE_HOOK_TIMEOUT_MS_MAX,
  parseInferenceHookEndpoint,
  parseInferenceHookTimeoutMs,
} from "@app/types/inference_hook";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  Input,
  Lock01,
  Settings01,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

interface InferenceHooksSettingsProps {
  owner: WorkspaceType;
}

export function InferenceHooksGovernanceSection({
  owner,
}: InferenceHooksSettingsProps) {
  const { isAdmin } = useAuth();
  const { hasFeature } = useFeatureFlags();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sheetProviderId, setSheetProviderId] =
    useState<InferenceHookProviderId>("generic_http");
  const { inferenceHook } = useInferenceHook(owner, {
    disabled: !hasFeature("inference_hooks") || !isAdmin,
  });

  if (!hasFeature("inference_hooks") || !isAdmin) {
    return null;
  }

  const openSheet = (providerId: InferenceHookProviderId) => {
    setSheetProviderId(providerId);
    setIsSheetOpen(true);
  };

  const genericMeta = INFERENCE_HOOK_PROVIDERS.generic_http;
  const datadogMeta = INFERENCE_HOOK_PROVIDERS.datadog_ai_guard;
  const isGenericConfigured = inferenceHook?.providerId === "generic_http";
  const isDatadogConfigured = inferenceHook?.providerId === "datadog_ai_guard";

  return (
    <>
      <GovernanceSettingSection label="Inference Hooks" icon={Lock01}>
        <GovernanceSettingRowLayout
          label={genericMeta.displayName}
          description={
            isGenericConfigured
              ? `Configured. ${genericMeta.description}`
              : genericMeta.description
          }
          action={
            <Button
              label={isGenericConfigured ? "Manage" : "Set up"}
              size="xs"
              variant="outline"
              icon={Settings01}
              onClick={() => openSheet("generic_http")}
            />
          }
        />
        <GovernanceSettingRowLayout
          label={datadogMeta.displayName}
          description={
            isDatadogConfigured
              ? `Configured. ${datadogMeta.description}`
              : datadogMeta.description
          }
          action={
            <Button
              label={isDatadogConfigured ? "Manage" : "Set up"}
              size="xs"
              variant="outline"
              icon={Settings01}
              onClick={() => openSheet("datadog_ai_guard")}
            />
          }
        />
      </GovernanceSettingSection>
      <InferenceHooksSettingsSheet
        owner={owner}
        isOpen={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        initialProviderId={sheetProviderId}
      />
    </>
  );
}

function InferenceHooksSettingsSheet({
  owner,
  isOpen,
  onOpenChange,
  initialProviderId,
}: {
  owner: WorkspaceType;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initialProviderId: InferenceHookProviderId;
}) {
  const { inferenceHook, isInferenceHookLoading } = useInferenceHook(owner, {
    disabled: !isOpen,
  });
  const { upsertInferenceHook } = useUpsertInferenceHook({ owner });
  const { deleteInferenceHook } = useDeleteInferenceHook({ owner });

  const [providerId, setProviderId] =
    useState<InferenceHookProviderId>(initialProviderId);
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [appKey, setAppKey] = useState("");
  const [enforcementMode, setEnforcementMode] =
    useState<InferenceHookEnforcementMode>(
      INFERENCE_HOOK_ENFORCEMENT_MODE_DEFAULT
    );
  const [failMode, setFailMode] = useState<InferenceHookFailMode>(
    INFERENCE_HOOK_FAIL_MODE_DEFAULT
  );
  const [timeoutMs, setTimeoutMs] = useState(
    String(INFERENCE_HOOK_TIMEOUT_MS_DEFAULT)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(isOpen);

  useEffect(() => {
    if (isOpen && !wasOpen) {
      const editingExisting = inferenceHook?.providerId === initialProviderId;
      setProviderId(initialProviderId);
      setEndpoint(editingExisting ? (inferenceHook?.endpoint ?? "") : "");
      setApiKey("");
      setAppKey("");
      setEnforcementMode(
        editingExisting
          ? (inferenceHook?.enforcementMode ??
              INFERENCE_HOOK_ENFORCEMENT_MODE_DEFAULT)
          : INFERENCE_HOOK_ENFORCEMENT_MODE_DEFAULT
      );
      setFailMode(
        editingExisting
          ? (inferenceHook?.failMode ?? INFERENCE_HOOK_FAIL_MODE_DEFAULT)
          : INFERENCE_HOOK_FAIL_MODE_DEFAULT
      );
      setTimeoutMs(
        String(
          editingExisting
            ? (inferenceHook?.timeoutMs ?? INFERENCE_HOOK_TIMEOUT_MS_DEFAULT)
            : INFERENCE_HOOK_TIMEOUT_MS_DEFAULT
        )
      );
    }
    setWasOpen(isOpen);
  }, [isOpen, wasOpen, inferenceHook, initialProviderId]);

  const providerMeta = INFERENCE_HOOK_PROVIDERS[providerId];

  const endpointValidation = useMemo(() => {
    if (!endpoint.trim()) {
      return null;
    }
    return parseInferenceHookEndpoint(endpoint, providerId);
  }, [endpoint, providerId]);

  const timeoutValidation = useMemo(
    () => parseInferenceHookTimeoutMs(timeoutMs),
    [timeoutMs]
  );

  const endpointMessage =
    endpointValidation && !endpointValidation.ok
      ? endpointValidation.message
      : providerId === "datadog_ai_guard"
        ? "HTTPS URL ending with /api/v2/ai-guard/evaluate for your Datadog site."
        : "HTTPS URL for your evaluate webhook (POST, returns ALLOW/DENY/ABORT).";

  const timeoutMessage = timeoutValidation.ok
    ? `At most ${INFERENCE_HOOK_TIMEOUT_MS_MAX}ms. Timed-out calls follow fail mode.`
    : timeoutValidation.message;

  const keysReady =
    !!apiKey.trim() ||
    (!!inferenceHook?.hasCredentials &&
      inferenceHook.providerId === providerId);
  const appKeyReady =
    !providerMeta.requiresAppKey ||
    !!appKey.trim() ||
    (!!inferenceHook?.hasCredentials &&
      inferenceHook.providerId === providerId);

  const canSave =
    !!endpoint.trim() &&
    keysReady &&
    appKeyReady &&
    endpointValidation?.ok === true &&
    timeoutValidation.ok &&
    !isSaving;

  const handleSave = async () => {
    if (
      !canSave ||
      !endpointValidation ||
      !endpointValidation.ok ||
      !timeoutValidation.ok
    ) {
      return;
    }
    setIsSaving(true);
    const ok = await upsertInferenceHook({
      providerId,
      endpoint: endpointValidation.endpoint,
      apiKey: apiKey.trim() || undefined,
      appKey: appKey.trim() || undefined,
      enforcementMode,
      failMode,
      timeoutMs: timeoutValidation.timeoutMs,
    });
    setIsSaving(false);
    if (ok) {
      onOpenChange(false);
    }
  };

  const handleDelete = async () => {
    setIsSaving(true);
    const ok = await deleteInferenceHook();
    setIsSaving(false);
    if (ok) {
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>Inference Hooks</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Dust calls your evaluate endpoint on each agent model step (input
              and output). Pick a generic HTTPS webhook or Datadog AI Guard. APM
              sidecars are not used.
            </p>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Provider</span>
              <select
                className="rounded-md border border-border bg-background px-2 py-2"
                value={providerId}
                disabled={isInferenceHookLoading || isSaving}
                onChange={(e) =>
                  setProviderId(e.target.value as InferenceHookProviderId)
                }
              >
                {INFERENCE_HOOK_PROVIDER_IDS.map((id) => (
                  <option key={id} value={id}>
                    {INFERENCE_HOOK_PROVIDERS[id].displayName}
                    {INFERENCE_HOOK_PROVIDERS[id].cobranded
                      ? " (co-branded)"
                      : ""}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                {providerMeta.description}
              </span>
            </label>
            <Input
              label="Evaluate endpoint"
              name="endpoint"
              placeholder={
                providerId === "datadog_ai_guard"
                  ? "https://api.datadoghq.com/api/v2/ai-guard/evaluate"
                  : "https://hooks.example.com/v1/evaluate"
              }
              value={endpoint}
              disabled={isInferenceHookLoading || isSaving}
              message={endpointMessage}
              messageStatus={
                endpointValidation && !endpointValidation.ok ? "error" : "info"
              }
              onChange={(e) => setEndpoint(e.target.value)}
            />
            <Input
              label="API key"
              name="apiKey"
              type="password"
              placeholder={
                inferenceHook?.hasCredentials &&
                inferenceHook.providerId === providerId
                  ? "Enter a new API key to rotate"
                  : providerId === "datadog_ai_guard"
                    ? "Datadog API key"
                    : "Bearer token / API key"
              }
              value={apiKey}
              disabled={isInferenceHookLoading || isSaving}
              onChange={(e) => setApiKey(e.target.value)}
            />
            {providerMeta.requiresAppKey && (
              <Input
                label="Application key"
                name="appKey"
                type="password"
                placeholder={
                  inferenceHook?.hasCredentials &&
                  inferenceHook.providerId === providerId
                    ? "Enter a new App key to rotate"
                    : "Datadog Application key"
                }
                value={appKey}
                disabled={isInferenceHookLoading || isSaving}
                onChange={(e) => setAppKey(e.target.value)}
              />
            )}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Enforcement mode</span>
              <select
                className="rounded-md border border-border bg-background px-2 py-2"
                value={enforcementMode}
                disabled={isInferenceHookLoading || isSaving}
                onChange={(e) =>
                  setEnforcementMode(
                    e.target.value as InferenceHookEnforcementMode
                  )
                }
              >
                <option value="block">
                  Block (DENY/ABORT stop the agent step)
                </option>
                <option value="monitor">Monitor (evaluate and log only)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">On error / timeout</span>
              <select
                className="rounded-md border border-border bg-background px-2 py-2"
                value={failMode}
                disabled={isInferenceHookLoading || isSaving}
                onChange={(e) =>
                  setFailMode(e.target.value as InferenceHookFailMode)
                }
              >
                <option value="closed">Fail closed (block the step)</option>
                <option value="open">Fail open (let the step continue)</option>
              </select>
            </label>
            <Input
              label="Timeout (ms)"
              name="timeoutMs"
              inputMode="numeric"
              value={timeoutMs}
              disabled={isInferenceHookLoading || isSaving}
              message={timeoutMessage}
              messageStatus={timeoutValidation.ok ? "info" : "error"}
              onChange={(e) => setTimeoutMs(e.target.value)}
            />
          </div>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={
            inferenceHook
              ? {
                  label: "Remove",
                  variant: "warning",
                  disabled: isSaving,
                  onClick: () => {
                    void handleDelete();
                  },
                }
              : undefined
          }
          rightButtonProps={{
            label: "Save",
            variant: "primary",
            disabled: !canSave,
            onClick: () => {
              void handleSave();
            },
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
