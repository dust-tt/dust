import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { GovernanceSettingSection } from "@app/components/pages/workspace/governance/GovernanceSettingSection";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import {
  useDeleteInferenceHook,
  useInferenceHook,
  useUpsertInferenceHook,
} from "@app/lib/swr/inference_hooks";
import {
  INFERENCE_HOOK_PROVIDERS,
  parseInferenceHookEndpoint,
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

const PROVIDER = INFERENCE_HOOK_PROVIDERS.datadog_ai_guard;

export function InferenceHooksGovernanceSection({
  owner,
}: InferenceHooksSettingsProps) {
  const { isAdmin } = useAuth();
  const { hasFeature } = useFeatureFlags();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  if (!hasFeature("inference_hooks") || !isAdmin) {
    return null;
  }

  return (
    <>
      <GovernanceSettingSection label="Inference security" icon={Lock01}>
        <GovernanceSettingRowLayout
          label={PROVIDER.displayName}
          description={PROVIDER.description}
          action={
            <Button
              label="Configure"
              size="xs"
              variant="outline"
              icon={Settings01}
              onClick={() => setIsSheetOpen(true)}
            />
          }
        />
      </GovernanceSettingSection>
      <InferenceHooksSettingsSheet
        owner={owner}
        isOpen={isSheetOpen}
        onOpenChange={setIsSheetOpen}
      />
    </>
  );
}

function InferenceHooksSettingsSheet({
  owner,
  isOpen,
  onOpenChange,
}: {
  owner: WorkspaceType;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { inferenceHook, isInferenceHookLoading } = useInferenceHook(owner, {
    disabled: !isOpen,
  });
  const { upsertInferenceHook } = useUpsertInferenceHook({ owner });
  const { deleteInferenceHook } = useDeleteInferenceHook({ owner });

  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [appKey, setAppKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(isOpen);

  useEffect(() => {
    if (isOpen && !wasOpen) {
      setEndpoint(inferenceHook?.endpoint ?? "");
      setApiKey("");
      setAppKey("");
    }
    setWasOpen(isOpen);
  }, [isOpen, wasOpen, inferenceHook?.endpoint]);

  const endpointValidation = useMemo(() => {
    if (!endpoint.trim()) {
      return null;
    }
    return parseInferenceHookEndpoint(endpoint);
  }, [endpoint]);

  const endpointMessage =
    endpointValidation && !endpointValidation.ok
      ? endpointValidation.message
      : "HTTPS URL ending with /api/v2/ai-guard/evaluate for your Datadog site.";

  const canSave =
    !!endpoint.trim() &&
    !!apiKey.trim() &&
    !!appKey.trim() &&
    endpointValidation?.ok === true &&
    !isSaving;

  const handleSave = async () => {
    if (!canSave || !endpointValidation || !endpointValidation.ok) {
      return;
    }
    setIsSaving(true);
    const ok = await upsertInferenceHook({
      providerId: "datadog_ai_guard",
      endpoint: endpointValidation.endpoint,
      apiKey: apiKey.trim(),
      appKey: appKey.trim(),
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
          <SheetTitle>{PROVIDER.displayName}</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Dust calls Datadog AI Guard on each agent model step (input and
              output). Configure your site evaluate endpoint and keys with the
              ai_guard_evaluate scope. APM sidecars are not used; only the HTTP
              evaluate API runs from Dust workers.
            </p>
            <Input
              label="Evaluate endpoint"
              name="endpoint"
              placeholder="https://api.datadoghq.com/api/v2/ai-guard/evaluate"
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
                inferenceHook?.hasCredentials
                  ? "Enter a new API key to rotate"
                  : "Datadog API key"
              }
              value={apiKey}
              disabled={isInferenceHookLoading || isSaving}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <Input
              label="Application key"
              name="appKey"
              type="password"
              placeholder={
                inferenceHook?.hasCredentials
                  ? "Enter a new App key to rotate"
                  : "Datadog Application key"
              }
              value={appKey}
              disabled={isInferenceHookLoading || isSaving}
              onChange={(e) => setAppKey(e.target.value)}
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
