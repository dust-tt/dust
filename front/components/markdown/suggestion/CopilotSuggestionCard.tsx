import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import {
  generateUniqueActionName,
  nameToStorageFormat,
} from "@app/components/agent_builder/capabilities/mcp/utils/actionNameUtils";
import { useCopilotSuggestions } from "@app/components/agent_builder/copilot/CopilotSuggestionsContext";
import { buildAgentInstructionsReadOnlyExtensions } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsEditor";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import { InstructionSuggestionExtension } from "@app/components/editor/extensions/agent_builder/InstructionSuggestionExtension";
import { getIcon } from "@app/components/resources/resources_icons";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { CONNECTOR_UI_CONFIGURATIONS } from "@app/lib/connector_providers_ui";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import type { DataSourceViewType } from "@app/types/data_source_view";
import { defaultSelectionConfiguration } from "@app/types/data_source_view";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type {
  AgentInstructionsSuggestionType,
  AgentKnowledgeSuggestionWithRelationsType,
  AgentModelSuggestionWithRelationsType,
  AgentSkillsSuggestionWithRelationsType,
  AgentSubAgentSuggestionWithRelationsType,
  AgentSuggestionKind,
  AgentSuggestionState,
  AgentSuggestionWithRelationsType,
  AgentToolsSuggestionWithRelationsType,
} from "@app/types/suggestions/agent_suggestion";
import type { ActionCardState } from "@dust-tt/sparkle";
import {
  ActionCardBlock,
  Avatar,
  Button,
  DiffBlock,
  EyeIcon,
  FolderIcon,
  LoadingBlock,
} from "@dust-tt/sparkle";
import { EditorContent, useEditor } from "@tiptap/react";
import { memo, useCallback, useMemo } from "react";
import { useController, useFormContext } from "react-hook-form";

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

interface InstructionsSuggestionCardProps {
  agentSuggestion: AgentInstructionsSuggestionType;
  focusOnSuggestion: (id: string) => void;
  getCommittedInstructionsHtml: () => string;
}

// Re-render only when suggestion identity/state or callbacks change.
// Comparing callbacks too avoids stale closures if upstream stops memoizing them.
const InstructionsSuggestionCard = memo(
  function InstructionsSuggestionCard({
    agentSuggestion,
    focusOnSuggestion,
    getCommittedInstructionsHtml,
  }: InstructionsSuggestionCardProps) {
    const { content, targetBlockId } = agentSuggestion.suggestion;
    const { state, sId } = agentSuggestion;

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
        onCreate: ({ editor: e }) => {
          if (!content) {
            return;
          }
          e.commands.applySuggestion({ id: sId, targetBlockId, content });
          e.commands.setHighlightedSuggestion(sId);
        },
      },
      [blockHtml]
    );

    const isPending = state === "pending";

    return (
      <div className="mb-2">
        <DiffBlock
          actions={
            isPending ? (
              <Button
                variant="outline"
                size="xs"
                icon={EyeIcon}
                tooltip="Review in instructions"
                onClick={() => focusOnSuggestion(sId)}
              />
            ) : undefined
          }
        >
          {editor && <EditorContent editor={editor} />}
        </DiffBlock>
      </div>
    );
  },
  (prev, next) =>
    prev.agentSuggestion.sId === next.agentSuggestion.sId &&
    prev.agentSuggestion.state === next.agentSuggestion.state
);

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
  agentSuggestion: AgentToolsSuggestionWithRelationsType;
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

  const labels = isAddition
    ? {
        title: `Add ${displayName} tool`,
        applyLabel: "Add",
        acceptedTitle: `${displayName} tool added`,
      }
    : {
        title: `Remove ${displayName} tool`,
        applyLabel: "Remove",
        acceptedTitle: `${displayName} tool removed`,
      };

  return (
    <ActionCardBlock
      {...labels}
      visual={<Avatar icon={getIcon(tool.server.icon)} size="sm" />}
      description={analysis ?? undefined}
      state={cardState}
      rejectedTitle={`${displayName} tool rejected`}
      actionsPosition="header"
      onClickAccept={handleAccept}
      onClickReject={handleReject}
    />
  );
}

interface SubAgentSuggestionCardProps {
  agentSuggestion: AgentSubAgentSuggestionWithRelationsType;
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

  const labels = isAddition
    ? {
        title: `Add ${displayName}`,
        applyLabel: "Add",
        acceptedTitle: `${displayName} added`,
      }
    : {
        title: `Remove ${displayName}`,
        applyLabel: "Remove",
        acceptedTitle: `${displayName} removed`,
      };

  return (
    <ActionCardBlock
      {...labels}
      visual={<Avatar icon={getIcon(tool.server.icon)} size="sm" />}
      description={analysis ?? undefined}
      state={cardState}
      rejectedTitle={`${displayName} dismissed`}
      actionsPosition="header"
      onClickAccept={handleAccept}
      onClickReject={handleReject}
    />
  );
}

interface SkillSuggestionCardProps {
  agentSuggestion: AgentSkillsSuggestionWithRelationsType;
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

  const labels = isAddition
    ? {
        title: `Add ${skill.name} skill`,
        applyLabel: "Add",
        acceptedTitle: `${skill.name} skill added`,
      }
    : {
        title: `Remove ${skill.name} skill`,
        applyLabel: "Remove",
        acceptedTitle: `${skill.name} skill removed`,
      };

  return (
    <ActionCardBlock
      {...labels}
      visual={<Avatar icon={getSkillAvatarIcon(skill.icon)} size="sm" />}
      description={analysis ?? undefined}
      state={cardState}
      rejectedTitle={`${skill.name} skill suggestion rejected`}
      actionsPosition="header"
      onClickAccept={handleAccept}
      onClickReject={handleReject}
    />
  );
}

interface ModelSuggestionCardProps {
  agentSuggestion: AgentModelSuggestionWithRelationsType;
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

const KNOWLEDGE_METHOD_ACTION_VERB: Record<string, string> = {
  include: "Include",
  extract: "Extract",
  search: "Search",
};

function buildNewKnowledgeAction(
  serverView: MCPServerViewType,
  method: string,
  dataSourceView: DataSourceViewType,
  displayName: string,
  description: string | null,
  currentActions: AgentBuilderFormData["actions"]
): ReturnType<typeof getDefaultMCPAction> {
  const newAction = getDefaultMCPAction(serverView);
  if (method === "query_tables") {
    newAction.name = generateUniqueActionName({
      baseName: nameToStorageFormat(`query ${displayName}`),
      existingActions: currentActions,
    });
    newAction.description = description ?? `Query tables in ${displayName}`;
    const tableConfig = defaultSelectionConfiguration(dataSourceView);
    newAction.configuration.tablesConfigurations = {
      [dataSourceView.sId]: { ...tableConfig, isSelectAll: true },
    };
    return newAction;
  }
  const actionVerb = KNOWLEDGE_METHOD_ACTION_VERB[method] ?? "Search";
  newAction.name = generateUniqueActionName({
    baseName: nameToStorageFormat(`${actionVerb.toLowerCase()} ${displayName}`),
    existingActions: currentActions,
  });
  newAction.description = description ?? `${actionVerb} ${displayName}`;
  newAction.configuration.dataSourceConfigurations = {
    [dataSourceView.sId]: {
      dataSourceView,
      selectedResources: [],
      excludedResources: [],
      isSelectAll: true,
      tagsFilter: null,
    },
  };
  return newAction;
}

function actionIncludesDataSourceView(
  action: AgentBuilderFormData["actions"][number],
  dataSourceViewSId: string,
  isQueryTables: boolean
): boolean {
  const config = isQueryTables
    ? action.configuration.tablesConfigurations
    : action.configuration.dataSourceConfigurations;
  return config != null && dataSourceViewSId in config;
}

function removeFirstWhere<T>(arr: T[], predicate: (item: T) => boolean): T[] {
  const i = arr.findIndex(predicate);
  if (i === -1) {
    return arr;
  }
  return [...arr.slice(0, i), ...arr.slice(i + 1)];
}

interface KnowledgeSuggestionCardProps {
  agentSuggestion: AgentKnowledgeSuggestionWithRelationsType;
}

function KnowledgeSuggestionCard({
  agentSuggestion,
}: KnowledgeSuggestionCardProps) {
  const { suggestion, relations, state, sId, analysis } = agentSuggestion;
  const cardState = mapSuggestionStateToCardState(state);
  const { acceptSuggestion, rejectSuggestion } = useCopilotSuggestions();
  const { setValue, getValues } = useFormContext<AgentBuilderFormData>();

  const isAddition = suggestion.action === "add";
  const { dataSourceView, serverView } = relations;
  const method = suggestion.method ?? "search";
  const isQueryTables = method === "query_tables";
  const displayName = getDisplayNameForDataSource(dataSourceView.dataSource);

  const handleAccept = useCallback(async () => {
    const success = await acceptSuggestion(sId);
    if (!success) {
      return;
    }
    const currentActions = getValues("actions");
    const nextActions = isAddition
      ? [
          ...currentActions,
          buildNewKnowledgeAction(
            serverView,
            method,
            dataSourceView,
            displayName,
            suggestion.description ?? null,
            currentActions
          ),
        ]
      : removeFirstWhere(currentActions, (action) =>
          actionIncludesDataSourceView(
            action,
            dataSourceView.sId,
            isQueryTables
          )
        );
    setValue("actions", nextActions, { shouldDirty: true });
  }, [
    acceptSuggestion,
    sId,
    isAddition,
    isQueryTables,
    serverView,
    dataSourceView,
    getValues,
    setValue,
    displayName,
    suggestion.description,
    method,
  ]);

  const handleReject = useCallback(() => {
    void rejectSuggestion(sId);
  }, [rejectSuggestion, sId]);

  const icon = dataSourceView.dataSource.connectorProvider
    ? CONNECTOR_UI_CONFIGURATIONS[
        dataSourceView.dataSource.connectorProvider
      ].getLogoComponent()
    : FolderIcon;

  const labels = isAddition
    ? {
        title: `Add ${displayName} knowledge`,
        applyLabel: "Add",
        acceptedTitle: `${displayName} knowledge added`,
      }
    : {
        title: `Remove ${displayName} knowledge`,
        applyLabel: "Remove",
        acceptedTitle: `${displayName} knowledge removed`,
      };

  return (
    <ActionCardBlock
      {...labels}
      visual={<Avatar icon={icon} size="sm" />}
      description={analysis ?? undefined}
      state={cardState}
      rejectedTitle={`${displayName} knowledge rejected`}
      actionsPosition="header"
      onClickAccept={handleAccept}
      onClickReject={handleReject}
    />
  );
}

interface SuggestionCardProps {
  agentSuggestion: AgentSuggestionWithRelationsType;
}

export function CopilotSuggestionCard({
  agentSuggestion,
}: SuggestionCardProps) {
  const { focusOnSuggestion, getCommittedInstructionsHtml } =
    useCopilotSuggestions();

  switch (agentSuggestion.kind) {
    case "instructions":
      return (
        <InstructionsSuggestionCard
          agentSuggestion={agentSuggestion}
          focusOnSuggestion={focusOnSuggestion}
          getCommittedInstructionsHtml={getCommittedInstructionsHtml}
        />
      );
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

  return (
    <ActionCardBlock
      title="Loading suggestion"
      state="accepted"
      description={<LoadingBlock className="h-14 w-full" />}
    />
  );
}
