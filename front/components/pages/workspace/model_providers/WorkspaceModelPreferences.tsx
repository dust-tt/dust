import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  getWorkspaceBackupModelPreference,
  getWorkspaceDefaultModelPreference,
  type WorkspaceModelPreference,
} from "@app/types/assistant/models/preferences";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  ContextItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

interface WorkspaceModelPreferencesProps {
  workspace: WorkspaceType;
  models: ModelConfigurationType[];
  mutateWorkspace: () => Promise<unknown>;
}

type PreferenceKind = "default" | "backup";

function toPreference(
  model: ModelConfigurationType | null
): WorkspaceModelPreference | null {
  if (!model) {
    return null;
  }

  return {
    providerId: model.providerId,
    modelId: model.modelId,
  };
}

function isSamePreference(
  a: WorkspaceModelPreference | null,
  b: WorkspaceModelPreference | null
) {
  return a?.providerId === b?.providerId && a?.modelId === b?.modelId;
}

function getModelLabel(
  models: ModelConfigurationType[],
  preference: WorkspaceModelPreference | null,
  fallbackLabel: string
) {
  if (!preference) {
    return fallbackLabel;
  }

  return (
    models.find(
      (model) =>
        model.providerId === preference.providerId &&
        model.modelId === preference.modelId
    )?.displayName ?? `${preference.providerId}/${preference.modelId}`
  );
}

function ModelPreferenceRow({
  description,
  disabledModelPreference,
  fallbackLabel,
  isSaving,
  kind,
  models,
  onSelect,
  preference,
  title,
}: {
  description: string;
  disabledModelPreference: WorkspaceModelPreference | null;
  fallbackLabel: string;
  isSaving: boolean;
  kind: PreferenceKind;
  models: ModelConfigurationType[];
  onSelect: (kind: PreferenceKind, model: ModelConfigurationType | null) => void;
  preference: WorkspaceModelPreference | null;
  title: string;
}) {
  const label = getModelLabel(models, preference, fallbackLabel);

  return (
    <ContextItem
      title={title}
      hasSeparator={false}
      action={
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={isSaving}>
            <Button isSelect label={label} variant="outline" size="sm" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-96 w-80 overflow-y-auto">
            <DropdownMenuItem
              label={fallbackLabel}
              onClick={() => onSelect(kind, null)}
            />
            <DropdownMenuLabel label="Models" />
            {models.map((model) => {
              const modelPreference = toPreference(model);
              const disabled = isSamePreference(
                modelPreference,
                disabledModelPreference
              );

              return (
                <DropdownMenuItem
                  key={`${kind}-${model.providerId}-${model.modelId}`}
                  disabled={disabled}
                  label={model.displayName}
                  description={model.shortDescription}
                  onClick={() => onSelect(kind, model)}
                />
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <ContextItem.Description>
        <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          {description}
        </span>
      </ContextItem.Description>
    </ContextItem>
  );
}

export function WorkspaceModelPreferences({
  workspace,
  models,
  mutateWorkspace,
}: WorkspaceModelPreferencesProps) {
  const sendNotification = useSendNotification();
  const [isSaving, setIsSaving] = useState(false);
  const [defaultModel, setDefaultModel] =
    useState<WorkspaceModelPreference | null>(() =>
      getWorkspaceDefaultModelPreference(workspace.metadata)
    );
  const [backupModel, setBackupModel] =
    useState<WorkspaceModelPreference | null>(() =>
      getWorkspaceBackupModelPreference(workspace.metadata)
    );

  useEffect(() => {
    setDefaultModel(getWorkspaceDefaultModelPreference(workspace.metadata));
    setBackupModel(getWorkspaceBackupModelPreference(workspace.metadata));
  }, [workspace.metadata]);

  const savePreferences = async ({
    nextBackupModel,
    nextDefaultModel,
  }: {
    nextBackupModel: WorkspaceModelPreference | null;
    nextDefaultModel: WorkspaceModelPreference | null;
  }) => {
    const previousDefaultModel = defaultModel;
    const previousBackupModel = backupModel;

    setDefaultModel(nextDefaultModel);
    setBackupModel(nextBackupModel);
    setIsSaving(true);

    try {
      const response = await clientFetch(`/api/w/${workspace.sId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultModel: nextDefaultModel,
          backupModel: nextBackupModel,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update workspace model preferences");
      }

      sendNotification({
        type: "success",
        title: "Model preferences updated",
        description: "The workspace model preferences have been updated.",
      });

      await mutateWorkspace();
    } catch {
      setDefaultModel(previousDefaultModel);
      setBackupModel(previousBackupModel);
      sendNotification({
        type: "error",
        title: "Update failed",
        description:
          "An unexpected error occurred while updating model preferences.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelect = (
    kind: PreferenceKind,
    model: ModelConfigurationType | null
  ) => {
    const preference = toPreference(model);

    void savePreferences({
      nextDefaultModel: kind === "default" ? preference : defaultModel,
      nextBackupModel: kind === "backup" ? preference : backupModel,
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <ModelPreferenceRow
        kind="default"
        title="Default model for Auto"
        description={
          "When an agent uses Auto, Dust will prefer this model if it is still " +
          "available for the workspace. If unset or unavailable, Dust falls " +
          "back to its system default order."
        }
        fallbackLabel="Dust system default"
        models={models}
        preference={defaultModel}
        disabledModelPreference={backupModel}
        isSaving={isSaving}
        onSelect={handleSelect}
      />
      <ModelPreferenceRow
        kind="backup"
        title="Backup model"
        description={
          "Optional fallback preference for Auto and future provider failover. " +
          "The backup must be different from the default model."
        }
        fallbackLabel="No backup model"
        models={models}
        preference={backupModel}
        disabledModelPreference={defaultModel}
        isSaving={isSaving}
        onSelect={handleSelect}
      />
    </div>
  );
}
