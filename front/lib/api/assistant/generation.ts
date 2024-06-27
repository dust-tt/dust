import type {
  AgentConfigurationType,
  ContentFragmentMessageTypeModel,
  ConversationType,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
  ModelMessageTypeMultiActions,
  Result,
  UserMessageType,
} from "@dust-tt/types";
import {
  assertNever,
  Err,
  isAgentMessageType,
  isContentFragmentMessageTypeModel,
  isContentFragmentType,
  isRetrievalConfiguration,
  isTextContent,
  isUserMessageType,
  isWebsearchConfiguration,
  Ok,
  removeNulls,
} from "@dust-tt/types";
import moment from "moment-timezone";

import { citationMetaPrompt } from "@app/lib/api/assistant/citations";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import type { Authenticator } from "@app/lib/auth";
import { getContentFragmentText } from "@app/lib/resources/content_fragment_resource";
import { tokenCountForText, tokenSplit } from "@app/lib/tokenization";
import logger from "@app/logger/logger";

/**
 * Model rendering of conversations.
 */

export async function renderConversationForModelMultiActions({
  conversation,
  model,
  prompt,
  allowedTokenCount,
  excludeActions,
}: {
  conversation: ConversationType;
  model: { providerId: string; modelId: string };
  prompt: string;
  allowedTokenCount: number;
  excludeActions?: boolean;
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
  const closingAttachmentTag = "</attachment>\n";

  // Render loop.
  // Render all messages and all actions.
  for (const versions of conversation.content) {
    const m = versions[versions.length - 1];

    if (isAgentMessageType(m)) {
      const actions = removeNulls(m.actions);

      // This array is 2D, because we can have multiple calls per agent message (parallel calls).
      const steps = [] as Array<
        Array<{ call: FunctionCallType; result: FunctionMessageTypeModel }>
      >;

      if (!excludeActions) {
        for (const action of actions) {
          const stepIndex = action.step;
          steps[stepIndex] = steps[stepIndex] || [];
          steps[stepIndex].push({
            call: action.renderForFunctionCall(),
            result: action.renderForMultiActionsModel(),
          });
        }
      }

      for (const step of steps) {
        if (!step?.length) {
          logger.error(
            {
              workspaceId: conversation.owner.sId,
              conversationId: conversation.sId,
              agentMessageId: m.sId,
              panic: true,
            },
            "Unexpected state, agent message step with no actions"
          );
          continue;
        }
        messages.push({
          role: "assistant",
          function_calls: step.map((s) => s.call),
        });
        for (const { result } of step) {
          messages.push(result);
        }
      }

      if (m.content?.trim()) {
        messages.push({
          role: "assistant" as const,
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
      try {
        const content = await getContentFragmentText({
          workspaceId: conversation.owner.sId,
          conversationId: conversation.sId,
          messageId: m.sId,
        });
        messages.push({
          role: "content_fragment",
          name: `inject_${m.contentType}`,
          // The closing </attachment> tag will be added in the merging loop because we might
          // need to add a "truncated..." mention in the selection loop.
          content: [
            {
              type: "text",
              text: `<attachment type="${m.contentType}" title="${m.title}">\n${content}\n`,
            },
          ],
        });
      } catch (error) {
        logger.error(
          {
            error,
            workspaceId: conversation.owner.sId,
            conversationId: conversation.sId,
            messageId: m.sId,
          },
          "Failed to retrieve content fragment text"
        );
        return new Err(new Error("Failed to retrieve content fragment text"));
      }
    } else {
      assertNever(m);
    }
  }

  // Compute in parallel the token count for each message and the prompt.
  const [messagesCountRes, promptCountRes] = await Promise.all([
    Promise.all(
      messages.map((m) => {
        let text = `${m.role} ${"name" in m ? m.name : ""} ${getTextContentFromMessage(m)}`;
        if (
          isContentFragmentMessageTypeModel(m) &&
          m.content.every((c) => isTextContent(c))
        ) {
          // Account for the upcoming </attachment> tag for textual attachments,
          // as it will be appended during the merging process.
          text += closingAttachmentTag;
        }

        if ("function_calls" in m) {
          text += m.function_calls
            .map((f) => `${f.name} ${f.arguments}`)
            .join(" ");
        }
        return tokenCountForText(text, model);
      })
    ),
    tokenCountForText(prompt, model),
  ]);

  if (promptCountRes.isErr()) {
    return new Err(promptCountRes.error);
  }

  // We initialize `tokensUsed` to the prompt tokens + a bit of buffer for message rendering
  // approximations, 64 tokens seems small enough and ample enough.
  const tokensMargin = 64;
  let tokensUsed = promptCountRes.value + tokensMargin;

  // Go backward and accumulate as much as we can within allowedTokenCount.
  const selected: ModelMessageTypeMultiActions[] = [];
  const truncationMessage = `... (content truncated)`;
  const approxTruncMsgTokenCount = truncationMessage.length / 3;

  // Selection loop.
  for (let i = messages.length - 1; i >= 0; i--) {
    const r = messagesCountRes[i];
    if (r.isErr()) {
      return new Err(r.error);
    }
    const c = r.value;

    const currentMessage = messages[i];

    if (tokensUsed + c <= allowedTokenCount) {
      tokensUsed += c;
      selected.unshift(currentMessage);
    } else if (
      // When a content fragment has more than the remaining number of tokens, we split it.
      isContentFragmentMessageTypeModel(currentMessage) &&
      // Allow at least tokensMargin tokens in addition to the truncation message.
      tokensUsed + approxTruncMsgTokenCount + tokensMargin < allowedTokenCount
    ) {
      const msg = messages[i] as ContentFragmentMessageTypeModel;
      const remainingTokens =
        allowedTokenCount - tokensUsed - approxTruncMsgTokenCount;

      const updatedContent = [];
      for (const c of msg.content) {
        if (!isTextContent(c)) {
          // If there is not enough room and it's an image, we simply ignore it.
          continue;
        }

        const contentRes = await tokenSplit(c.text, model, remainingTokens);
        if (contentRes.isErr()) {
          return new Err(contentRes.error);
        }

        updatedContent.push({
          ...c,
          text: contentRes.value + truncationMessage,
        });
      }

      selected.unshift({
        ...msg,
        content: updatedContent,
      });

      tokensUsed += remainingTokens;
      break;
    } else {
      break;
    }
  }

  // Merging loop.
  // Merging content fragments into the upcoming user message.
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

      for (const c of cfMessage.content) {
        if (isTextContent(c)) {
          // We can now close the </attachment> tag, because the message was already properly
          // truncated.  We also accounted for the closing that above when computing the tokens count.
          c.text += closingAttachmentTag;
        }
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
    const tokenCountRes = messagesCountRes[messages.length - selected.length];
    if (tokenCountRes.isErr()) {
      return new Err(tokenCountRes.error);
    }
    tokensUsed -= tokenCountRes.value;
    selected.shift();
  }

  logger.info(
    {
      workspaceId: conversation.owner.sId,
      conversationId: conversation.sId,
      messageCount: messages.length,
      promptToken: promptCountRes.value,
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

/**
 * Generation execution.
 */

export async function constructPromptMultiActions(
  auth: Authenticator,
  {
    userMessage,
    agentConfiguration,
    fallbackPrompt,
    model,
    hasAvailableActions,
  }: {
    userMessage: UserMessageType;
    agentConfiguration: AgentConfigurationType;
    fallbackPrompt?: string;
    model: ModelConfigurationType;
    hasAvailableActions: boolean;
  }
) {
  const d = moment(new Date()).tz(userMessage.context.timezone);
  const owner = auth.workspace();

  // CONTEXT section
  let context = "CONTEXT:\n";
  context += `assistant: @${agentConfiguration.name}\n`;
  context += `local_time: ${d.format("YYYY-MM-DD HH:mm (ddd)")}\n`;
  if (owner) {
    context += `workspace: ${owner.name}\n`;
    if (userMessage.context.fullName) {
      context += `user_full_name: ${userMessage.context.fullName}\n`;
    }
    if (userMessage.context.email) {
      context += `user_email: ${userMessage.context.email}\n`;
    }
  }

  // INSTRUCTIONS section
  let instructions = "INSTRUCTIONS:\n";
  if (agentConfiguration.instructions) {
    instructions += `${agentConfiguration.instructions}\n`;
  } else if (fallbackPrompt) {
    instructions += `${fallbackPrompt}\n`;
  }

  // Replacement if instructions include "{USER_FULL_NAME}".
  instructions = instructions.replaceAll(
    "{USER_FULL_NAME}",
    userMessage.context.fullName || "Unknown user"
  );

  // Replacement if instructions includes "{ASSISTANTS_LIST}"
  if (instructions.includes("{ASSISTANTS_LIST}")) {
    if (!auth.isUser()) {
      throw new Error("Unexpected unauthenticated call to `constructPrompt`");
    }
    const agents = await getAgentConfigurations({
      auth,
      agentsGetView: auth.user() ? "list" : "all",
      variant: "light",
    });
    instructions = instructions.replaceAll(
      "{ASSISTANTS_LIST}",
      agents
        .map((agent) => {
          let agentDescription = "";
          agentDescription += `@${agent.name}: `;
          agentDescription += `${agent.description}`;
          return agentDescription;
        })
        .join("\n")
    );
  }

  // ADDITIONAL INSTRUCTIONS section
  let additionalInstructions = "";

  const canCiteDocuments = agentConfiguration.actions.some(
    (action) =>
      isRetrievalConfiguration(action) || isWebsearchConfiguration(action)
  );
  if (canCiteDocuments) {
    additionalInstructions += `${citationMetaPrompt()}\n`;
  }

  const providerMetaPrompt = model.metaPrompt;
  if (providerMetaPrompt) {
    additionalInstructions += `\n${providerMetaPrompt}\n`;
  }

  if (hasAvailableActions) {
    const toolMetaPrompt = model.toolUseMetaPrompt;
    if (toolMetaPrompt) {
      additionalInstructions += `\n${toolMetaPrompt}\n`;
    }
  }

  let prompt = `${context}\n${instructions}`;
  if (additionalInstructions) {
    prompt += `\nADDITIONAL INSTRUCTIONS:\n${additionalInstructions}`;
  }
  return prompt;
}

function getTextContentFromMessage(
  message: ModelMessageTypeMultiActions
): string {
  const { content } = message;

  if (typeof content === "string") {
    return content;
  }

  if (!content) {
    return "";
  }

  return content
    ?.map((c) => {
      if (isTextContent(c)) {
        return c.text;
      }

      return c.image_url.url;
    })
    .join("\n");
}
