import type {
  DataSourceType,
  DataSourceViewType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import {
  CoreAPI,
  DEFAULT_EMBEDDING_PROVIDER_ID,
  DEFAULT_QDRANT_CLUSTER,
  dustManagedCredentials,
  EMBEDDING_CONFIGS,
  isDataSourceNameValid,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { getDataSource } from "@app/lib/api/data_sources";
import { withSessionAuthenticationForWorkspaceAsUser } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

const PostStaticDataSourceRequestBodySchema = t.type({
  name: t.string,
  description: t.string,
  assistantDefaultSelected: t.boolean,
});

export type PostVaultDataSourceResponseBody = {
  dataSource: DataSourceType;
  dataSourceView: DataSourceViewType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostVaultDataSourceResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users of the current workspace can interact with vaults.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();
  const plan = auth.getNonNullablePlan();
  const user = auth.getNonNullableUser();

  const vault = await VaultResource.fetchById(auth, req.query.vId as string);

  if (!vault || !auth.hasPermission([vault.acl()], "write")) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "vault_not_found",
        message: "The vault you requested was not found.",
      },
    });
  }

  if (vault.isSystem()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Cannot post a static datasource in a system vault.`,
      },
    });
  }

  switch (req.method) {
    case "POST": {
      const bodyValidation = PostStaticDataSourceRequestBodySchema.decode(
        req.body
      );
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body to post a static data source: ${pathError}`,
          },
        });
      }

      const { name, description, assistantDefaultSelected } =
        bodyValidation.right;

      if (name.startsWith("managed-")) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The data source name cannot start with `managed-`.",
          },
        });
      }
      if (!isDataSourceNameValid(name)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Data source names must only contain letters, numbers, and the characters `._-`, and cannot be empty.",
          },
        });
      }
      const dataSources = await DataSourceResource.listByWorkspace(auth);
      if (
        plan.limits.dataSources.count != -1 &&
        dataSources.length >= plan.limits.dataSources.count
      ) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "plan_limit_error",
            message:
              "Your plan does not allow you to create managed data sources.",
          },
        });
      }

      const dataSourceEmbedder =
        owner.defaultEmbeddingProvider ?? DEFAULT_EMBEDDING_PROVIDER_ID;
      const embedderConfig = EMBEDDING_CONFIGS[dataSourceEmbedder];
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

      const dustProject = await coreAPI.createProject();
      if (dustProject.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to create internal project for the data source.`,
            data_source_error: dustProject.error,
          },
        });
      }

      const dustDataSource = await coreAPI.createDataSource({
        projectId: dustProject.value.project.project_id.toString(),
        dataSourceId: name,
        config: {
          qdrant_config: {
            cluster: DEFAULT_QDRANT_CLUSTER,
            shadow_write_cluster: null,
          },
          embedder_config: {
            embedder: {
              max_chunk_size: embedderConfig.max_chunk_size,
              model_id: embedderConfig.model_id,
              provider_id: embedderConfig.provider_id,
              splitter_id: embedderConfig.splitter_id,
            },
          },
        },
        credentials: dustManagedCredentials(),
      });

      if (dustDataSource.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to create the data source.",
            data_source_error: dustDataSource.error,
          },
        });
      }

      const dataSource = await DataSourceResource.makeNew(
        {
          name,
          description,
          dustAPIProjectId: dustProject.value.project.project_id.toString(),
          workspaceId: owner.id,
          assistantDefaultSelected,
          editedByUserId: user.id,
        },
        vault
      );

      const dataSourceView =
        await DataSourceViewResource.createViewInVaultFromDataSourceIncludingAllDocuments(
          dataSource.vault,
          dataSource
        );

      const dataSourceType = await getDataSource(auth, dataSource.name);
      if (dataSourceType) {
        void ServerSideTracking.trackDataSourceCreated({
          user,
          workspace: owner,
          dataSource: dataSourceType,
        });
      }

      return res.status(201).json({
        dataSource: dataSource.toJSON(),
        dataSourceView: dataSourceView.toJSON(),
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspaceAsUser(handler);
