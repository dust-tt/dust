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
  InferenceHookType,
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
import { assertNever } from "@app/types/shared/utils/assert_never";
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
import { useReducer, useState } from "react";

interface InferenceHooksSettingsProps {
  owner: WorkspaceType;
}

type SheetFormState = {
  providerId: InferenceHookProviderId;
  endpoint: string;
  apiKey: string;
  appKey: string;
  enforcementMode: InferenceHookEnforcementMode;
  failMode: InferenceHookFailMode;
  timeoutMs: string;
};

type SheetFormAction =
  | { type: "set_provider"; providerId: InferenceHookProviderId }
  | { type: "set_endpoint"; endpoint: string }
  | { type: "set_api_key"; apiKey: string }
  | { type: "set_app_key"; appKey: string }
  | {
      type: "set_enforcement_mode";
      enforcementMode: InferenceHookEnforcementMode;
    }
  | { type: "set_fail_mode"; failMode: InferenceHookFailMode }
  | { type: "set_timeout_ms"; timeoutMs: string };

function buildInitialFormState({
  providerId,
  inferenceHook,
}: {
  providerId: InferenceHookProviderId;
  inferenceHook: InferenceHookType | null;
}): SheetFormState {
  const editingExisting = inferenceHook?.providerId === providerId;
  return {
    providerId,
    endpoint: editingExisting ? (inferenceHook?.endpoint ?? "") : "",
    apiKey: "",
    appKey: "",
    enforcementMode: editingExisting
      ? (inferenceHook?.enforcementMode ??
        INFERENCE_HOOK_ENFORCEMENT_MODE_DEFAULT)
      : INFERENCE_HOOK_ENFORCEMENT_MODE_DEFAULT,
    failMode: editingExisting
      ? (inferenceHook?.failMode ?? INFERENCE_HOOK_FAIL_MODE_DEFAULT)
      : INFERENCE_HOOK_FAIL_MODE_DEFAULT,
    timeoutMs: String(
      editingExisting
        ? (inferenceHook?.timeoutMs ?? INFERENCE_HOOK_TIMEOUT_MS_DEFAULT)
        : INFERENCE_HOOK_TIMEOUT_MS_DEFAULT
    ),
  };
}

function sheetFormReducer(
  state: SheetFormState,
  action: SheetFormAction
): SheetFormState {
  switch (action.type) {
    case "set_provider":
      return { ...state, providerId: action.providerId };
    case "set_endpoint":
      return { ...state, endpoint: action.endpoint };
    case "set_api_key":
      return { ...state, apiKey: action.apiKey };
    case "set_app_key":
      return { ...state, appKey: action.appKey };
    case "set_enforcement_mode":
      return { ...state, enforcementMode: action.enforcementMode };
    case "set_fail_mode":
      return { ...state, failMode: action.failMode };
    case "set_timeout_ms":
      return { ...state, timeoutMs: action.timeoutMs };
    default:
      assertNever(action);
  }
}

export function InferenceHooksGovernanceSection({
  owner,
}: InferenceHooksSettingsProps) {
  const { isAdmin } = useAuth();
  const { hasFeature } = useFeatureFlags();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sheetSession, setSheetSession] = useState<{
    providerId: InferenceHookProviderId;
    key: number;
  }>({ providerId: "generic_http", key: 0 });
  const { inferenceHook } = useInferenceHook(owner, {
    disabled: !hasFeature("inference_hooks") || !isAdmin,
  });

  if (!hasFeature("inference_hooks") || !isAdmin) {
    return null;
  }

  const openSheet = (providerId: InferenceHookProviderId) => {
    setSheetSession((prev) => ({
      providerId,
      key: prev.key + 1,
    }));
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
        key={sheetSession.key}
        owner={owner}
        isOpen={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        initialProviderId={sheetSession.providerId}
        inferenceHook={inferenceHook}
      />
    </>
  );
}

function InferenceHooksSettingsSheet({
  owner,
  isOpen,
  onOpenChange,
  initialProviderId,
  inferenceHook,
}: {
  owner: WorkspaceType;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initialProviderId: InferenceHookProviderId;
  inferenceHook: InferenceHookType | null;
}) {
  const { isInferenceHookLoading } = useInferenceHook(owner, {
    disabled: !isOpen,
  });
  const { upsertInferenceHook } = useUpsertInferenceHook({ owner });
  const { deleteInferenceHook } = useDeleteInferenceHook({ owner });

  const [form, dispatch] = useReducer(
    sheetFormReducer,
    { providerId: initialProviderId, inferenceHook },
    buildInitialFormState
  );
  const [isSaving, setIsSaving] = useState(false);

  const {
    providerId,
    endpoint,
    apiKey,
    appKey,
    enforcementMode,
    failMode,
    timeoutMs,
  } = form;

  const providerMeta = INFERENCE_HOOK_PROVIDERS[providerId];

  const endpointValidation = endpoint.trim()
    ? parseInferenceHookEndpoint(endpoint, providerId)
    : null;
  const timeoutValidation = parseInferenceHookTimeoutMs(timeoutMs);

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
                  dispatch({
                    type: "set_provider",
                    providerId: e.target.value as InferenceHookProviderId,
                  })
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
              onChange={(e) =>
                dispatch({ type: "set_endpoint", endpoint: e.target.value })
              }
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
              onChange={(e) =>
                dispatch({ type: "set_api_key", apiKey: e.target.value })
              }
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
                onChange={(e) =>
                  dispatch({ type: "set_app_key", appKey: e.target.value })
                }
              />
            )}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Enforcement mode</span>
              <select
                className="rounded-md border border-border bg-background px-2 py-2"
                value={enforcementMode}
                disabled={isInferenceHookLoading || isSaving}
                onChange={(e) =>
                  dispatch({
                    type: "set_enforcement_mode",
                    enforcementMode: e.target
                      .value as InferenceHookEnforcementMode,
                  })
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
                  dispatch({
                    type: "set_fail_mode",
                    failMode: e.target.value as InferenceHookFailMode,
                  })
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
              onChange={(e) =>
                dispatch({ type: "set_timeout_ms", timeoutMs: e.target.value })
              }
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
