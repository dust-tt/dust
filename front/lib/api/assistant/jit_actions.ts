import type {
  ActionConfigurationType,
  AgentActionType,
  AgentMessageType,
  ConversationFileType,
  ConversationType,
  RetrievalConfigurationType,
  TablesQueryConfigurationType,
} from "@dust-tt/types";
import assert from "assert";
import _ from "lodash";

import {
  DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_DATA_DESCRIPTION,
  DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME,
  DEFAULT_CONVERSATION_SEARCH_ACTION_DATA_DESCRIPTION,
  DEFAULT_CONVERSATION_SEARCH_ACTION_NAME,
} from "@app/lib/api/assistant/actions/constants";
import { makeConversationIncludeFileConfiguration } from "@app/lib/api/assistant/actions/conversation/include_file";
import { makeConversationListFilesAction } from "@app/lib/api/assistant/actions/conversation/list_files";
import { getRunnerForActionConfiguration } from "@app/lib/api/assistant/actions/runners";
import { listFiles } from "@app/lib/api/assistant/jit_utils";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";

async function getJITActions(
  auth: Authenticator,
  {
    availableActions,
    conversation,
    files,
  }: {
    availableActions: ActionConfigurationType[];
    conversation: ConversationType;
    files: ConversationFileType[];
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
      const dataSourceView = await DataSourceViewResource.fetchByConversation(
        auth,
        conversation
      );

      // TODO(pr,attach) remove this if when tackling table query / semantic search action
      if (!dataSourceView) {
        logger.warn(
          {
            conversationId: conversation.sId,
            fileIds: _.uniq(
              filesUsableAsTableQuery
                .map((f) => f.contentFragmentId)
                .concat(
                  filesUsableAsRetrievalQuery.map((f) => f.contentFragmentId)
                )
            ),
            workspaceId: conversation.owner.sId,
          },
          "No default datasource view found for conversation when trying to get JIT actions"
        );

        return actions;
      }

      if (filesUsableAsTableQuery.length > 0) {
        // TODO(JIT) Shall we look for an existing table query action and update it instead of creating a new one? This would allow join between the tables.
        const action: TablesQueryConfigurationType = {
          // The description here is the description of the data, a meta description of the action is prepended automatically.
          description:
            DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_DATA_DESCRIPTION,
          type: "tables_query_configuration",
          id: -1,
          name: DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME,
          sId: generateRandomModelSId(),
          tables: filesUsableAsTableQuery.flatMap((f) =>
            f.generatedTables.map((tableId) => ({
              workspaceId: auth.getNonNullableWorkspace().sId,
              dataSourceViewId: dataSourceView.sId,
              tableId: tableId,
            }))
          ),
        };
        actions.push(action);
      }

      if (filesUsableAsRetrievalQuery.length > 0) {
        const action: RetrievalConfigurationType = {
          description: DEFAULT_CONVERSATION_SEARCH_ACTION_DATA_DESCRIPTION,
          type: "retrieval_configuration",
          id: -1,
          name: DEFAULT_CONVERSATION_SEARCH_ACTION_NAME,
          sId: generateRandomModelSId(),
          topK: "auto",
          query: "auto",
          relativeTimeFrame: "auto",
          dataSources: [
            {
              workspaceId: conversation.owner.sId,
              dataSourceViewId: dataSourceView.sId,
              filter: { parents: null, tags: null },
            },
          ],
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
