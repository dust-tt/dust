import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { MCPFormData } from "@app/components/agent_builder/agentBuilderFormSchema";
import { CapabilitiesFooter } from "@app/components/agent_builder/capabilities/capabilities_sheet/CapabilitiesFooter";
import { CapabilitiesSelectionPageContent } from "@app/components/agent_builder/capabilities/capabilities_sheet/CapabilitiesSelectionPage";
import {
  useSkillSelection,
  useToolSelection,
} from "@app/components/agent_builder/capabilities/capabilities_sheet/hooks";
import { SkillInfoPage } from "@app/components/agent_builder/capabilities/capabilities_sheet/SkillInfoPage";
import type { CapabilitiesSheetContentProps } from "@app/components/agent_builder/capabilities/capabilities_sheet/types";
import { MCPServerConfigurationPage } from "@app/components/agent_builder/capabilities/mcp/MCPServerConfigurationPage";
import { MCPServerInfoPage } from "@app/components/agent_builder/capabilities/mcp/MCPServerInfoPage";
import { generateUniqueActionName } from "@app/components/agent_builder/capabilities/mcp/utils/actionNameUtils";
import { getMCPConfigurationFormSchema } from "@app/components/agent_builder/capabilities/mcp/utils/formValidation";
import {
  getInfoPageDescription,
  getInfoPageIcon,
  getInfoPageTitle,
} from "@app/components/agent_builder/capabilities/mcp/utils/infoPageUtils";
import type { ConfigurationState } from "@app/components/agent_builder/skills/types";
import { isConfigurationState } from "@app/components/agent_builder/skills/types";
import { getDefaultFormValues } from "@app/components/shared/tools_picker/formDefaults";
import { nameToStorageFormat } from "@app/lib/actions/default_mcp_action";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import { getSkillIcon } from "@app/lib/skill";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { ButtonProps, MultiPageSheetPage } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useForm } from "react-hook-form";

export function useCapabilitiesPageAndFooter({
  isOpen,
  sheetState,
  onStateChange,
  onClose,
  onCapabilitiesSave,
  onToolEditSave,
  alreadyAddedSkillIds,
  selectedActions,
  getAgentInstructions,
}: CapabilitiesSheetContentProps): {
  page: MultiPageSheetPage;
  leftButton?: ButtonProps & React.RefAttributes<HTMLButtonElement>;
  rightButton?: ButtonProps & React.RefAttributes<HTMLButtonElement>;
} {
  const { t } = useLingui();
  const { owner, user } = useAgentBuilderContext();
  const [searchQuery, setSearchQuery] = useState("");

  const skillSelection = useSkillSelection({
    owner,
    disabled: !isOpen || sheetState.state !== "selection",
    alreadyAddedSkillIds,
    searchQuery,
  });
  const toolSelection = useToolSelection({
    selectedActions,
    onStateChange,
    // Filter local tools with the query belonging to the displayed skills.
    searchQuery: skillSelection.resolvedSearchQuery,
  });

  const resetSheetState = useCallback(() => {
    skillSelection.resetLocalState();
    toolSelection.resetLocalState();
  }, [skillSelection, toolSelection]);

  const handleCapabilitiesSelectionSave = useCallback(() => {
    onCapabilitiesSave({
      skills: skillSelection.localSelectedSkills,
      tools: toolSelection.localSelectedTools,
    });
    resetSheetState();
    onClose();
  }, [
    skillSelection,
    toolSelection,
    onCapabilitiesSave,
    resetSheetState,
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
        ? getMCPConfigurationFormSchema(sheetState.mcpServerView, t)
        : null,
    [sheetState, t]
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
          title: t`Add capabilities`,
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
          label: t`Cancel`,
          variant: "outline",
          onClick: onClose,
        },
        rightButton: {
          label:
            selectedCapabilitiesCount > 0
              ? t`${plural(selectedCapabilitiesCount, {
                  one: "Add # capability",
                  other: "Add # capabilities",
                })}`
              : t`Add capabilities`,
          disabled: selectedCapabilitiesCount === 0,
          onClick: handleCapabilitiesSelectionSave,
          variant: "primary",
        },
      };

    case "info":
      if (sheetState.kind === "skill") {
        const handleClose = sheetState.hasPreviousPage
          ? () => onStateChange({ state: "selection" })
          : onClose;

        return {
          page: {
            title: sheetState.capability.name,
            description: sheetState.capability.userFacingDescription,
            id: sheetState.state,
            icon: getSkillIcon(sheetState.capability.icon),
            content: (
              <SkillInfoPage
                skill={sheetState.capability}
                owner={owner}
                user={user}
                onClose={handleClose}
              />
            ),
          },
          leftButton: sheetState.hasPreviousPage
            ? {
                label: t`Back`,
                variant: "outline",
                onClick: () => {
                  onStateChange({ state: "selection" });
                },
              }
            : {
                label: t`Close`,
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
            title: getInfoPageTitle(mcpServerView, t),
            description: getInfoPageDescription(mcpServerView, t),
            icon: getInfoPageIcon(mcpServerView),
            id: sheetState.state,
            content: mcpServerView ? (
              <MCPServerInfoPage infoMCPServerView={mcpServerView} />
            ) : (
              <div className="p-4 text-muted-foreground">
                <Trans>Tool information not available.</Trans>
              </div>
            ),
          },
          leftButton: sheetState.hasPreviousPage
            ? {
                label: t`Back`,
                variant: "outline",
                onClick: () => {
                  onStateChange({ state: "selection" });
                },
              }
            : {
                label: t`Close`,
                variant: "primary",
                onClick: onClose,
              },
        };
      }

    case "configuration":
      // index === null means new configuration, index !== null means edit
      if (sheetState.index === null) {
        const serverLabel = sheetState.mcpServerView.label;
        return {
          page: {
            title: t`Configure ${serverLabel}`,
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
            label: t`Cancel`,
            variant: "outline",
            onClick: () => {
              onStateChange({ state: "selection" });
            },
          },
          rightButton: {
            label: t`Save`,
            variant: "primary",
            onClick: form.handleSubmit(
              toolSelection.handleToolConfigurationSave(sheetState)
            ),
          },
        };
      } else {
        // edit mode
        const serverLabel = sheetState.mcpServerView.label;
        return {
          page: {
            title: t`Edit ${serverLabel} configuration`,
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
            label: t`Close`,
            variant: "outline",
            onClick: onClose,
          },
          rightButton: {
            label: t`Save`,
            variant: "primary",
            onClick: form.handleSubmit(handleToolEditSave(sheetState)),
          },
        };
      }

    default:
      assertNever(sheetState);
  }
}
