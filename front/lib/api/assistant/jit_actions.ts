import assert from "assert";

import {
  DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_DATA_DESCRIPTION,
  DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME,
  DEFAULT_CONVERSATION_SEARCH_ACTION_DATA_DESCRIPTION,
  DEFAULT_CONVERSATION_SEARCH_ACTION_NAME,
  DEFAULT_SEARCH_LABELS_ACTION_NAME,
} from "@app/lib/actions/constants";
import { makeConversationIncludeFileConfiguration } from "@app/lib/actions/conversation/include_file";
import type {
  ConversationAttachmentType,
  ConversationContentNodeType,
} from "@app/lib/actions/conversation/list_files";
import {
  isConversationContentNodeType,
  isConversationFileType,
  makeConversationListFilesAction,
} from "@app/lib/actions/conversation/list_files";
import type {
  DataSourceConfiguration,
  RetrievalConfigurationType,
} from "@app/lib/actions/retrieval";
import type { TablesQueryConfigurationType } from "@app/lib/actions/tables_query";
import type {
  ActionConfigurationType,
  AgentActionConfigurationType,
} from "@app/lib/actions/types/agent";
import {
  isProcessConfiguration,
  isRetrievalConfiguration,
} from "@app/lib/actions/types/guards";
import { listFiles } from "@app/lib/api/assistant/jit_utils";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import type {
  AgentActionType,
  AgentMessageType,
  ConversationType,
} from "@app/types";
import { assertNever } from "@app/types";

/**
 * Returns a list of supporting actions that should be made available to the model alongside this action.
 * These actions provide additional functionality that can be useful when using this action,
 * but they are not required - the model may choose to use them or not.
 *
 * For example, a retrieval action with auto tags may return a search_tags action
 * to help the model find relevant tags, but the model can still use the retrieval
 * action without searching for tags first.
 *
 * TODO(mcp): in a MCP world, the supporting actions are part of the MCP server tools for the main action. Should be removed once everything has been migrated to MCP.
 */
function getSupportingActions(
  agentActions: AgentActionConfigurationType[]
): ActionConfigurationType[] {
  return agentActions.flatMap((action) => {
    if (isProcessConfiguration(action) || isRetrievalConfiguration(action)) {
      const hasAutoTags = action.dataSources.some(
        (ds) => ds.filter.tags?.mode === "auto"
      );

      if (hasAutoTags) {
        return [
          {
            id: -1,
            sId: generateRandomModelSId(),
            type: "search_labels_configuration" as const,
            // Tool name must be unique. We use the parent tool name to make it unique.
            name: `${DEFAULT_SEARCH_LABELS_ACTION_NAME}_${action.name}`,
            dataSourceViewIds: action.dataSources.map(
              (ds) => ds.dataSourceViewId
            ),
            parentTool: action.name,
          },
        ];
      }
    }

    return [];
  });
}

async function getJITActions(
  auth: Authenticator,
  {
    agentActions,
    conversation,
    files,
  }: {
    agentActions: AgentActionConfigurationType[];
    conversation: ConversationType;
    files: ConversationAttachmentType[];
  }
): Promise<ActionConfigurationType[]> {
  const actions: ActionConfigurationType[] = [];

  // Get supporting actions from available actions.
  const supportingActions = getSupportingActions(agentActions);

  // Add supporting actions first.
  actions.push(...supportingActions);

  if (files.length > 0) {
    // conversation_include_file_action
    actions.push(makeConversationIncludeFileConfiguration());

    // Check tables for the table query action.
    const filesUsableAsTableQuery = files.filter((f) => f.isQueryable);

    // Check files for the retrieval query action.
    const filesUsableAsRetrievalQuery = files.filter((f) => f.isSearchable);

    if (
      filesUsableAsTableQuery.length > 0 ||
      filesUsableAsRetrievalQuery.length > 0
    ) {
      // Get the datasource view for the conversation.
      const conversationDataSourceView =
        await DataSourceViewResource.fetchByConversation(auth, conversation);

      if (filesUsableAsTableQuery.length > 0) {
        const action: TablesQueryConfigurationType = {
          // The description here is the description of the data, a meta description of the action is prepended automatically.
          description:
            DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_DATA_DESCRIPTION,
          type: "tables_query_configuration",
          id: -1,
          name: DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME,
          sId: generateRandomModelSId(),
          tables: filesUsableAsTableQuery.flatMap((f) => {
            if (isConversationFileType(f)) {
              assert(
                conversationDataSourceView,
                "No conversation datasource view found for table when trying to get JIT actions"
              );
              return f.generatedTables.map((tableId) => ({
                workspaceId: auth.getNonNullableWorkspace().sId,
                dataSourceViewId: conversationDataSourceView.sId,
                tableId,
              }));
            } else if (isConversationContentNodeType(f)) {
              return f.generatedTables.map((tableId) => ({
                workspaceId: auth.getNonNullableWorkspace().sId,
                dataSourceViewId: f.nodeDataSourceViewId,
                tableId,
              }));
            }
            assertNever(f);
          }),
        };
        actions.push(action);
      }

      if (filesUsableAsRetrievalQuery.length > 0) {
        const dataSources: DataSourceConfiguration[] =
          filesUsableAsRetrievalQuery
            // For each searchable content node, we add its datasourceview with itself as parent filter.
            .filter((f) => isConversationContentNodeType(f))
            .map((f) => ({
              workspaceId: auth.getNonNullableWorkspace().sId,
              // Cast ok here because of the filter above.
              dataSourceViewId: (f as ConversationContentNodeType)
                .nodeDataSourceViewId,
              filter: {
                parents: {
                  in: [(f as ConversationContentNodeType).contentNodeId],
                  not: [],
                },
                tags: null,
              },
            }));
        if (conversationDataSourceView) {
          dataSources.push({
            workspaceId: auth.getNonNullableWorkspace().sId,
            dataSourceViewId: conversationDataSourceView.sId,
            filter: { parents: null, tags: null },
          });
        }
        const action: RetrievalConfigurationType = {
          description: DEFAULT_CONVERSATION_SEARCH_ACTION_DATA_DESCRIPTION,
          type: "retrieval_configuration",
          id: -1,
          name: DEFAULT_CONVERSATION_SEARCH_ACTION_NAME,
          sId: generateRandomModelSId(),
          topK: "auto",
          query: "auto",
          relativeTimeFrame: "auto",
          dataSources,
        };
        actions.push(action);
      }
    }
  }

  return actions;
}

export async function getEmulatedAndJITActions(
  auth: Authenticator,
  {
    agentMessage,
    agentActions,
    conversation,
  }: {
    agentMessage: AgentMessageType;
    agentActions: AgentActionConfigurationType[];
    conversation: ConversationType;
  }
): Promise<{
  emulatedActions: AgentActionType[];
  jitActions: ActionConfigurationType[];
}> {
  const emulatedActions: AgentActionType[] = [];
  let jitActions: ActionConfigurationType[] = [];

  const files = listFiles(conversation);

  const a = makeConversationListFilesAction({
    agentMessage,
    files,
  });
  if (a) {
    emulatedActions.push(a);
  }

  jitActions = await getJITActions(auth, {
    conversation,
    files,
    agentActions,
  });

  // We ensure that all emulated actions are injected with step -1.
  assert(
    emulatedActions.every((a) => a.step === -1),
    "Emulated actions must have step -1"
  );

  return { emulatedActions, jitActions };
}
