import type { ActionCardState } from "@dust-tt/sparkle";
import {
  ActionCardBlock,
  Avatar,
  Button,
  ContentMessage,
  ExclamationCircleIcon,
  EyeIcon,
  FolderIcon,
  Icon,
  LoadingBlock,
  PencilSquareIcon,
} from "@dust-tt/sparkle";
import { EditorContent, useEditor } from "@tiptap/react";
import React, { useCallback, useEffect, useMemo } from "react";
import { useController, useFormContext } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { nameToStorageFormat } from "@app/components/agent_builder/capabilities/mcp/utils/actionNameUtils";
import { useCopilotSuggestions } from "@app/components/agent_builder/copilot/CopilotSuggestionsContext";
import { buildAgentInstructionsReadOnlyExtensions } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsEditor";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import { InstructionSuggestionExtension } from "@app/components/editor/extensions/agent_builder/InstructionSuggestionExtension";
import { getIcon } from "@app/components/resources/resources_icons";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { CONNECTOR_UI_CONFIGURATIONS } from "@app/lib/connector_providers_ui";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import type {
  AgentInstructionsSuggestionType,
  AgentSuggestionKind,
  AgentSuggestionState,
  AgentSuggestionWithRelationsType,
} from "@app/types/suggestions/agent_suggestion";
import { assertNever } from "@app/types/shared/utils/assert_never";

function mapSuggestionStateToCardState(
  state: AgentSuggestionState
): ActionCardState {
  switch (state) {
    case "pending":
      return "active";
    case "approved":
      return "accepted";
    case "rejected":
      return "rejected";
    case "outdated":
      return "disabled";
    default:
      assertNever(state);
  }
}

interface SuggestionCardProps {
  agentSuggestion: AgentSuggestionWithRelationsType;
}

interface InstructionsSuggestionCardProps {
  agentSuggestion: AgentInstructionsSuggestionType;
}

function InstructionsSuggestionCard({
  agentSuggestion,
}: InstructionsSuggestionCardProps) {
  const { content, targetBlockId } = agentSuggestion.suggestion;
  const { analysis, state, sId } = agentSuggestion;
  const { focusOnSuggestion, getCommittedInstructionsHtml } =
    useCopilotSuggestions();

  const cardState = mapSuggestionStateToCardState(state);

  const blockHtml = useMemo(() => {
    const instructionsHtml = getCommittedInstructionsHtml();
    if (!instructionsHtml) {
      return "";
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(instructionsHtml, "text/html");
    const targetElement = doc.querySelector(
      `[data-block-id="${targetBlockId}"]`
    );

    return targetElement ? targetElement.outerHTML : "";
  }, [targetBlockId, getCommittedInstructionsHtml]);

  const editor = useEditor(
    {
      extensions: [
        ...buildAgentInstructionsReadOnlyExtensions(),
        InstructionSuggestionExtension,
      ],
      editable: false,
      content: blockHtml,
      immediatelyRender: false,
    },
    [blockHtml]
  );

  useEffect(() => {
    if (!editor || editor.isDestroyed || !content) {
      return;
    }

    editor.commands.applySuggestion({
      id: sId,
      targetBlockId,
      content,
    });
    editor.commands.setHighlightedSuggestion(sId);
  }, [editor, sId, targetBlockId, content]);

  return (
    <ActionCardBlock
      title="Instructions suggestion"
      visual={<Avatar icon={PencilSquareIcon} size="sm" />}
      description={
        <>
          {analysis && <div className="mb-2">{analysis}</div>}
          <div className="rounded-lg border border-border bg-muted-background px-3 py-2 dark:border-border-night dark:bg-muted-background-night">
            {editor && <EditorContent editor={editor} />}
          </div>
        </>
      }
      state={cardState}
      actionsPosition="header"
      actions={
        <Button
          variant="outline"
          size="xs"
          icon={EyeIcon}
          tooltip="Review"
          onClick={() => focusOnSuggestion(sId)}
          disabled={cardState !== "active"}
        />
      }
    />
  );
}

function isToolAlreadyAdded(
  currentActions: AgentBuilderFormData["actions"],
  toolSId: string
): boolean {
  return currentActions.some(
    (action) => action.configuration.mcpServerViewId === toolSId
  );
}

function isSubAgentAlreadyAdded(
  currentActions: AgentBuilderFormData["actions"],
  childAgentId: string
): boolean {
  return currentActions.some(
    (action) => action.configuration.childAgentId === childAgentId
  );
}

function getNewSubAgentAction(
  tool: MCPServerViewType,
  childAgentId: string,
  childAgentName: string | null
): ReturnType<typeof getDefaultMCPAction> {
  const newAction = getDefaultMCPAction(tool);
  newAction.configuration.childAgentId = childAgentId;
  if (childAgentName) {
    newAction.name = nameToStorageFormat(`run_${childAgentName}`);
  }
  return newAction;
}

interface ToolSuggestionCardProps {
  agentSuggestion: Extract<AgentSuggestionWithRelationsType, { kind: "tools" }>;
}

function ToolSuggestionCard({ agentSuggestion }: ToolSuggestionCardProps) {
  const { suggestion, relations, state, sId, analysis } = agentSuggestion;
  const cardState = mapSuggestionStateToCardState(state);
  const { acceptSuggestion, rejectSuggestion } = useCopilotSuggestions();
  const { setValue, getValues } = useFormContext<AgentBuilderFormData>();

  const isAddition = suggestion.action === "add";
  const tool = relations.tool;

  const handleAccept = useCallback(async () => {
    const success = await acceptSuggestion(sId);
    if (success) {
      if (isAddition) {
        const currentActions = getValues("actions");
        if (!isToolAlreadyAdded(currentActions, tool.sId)) {
          const newAction = getDefaultMCPAction(tool);
          setValue("actions", [...currentActions, newAction], {
            shouldDirty: true,
          });
        }
      } else {
        const currentActions = getValues("actions");
        const filteredActions = currentActions.filter(
          (action) => action.configuration.mcpServerViewId !== tool.sId
        );
        setValue("actions", filteredActions, { shouldDirty: true });
      }
    }
  }, [acceptSuggestion, sId, getValues, setValue, isAddition, tool]);

  const handleReject = useCallback(() => {
    void rejectSuggestion(sId);
  }, [rejectSuggestion, sId]);

  const displayName = getMcpServerViewDisplayName(tool);

  return (
    <ActionCardBlock
      title={
        isAddition ? `Add ${displayName} tool` : `Remove ${displayName} tool`
      }
      visual={<Avatar icon={getIcon(tool.server.icon)} size="sm" />}
      description={analysis ?? undefined}
      state={cardState}
      applyLabel={isAddition ? "Add" : "Remove"}
      rejectLabel="Dismiss"
      acceptedTitle={
        isAddition ? `${displayName} tool added` : `${displayName} tool removed`
      }
      rejectedTitle={`${displayName} tool dismissed`}
      actionsPosition="header"
      onClickAccept={handleAccept}
      onClickReject={handleReject}
    />
  );
}

interface SubAgentSuggestionCardProps {
  agentSuggestion: Extract<
    AgentSuggestionWithRelationsType,
    { kind: "sub_agent" }
  >;
}

function SubAgentSuggestionCard({
  agentSuggestion,
}: SubAgentSuggestionCardProps) {
  const { suggestion, relations, state, sId, analysis } = agentSuggestion;
  const cardState = mapSuggestionStateToCardState(state);
  const { acceptSuggestion, rejectSuggestion } = useCopilotSuggestions();
  const { setValue, getValues } = useFormContext<AgentBuilderFormData>();
  const { owner } = useAgentBuilderContext();

  const isAddition = suggestion.action === "add";
  const tool = relations.tool;
  const childAgentId = suggestion.childAgentId;

  // Fetch agent configurations to resolve childAgentId to name.
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
  });

  // Resolve child agent name from childAgentId.
  const childAgentName = useMemo(() => {
    const childAgent = agentConfigurations.find((a) => a.sId === childAgentId);
    return childAgent?.name ?? null;
  }, [childAgentId, agentConfigurations]);

  const handleAccept = useCallback(async () => {
    const success = await acceptSuggestion(sId);
    if (success) {
      if (isAddition) {
        const currentActions = getValues("actions");
        if (!isSubAgentAlreadyAdded(currentActions, childAgentId)) {
          const newAction = getNewSubAgentAction(
            tool,
            childAgentId,
            childAgentName
          );
          setValue("actions", [...currentActions, newAction], {
            shouldDirty: true,
          });
        }
      } else {
        const currentActions = getValues("actions");
        const filteredActions = currentActions.filter(
          (action) => action.configuration.childAgentId !== childAgentId
        );
        setValue("actions", filteredActions, { shouldDirty: true });
      }
    }
  }, [
    acceptSuggestion,
    sId,
    getValues,
    setValue,
    isAddition,
    tool,
    childAgentId,
    childAgentName,
  ]);

  const handleReject = useCallback(() => {
    void rejectSuggestion(sId);
  }, [rejectSuggestion, sId]);

  const displayName = childAgentName
    ? `Run ${childAgentName}`
    : "Run sub-agent";

  return (
    <ActionCardBlock
      title={isAddition ? `Add ${displayName}` : `Remove ${displayName}`}
      visual={<Avatar icon={getIcon(tool.server.icon)} size="sm" />}
      description={analysis ?? undefined}
      state={cardState}
      applyLabel={isAddition ? "Add" : "Remove"}
      acceptedTitle={
        isAddition ? `${displayName} added` : `${displayName} removed`
      }
      rejectedTitle={`${displayName} dismissed`}
      actionsPosition="header"
      onClickAccept={handleAccept}
      onClickReject={handleReject}
    />
  );
}

interface SkillSuggestionCardProps {
  agentSuggestion: Extract<
    AgentSuggestionWithRelationsType,
    { kind: "skills" }
  >;
}

function SkillSuggestionCard({ agentSuggestion }: SkillSuggestionCardProps) {
  const { suggestion, relations, state, sId, analysis } = agentSuggestion;
  const cardState = mapSuggestionStateToCardState(state);
  const { acceptSuggestion, rejectSuggestion } = useCopilotSuggestions();
  const { setValue, getValues } = useFormContext<AgentBuilderFormData>();

  const isAddition = suggestion.action === "add";
  const skill = relations.skill;

  const handleAccept = useCallback(async () => {
    const success = await acceptSuggestion(sId);
    if (success) {
      if (isAddition) {
        const currentSkills = getValues("skills");
        const alreadyExists = currentSkills.some((s) => s.sId === skill.sId);
        if (!alreadyExists) {
          const newSkill = {
            sId: skill.sId,
            name: skill.name,
            description: skill.userFacingDescription,
            icon: skill.icon,
          };
          setValue("skills", [...currentSkills, newSkill], {
            shouldDirty: true,
          });
        }
      } else {
        const currentSkills = getValues("skills");
        const filteredSkills = currentSkills.filter((s) => s.sId !== skill.sId);
        setValue("skills", filteredSkills, { shouldDirty: true });
      }
    }
  }, [acceptSuggestion, sId, getValues, setValue, isAddition, skill]);

  const handleReject = useCallback(() => {
    void rejectSuggestion(sId);
  }, [rejectSuggestion, sId]);

  return (
    <ActionCardBlock
      title={
        isAddition ? `Add ${skill.name} skill` : `Remove ${skill.name} skill`
      }
      visual={<Icon visual={getSkillAvatarIcon(skill.icon)} />}
      description={analysis ?? undefined}
      state={cardState}
      applyLabel={isAddition ? "Add" : "Remove"}
      acceptedTitle={
        isAddition ? `${skill.name} skill added` : `${skill.name} skill removed`
      }
      rejectedTitle={`${skill.name} skill suggestion rejected`}
      actionsPosition="header"
      onClickAccept={handleAccept}
      onClickReject={handleReject}
    />
  );
}

interface ModelSuggestionCardProps {
  agentSuggestion: Extract<AgentSuggestionWithRelationsType, { kind: "model" }>;
}

function ModelSuggestionCard({ agentSuggestion }: ModelSuggestionCardProps) {
  const { relations, suggestion, state, sId, analysis } = agentSuggestion;
  const cardState = mapSuggestionStateToCardState(state);
  const modelName =
    relations.model?.displayName ?? relations.model?.modelId ?? "Unknown model";
  const { acceptSuggestion, rejectSuggestion } = useCopilotSuggestions();
  const { control } = useFormContext<AgentBuilderFormData>();

  const { field: modelSettingsField } = useController({
    control,
    name: "generationSettings.modelSettings",
  });

  const { field: reasoningEffortField } = useController({
    control,
    name: "generationSettings.reasoningEffort",
  });

  const handleAccept = useCallback(async () => {
    const success = await acceptSuggestion(sId);
    if (success && relations.model) {
      modelSettingsField.onChange({
        modelId: relations.model.modelId,
        providerId: relations.model.providerId,
      });
      reasoningEffortField.onChange(
        suggestion.reasoningEffort ?? relations.model.defaultReasoningEffort
      );
    }
  }, [
    sId,
    acceptSuggestion,
    relations.model,
    suggestion.reasoningEffort,
    modelSettingsField,
    reasoningEffortField,
  ]);

  const handleReject = useCallback(() => {
    void rejectSuggestion(sId);
  }, [sId, rejectSuggestion]);

  return (
    <ActionCardBlock
      title={`Change model to: ${modelName}`}
      description={analysis ?? undefined}
      state={cardState}
      applyLabel="Change"
      acceptedTitle={`Model changed to ${modelName}`}
      rejectedTitle={`${modelName} model suggestion rejected`}
      actionsPosition="header"
      onClickAccept={handleAccept}
      onClickReject={handleReject}
    />
  );
}

interface KnowledgeSuggestionCardProps {
  agentSuggestion: Extract<
    AgentSuggestionWithRelationsType,
    { kind: "knowledge" }
  >;
}

// TODO(copilot 2026-02-11): Open KnowledgeConfigurationSheet instead of auto-add.
// POC: Auto-adds with "select all" defaults for one-click simplicity.
// Production: Open KnowledgeConfigurationSheet pre-filled with suggested data source.
function KnowledgeSuggestionCard({
  agentSuggestion,
}: KnowledgeSuggestionCardProps) {
  const { suggestion, relations, state, sId, analysis } = agentSuggestion;
  const cardState = mapSuggestionStateToCardState(state);
  const { acceptSuggestion, rejectSuggestion } = useCopilotSuggestions();
  const { setValue, getValues } = useFormContext<AgentBuilderFormData>();
  // TODO(copilot 2026-02-11): Reliable "search" MCP server view resolution.
  // POC: Find by name. Production: Use dedicated query method.
  const { mcpServerViewsWithKnowledge } = useMCPServerViewsContext();

  const isAddition = suggestion.action === "add";
  const dsv = relations.dataSourceView;
  const displayName = getDisplayNameForDataSource(dsv.dataSource);

  const handleAccept = useCallback(async () => {
    const success = await acceptSuggestion(sId);
    if (success) {
      if (isAddition) {
        // Find the "search" MCP server view to create the knowledge action.
        const searchServer = mcpServerViewsWithKnowledge.find(
          (v) => v.server.name === "search"
        );

        if (!searchServer) {
          return;
        }

        const currentActions = getValues("actions");

        // TODO(copilot 2026-02-11): Sub-folder granularity in suggestions.
        // POC: "select all" on the whole data source.
        // Production: Use parentNodeIds from suggestion for scoped selection.
        const newAction = getDefaultMCPAction(searchServer);
        newAction.name = `search_${displayName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
        newAction.description = analysis ?? `Search ${displayName}`;
        newAction.configuration.dataSourceConfigurations = {
          [dsv.sId]: {
            dataSourceView: dsv,
            selectedResources: [],
            excludedResources: [],
            isSelectAll: true,
            tagsFilter: null,
          },
        };

        setValue("actions", [...currentActions, newAction], {
          shouldDirty: true,
        });
      } else {
        const currentActions = getValues("actions");
        const filteredActions = currentActions.filter((action) => {
          const dsConfigs = action.configuration.dataSourceConfigurations;
          return !dsConfigs || !(dsv.sId in dsConfigs);
        });
        setValue("actions", filteredActions, { shouldDirty: true });
      }
    }
  }, [
    acceptSuggestion,
    sId,
    isAddition,
    mcpServerViewsWithKnowledge,
    getValues,
    setValue,
    dsv,
    displayName,
    analysis,
  ]);

  const handleReject = useCallback(() => {
    void rejectSuggestion(sId);
  }, [rejectSuggestion, sId]);

  const icon = dsv.dataSource.connectorProvider
    ? CONNECTOR_UI_CONFIGURATIONS[
        dsv.dataSource.connectorProvider
      ].getLogoComponent()
    : FolderIcon;

  return (
    <ActionCardBlock
      title={
        isAddition
          ? `Add ${displayName} as knowledge`
          : `Remove ${displayName} knowledge`
      }
      visual={<Avatar icon={icon} size="sm" />}
      description={analysis ?? undefined}
      state={cardState}
      applyLabel={isAddition ? "Add" : "Remove"}
      rejectLabel="Dismiss"
      acceptedTitle={
        isAddition
          ? `${displayName} knowledge added`
          : `${displayName} knowledge removed`
      }
      rejectedTitle={`${displayName} knowledge dismissed`}
      actionsPosition="header"
      onClickAccept={handleAccept}
      onClickReject={handleReject}
    />
  );
}

export function CopilotSuggestionCard({
  agentSuggestion,
}: SuggestionCardProps) {
  switch (agentSuggestion.kind) {
    case "instructions":
      return <InstructionsSuggestionCard agentSuggestion={agentSuggestion} />;
    case "tools":
      return <ToolSuggestionCard agentSuggestion={agentSuggestion} />;
    case "sub_agent":
      return <SubAgentSuggestionCard agentSuggestion={agentSuggestion} />;
    case "skills":
      return <SkillSuggestionCard agentSuggestion={agentSuggestion} />;
    case "model":
      return <ModelSuggestionCard agentSuggestion={agentSuggestion} />;
    case "knowledge":
      return <KnowledgeSuggestionCard agentSuggestion={agentSuggestion} />;
    default:
      assertNever(agentSuggestion);
  }
}

interface SuggestionCardSkeletonProps {
  kind?: AgentSuggestionKind;
}

export function SuggestionCardSkeleton({ kind }: SuggestionCardSkeletonProps) {
  if (kind === "instructions") {
    return <LoadingBlock className="h-24 w-full" />;
  }

  // For tools/skills/model, match ActionCardBlock structure
  return (
    <ActionCardBlock
      state="accepted"
      description={<LoadingBlock className="h-14 w-full" />}
    />
  );
}

export function SuggestionCardNotFound() {
  return (
    <div className="mb-2 inline-block w-full max-w-md align-top">
      <ContentMessage
        title="Suggestion not found"
        icon={ExclamationCircleIcon}
        variant="warning"
        size="sm"
      >
        <span className="text-sm">
          This suggestion is outdated or has been deleted.
        </span>
      </ContentMessage>
    </div>
  );
}
