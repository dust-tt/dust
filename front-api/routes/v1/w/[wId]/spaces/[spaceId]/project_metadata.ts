import { serializeMention } from "@app/lib/mentions/format";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { GetSpaceMetadataResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import uniqBy from "lodash/uniqBy";
import { z } from "zod";

const ParamsSchema = z.object({
  spaceId: z.string(),
});

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 * Used by connectors to fetch project metadata for syncing to data sources.
 */

// Mounted at /api/v1/w/:wId/spaces/:spaceId/project_metadata.
const app = publicApiApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetSpaceMetadataResponseType> => {
    const auth = ctx.get("auth");

    // Only allow system keys (connectors) to access this endpoint
    if (!auth.isSystemKey()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_oauth_token_error",
          message: "Only system keys are allowed to use this endpoint.",
        },
      });
    }

    const { spaceId } = ctx.req.valid("param");

    // Fetch and verify space exists
    const space = await SpaceResource.fetchById(auth, spaceId);
    if (!space) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: "Space not found.",
        },
      });
    }

    // Only project spaces can have metadata
    if (!space.isProject()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Pod metadata is only available for Pod spaces.",
        },
      });
    }

    // Fetch metadata
    const metadata = await ProjectMetadataResource.fetchBySpace(auth, space);
    // shouldn't happen, as we create the metadata row when we create the project, but just in case
    if (!metadata) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "project_metadata_not_found",
          message: "Pod metadata not found for this space.",
        },
      });
    }

    // Fetch current members of the project
    const memberUsers = uniqBy(
      (
        await concurrentExecutor(
          space.groups,
          (group) => group.getActiveMembers(auth),
          { concurrency: 2 }
        )
      ).flat(),
      "sId"
    );

    // Format members with mention syntax
    const formattedMembers = memberUsers.map((user) =>
      serializeMention({
        id: user.sId,
        type: "user",
        label: user.fullName() || user.email,
      })
    );

    return ctx.json({
      metadata: { ...metadata.toJSON(), members: formattedMembers },
    });
  }
);

export default app;
