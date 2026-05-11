import {
  createConversation,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import type { Authenticator } from "@app/lib/auth";
import { serializeProjectTaskDirective } from "@app/lib/project_task/format";
import { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { APIErrorType } from "@app/types/error";
import type {
  ProjectTaskSourceInfo,
  ProjectTaskType,
} from "@app/types/project_task";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

type StartProjectTaskAgentError = {
  statusCode: number;
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

function mergeKickoffCustomMessage(
  stored: string | null | undefined,
  userProvided: string | undefined
): string | undefined {
  const s = stored?.trim();
  const u = userProvided?.trim();
  if (s && u) {
    return `${s}\n\n${u}`;
  }
  return u ?? s ?? undefined;
}

function formatTaskSourcesMarkdown(sources: ProjectTaskSourceInfo[]): string {
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
  customMessage,
}: {
  taskId: string;
  taskText: string;
  sources: ProjectTaskSourceInfo[];
  customMessage?: string;
}): string {
  const sourcesBlock = formatTaskSourcesMarkdown(sources);
  const customMessageBlock = customMessage
    ? ["", "### More from me", "", customMessage]
    : [];

  const taskDirective = serializeProjectTaskDirective({
    label: taskText,
    sId: taskId,
  });

  return [
    "## Project task",
    "",
    "I'm asking you to help with this task from my project. The task is shown as the attachment on this message — I don't need you to repeat the full title unless it helps.",
    "",
    "If your tools need the task reference, use:",
    "",
    taskDirective,
    "",
    "## Sources",
    "",
    sourcesBlock,
    "",
    "## What I'd like you to do",
    "",
    "1. Clarify assumptions and plan; don't wait on me if you can get context with tools.",
    "2. Use project context and tools to carry out the work end-to-end.",
    "3. Summarize what you did, and anything I should verify.",
    "",
    "## When to mark it done",
    "",
    "**After your first delivery of the work:** don't mark this task done only because *you* consider the work finished—give me a clear summary so I can react.",
    "",
    '**When I clearly accept the result in this chat** (e.g. "ok good for me", "looks good", "perfect", "works for me", "thanks that\'s what I needed", or any plain statement that I\'m satisfied or we\'re done): **mark this task as done** in the same turn using the project task tools. Verbal approval here is the signal; don\'t assume I will only ever close it in the UI. A quick acknowledgment is fine, but do not skip marking done if I\'ve clearly approved.',
    "",
    "**If** I ask for more changes, say it's not quite right, or I tell you to keep the task open, then don't mark it done yet.",
    ...customMessageBlock,
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
      task: ProjectTaskType;
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
      message: "Tasks are only available for project spaces.",
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
    customMessage: mergeKickoffCustomMessage(
      task.agentInstructions,
      customMessage
    ),
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

  const messageRes = await postUserMessage(auth, {
    conversation,
    content: prompt,
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
