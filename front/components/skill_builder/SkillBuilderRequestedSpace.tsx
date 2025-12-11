import {
  Chip,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";

import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { getSpaceIdToActionsMap } from "@app/components/shared/getSpaceIdToActionsMap";
import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import { getSpaceIcon, getSpaceName } from "@app/lib/spaces";
import type { SpaceType } from "@app/types";

function getToolDisplayName(
  action: BuilderAction,
  mcpServerViews: MCPServerViewTypeWithLabel[]
): string {
  const mcpServerView = mcpServerViews.find(
    (view) => view.sId === action.configuration.mcpServerViewId
  );
  if (mcpServerView) {
    return getMcpServerViewDisplayName(mcpServerView, action);
  }
  return action.name;
}

function getToolIcon(
  action: BuilderAction,
  mcpServerViews: MCPServerViewTypeWithLabel[]
): React.ReactNode {
  const mcpServerView = mcpServerViews.find(
    (view) => view.sId === action.configuration.mcpServerViewId
  );
  if (mcpServerView?.server) {
    return getAvatar(mcpServerView.server, "xs");
  }
  return null;
}

interface RemoveSpaceDialogProps {
  space: SpaceType | null;
  tools: BuilderAction[];
  mcpServerViews: MCPServerViewTypeWithLabel[];
  onClose: () => void;
  onConfirm: () => void;
}

function RemoveSpaceDialog({
  space,
  tools,
  mcpServerViews,
  onClose,
  onConfirm,
}: RemoveSpaceDialogProps) {
  if (!space) {
    return null;
  }

  return (
    <Dialog open={!!space} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md" isAlertDialog>
        <DialogHeader hideButton>
          <DialogTitle>Remove {getSpaceName(space)} space</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            This will remove the following elements from skill:
          </p>
          <h4 className="mt-4 font-semibold text-foreground dark:text-foreground-night">
            Tools
          </h4>
          <ul className="mt-2 space-y-2">
            {tools.map((tool) => (
              <li key={tool.id} className="flex items-center gap-2">
                {getToolIcon(tool, mcpServerViews)}
                <span className="text-sm text-foreground dark:text-foreground-night">
                  {getToolDisplayName(tool, mcpServerViews)}
                </span>
              </li>
            ))}
          </ul>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "OK",
            variant: "warning",
            onClick: onConfirm,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function SkillBuilderRequestedSpace() {
  const { watch, setValue } = useFormContext<SkillBuilderFormData>();
  const tools = watch("tools");

  const { mcpServerViews } = useMCPServerViewsContext();
  const { spaces } = useSpacesContext();

  const [spaceToRemove, setSpaceToRemove] = useState<SpaceType | null>(null);

  const spaceIdToActions = useMemo(() => {
    return getSpaceIdToActionsMap(tools, mcpServerViews);
  }, [tools, mcpServerViews]);

  const nonGlobalSpacesUsedInActions = useMemo(() => {
    const nonGlobalSpaces = spaces.filter((s) => s.kind !== "global");
    return nonGlobalSpaces.filter((s) => spaceIdToActions[s.sId]?.length > 0);
  }, [spaceIdToActions, spaces]);

  const handleRemoveSpace = (space: SpaceType) => {
    setSpaceToRemove(space);
  };

  const handleConfirmRemove = () => {
    if (!spaceToRemove) {
      return;
    }

    const actionsToRemove = spaceIdToActions[spaceToRemove.sId] || [];
    const actionIdsToRemove = new Set(actionsToRemove.map((a) => a.id));

    // Filter out the tools to remove and set the new value
    const newTools = tools.filter((t) => !actionIdsToRemove.has(t.id));
    setValue("tools", newTools);

    setSpaceToRemove(null);
  };

  if (nonGlobalSpacesUsedInActions.length === 0) {
    return null;
  }

  const toolsToRemove = spaceToRemove
    ? (spaceIdToActions[spaceToRemove.sId] || []).filter(
        (action): action is BuilderAction => action.type === "MCP"
      )
    : [];

  return (
    <div className="space-y-3">
      <div>
        <h3 className="heading-base font-semibold text-foreground dark:text-foreground-night">
          Spaces
        </h3>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Determines who can use this skill and what data it can access
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {nonGlobalSpacesUsedInActions.map((space) => (
          <Chip
            key={space.sId}
            label={getSpaceName(space)}
            icon={getSpaceIcon(space)}
            onRemove={() => handleRemoveSpace(space)}
          />
        ))}
      </div>

      <RemoveSpaceDialog
        space={spaceToRemove}
        tools={toolsToRemove}
        mcpServerViews={mcpServerViews}
        onClose={() => setSpaceToRemove(null)}
        onConfirm={handleConfirmRemove}
      />
    </div>
  );
}
