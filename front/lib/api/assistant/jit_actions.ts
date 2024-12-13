import type {
  ActionConfigurationType,
  AgentActionType,
  AgentMessageType,
  AssistantContentMessageTypeModel,
  AssistantFunctionCallMessageTypeModel,
  ConversationFileType,
  ConversationType,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
  ModelMessageTypeMultiActions,
  Result,
  RetrievalConfigurationType,
  TablesQueryConfigurationType,
} from "@dust-tt/types";
import {
  assertNever,
  Err,
  isAgentMessageType,
  isContentFragmentMessageTypeModel,
  isContentFragmentType,
  isUserMessageType,
  Ok,
  removeNulls,
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
import { listFiles } from "@app/lib/api/assistant/jit_utils";
import {
  getTextContentFromMessage,
  getTextRepresentationFromMessages,
} from "@app/lib/api/assistant/utils";
import type { Authenticator } from "@app/lib/auth";
import { renderLightContentFragmentForModel } from "@app/lib/resources/content_fragment_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { tokenCountForTexts } from "@app/lib/tokenization";
import logger from "@app/logger/logger";

export function isJITActionsEnabled(auth: Authenticator): boolean {
  // Disable for one specific customer to avoid slightly changing the behavior of their assistants.
  if (auth.getNonNullableWorkspace().sId === "4d76593070") {
    return false;
  }
  return true;
}

async function getJITActions(
  auth: Authenticator,
  {
    conversation,
    files,
  }: { conversation: ConversationType; files: ConversationFileType[] }
): Promise<ActionConfigurationType[]> {
  const actions: ActionConfigurationType[] = [];

  if (files.length > 0) {
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

      if (!dataSourceView) {
        logger.warn(
          {
            conversationId: conversation.sId,
            fileIds: _.uniq(
              filesUsableAsTableQuery
                .map((f) => f.fileId)
                .concat(filesUsableAsRetrievalQuery.map((f) => f.fileId))
            ),
            workspaceId: conversation.owner.sId,
          },
          "No default datasource view found for conversation when trying to get JIT actions"
        );

        return [];
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
          tables: filesUsableAsTableQuery.map((f) => ({
            workspaceId: auth.getNonNullableWorkspace().sId,
            dataSourceViewId: dataSourceView.sId,
            tableId: f.fileId,
          })),
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
              filter: { parents: null },
            },
          ],
        };
        actions.push(action);
      }
    }

    // conversation_include_file_action
    actions.push(makeConversationIncludeFileConfiguration());
  }

  return actions;
}

export async function getEmulatedAndJITActions(
  auth: Authenticator,
  {
    agentMessage,
    conversation,
  }: { agentMessage: AgentMessageType; conversation: ConversationType }
): Promise<{
  emulatedActions: AgentActionType[];
  jitActions: ActionConfigurationType[];
}> {
  const emulatedActions: AgentActionType[] = [];
  let jitActions: ActionConfigurationType[] = [];

  if (isJITActionsEnabled(auth)) {
    const files = listFiles(conversation);

    const a = makeConversationListFilesAction({
      agentMessage,
      files,
    });
    if (a) {
      emulatedActions.push(a);
    }

    jitActions = await getJITActions(auth, { conversation, files });
  }

  // We ensure that all emulated actions are injected with step -1.
  assert(
    emulatedActions.every((a) => a.step === -1),
    "Emulated actions must have step -1"
  );
  return { emulatedActions, jitActions };
}

/**
 * Model conversation rendering - JIT actions
 */

export async function renderConversationForModelJIT({
  conversation,
  model,
  prompt,
  allowedTokenCount,
  excludeActions,
  excludeImages,
}: {
  conversation: ConversationType;
  model: ModelConfigurationType;
  prompt: string;
  allowedTokenCount: number;
  excludeActions?: boolean;
  excludeImages?: boolean;
}): Promise<
  Result<
    {
      modelConversation: ModelConversationTypeMultiActions;
      tokensUsed: number;
    },
    Error
  >
> {
  const now = Date.now();
  const messages: ModelMessageTypeMultiActions[] = [];

  // Render loop: dender all messages and all actions.
  for (const versions of conversation.content) {
    const m = versions[versions.length - 1];

    if (isAgentMessageType(m)) {
      const actions = removeNulls(m.actions);

      // This is a record of arrays, because we can have multiple calls per agent message (parallel
      // calls).  Actions all have a step index which indicates how they should be grouped but some
      // actions injected by `getEmulatedAgentMessageActions` have a step index of `-1`. We
      // therefore group by index, then order and transform in a 2D array to present to the model.
      const stepByStepIndex = {} as Record<
        string,
        {
          contents: string[];
          actions: Array<{
            call: FunctionCallType;
            result: FunctionMessageTypeModel;
          }>;
        }
      >;

      const emptyStep = () =>
        ({
          contents: [],
          actions: [],
        }) satisfies (typeof stepByStepIndex)[number];

      for (const action of actions) {
        const stepIndex = action.step;
        stepByStepIndex[stepIndex] = stepByStepIndex[stepIndex] || emptyStep();
        // All these calls (except `conversation_include_files_action` are not async so we're not
        // doing a Promise.all for now but might need to be reconsiderd in the future.
        stepByStepIndex[stepIndex].actions.push({
          call: action.renderForFunctionCall(),
          result: await action.renderForMultiActionsModel({
            conversation,
            model,
          }),
        });
      }

      for (const content of m.rawContents) {
        stepByStepIndex[content.step] =
          stepByStepIndex[content.step] || emptyStep();
        if (content.content.trim()) {
          stepByStepIndex[content.step].contents.push(content.content);
        }
      }

      const steps = Object.entries(stepByStepIndex)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, step]) => step);

      if (excludeActions) {
        // In Exclude Actions mode, we only render the last step that has content.
        const stepsWithContent = steps.filter((s) => s?.contents.length);
        if (stepsWithContent.length) {
          const lastStepWithContent =
            stepsWithContent[stepsWithContent.length - 1];
          messages.push({
            role: "assistant",
            name: m.configuration.name,
            content: lastStepWithContent.contents.join("\n"),
          } satisfies AssistantContentMessageTypeModel);
        }
      } else {
        // In regular mode, we render all steps.
        for (const step of steps) {
          if (!step) {
            logger.error(
              {
                workspaceId: conversation.owner.sId,
                conversationId: conversation.sId,
                agentMessageId: m.sId,
                panic: true,
              },
              "Unexpected state, agent message step is empty"
            );
            continue;
          }
          if (!step.actions.length && !step.contents.length) {
            logger.error(
              {
                workspaceId: conversation.owner.sId,
                conversationId: conversation.sId,
                agentMessageId: m.sId,
              },
              "Unexpected state, agent message step with no actions and no contents"
            );
            continue;
          }

          if (step.actions.length) {
            messages.push({
              role: "assistant",
              function_calls: step.actions.map((s) => s.call),
              content: step.contents.join("\n"),
            } satisfies AssistantFunctionCallMessageTypeModel);
          } else {
            messages.push({
              role: "assistant",
              content: step.contents.join("\n"),
              name: m.configuration.name,
            } satisfies AssistantContentMessageTypeModel);
          }

          for (const { result } of step.actions) {
            messages.push(result);
          }
        }
      }

      if (!m.rawContents.length && m.content?.trim()) {
        // We need to maintain support for legacy agent messages that don't have rawContents.
        messages.push({
          role: "assistant",
          name: m.configuration.name,
          content: m.content,
        });
      }
    } else if (isUserMessageType(m)) {
      // Replace all `:mention[{name}]{.*}` with `@name`.
      const content = m.content.replaceAll(
        /:mention\[([^\]]+)\]\{[^}]+\}/g,
        (_, name) => {
          return `@${name}`;
        }
      );
      messages.push({
        role: "user" as const,
        name: m.context.fullName || m.context.username,
        content: [
          {
            type: "text",
            text: content,
          },
        ],
      });
    } else if (isContentFragmentType(m)) {
      messages.push(
        await renderLightContentFragmentForModel(m, conversation, model, {
          excludeImages: Boolean(excludeImages),
        })
      );
    } else {
      assertNever(m);
    }
  }

  // Compute in parallel the token count for each message and the prompt.
  const res = await tokenCountForTexts(
    [prompt, ...getTextRepresentationFromMessages(messages)],
    model
  );
  if (res.isErr()) {
    return new Err(res.error);
  }

  const [promptCount, ...messagesCount] = res.value;

  // We initialize `tokensUsed` to the prompt tokens + a bit of buffer for message rendering
  // approximations.
  const tokensMargin = 1024;
  let tokensUsed = promptCount + tokensMargin;

  // Go backward and accumulate as much as we can within allowedTokenCount.
  const selected: ModelMessageTypeMultiActions[] = [];

  // Selection loop.
  for (let i = messages.length - 1; i >= 0; i--) {
    const c = messagesCount[i];

    const currentMessage = messages[i];

    if (tokensUsed + c <= allowedTokenCount) {
      tokensUsed += c;
      selected.unshift(currentMessage);
    } else {
      break;
    }
  }

  // Merging loop: merging content fragments into the upcoming user message.
  // Eg: [CF1, CF2, UserMessage, AgentMessage] => [CF1-CF2-UserMessage, AgentMessage]
  for (let i = selected.length - 1; i >= 0; i--) {
    const cfMessage = selected[i];
    if (isContentFragmentMessageTypeModel(cfMessage)) {
      const userMessage = selected[i + 1];
      if (!userMessage || userMessage.role !== "user") {
        logger.error(
          {
            workspaceId: conversation.owner.sId,
            conversationId: conversation.sId,
            selected: selected.map((m) => ({
              ...m,
              content:
                getTextContentFromMessage(m)?.slice(0, 100) + " (truncated...)",
            })),
          },
          "Unexpected state, cannot find user message after a Content Fragment"
        );
        throw new Error(
          "Unexpected state, cannot find user message after a Content Fragment"
        );
      }

      userMessage.content = [...cfMessage.content, ...userMessage.content];
      // Now we remove the content fragment from the array since it was merged into the upcoming
      // user message.
      selected.splice(i, 1);
    }
  }

  while (
    selected.length > 0 &&
    // Most model providers don't support starting by a function result or assistant message.
    ["assistant", "function"].includes(selected[0].role)
  ) {
    const tokenCount = messagesCount[messages.length - selected.length];
    tokensUsed -= tokenCount;
    selected.shift();
  }

  logger.info(
    {
      workspaceId: conversation.owner.sId,
      conversationId: conversation.sId,
      messageCount: messages.length,
      promptToken: promptCount,
      tokensUsed,
      messageSelected: selected.length,
      elapsed: Date.now() - now,
    },
    "[ASSISTANT_TRACE] renderConversationForModelMultiActions"
  );

  return new Ok({
    modelConversation: {
      messages: selected,
    },
    tokensUsed,
  });
}
