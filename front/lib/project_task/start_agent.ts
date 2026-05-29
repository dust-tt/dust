import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  POD_TASKS_SERVER_NAME,
  UPDATE_TASKS_TOOL_NAME,
} from "@app/lib/api/actions/servers/pod_tasks/metadata";
import {
  createConversation,
  postNewContentFragment,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import type { Authenticator } from "@app/lib/auth";
import { serializeProjectTaskDirective } from "@app/lib/project_task/format";
import { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { APIErrorType } from "@app/types/error";
import type { PodTaskSourceInfo, PodTaskType } from "@app/types/project_task";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { toFileContentFragment } from "../api/assistant/conversation/content_fragment";

type StartProjectTaskAgentError = {
  statusCode: ContentfulStatusCode;
  type: APIErrorType;
  message: string;
};

function escapeMarkdownInlineLinkText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function markdownInlineLink(label: string, url: string): string {
  const dest = `<${url}>`;
  return `[${escapeMarkdownInlineLinkText(label)}](${dest})`;
}

function linkLabelForUrlOnly(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

function formatTaskSourcesMarkdown(sources: PodTaskSourceInfo[]): string {
  const lines = sources
    .map((s) => {
      const title = s.sourceTitle?.trim();
      const url = s.sourceUrl?.trim();
      if (title && url) {
        return `- ${markdownInlineLink(title, url)}`;
      }
      if (title) {
        return `- **${title}**`;
      }
      if (url) {
        return `- ${markdownInlineLink(linkLabelForUrlOnly(url), url)}`;
      }
      return null;
    })
    .filter((line): line is string => line !== null);

  if (lines.length === 0) {
    return "_I didn't attach sources to this task._";
  }
  return lines.join("\n");
}

function buildTaskKickoffPrompt({
  taskId,
  taskText,
  sources,
  agentInstructions,
}: {
  taskId: string;
  taskText: string;
  sources: PodTaskSourceInfo[];
  agentInstructions: string | null;
}): string {
  const trimmedAgentInstructions = agentInstructions?.trim();
  const sourcesBlock = formatTaskSourcesMarkdown(sources);

  const taskDirective = serializeProjectTaskDirective({
    label: taskText,
    sId: taskId,
  });

  return [
    "Assist with the following Pod task. Repeating the full title is not necessary unless helpful for clarity.",
    "",
    "For tools requiring a task reference, use:",
    "",
    taskDirective,
    "",
    ...(sources.length > 0 ? ["## Sources", "", sourcesBlock] : []),
    "",
    "## Instructions",
    "",
    "1. Clarify initial assumptions and planning; independently use available tools or context as needed.",
    "2. Leverage Pod context and accessible tools to complete the task end-to-end.",
    "3. Provide a summary of actions taken and highlight anything that should be verified.",
    "",
    "## Completion Criteria",
    "",
    "After the initial delivery, avoid marking the task as done solely based on your own judgment—provide a clear summary for user review and response.",
    "",
    `Once there is explicit acceptance in this chat (e.g. "ok good for me", "looks good", "perfect", "works for me", "thanks that's what I needed", or any unequivocal statement of satisfaction or task completion), mark the task as done in the same turn using the \`${getPrefixedToolName(POD_TASKS_SERVER_NAME, UPDATE_TASKS_TOOL_NAME)}\` tool. Verbal approval in chat is required; do not assume closure will only happen via the UI. A prompt acknowledgment is sufficient, but always mark the task as done upon clear approval.`,
    "",
    "If further changes are requested, if feedback indicates the work is not complete, or if the user instructs to keep the task open, do not mark it as done.",
    ...(trimmedAgentInstructions
      ? ["", "## Task-specific guidance", "", trimmedAgentInstructions]
      : []),
  ].join("\n");
}

export async function startAgentForProjectTask(
  auth: Authenticator,
  {
    space,
    taskId,
    agentConfigurationId,
    customMessage,
  }: {
    space: SpaceResource;
    taskId: string;
    agentConfigurationId?: string;
    customMessage?: string;
  }
): Promise<
  Result<
    {
      task: PodTaskType;
      conversationId: string;
      userMessageId: string;
      action: "created" | "appended";
    },
    StartProjectTaskAgentError
  >
> {
  if (!space.isProject()) {
    return new Err({
      statusCode: 400,
      type: "invalid_request_error",
      message: "Tasks are only available for Pod spaces.",
    });
  }

  const task = await ProjectTaskResource.fetchBySId(auth, taskId);
  if (!task || task.spaceId !== space.id) {
    return new Err({
      statusCode: 404,
      type: "project_task_not_found",
      message: "Task not found.",
    });
  }

  const user = auth.getNonNullableUser();

  if (task.category !== "to_do") {
    return new Err({
      statusCode: 400,
      type: "invalid_request_error",
      message: "Only 'Need to do' items can be started.",
    });
  }

  const sourcesByTaskId = await ProjectTaskResource.fetchSourcesForTaskIds(
    auth,
    {
      sIds: [task.sId],
    }
  );
  const sources = sourcesByTaskId.get(task.sId) ?? [];
  const prompt = buildTaskKickoffPrompt({
    taskId: task.sId,
    taskText: task.text,
    sources,
    agentInstructions: task.agentInstructions,
  });

  let conversationId = await task.getLatestConversationId(auth);
  let conversation;
  let action: "created" | "appended" = "appended";

  if (!conversationId) {
    conversation = await createConversation(auth, {
      title: `Task · ${task.text.slice(0, 80)}`,
      visibility: "unlisted",
      spaceId: space.id,
      metadata: {
        projectTaskId: task.sId,
      },
    });

    await task.addConversation(auth, {
      conversationModelId: conversation.id,
    });
    conversationId = conversation.sId;
    action = "created";
  } else {
    const conversationRes = await getConversation(auth, conversationId, false);
    if (conversationRes.isErr()) {
      const conversationErrorType = conversationRes.error.type;
      return new Err({
        statusCode:
          conversationErrorType === "conversation_not_found" ? 404 : 403,
        type: conversationErrorType,
        message: conversationRes.error.message,
      });
    }
    conversation = conversationRes.value;
  }

  // Add the prompt as a file attachment to the conversation.
  const contentFragmentRes = await toFileContentFragment(auth, {
    conversation,
    contentFragment: {
      title: "How to complete the task",
      content: prompt,
      contentType: "text/markdown",
    },
    fileName: "how-to-complete-the-task.md",
  });
  if (contentFragmentRes.isErr()) {
    return new Err({
      statusCode: 400,
      type: "invalid_request_error",
      message: contentFragmentRes.error.message,
    });
  }

  const contentFragmentMsgRes = await postNewContentFragment(
    auth,
    conversation,
    contentFragmentRes.value,
    null
  );

  if (contentFragmentMsgRes.isErr()) {
    return new Err({
      statusCode: 400,
      type: "invalid_request_error",
      message: contentFragmentMsgRes.error.message,
    });
  }

  // Get the updated conversation with the new content fragment.
  const conversationRes = await getConversation(auth, conversationId);
  if (conversationRes.isErr()) {
    return new Err({
      statusCode: 400,
      type: "invalid_request_error",
      message: conversationRes.error.message,
    });
  }

  conversation = conversationRes.value;

  const taskDirective = serializeProjectTaskDirective({
    label: task.text,
    sId: task.sId,
  });

  const content =
    "Let's work on: " +
    taskDirective +
    ".\n\n" +
    (customMessage ?? "") +
    "\n\n" +
    "Read the attached file in full for more instructions.";

  const messageRes = await postUserMessage(auth, {
    conversation,
    content,
    mentions: [
      {
        configurationId: agentConfigurationId ?? GLOBAL_AGENTS_SID.DUST,
      },
    ],
    context: {
      timezone: "UTC",
      username: user.username,
      fullName: user.fullName(),
      email: user.email,
      profilePictureUrl: user.imageUrl,
      origin: "web",
    },
    skipToolsValidation: false,
  });

  if (messageRes.isErr()) {
    return new Err({
      statusCode: messageRes.error.status_code,
      type: messageRes.error.api_error.type,
      message: messageRes.error.api_error.message,
    });
  }

  const updatedTask = await task.updateWithVersion(auth, {
    status: "in_progress",
    doneAt: null,
    markedAsDoneByType: null,
    markedAsDoneByUserId: null,
    markedAsDoneByAgentConfigurationId: null,
  });

  return new Ok({
    task: {
      ...updatedTask.toJSON(),
      conversationId,
    },
    conversationId,
    userMessageId: messageRes.value.userMessage.sId,
    action,
  });
}
