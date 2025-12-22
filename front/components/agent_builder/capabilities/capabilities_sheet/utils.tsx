import type { ButtonProps, MultiPageSheetPage } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { CapabilitiesSelectionPageContent } from "@app/components/agent_builder/capabilities/capabilities_sheet/CapabilitiesSelectionPage";
import {
  useSkillSelection,
  useToolSelection,
} from "@app/components/agent_builder/capabilities/capabilities_sheet/hooks";
import { SpaceSelectionPageContent } from "@app/components/agent_builder/capabilities/capabilities_sheet/SpaceSelectionPage";
import type { CapabilitiesSheetContentProps } from "@app/components/agent_builder/capabilities/capabilities_sheet/types";
import { MCPServerConfigurationPage } from "@app/components/agent_builder/capabilities/mcp/MCPServerConfigurationPage";
import { MCPServerInfoPage } from "@app/components/agent_builder/capabilities/mcp/MCPServerInfoPage";
import { createFormResetHandler } from "@app/components/agent_builder/capabilities/mcp/utils/formStateUtils";
import { getMCPConfigurationFormSchema } from "@app/components/agent_builder/capabilities/mcp/utils/formValidation";
import {
  getInfoPageDescription,
  getInfoPageIcon,
  getInfoPageTitle,
} from "@app/components/agent_builder/capabilities/mcp/utils/infoPageUtils";
import { SkillDetailsSheetContent } from "@app/components/skills/SkillDetailsSheet";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import { getSkillIcon } from "@app/lib/skill";
import { assertNever } from "@app/types";

export function useCapabilitiesPageAndFooter({
  owner,
  user,
  mode,
  onModeChange,
  onClose,
  onSave,
  alreadyRequestedSpaceIds,
  alreadyAddedSkillIds,
  initialAdditionalSpaces,
  selectedActions,
  getAgentInstructions,
}: CapabilitiesSheetContentProps): {
  page: MultiPageSheetPage;
  leftButton?: ButtonProps & React.RefAttributes<HTMLButtonElement>;
  rightButton?: ButtonProps & React.RefAttributes<HTMLButtonElement>;
} {
  const [searchQuery, setSearchQuery] = useState("");

  const skillSelection = useSkillSelection({
    onModeChange,
    alreadyAddedSkillIds,
    initialAdditionalSpaces,
    searchQuery,
  });
  const toolSelection = useToolSelection({
    selectedActions,
    onModeChange,
    searchQuery,
  });

  const handleCapabilitiesSelectionSave = useCallback(() => {
    onSave({
      skills: skillSelection.localSelectedSkills,
      additionalSpaces: skillSelection.localAdditionalSpaces,
      tools: toolSelection.localSelectedTools,
    });
    onClose();
  }, [
    skillSelection.localSelectedSkills,
    skillSelection.localAdditionalSpaces,
    toolSelection.localSelectedTools,
    onSave,
    onClose,
  ]);

  const selectedCapabilitiesCount = useMemo(() => {
    return (
      skillSelection.selectedSkillIds.size +
      toolSelection.selectedMCPServerViewIds.size
    );
  }, [skillSelection.selectedSkillIds, toolSelection.selectedMCPServerViewIds]);

  const formSchema = useMemo(
    () =>
      getMCPConfigurationFormSchema(
        toolSelection.localMCPServerViewToConfigure
      ),
    [toolSelection.localMCPServerViewToConfigure]
  );

  const form = useForm<MCPFormData>({
    resolver: zodResolver(formSchema),
    mode: "onSubmit",
    // Prevent form recreation by providing stable shouldUnregister
    shouldUnregister: false,
  });

  // Stable form reset handler - no form dependency to prevent re-renders
  const resetFormValues = useMemo(
    () =>
      createFormResetHandler(
        toolSelection.localActionToConfigure,
        toolSelection.localMCPServerViewToConfigure,
        !!mode
      ),
    [
      toolSelection.localActionToConfigure,
      toolSelection.localMCPServerViewToConfigure,
      mode,
    ]
  );

  useEffect(() => {
    resetFormValues(form);
  }, [resetFormValues, form]);

  switch (mode.pageId) {
    case "selection":
      return {
        page: {
          title: "Add capabilities",
          id: mode.pageId,
          content: (
            <CapabilitiesSelectionPageContent
              owner={owner}
              isCapabilitiesLoading={
                skillSelection.isSkillsLoading ||
                toolSelection.isMCPServerViewsLoading
              }
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              {...skillSelection}
              {...toolSelection}
              onModeChange={onModeChange}
            />
          ),
        },
        leftButton: {
          label: "Cancel",
          variant: "outline",
          onClick: onClose,
        },
        rightButton: {
          label:
            selectedCapabilitiesCount > 0
              ? `Add ${selectedCapabilitiesCount} ${selectedCapabilitiesCount === 1 ? "capability" : "capabilities"}`
              : "Add capabilities",
          disabled: selectedCapabilitiesCount === 0,
          onClick: handleCapabilitiesSelectionSave,
          variant: "primary",
        },
      };
    case "skill_info":
      const title = mode.capability.relations.extendedSkill?.name
        ? `${mode.capability.name} (extends ${mode.capability.relations.extendedSkill.name})`
        : mode.capability.name;

      return {
        page: {
          title,
          description: mode.capability.userFacingDescription,
          id: mode.pageId,
          icon: getSkillIcon(mode.capability.icon),
          content: (
            <SkillDetailsSheetContent
              skill={mode.capability}
              owner={owner}
              user={user}
            />
          ),
        },
        leftButton: mode.hasPreviousPage
          ? {
              label: "Back",
              variant: "outline",
              onClick: () => {
                onModeChange({ pageId: "selection" });
              },
            }
          : {
              label: "Close",
              variant: "primary",
              onClick: onClose,
            },
      };
    case "skill_space_selection":
      return {
        page: {
          title: `Select spaces`,
          description:
            "Automatically grant access to all knowledge sources discovery from your selected spaces",
          id: mode.pageId,
          content: (
            <SpaceSelectionPageContent
              alreadyRequestedSpaceIds={alreadyRequestedSpaceIds}
              draftSelectedSpaces={skillSelection.draftSelectedSpaces}
              setDraftSelectedSpaces={skillSelection.setDraftSelectedSpaces}
            />
          ),
        },
        leftButton: {
          label: "Cancel",
          variant: "outline",
          onClick: () => {
            skillSelection.setDraftSelectedSpaces(
              skillSelection.localAdditionalSpaces
            );
            onModeChange({ pageId: "selection" });
          },
        },
        rightButton: {
          label: "Save",
          variant: "primary",
          onClick: () =>
            skillSelection.handleSpaceSelectionSave(mode.capability),
        },
      };
    case "tool_info": {
      const mcpServerView =
        toolSelection.allMcpServerViews.find(
          (view) => view.sId === mode.capability.configuration.mcpServerViewId
        ) ?? null;

      return {
        page: {
          title: getInfoPageTitle(mcpServerView),
          description: getInfoPageDescription(mcpServerView),
          icon: getInfoPageIcon(mcpServerView),
          id: mode.pageId,
          content: mcpServerView ? (
            <MCPServerInfoPage infoMCPServerView={mcpServerView} />
          ) : (
            <div className="p-4 text-muted-foreground">
              Tool information not available.
            </div>
          ),
        },
        leftButton: mode.hasPreviousPage
          ? {
              label: "Back",
              variant: "outline",
              onClick: () => {
                onModeChange({ pageId: "selection" });
              },
            }
          : {
              label: "Close",
              variant: "primary",
              onClick: onClose,
            },
      };
    }
    case "tool_configuration": {
      return {
        page: {
          title: `Configure ${mode.mcpServerView.label}`,
          icon: () => getAvatar(mode.mcpServerView.server),
          id: mode.pageId,
          content: (
            <MCPServerConfigurationPage
              owner={owner}
              form={form}
              action={mode.capability}
              mcpServerView={mode.mcpServerView}
              getAgentInstructions={getAgentInstructions}
            />
          ),
        },
        leftButton: {
          label: "Cancel",
          variant: "outline",
          onClick: () => {
            onModeChange({ pageId: "selection" });
          },
        },
        rightButton: {
          label: "Save",
          variant: "primary",
          onClick: form.handleSubmit(
            toolSelection.handleMCPServerConfigurationSave
          ),
        },
      };
    }
    // TODO(skills 2025-12-18): placeholder to satisfy type for now, will be implemented in future PRs
    case "tool_edit":
      return {
        page: {
          title: "Tool",
          id: mode.pageId,
          content: <div>Tool configuration coming soon</div>,
        },
        leftButton: {
          label: "Cancel",
          variant: "outline",
          onClick: () => {
            onModeChange({ pageId: "selection" });
          },
        },
      };
    default:
      assertNever(mode);
  }
}
