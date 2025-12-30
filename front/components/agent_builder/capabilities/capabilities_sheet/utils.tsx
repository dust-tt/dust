import type { ButtonProps, MultiPageSheetPage } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useForm } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { CapabilitiesFooter } from "@app/components/agent_builder/capabilities/capabilities_sheet/CapabilitiesFooter";
import { CapabilitiesSelectionPageContent } from "@app/components/agent_builder/capabilities/capabilities_sheet/CapabilitiesSelectionPage";
import {
  useSkillSelection,
  useToolSelection,
} from "@app/components/agent_builder/capabilities/capabilities_sheet/hooks";
import { SpaceSelectionPageContent } from "@app/components/agent_builder/capabilities/capabilities_sheet/SpaceSelectionPage";
import type {
  CapabilitiesSheetContentProps,
  ToolEditMode,
} from "@app/components/agent_builder/capabilities/capabilities_sheet/types";
import { isToolConfigurationOrEditPage } from "@app/components/agent_builder/capabilities/capabilities_sheet/types";
import { MCPServerConfigurationPage } from "@app/components/agent_builder/capabilities/mcp/MCPServerConfigurationPage";
import { MCPServerInfoPage } from "@app/components/agent_builder/capabilities/mcp/MCPServerInfoPage";
import {
  generateUniqueActionName,
  nameToStorageFormat,
} from "@app/components/agent_builder/capabilities/mcp/utils/actionNameUtils";
import { getDefaultFormValues } from "@app/components/agent_builder/capabilities/mcp/utils/formDefaults";
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
  mode,
  onModeChange,
  onClose,
  onCapabilitiesSave,
  onToolEditSave,
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
  const { owner, user } = useAgentBuilderContext();
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
    onCapabilitiesSave({
      skills: skillSelection.localSelectedSkills,
      additionalSpaces: skillSelection.localAdditionalSpaces,
      tools: toolSelection.localSelectedTools,
    });
    skillSelection.resetLocalState();
    toolSelection.resetLocalState();
    onClose();
  }, [skillSelection, toolSelection, onCapabilitiesSave, onClose]);

  const handleToolEditSave = useCallback(
    (mode: ToolEditMode) => (formData: MCPFormData) => {
      const nameChanged = mode.capability.name !== formData.name;
      const newActionName = nameChanged
        ? generateUniqueActionName({
            baseName: nameToStorageFormat(formData.name),
            existingActions: selectedActions,
            selectedToolsInSheet: toolSelection.localSelectedTools,
          })
        : mode.capability.name;

      onToolEditSave({
        ...mode.capability,
        name: newActionName,
        description: formData.description,
        configuration: formData.configuration,
      });
      onClose();
    },
    [selectedActions, toolSelection.localSelectedTools, onToolEditSave, onClose]
  );

  const selectedCapabilitiesCount = useMemo(() => {
    return (
      skillSelection.selectedSkillIds.size +
      toolSelection.selectedMCPServerViewIds.size
    );
  }, [skillSelection.selectedSkillIds, toolSelection.selectedMCPServerViewIds]);

  const formSchema = useMemo(
    () =>
      isToolConfigurationOrEditPage(mode)
        ? getMCPConfigurationFormSchema(mode.mcpServerView)
        : null,
    [mode]
  );

  const form = useForm<MCPFormData>({
    resolver: formSchema ? zodResolver(formSchema) : undefined,
    mode: "onSubmit",
    // Prevent form recreation by providing stable shouldUnregister
    shouldUnregister: false,
  });

  // Stable form reset handler - no form dependency to prevent re-renders
  const resetFormValues = useMemo(
    () => (form: UseFormReturn<MCPFormData>) => {
      if (isToolConfigurationOrEditPage(mode)) {
        form.reset({
          name: mode.capability.name,
          description: mode.capability.description,
          configuration: mode.capability.configuration,
        });
      } else {
        form.reset(getDefaultFormValues(null));
      }
    },
    [mode]
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
          footerContent:
            selectedCapabilitiesCount > 0 ? (
              <CapabilitiesFooter
                localSelectedTools={toolSelection.localSelectedTools}
                localSelectedSkills={skillSelection.localSelectedSkills}
                onRemoveSelectedTool={toolSelection.unselectTool}
                onRemoveSelectedSkill={skillSelection.unselectSkill}
              />
            ) : null,
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
                onModeChange({ pageId: "selection", open: true });
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
            onModeChange({ pageId: "selection", open: true });
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
                onModeChange({ pageId: "selection", open: true });
              },
            }
          : {
              label: "Close",
              variant: "primary",
              onClick: onClose,
            },
      };
    }

    case "tool_configuration":
      return {
        page: {
          title: `Configure ${mode.mcpServerView.label}`,
          icon: () => getAvatar(mode.mcpServerView.server),
          id: mode.pageId,
          content: (
            <MCPServerConfigurationPage
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
            onModeChange({ pageId: "selection", open: true });
          },
        },
        rightButton: {
          label: "Save",
          variant: "primary",
          onClick: form.handleSubmit(
            toolSelection.handleToolConfigurationSave(mode)
          ),
        },
      };

    case "tool_edit":
      return {
        page: {
          title: `Edit ${mode.mcpServerView.label} Configuration`,
          icon: () => getAvatar(mode.mcpServerView.server),
          id: mode.pageId,
          content: (
            <MCPServerConfigurationPage
              form={form}
              action={mode.capability}
              mcpServerView={mode.mcpServerView}
              getAgentInstructions={getAgentInstructions}
            />
          ),
        },
        leftButton: {
          label: "Close",
          variant: "outline",
          onClick: onClose,
        },
        rightButton: {
          label: "Save",
          variant: "primary",
          onClick: form.handleSubmit(handleToolEditSave(mode)),
        },
      };

    default:
      assertNever(mode);
  }
}
