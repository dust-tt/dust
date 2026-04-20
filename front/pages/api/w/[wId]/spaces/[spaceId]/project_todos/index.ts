/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import { ProjectTodoStateResource } from "@app/lib/resources/project_todo_state_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type {
  ProjectTodoSourceInfo,
  ProjectTodoType,
} from "@app/types/project_todo";
import type { NextApiRequest, NextApiResponse } from "next";

export interface GetProjectTodosResponseBody {
  todos: ProjectTodoType[];
  previousTodos: ProjectTodoType[] | null;
  previousLastReadAt: string | null;
}

function enrichWithSources(
  todos: ProjectTodoResource[],
  sourcesByTodoId: Map<string, ProjectTodoSourceInfo[]>
): ProjectTodoType[] {
  return todos.map((t) => {
    const sources = sourcesByTodoId.get(t.sId) ?? [];
    return {
      ...t.toJSON(),
      sources: sources.map((s) => ({
        sourceType: s.sourceType,
        sourceId: s.sourceId,
        sourceTitle: s.sourceTitle,
        sourceUrl: s.sourceUrl,
      })),
    };
  });
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetProjectTodosResponseBody>>,
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

  switch (req.method) {
    case "GET": {
      const todos = await ProjectTodoResource.fetchLatestBySpace(auth, {
        spaceId: space.id,
      });

      // Reconstruct the state as it was at the user's last visit.
      const state = await ProjectTodoStateResource.fetchBySpace(auth, {
        spaceId: space.id,
      });

      const previous = state
        ? await ProjectTodoResource.fetchLatestBySpaceForUserAtTimestamp(auth, {
            spaceId: space.id,
            userId: auth.getNonNullableUser().id,
            timestamp: state.lastReadAt,
          })
        : null;

      // Fetch sources for all todos, past and present, in one query.
      const allSIds = [
        ...new Set([
          ...todos.map((t) => t.sId),
          ...(previous?.map((t) => t.sId) ?? []),
        ]),
      ];
      const sourcesByTodoId = await ProjectTodoResource.fetchSourcesForTodoIds(
        auth,
        {
          sIds: allSIds,
        }
      );

      const todosWithSources = enrichWithSources(todos, sourcesByTodoId);
      const previousTodos = previous
        ? enrichWithSources(previous, sourcesByTodoId)
        : null;

      return res.status(200).json({
        todos: todosWithSources,
        previousTodos,
        previousLastReadAt: state ? state.lastReadAt.toISOString() : null,
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanRead: true },
  })
);
