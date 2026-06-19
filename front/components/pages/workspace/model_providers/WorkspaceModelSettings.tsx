import { useWorkspaceModelSettings } from "@app/hooks/useWorkspaceModelSettings";
import { useModels } from "@app/lib/swr/models";
import { CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";
import { isAutoModel } from "@app/types/assistant/models/dust";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { LightWorkspaceType, WorkspaceType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

interface WorkspaceModelSettingsProps {
  owner: LightWorkspaceType;
  workspace: WorkspaceType;
  mutateWorkspace: () => Promise<unknown>;
}

// `null` is a valid selection: default falls back to the Dust default, backup
// means "no backup".
function labelForSelection(
  modelId: string | null,
  models: ModelConfigurationType[],
  nullLabel: string
): string {
  if (!modelId) {
    return nullLabel;
  }
  return models.find((m) => m.modelId === modelId)?.displayName ?? modelId;
}

export function WorkspaceModelSettings({
  owner,
  workspace,
  mutateWorkspace,
}: WorkspaceModelSettingsProps) {
  const { models, isModelsLoading } = useModels({ owner });
  const { saveModelSettings, isSaving } = useWorkspaceModelSettings(
    owner,
    mutateWorkspace
  );

  // Selectable models exclude the "auto" sentinel (can't be a default/backup).
  const selectableModels = useMemo(
    () => models.filter((m) => !isAutoModel(m)),
    [models]
  );

  const [defaultModelId, setDefaultModelId] = useState<string | null>(
    workspace.defaultModelId
  );
  const [backupModelId, setBackupModelId] = useState<string | null>(
    workspace.backupModelId
  );

  useEffect(() => {
    setDefaultModelId(workspace.defaultModelId);
    setBackupModelId(workspace.backupModelId);
  }, [workspace.defaultModelId, workspace.backupModelId]);

  const hasChanges =
    defaultModelId !== workspace.defaultModelId ||
    backupModelId !== workspace.backupModelId;

  const dustDefaultLabel = `Dust default (${CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.displayName})`;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="font-semibold">Auto model tier</div>
      <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        The default model is used by agents on the "Auto" tier. The backup model
        is used as an automatic fallback for all agents during provider outages.
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Default model</div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={isModelsLoading || isSaving}>
            <Button
              isSelect
              label={labelForSelection(
                defaultModelId,
                selectableModels,
                dustDefaultLabel
              )}
              variant="outline"
              size="sm"
              disabled={isModelsLoading || isSaving}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              label={dustDefaultLabel}
              onClick={() => setDefaultModelId(null)}
            />
            {selectableModels.map((model) => (
              <DropdownMenuItem
                key={model.modelId}
                label={model.displayName}
                onClick={() => setDefaultModelId(model.modelId)}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Backup model</div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={isModelsLoading || isSaving}>
            <Button
              isSelect
              label={labelForSelection(backupModelId, selectableModels, "None")}
              variant="outline"
              size="sm"
              disabled={isModelsLoading || isSaving}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              label="None"
              onClick={() => setBackupModelId(null)}
            />
            {selectableModels.map((model) => (
              <DropdownMenuItem
                key={model.modelId}
                label={model.displayName}
                onClick={() => setBackupModelId(model.modelId)}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex justify-end">
        <Button
          label="Save"
          variant="primary"
          size="sm"
          disabled={!hasChanges || isSaving}
          isLoading={isSaving}
          onClick={() => {
            void saveModelSettings({ defaultModelId, backupModelId });
          }}
        />
      </div>
    </div>
  );
}
