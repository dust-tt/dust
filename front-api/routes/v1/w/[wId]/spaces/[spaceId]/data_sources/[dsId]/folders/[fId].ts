import apiConfig from "@app/lib/api/config";
import { resolveLegacyDataSourceSpaceId } from "@app/lib/api/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import type {
  DeleteFolderResponseType,
  GetFolderResponseType,
  UpsertFolderResponseType,
} from "@dust-tt/client";
import { UpsertDataSourceFolderRequestSchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */
const app = publicApiApp();

app.get("/", async (ctx): HandlerResult<GetFolderResponseType> => {
  const auth = ctx.get("auth");

  if (!auth.isSystemKey()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "invalid_oauth_token_error",
        message: "Only system keys are allowed to use this endpoint.",
      },
    });
  }

  const dsId = ctx.req.param("dsId");
  const fId = ctx.req.param("fId");
  if (!dsId || !fId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const dataSource = await DataSourceResource.fetchById(auth, dsId);
  const spaceId = await resolveLegacyDataSourceSpaceId(
    auth,
    ctx.req.param("spaceId"),
    dataSource
  );

  if (
    !dataSource ||
    dataSource.space.sId !== spaceId ||
    dataSource.space.isConversations() ||
    !dataSource.canReadOrAdministrate(auth)
  ) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
  const docRes = await coreAPI.getDataSourceFolder({
    projectId: dataSource.dustAPIProjectId,
    dataSourceId: dataSource.dustAPIDataSourceId,
    folderId: fId,
  });

  if (docRes.isErr()) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "data_source_error",
        message: "There was an error retrieving the data source folder.",
        data_source_error: docRes.error,
      },
    });
  }

  return ctx.json({
    folder: docRes.value.folder,
  });
});

app.post(
  "/",
  validate("json", UpsertDataSourceFolderRequestSchema),
  async (ctx): HandlerResult<UpsertFolderResponseType> => {
    const auth = ctx.get("auth");

    if (!auth.isSystemKey()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_oauth_token_error",
          message: "Only system keys are allowed to use this endpoint.",
        },
      });
    }

    const dsId = ctx.req.param("dsId");
    const fId = ctx.req.param("fId");
    if (!dsId || !fId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Invalid path parameters.",
        },
      });
    }

    const dataSource = await DataSourceResource.fetchById(auth, dsId);
    const spaceId = await resolveLegacyDataSourceSpaceId(
      auth,
      ctx.req.param("spaceId"),
      dataSource
    );

    if (
      !dataSource ||
      dataSource.space.sId !== spaceId ||
      dataSource.space.isConversations() ||
      !dataSource.canReadOrAdministrate(auth)
    ) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_not_found",
          message: "The data source you requested was not found.",
        },
      });
    }

    // To write we must have canWrite or be a systemAPIKey
    if (!(dataSource.canWrite(auth) || auth.isSystemKey())) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message: "You are not allowed to update data in this data source.",
        },
      });
    }

    const {
      timestamp,
      parent_id: parentId,
      parents,
      title,
      mime_type,
      source_url,
      provider_visibility,
    } = ctx.req.valid("json");
    if (parentId && parents && parents[1] !== parentId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid request body: parents[1] and parent_id should be equal`,
        },
      });
    }

    // Enforce parents consistency: we expect users to either not pass them (recommended) or pass them correctly.
    if (parents) {
      if (parents.length === 0) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid parents: parents must have at least one element.`,
          },
        });
      }
      if (parents[0] !== fId) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid parents: parents[0] should be equal to document_id.`,
          },
        });
      }
      if (
        (parents.length >= 2 || parentId !== null) &&
        parents[1] !== parentId
      ) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid parent id: parents[1] and parent_id should be equal.`,
          },
        });
      }
    }

    const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);

    // Create folder with the Dust internal API.
    const upsertRes = await coreAPI.upsertDataSourceFolder({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      folderId: fId,

      timestamp: timestamp || null,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      parentId: parentId || null,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      parents: parents || [fId],

      title: title.trim() || "Untitled Folder",
      mimeType: mime_type,
      sourceUrl: source_url ?? null,
      providerVisibility: provider_visibility,
    });

    if (upsertRes.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "There was an error upserting the folder.",
          data_source_error: upsertRes.error,
        },
      });
    }

    return ctx.json({
      folder: upsertRes.value.folder,
      data_source: dataSource.toJSON(),
    });
  }
);

app.delete("/", async (ctx): HandlerResult<DeleteFolderResponseType> => {
  const auth = ctx.get("auth");

  if (!auth.isSystemKey()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "invalid_oauth_token_error",
        message: "Only system keys are allowed to use this endpoint.",
      },
    });
  }

  const dsId = ctx.req.param("dsId");
  const fId = ctx.req.param("fId");
  if (!dsId || !fId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const dataSource = await DataSourceResource.fetchById(auth, dsId);
  const spaceId = await resolveLegacyDataSourceSpaceId(
    auth,
    ctx.req.param("spaceId"),
    dataSource
  );

  if (
    !dataSource ||
    dataSource.space.sId !== spaceId ||
    dataSource.space.isConversations() ||
    !dataSource.canReadOrAdministrate(auth)
  ) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  // To write we must have canWrite or be a systemAPIKey
  if (!(dataSource.canWrite(auth) || auth.isSystemKey())) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message: "You are not allowed to update data in this data source.",
      },
    });
  }

  const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
  const delRes = await coreAPI.deleteDataSourceFolder({
    projectId: dataSource.dustAPIProjectId,
    dataSourceId: dataSource.dustAPIDataSourceId,
    folderId: fId,
  });

  if (delRes.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "There was an error deleting the folder.",
        data_source_error: delRes.error,
      },
    });
  }

  return ctx.json({
    folder: {
      folder_id: fId,
    },
  });
});

export default app;
