import { Hono } from "hono";
import { z } from "zod";

import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { enrichProjectsWithMetadata } from "@app/lib/api/projects/list";
import { createSpaceAndGroup } from "@app/lib/api/spaces";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { areOpenProjectsAllowed } from "@app/lib/workspace_policies";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { ProjectType, SpaceType } from "@app/types/space";

import { validate } from "../../../middleware/validator";
import { appsApp } from "./apps";
import { dataSourceViewsApp } from "./data_source_views";
import { dataSourcesApp } from "./data_sources";
import { joinApp } from "./join";
import { leaveApp } from "./leave";
import { mcpApp } from "./mcp";
import { mcpViewsApp } from "./mcp_views";
import { projectContextApp } from "./project_context";
import { projectTasksApp } from "./project_tasks";
import { searchConversationsApp } from "./search_conversations";
import { starApp } from "./star";
import { webhookSourceViewsApp } from "./webhook_source_views";

const PostSpaceRequestBodySchema = z.intersection(
  z.object({
    isRestricted: z.boolean(),
    name: z.string(),
    spaceKind: z.enum(["regular", "project"]),
  }),
  z.discriminatedUnion("managementMode", [
    z.object({
      memberIds: z.array(z.string()),
      managementMode: z.literal("manual"),
    }),
    z.object({
      groupIds: z.array(z.string()),
      managementMode: z.literal("group"),
    }),
  ])
);

export type PostSpaceRequestBodyType = z.infer<
  typeof PostSpaceRequestBodySchema
>;

export type GetSpacesResponseBody = {
  spaces: (SpaceType | ProjectType)[];
};

export type PostSpacesResponseBody = {
  space: SpaceType;
};

export const spacesApp = new Hono();

// Mounted under /api/w/:wId/spaces. workspaceAuth is applied by the parent
// workspace sub-app, so c.get("auth") is always available here.

spacesApp.get("/", async (c) => {
  const auth = c.get("auth");
  const role = c.req.query("role");
  const kind = c.req.query("kind");

  let spaces: SpaceResource[] = [];
  if (role === "admin") {
    if (kind === "system") {
      const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
      spaces = systemSpace ? [systemSpace] : [];
    } else {
      spaces = await SpaceResource.listWorkspaceSpaces(auth);
    }
  } else {
    spaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);
  }

  spaces = spaces.filter((s) => s.kind !== "conversations");
  const nonProjectSpaces = spaces.filter((s) => s.kind !== "project");
  const projectSpaces = spaces.filter((s) => s.kind === "project");

  const nonProjectsJson: SpaceType[] = nonProjectSpaces.map((s) => s.toJSON());
  const projectsJson: ProjectType[] = await enrichProjectsWithMetadata(
    auth,
    projectSpaces
  );

  const body: GetSpacesResponseBody = {
    spaces: [...nonProjectsJson, ...projectsJson],
  };
  return c.json(body);
});

spacesApp.post("/", validate("json", PostSpaceRequestBodySchema), async (c) => {
  const auth = c.get("auth");
  const requestBody = c.req.valid("json");
  const owner = auth.getNonNullableWorkspace();

  if (
    requestBody.spaceKind === "project" &&
    !requestBody.isRestricted &&
    !areOpenProjectsAllowed(owner)
  ) {
    return c.json(
      {
        error: {
          type: "invalid_request_error",
          message:
            "Open projects are disabled by your workspace admin. Create a private project instead.",
        },
      },
      403
    );
  }

  const spaceRes = await createSpaceAndGroup(auth, requestBody);
  if (spaceRes.isErr()) {
    switch (spaceRes.error.code) {
      case "limit_reached":
        return c.json(
          {
            error: {
              type: "plan_limit_error",
              message:
                "Limit of spaces allowed for your plan reached. Contact support to upgrade.",
            },
          },
          403
        );
      case "space_already_exists":
        return c.json(
          {
            error: {
              type: "space_already_exists",
              message: "Space with that name already exists.",
            },
          },
          400
        );
      case "internal_error":
        return c.json(
          {
            error: {
              type: "internal_server_error",
              message: spaceRes.error.message,
            },
          },
          500
        );
      case "unauthorized":
        return c.json(
          {
            error: {
              type: "workspace_auth_error",
              message:
                "Only users that are `admins` can create regular spaces.",
            },
          },
          403
        );
      default:
        assertNever(spaceRes.error.code);
    }
  }

  const space = spaceRes.value;

  void emitAuditLogEvent({
    auth,
    action: "space.created",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("space", space),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      space_name: space.name,
      space_kind: space.kind,
      is_restricted: String(requestBody.isRestricted),
    },
  });

  const responseBody: PostSpacesResponseBody = { space: space.toJSON() };
  return c.json(responseBody, 201);
});

// Per-space sub-resource sub-apps. New families of routes under a specific
// space (data source views, members, etc.) live in their own sibling files
// and are mounted here.
spacesApp.route("/:spaceId/apps", appsApp);
spacesApp.route("/:spaceId/data_source_views/:dsvId", dataSourceViewsApp);
spacesApp.route("/:spaceId/data_sources/:dsId", dataSourcesApp);
spacesApp.route("/:spaceId/join", joinApp);
spacesApp.route("/:spaceId/leave", leaveApp);
spacesApp.route("/:spaceId/mcp", mcpApp);
spacesApp.route("/:spaceId/mcp_views", mcpViewsApp);
spacesApp.route("/:spaceId/project_context", projectContextApp);
spacesApp.route("/:spaceId/project_tasks", projectTasksApp);
spacesApp.route("/:spaceId/search_conversations", searchConversationsApp);
spacesApp.route("/:spaceId/star", starApp);
spacesApp.route("/:spaceId/webhook_source_views", webhookSourceViewsApp);
