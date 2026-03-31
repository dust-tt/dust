/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import { ProjectTodoStateResource } from "@app/lib/resources/project_todo_state_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { ProjectTodoType } from "@app/types/project_todo";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetProjectTodosResponseBody = {
  // Todos as they were when the user last acknowledged them. Null on first visit
  // (no prior read state), in which case the UI should display `after` without
  // animation.
  before: ProjectTodoType[] | null;
  // Current state of the todo list.
  after: ProjectTodoType[];
};

export type PostProjectTodosResponseBody = {
  lastReadAt: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetProjectTodosResponseBody | PostProjectTodosResponseBody
    >
  >,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  const user = auth.getNonNullableUser();

  switch (req.method) {
    case "GET": {
      const [todos, state] = await Promise.all([
        ProjectTodoResource.fetchBySpace(auth, { spaceId: space.id }),
        ProjectTodoStateResource.fetchBySpace(auth, {
          spaceId: space.id,
        }),
      ]);

      const after = todos.map((t) => t.toJSON());

      // `before` is the subset of the current todos that existed at the time
      // the user last read the list. Items created after `lastReadAt` will only
      // appear in `after`, making them visually "new" for the animation.
      const before = state
        ? todos
            .filter((t) => t.createdAt.getTime() <= state.lastReadAt.getTime())
            .map((t) => t.toJSON())
        : null;

      return res.status(200).json({ before, after });
    }

    case "POST": {
      // Marks the current todo list as seen by the user. After this call,
      // subsequent GET requests will use this timestamp as the `before` cutoff.
      const state = await ProjectTodoStateResource.upsertBySpace(auth, {
        spaceId: space.id,
        lastReadAt: new Date(),
      });

      return res.status(200).json({
        lastReadAt: state.lastReadAt.toISOString(),
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET or POST expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
