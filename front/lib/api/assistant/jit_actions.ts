import assert from "assert";

import {
  DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_DATA_DESCRIPTION,
  DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME,
  DEFAULT_CONVERSATION_SEARCH_ACTION_DATA_DESCRIPTION,
  DEFAULT_CONVERSATION_SEARCH_ACTION_NAME,
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
import { getRunnerForActionConfiguration } from "@app/lib/actions/runners";
import type { TablesQueryConfigurationType } from "@app/lib/actions/tables_query";
import type { ActionConfigurationType } from "@app/lib/actions/types/agent";
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

async function getJITActions(
  auth: Authenticator,
  {
    availableActions,
    conversation,
    files,
  }: {
    availableActions: ActionConfigurationType[];
    conversation: ConversationType;
    files: ConversationAttachmentType[];
  }
): Promise<ActionConfigurationType[]> {
  const actions: ActionConfigurationType[] = [];

  // Get supporting actions from available actions.
  const supportingActions = availableActions.flatMap((action) => {
    const runner = getRunnerForActionConfiguration(action);
    return runner.getSupportingActions?.() ?? [];
  });

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
    availableActions,
    conversation,
  }: {
    agentMessage: AgentMessageType;
    availableActions: ActionConfigurationType[];
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
    availableActions,
  });

  // We ensure that all emulated actions are injected with step -1.
  assert(
    emulatedActions.every((a) => a.step === -1),
    "Emulated actions must have step -1"
  );

  return { emulatedActions, jitActions };
}
