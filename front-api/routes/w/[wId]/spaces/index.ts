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
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";
import spaceId from "./[spaceId]";
import checkName from "./check-name";
import projectsLookup from "./projects-lookup";
import searchProjects from "./search_projects";

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

// Mounted under /api/w/:wId/spaces. workspaceAuth is applied by the parent
// workspace sub-app, so ctx.get("auth") is always available here.
const app = new Hono();

app.get("/", async (ctx): HandlerResult<GetSpacesResponseBody> => {
  const auth = ctx.get("auth");
  const role = ctx.req.query("role");
  const kind = ctx.req.query("kind");

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

  return ctx.json({
    spaces: [...nonProjectsJson, ...projectsJson],
  });
});

app.post(
  "/",
  validate("json", PostSpaceRequestBodySchema),
  async (ctx): HandlerResult<PostSpacesResponseBody> => {
    const auth = ctx.get("auth");
    const requestBody = ctx.req.valid("json");
    const owner = auth.getNonNullableWorkspace();

    if (
      requestBody.spaceKind === "project" &&
      !requestBody.isRestricted &&
      !areOpenProjectsAllowed(owner)
    ) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message:
            "Open projects are disabled by your workspace admin. Create a private project instead.",
        },
      });
    }

    const spaceRes = await createSpaceAndGroup(auth, requestBody);
    if (spaceRes.isErr()) {
      switch (spaceRes.error.code) {
        case "limit_reached":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "plan_limit_error",
              message:
                "Limit of spaces allowed for your plan reached. Contact support to upgrade.",
            },
          });
        case "space_already_exists":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "space_already_exists",
              message: "Space with that name already exists.",
            },
          });
        case "internal_error":
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: spaceRes.error.message,
            },
          });
        case "unauthorized":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message:
                "Only users that are `admins` can create regular spaces.",
            },
          });
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

    return ctx.json({ space: space.toJSON() }, 201);
  }
);

// Register static paths BEFORE `/:spaceId` so the param route does not
// swallow these names as ids.
app.route("/check-name", checkName);
app.route("/projects-lookup", projectsLookup);
app.route("/search_projects", searchProjects);
app.route("/:spaceId", spaceId);

export default app;
