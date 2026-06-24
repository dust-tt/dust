import { getResolvedWorkspaceDefaultModel } from "@app/components/agent_builder/transformAgentConfiguration";
import { ConfirmContext } from "@app/components/Confirm";
import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useWorkspaceDefaultModel } from "@app/hooks/useWorkspaceDefaultModel";
import { useModels } from "@app/lib/swr/models";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { WorkspaceType } from "@app/types/user";
import { getWorkspaceDefaultModelSetting } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useContext } from "react";

interface DefaultModelSelectProps {
  workspace: WorkspaceType;
  mutateWorkspace: () => Promise<unknown>;
}

export function DefaultModelSelect({
  workspace,
  mutateWorkspace,
}: DefaultModelSelectProps) {
  const { isDark } = useTheme();
  const confirm = useContext(ConfirmContext);
  const { models } = useModels({ owner: workspace });
  const { updateDefaultModel, isSaving } = useWorkspaceDefaultModel({
    owner: workspace,
    mutateWorkspace,
  });

  const setting = getWorkspaceDefaultModelSetting(workspace);
  const isAutomatic = setting === null;
  const resolvedModel = getResolvedWorkspaceDefaultModel(workspace, models);

  const onSelectModel = async (model: ModelConfigurationType) => {
    const confirmed = await confirm({
      title: `Set ${model.displayName} as the workspace default?`,
      message: (
        <div className="flex flex-col gap-2">
          <div>{model.shortDescription}</div>
          <div>
            This model powers @dust, @dust-task and every default agent. It is
            also the default option for newly created agents. Cost and latency
            may vary depending on the model you select. You can always change it
            later.
          </div>
        </div>
      ),
      validateLabel: "Set as default",
      validateVariant: "warning",
    });
    if (confirmed) {
      await updateDefaultModel({
        providerId: model.providerId,
        modelId: model.modelId,
      });
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Default model:</div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={isSaving}>
            <Button
              isSelect
              disabled={isSaving}
              label={isAutomatic ? "Not selected" : resolvedModel.displayName}
              icon={
                isAutomatic
                  ? undefined
                  : getModelProviderLogo(resolvedModel.providerId, isDark)
              }
              variant="outline"
              size="sm"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => updateDefaultModel(null)}>
              <div className="flex flex-col">
                <span>Not selected</span>
                <span className="text-xs text-gray-500">
                  Currently{" "}
                  <span className="font-bold">{resolvedModel.displayName}</span>
                </span>
              </div>
            </DropdownMenuItem>
            {models.map((model) => (
              <DropdownMenuItem
                key={`${model.providerId}/${model.modelId}`}
                label={model.displayName}
                description={model.shortDescription}
                icon={getModelProviderLogo(model.providerId, isDark)}
                onClick={() => onSelectModel(model)}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="text-sm text-gray-500">
        The default model backs the standard agents (Dust, dust-task, …) and is
        the default for newly created agents, which follow it automatically.
        Leave it unset to always use the best available model, or pin a specific
        model to freeze it.{" "}
        {isAutomatic && (
          <>
            <br />
            <b>
              No model is set. Agents currently default to Dust's recommended
              model: {resolvedModel.displayName}
            </b>
          </>
        )}
      </div>
    </div>
  );
}
