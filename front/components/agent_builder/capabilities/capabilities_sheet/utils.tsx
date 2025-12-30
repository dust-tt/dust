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
import type { CapabilitiesSheetContentProps } from "@app/components/agent_builder/capabilities/capabilities_sheet/types";
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
import type { ConfigurationState } from "@app/components/agent_builder/skills/types";
import { isConfigurationState } from "@app/components/agent_builder/skills/types";
import { SkillDetailsSheetContent } from "@app/components/skills/SkillDetailsSheet";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import { getSkillIcon } from "@app/lib/skill";
import { assertNever } from "@app/types";

export function useCapabilitiesPageAndFooter({
  sheetState,
  onStateChange,
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
    onStateChange,
    alreadyAddedSkillIds,
    initialAdditionalSpaces,
    searchQuery,
  });
  const toolSelection = useToolSelection({
    selectedActions,
    onStateChange,
    searchQuery,
  });

  const handleCapabilitiesSelectionSave = useCallback(() => {
    onCapabilitiesSave({
      skills: skillSelection.localSelectedSkills,
      additionalSpaces: skillSelection.localAdditionalSpaces,
      tools: toolSelection.localSelectedTools,
    });
    onClose();
  }, [
    skillSelection.localSelectedSkills,
    skillSelection.localAdditionalSpaces,
    toolSelection.localSelectedTools,
    onCapabilitiesSave,
    onClose,
  ]);

  const handleToolEditSave = useCallback(
    (configState: ConfigurationState) => (formData: MCPFormData) => {
      const nameChanged = configState.capability.name !== formData.name;
      const newActionName = nameChanged
        ? generateUniqueActionName({
            baseName: nameToStorageFormat(formData.name),
            existingActions: selectedActions,
            selectedToolsInSheet: toolSelection.localSelectedTools,
          })
        : configState.capability.name;

      onToolEditSave({
        ...configState.capability,
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
      isConfigurationState(sheetState)
        ? getMCPConfigurationFormSchema(sheetState.mcpServerView)
        : null,
    [sheetState]
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
      if (isConfigurationState(sheetState)) {
        form.reset({
          name: sheetState.capability.name,
          description: sheetState.capability.description,
          configuration: sheetState.capability.configuration,
        });
      } else {
        form.reset(getDefaultFormValues(null));
      }
    },
    [sheetState]
  );

  useEffect(() => {
    resetFormValues(form);
  }, [resetFormValues, form]);

  switch (sheetState.state) {
    case "selection":
      return {
        page: {
          title: "Add capabilities",
          id: sheetState.state,
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
              onStateChange={onStateChange}
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

    case "info":
      if (sheetState.kind === "skill") {
        const title = sheetState.capability.relations.extendedSkill?.name
          ? `${sheetState.capability.name} (extends ${sheetState.capability.relations.extendedSkill.name})`
          : sheetState.capability.name;

        return {
          page: {
            title,
            description: sheetState.capability.userFacingDescription,
            id: sheetState.state,
            icon: getSkillIcon(sheetState.capability.icon),
            content: (
              <SkillDetailsSheetContent
                skill={sheetState.capability}
                owner={owner}
                user={user}
              />
            ),
          },
          leftButton: sheetState.hasPreviousPage
            ? {
                label: "Back",
                variant: "outline",
                onClick: () => {
                  onStateChange({ state: "selection" });
                },
              }
            : {
                label: "Close",
                variant: "primary",
                onClick: onClose,
              },
        };
      } else {
        // tool info
        const mcpServerView =
          toolSelection.allMcpServerViews.find(
            (view) =>
              view.sId === sheetState.capability.configuration.mcpServerViewId
          ) ?? null;

        return {
          page: {
            title: getInfoPageTitle(mcpServerView),
            description: getInfoPageDescription(mcpServerView),
            icon: getInfoPageIcon(mcpServerView),
            id: sheetState.state,
            content: mcpServerView ? (
              <MCPServerInfoPage infoMCPServerView={mcpServerView} />
            ) : (
              <div className="p-4 text-muted-foreground">
                Tool information not available.
              </div>
            ),
          },
          leftButton: sheetState.hasPreviousPage
            ? {
                label: "Back",
                variant: "outline",
                onClick: () => {
                  onStateChange({ state: "selection" });
                },
              }
            : {
                label: "Close",
                variant: "primary",
                onClick: onClose,
              },
        };
      }

    case "space-selection":
      return {
        page: {
          title: `Select spaces`,
          description:
            "Automatically grant access to all knowledge sources discovery from your selected spaces",
          id: sheetState.state,
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
            onStateChange({ state: "selection" });
          },
        },
        rightButton: {
          label: "Save",
          variant: "primary",
          onClick: () =>
            skillSelection.handleSpaceSelectionSave(sheetState.capability),
        },
      };

    case "configuration":
      // index === null means new configuration, index !== null means edit
      if (sheetState.index === null) {
        return {
          page: {
            title: `Configure ${sheetState.mcpServerView.label}`,
            icon: () => getAvatar(sheetState.mcpServerView.server),
            id: sheetState.state,
            content: (
              <MCPServerConfigurationPage
                form={form}
                action={sheetState.capability}
                mcpServerView={sheetState.mcpServerView}
                getAgentInstructions={getAgentInstructions}
              />
            ),
          },
          leftButton: {
            label: "Cancel",
            variant: "outline",
            onClick: () => {
              onStateChange({ state: "selection" });
            },
          },
          rightButton: {
            label: "Save",
            variant: "primary",
            onClick: form.handleSubmit(
              toolSelection.handleToolConfigurationSave(sheetState)
            ),
          },
        };
      } else {
        // edit mode
        return {
          page: {
            title: `Edit ${sheetState.mcpServerView.label} Configuration`,
            icon: () => getAvatar(sheetState.mcpServerView.server),
            id: sheetState.state,
            content: (
              <MCPServerConfigurationPage
                form={form}
                action={sheetState.capability}
                mcpServerView={sheetState.mcpServerView}
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
            onClick: form.handleSubmit(handleToolEditSave(sheetState)),
          },
        };
      }

    default:
      assertNever(sheetState);
  }
}
