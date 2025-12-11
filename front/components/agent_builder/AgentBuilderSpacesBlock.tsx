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

import type {
  AgentBuilderFormData,
  AgentBuilderSkillsType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { getSpaceIdToActionsMap } from "@app/components/shared/getSpaceIdToActionsMap";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { SKILL_ICON } from "@app/lib/skill";
import { getSpaceIcon, getSpaceName } from "@app/lib/spaces";
import type { SpaceType } from "@app/types";

function getActionDisplayName(
  action: BuilderAction,
  mcpServerViews: MCPServerViewType[]
): string {
  const mcpServerView = mcpServerViews.find(
    (view) => view.sId === action.configuration.mcpServerViewId
  );
  if (mcpServerView) {
    return getMcpServerViewDisplayName(mcpServerView, action);
  }
  return action.name;
}

function getActionIcon(
  action: BuilderAction,
  mcpServerViews: MCPServerViewType[]
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
  knowledge: BuilderAction[];
  tools: BuilderAction[];
  skills: AgentBuilderSkillsType[];
  mcpServerViews: MCPServerViewType[];
  onClose: () => void;
  onConfirm: () => void;
}

function RemoveSpaceDialog({
  space,
  knowledge,
  tools,
  skills,
  mcpServerViews,
  onClose,
  onConfirm,
}: RemoveSpaceDialogProps) {
  if (!space) {
    return null;
  }

  const SkillIcon = SKILL_ICON;
  const hasKnowledge = knowledge.length > 0;
  const hasSkillsOrTools = tools.length > 0 || skills.length > 0;

  return (
    <Dialog open={!!space} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md" isAlertDialog>
        <DialogHeader hideButton>
          <DialogTitle>Remove {getSpaceName(space)} space</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            This will remove the following elements from agent:
          </p>

          {hasKnowledge && (
            <>
              <h4 className="mt-4 font-semibold text-foreground dark:text-foreground-night">
                Knowledge
              </h4>
              <ul className="mt-2 space-y-2">
                {knowledge.map((item) => (
                  <li key={item.id} className="flex items-center gap-2">
                    {getActionIcon(item, mcpServerViews)}
                    <span className="text-sm text-foreground dark:text-foreground-night">
                      {getActionDisplayName(item, mcpServerViews)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {hasSkillsOrTools && (
            <>
              <h4 className="mt-4 font-semibold text-foreground dark:text-foreground-night">
                Skills and Tools
              </h4>
              <ul className="mt-2 space-y-2">
                {skills.map((skill) => (
                  <li key={skill.sId} className="flex items-center gap-2">
                    <SkillIcon className="h-4 w-4 shrink-0" />
                    <span className="text-sm text-foreground dark:text-foreground-night">
                      {skill.name}
                    </span>
                  </li>
                ))}
                {tools.map((item) => (
                  <li key={item.id} className="flex items-center gap-2">
                    {getActionIcon(item, mcpServerViews)}
                    <span className="text-sm text-foreground dark:text-foreground-night">
                      {getActionDisplayName(item, mcpServerViews)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
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

export function AgentBuilderSpacesBlock() {
  const { watch, setValue } = useFormContext<AgentBuilderFormData>();

  const { mcpServerViews, mcpServerViewsWithKnowledge } =
    useMCPServerViewsContext();
  const { spaces } = useSpacesContext();

  const skills = watch("skills");
  const actions = watch("actions");

  const [spaceToRemove, setSpaceToRemove] = useState<SpaceType | null>(null);

  // Compute requested spaces from tools/knowledge (actions)
  const spaceIdToActions = useMemo(() => {
    return getSpaceIdToActionsMap(actions, mcpServerViews);
  }, [actions, mcpServerViews]);

  // Merge requested spaces from skills and from actions
  const nonGlobalSpacesWithRestrictions = useMemo(() => {
    const nonGlobalSpaces = spaces.filter((s) => s.kind !== "global");

    // Collect space IDs from skills
    const skillRequestedSpaceIds = new Set<string>();
    for (const skill of skills) {
      for (const spaceId of skill.requestedSpaceIds) {
        skillRequestedSpaceIds.add(spaceId);
      }
    }

    // Collect space IDs from actions (tools/knowledge)
    const actionRequestedSpaceIds = new Set<string>();
    for (const spaceId of Object.keys(spaceIdToActions)) {
      if (spaceIdToActions[spaceId]?.length > 0) {
        actionRequestedSpaceIds.add(spaceId);
      }
    }

    // Merge both sets
    const allRequestedSpaceIds = new Set([
      ...skillRequestedSpaceIds,
      ...actionRequestedSpaceIds,
    ]);

    return nonGlobalSpaces.filter((s) => allRequestedSpaceIds.has(s.sId));
  }, [spaces, skills, spaceIdToActions]);

  const handleRemoveSpace = (space: SpaceType) => {
    setSpaceToRemove(space);
  };

  const handleConfirmRemove = () => {
    if (!spaceToRemove) {
      return;
    }

    // Remove actions (knowledge + tools) that belong to this space
    const actionsToRemove = spaceIdToActions[spaceToRemove.sId] || [];
    const actionIdsToRemove = new Set(actionsToRemove.map((a) => a.id));
    const newActions = actions.filter((a) => !actionIdsToRemove.has(a.id));
    setValue("actions", newActions);

    // Remove skills that have this space in their requestedSpaceIds
    const newSkills = skills.filter(
      (skill) => !skill.requestedSpaceIds.includes(spaceToRemove.sId)
    );
    setValue("skills", newSkills);

    setSpaceToRemove(null);
  };

  if (nonGlobalSpacesWithRestrictions.length === 0) {
    return null;
  }

  // Compute items to remove for the dialog
  const actionsToRemove = spaceToRemove
    ? (spaceIdToActions[spaceToRemove.sId] || []).filter(
        (action): action is BuilderAction => action.type === "MCP"
      )
    : [];

  // Knowledge is identified by checking if the action's MCP server view is in mcpServerViewsWithKnowledge
  const knowledgeServerViewIds = new Set(
    mcpServerViewsWithKnowledge.map((v) => v.sId)
  );
  const knowledgeToRemove = actionsToRemove.filter((action) =>
    knowledgeServerViewIds.has(action.configuration.mcpServerViewId)
  );
  const toolsToRemove = actionsToRemove.filter(
    (action) => !knowledgeServerViewIds.has(action.configuration.mcpServerViewId)
  );
  const skillsToRemove = spaceToRemove
    ? skills.filter((skill) =>
        skill.requestedSpaceIds.includes(spaceToRemove.sId)
      )
    : [];

  return (
    <div className="space-y-3 px-6">
      <div>
        <h2 className="heading-lg text-foreground dark:text-foreground-night">
          Spaces
        </h2>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Determines who can use this agent and what data it can access
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {nonGlobalSpacesWithRestrictions.map((space) => (
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
        knowledge={knowledgeToRemove}
        tools={toolsToRemove}
        skills={skillsToRemove}
        mcpServerViews={mcpServerViews}
        onClose={() => setSpaceToRemove(null)}
        onConfirm={handleConfirmRemove}
      />
    </div>
  );
}
