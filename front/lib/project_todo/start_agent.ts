import {
  createConversation,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import type { Authenticator } from "@app/lib/auth";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { APIErrorType } from "@app/types/error";
import type { ProjectTodoType } from "@app/types/project_todo";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

type StartProjectTodoAgentError = {
  statusCode: number;
  type: APIErrorType;
  message: string;
};

function buildTodoKickoffPrompt({
  todoId,
  todoText,
  sourceUrls,
}: {
  todoId: string;
  todoText: string;
  sourceUrls: string[];
}): string {
  const sourceLine =
    sourceUrls.length > 0
      ? `The item was sourced from ${sourceUrls.join(", ")}.`
      : "No explicit source was attached to this todo item.";

  return [
    `You are working on the todo (id: ${todoId}) from the current project.`,
    "",
    `Todo: ${todoText}`,
    "",
    sourceLine,
    "",
    "Please execute this task end-to-end:",
    "1. Clarify assumptions and plan the work but avoid waiting for user input if possible.",
    "2. Use available project context and tools to complete the work.",
    "3. Share concrete outputs and next checks.",
    "4. Once the task is completed, mark this todo as done.",
  ].join("\n");
}

export async function startAgentForProjectTodo(
  auth: Authenticator,
  {
    space,
    todoId,
    agentConfigurationId,
  }: {
    space: SpaceResource;
    todoId: string;
    agentConfigurationId?: string;
  }
): Promise<
  Result<
    {
      todo: ProjectTodoType;
      conversationId: string;
      userMessageId: string;
      action: "created" | "appended";
    },
    StartProjectTodoAgentError
  >
> {
  if (!space.isProject()) {
    return new Err({
      statusCode: 400,
      type: "invalid_request_error",
      message: "Todos are only available for project spaces.",
    });
  }

  const todo = await ProjectTodoResource.fetchBySId(auth, todoId);
  if (!todo || todo.spaceId !== space.id) {
    return new Err({
      statusCode: 404,
      type: "project_todo_not_found",
      message: "Todo not found.",
    });
  }

  const user = auth.getNonNullableUser();
  if (todo.userId !== user.id) {
    return new Err({
      statusCode: 403,
      type: "invalid_request_error",
      message: "You can only modify your own todos.",
    });
  }

  if (todo.category !== "to_do") {
    return new Err({
      statusCode: 400,
      type: "invalid_request_error",
      message: "Only 'Need to do' items can be started.",
    });
  }

  const sourcesByTodoId = await ProjectTodoResource.fetchSourcesForTodoIds(
    auth,
    {
      sIds: [todo.sId],
    }
  );
  const sources = sourcesByTodoId.get(todo.sId) ?? [];
  const sourceUrls = sources
    .map((source) => source.sourceUrl)
    .filter((url): url is string => !!url);
  const prompt = buildTodoKickoffPrompt({
    todoId: todo.sId,
    todoText: todo.text,
    sourceUrls,
  });

  let conversationId = await todo.getLatestConversationId(auth);
  let conversation;
  let action: "created" | "appended" = "appended";

  if (!conversationId) {
    conversation = await createConversation(auth, {
      title: `Project todo · ${todo.text.slice(0, 80)}`,
      visibility: "unlisted",
      spaceId: space.id,
      metadata: {
        projectTodoId: todo.sId,
      },
    });

    await todo.addConversation(auth, {
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

  return new Ok({
    todo: {
      ...todo.toJSON(),
      conversationId,
    },
    conversationId,
    userMessageId: messageRes.value.userMessage.sId,
    action,
  });
}
