/** @ignoreswagger */
import {
  createConversation,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { ProjectTodoType } from "@app/types/project_todo";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export interface PostStartProjectTodoResponseBody {
  todo: ProjectTodoType;
}

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
    `Let's start working on the todo (id: ${todoId}) from the current project.`,
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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostStartProjectTodoResponseBody>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  if (!space.isProject()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Todos are only available for project spaces.",
      },
    });
  }

  const { todoId } = req.query;
  if (!isString(todoId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid todo id.",
      },
    });
  }

  const todo = await ProjectTodoResource.fetchBySId(auth, todoId);
  if (!todo || todo.spaceId !== space.id) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "project_todo_not_found",
        message: "Todo not found.",
      },
    });
  }

  const user = auth.getNonNullableUser();
  if (todo.userId !== user.id) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "You can only modify your own todos.",
      },
    });
  }

  if (todo.category !== "to_do") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only 'Need to do' items can be started.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      let conversationId = await todo.getLatestConversationId(auth);

      if (!conversationId) {
        const sourcesByTodoId =
          await ProjectTodoResource.fetchSourcesForTodoIds(auth, {
            sIds: [todo.sId],
          });
        const sources = sourcesByTodoId.get(todo.sId) ?? [];
        const sourceUrls = sources
          .map((source) => source.sourceUrl)
          .filter((url): url is string => !!url);
        const prompt = buildTodoKickoffPrompt({
          todoId: todo.sId,
          todoText: todo.text,
          sourceUrls,
        });

        const conversation = await createConversation(auth, {
          title: `Project todo · ${todo.text.slice(0, 80)}`,
          visibility: "unlisted",
          spaceId: space.id,
          metadata: {
            projectTodoId: todo.sId,
          },
        });

        const messageRes = await postUserMessage(auth, {
          conversation,
          content: prompt,
          mentions: [{ configurationId: GLOBAL_AGENTS_SID.DUST }],
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
          return apiError(req, res, messageRes.error);
        }

        await todo.addConversation(auth, {
          conversationModelId: conversation.id,
        });
        conversationId = conversation.sId;
      }

      return res.status(200).json({
        todo: {
          ...todo.toJSON(),
          conversationId,
        },
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanRead: true },
  })
);
