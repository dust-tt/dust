import type { ButtonProps, MultiPageSheetPage } from "@dust-tt/sparkle";
import { Spinner } from "@dust-tt/sparkle";
import React from "react";
import type { UseFormReturn } from "react-hook-form";

import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { MCPServerInfoPage } from "@app/components/agent_builder/capabilities/mcp/MCPServerInfoPage";
import { AdditionalConfigurationSection } from "@app/components/agent_builder/capabilities/shared/AdditionalConfigurationSection";
import { ChildAgentSection } from "@app/components/agent_builder/capabilities/shared/ChildAgentSection";
import { DustAppSection } from "@app/components/agent_builder/capabilities/shared/DustAppSection";
import { JsonSchemaSection } from "@app/components/agent_builder/capabilities/shared/JsonSchemaSection";
import { NameSection } from "@app/components/agent_builder/capabilities/shared/NameSection";
import { SecretSection } from "@app/components/agent_builder/capabilities/shared/SecretSection";
import { TimeFrameSection } from "@app/components/agent_builder/capabilities/shared/TimeFrameSection";
import {
  useSkillSelection,
  useToolSelection,
} from "@app/components/agent_builder/skills/skillSheet/hooks";
import { SelectionPageContent } from "@app/components/agent_builder/skills/skillSheet/SelectionPage";
import { SkillWithRelationsDetailsSheetContent } from "@app/components/agent_builder/skills/skillSheet/SkillWithRelationsDetailsSheetContent";
import { SpaceSelectionPageContent } from "@app/components/agent_builder/skills/skillSheet/SpaceSelectionPage";
import type {
  CapabilityFilterType,
  PageContentProps,
} from "@app/components/agent_builder/skills/skillSheet/types";
import { SKILLS_SHEET_PAGE_IDS } from "@app/components/agent_builder/skills/skillSheet/types";
import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import { SKILL_ICON } from "@app/lib/skill";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { assertNever } from "@app/types";

export type ExtendedPageContentProps = PageContentProps & {
  capabilityFilter: CapabilityFilterType;
  setCapabilityFilter: React.Dispatch<
    React.SetStateAction<CapabilityFilterType>
  >;
  selectedActions: BuilderAction[];
  filterMCPServerViews?: (view: MCPServerViewTypeWithLabel) => boolean;
  addTools: (action: BuilderAction | BuilderAction[]) => void;
  onActionUpdate?: (action: BuilderAction, index: number) => void;
  getAgentInstructions: () => string;
  // Form props for configuration pages
  form?: UseFormReturn<MCPFormData>;
  handleConfigurationSave?: (formData: MCPFormData) => void;
  configurationMCPServerView?: MCPServerViewTypeWithLabel | null;
};

export function getPageAndFooter(props: ExtendedPageContentProps): {
  page: MultiPageSheetPage;
  leftButton?: ButtonProps & React.RefAttributes<HTMLButtonElement>;
  rightButton?: ButtonProps & React.RefAttributes<HTMLButtonElement>;
} {
  const {
    mode,
    onModeChange,
    onClose,
    handleSave,
    alreadyRequestedSpaceIds,
    localAdditionalSpaces,
    selectedToolsInSheet,
    setSelectedToolsInSheet,
    capabilityFilter,
    setCapabilityFilter,
    selectedActions,
    filterMCPServerViews,
    form,
    handleConfigurationSave,
    owner,
  } = props;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const skillSelection = useSkillSelection(props);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const toolSelection = useToolSelection({
    selectedActions,
    selectedToolsInSheet,
    setSelectedToolsInSheet,
    onModeChange,
    searchQuery: skillSelection.searchQuery,
    filterMCPServerViews,
  });

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { mcpServerViews } = useMCPServerViewsContext();

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });

  const totalSelected =
    props.localSelectedSkills.length + selectedToolsInSheet.length;

  switch (mode.type) {
    case SKILLS_SHEET_PAGE_IDS.SELECTION:
      return {
        page: {
          title: "Add capabilities",
          id: mode.type,
          content: (
            <SelectionPageContent
              {...props}
              mode={mode}
              // Skills props
              handleSkillToggle={skillSelection.handleSkillToggle}
              filteredSkills={skillSelection.filteredSkills}
              isSkillsLoading={skillSelection.isSkillsLoading}
              searchQuery={skillSelection.searchQuery}
              selectedSkillIds={skillSelection.selectedSkillIds}
              setSearchQuery={skillSelection.setSearchQuery}
              // Tools props
              topMCPServerViews={toolSelection.topMCPServerViews}
              nonTopMCPServerViews={toolSelection.nonTopMCPServerViews}
              onToolClick={toolSelection.onClickMCPServer}
              onToolDetailsClick={toolSelection.handleToolInfoClick}
              isMCPServerViewsLoading={toolSelection.isMCPServerViewsLoading}
              featureFlags={toolSelection.featureFlags}
              // Filter props
              filter={capabilityFilter}
              onFilterChange={setCapabilityFilter}
            />
          ),
        },
        leftButton: getCancelButton(onClose),
        rightButton: {
          label:
            totalSelected > 0
              ? `Add ${totalSelected} ${totalSelected === 1 ? "capability" : "capabilities"}`
              : "Add capabilities",
          onClick: handleSave,
          variant: "primary",
          disabled: totalSelected === 0,
        },
      };

    case SKILLS_SHEET_PAGE_IDS.SKILL_INFO:
      return {
        page: {
          title: mode.skill.name,
          description: mode.skill.userFacingDescription,
          id: mode.type,
          icon: SKILL_ICON,
          content: (
            <SkillWithRelationsDetailsSheetContent
              skill={mode.skill}
              owner={props.owner}
              user={props.user}
            />
          ),
        },
        leftButton:
          mode.source === "skillDetails"
            ? {
                label: "Back",
                variant: "outline",
                onClick: () =>
                  onModeChange({ type: SKILLS_SHEET_PAGE_IDS.SELECTION }),
              }
            : {
                label: "Close",
                variant: "outline",
                onClick: onClose,
              },
      };

    case SKILLS_SHEET_PAGE_IDS.SPACE_SELECTION:
      return {
        page: {
          title: `Select spaces`,
          description:
            "Automatically grant access to all knowledge sources discovery from your selected spaces",
          id: mode.type,
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
            skillSelection.setDraftSelectedSpaces(localAdditionalSpaces);
            onModeChange(mode.previousMode);
          },
        },
        rightButton: {
          label: "Save",
          variant: "primary",
          onClick: () =>
            skillSelection.handleSpaceSelectionSave(mode.skillConfiguration),
        },
      };

    case SKILLS_SHEET_PAGE_IDS.TOOL_INFO: {
      // Find the MCP server view for this action by matching the configuration
      const mcpServerView = mcpServerViews.find(
        (v) =>
          v.sId === mode.action.configuration?.mcpServerViewId ||
          v.name === mode.action.name
      );
      return {
        page: {
          title: mode.action.name,
          description: mode.action.description ?? "",
          id: mode.type,
          content: mcpServerView ? (
            <MCPServerInfoPage infoMCPServerView={mcpServerView} />
          ) : (
            <div className="p-4 text-muted-foreground">
              Tool information not available.
            </div>
          ),
        },
        leftButton:
          mode.source === "toolDetails"
            ? {
                label: "Back",
                variant: "outline",
                onClick: () =>
                  onModeChange({ type: SKILLS_SHEET_PAGE_IDS.SELECTION }),
              }
            : {
                label: "Close",
                variant: "outline",
                onClick: onClose,
              },
      };
    }

    case SKILLS_SHEET_PAGE_IDS.CONFIGURATION: {
      const mcpServerView = mode.mcpServerView;
      const requirements = getMCPServerRequirements(
        mcpServerView,
        featureFlags
      );

      return {
        page: {
          title: `Configure ${mcpServerView.label}`,
          id: mode.type,
          icon: () => getAvatar(mcpServerView.server, "md"),
          content:
            form && requirements ? (
              <FormProvider form={form} className="h-full">
                <div className="h-full space-y-6 pt-3">
                  {mode.action.configurationRequired && (
                    <NameSection
                      title="Name"
                      placeholder="My tool name…"
                      triggerValidationOnChange
                    />
                  )}
                  {requirements.requiresChildAgentConfiguration && (
                    <ChildAgentSection />
                  )}
                  {requirements.mayRequireTimeFrameConfiguration && (
                    <TimeFrameSection actionType="search" />
                  )}
                  {requirements.requiresDustAppConfiguration && (
                    <DustAppSection />
                  )}
                  {requirements.developerSecretSelection && (
                    <SecretSection
                      customDescription={
                        mcpServerView.server
                          .developerSecretSelectionDescription ?? undefined
                      }
                    />
                  )}
                  {requirements.mayRequireJsonSchemaConfiguration && (
                    <JsonSchemaSection
                      getAgentInstructions={props.getAgentInstructions}
                    />
                  )}
                  <AdditionalConfigurationSection
                    requiredStrings={requirements.requiredStrings}
                    requiredNumbers={requirements.requiredNumbers}
                    requiredBooleans={requirements.requiredBooleans}
                    requiredEnums={requirements.requiredEnums}
                    requiredLists={requirements.requiredLists}
                  />
                </div>
              </FormProvider>
            ) : (
              <div className="flex h-40 w-full items-center justify-center">
                <Spinner />
              </div>
            ),
        },
        leftButton: {
          label: "Back",
          variant: "outline",
          onClick: () =>
            onModeChange({ type: SKILLS_SHEET_PAGE_IDS.SELECTION }),
        },
        rightButton: {
          label: "Add tool",
          variant: "primary",
          onClick:
            form && handleConfigurationSave
              ? form.handleSubmit(handleConfigurationSave)
              : undefined,
        },
      };
    }

    case SKILLS_SHEET_PAGE_IDS.TOOL_EDIT: {
      // Find MCP server view from action
      const mcpServerView = mcpServerViews.find(
        (v) => v.sId === mode.action.configuration?.mcpServerViewId
      );
      const requirements = mcpServerView
        ? getMCPServerRequirements(mcpServerView, featureFlags)
        : null;

      return {
        page: {
          title: `Edit ${mode.action.name}`,
          id: mode.type,
          icon: mcpServerView
            ? () => getAvatar(mcpServerView.server, "md")
            : undefined,
          content:
            form && requirements && mcpServerView ? (
              <FormProvider form={form} className="h-full">
                <div className="h-full space-y-6 pt-3">
                  <NameSection
                    title="Name"
                    placeholder="My tool name…"
                    triggerValidationOnChange
                  />
                  {requirements.requiresChildAgentConfiguration && (
                    <ChildAgentSection />
                  )}
                  {requirements.mayRequireTimeFrameConfiguration && (
                    <TimeFrameSection actionType="search" />
                  )}
                  {requirements.requiresDustAppConfiguration && (
                    <DustAppSection />
                  )}
                  {requirements.developerSecretSelection && (
                    <SecretSection
                      customDescription={
                        mcpServerView.server
                          .developerSecretSelectionDescription ?? undefined
                      }
                    />
                  )}
                  {requirements.mayRequireJsonSchemaConfiguration && (
                    <JsonSchemaSection
                      getAgentInstructions={props.getAgentInstructions}
                    />
                  )}
                  <AdditionalConfigurationSection
                    requiredStrings={requirements.requiredStrings}
                    requiredNumbers={requirements.requiredNumbers}
                    requiredBooleans={requirements.requiredBooleans}
                    requiredEnums={requirements.requiredEnums}
                    requiredLists={requirements.requiredLists}
                  />
                </div>
              </FormProvider>
            ) : (
              <div className="flex h-40 w-full items-center justify-center">
                <Spinner />
              </div>
            ),
        },
        leftButton: {
          label: "Cancel",
          variant: "outline",
          onClick: onClose,
        },
        rightButton: {
          label: "Save",
          variant: "primary",
          onClick:
            form && handleConfigurationSave
              ? form.handleSubmit(handleConfigurationSave)
              : undefined,
        },
      };
    }

    default:
      assertNever(mode);
  }
}

export const getCancelButton = (
  onClose: () => void
): ButtonProps & React.RefAttributes<HTMLButtonElement> => ({
  label: "Cancel",
  variant: "outline",
  onClick: onClose,
});
