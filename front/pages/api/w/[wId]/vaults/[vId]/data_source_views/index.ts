import type {
  DataSourceViewCategory,
  DataSourceViewsWithDetails,
  DataSourceViewType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { PostDataSourceViewSchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import type { DataSourcesUsageByAgent } from "@app/lib/api/agent_data_sources";
import {
  getDataSourcesUsageByCategory,
  getDataSourceViewsUsageByCategory,
} from "@app/lib/api/agent_data_sources";
import { augmentDataSourceWithConnectorDetails } from "@app/lib/api/data_sources";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { isManaged } from "@app/lib/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { apiError } from "@app/logger/withlogging";

export type GetVaultDataSourceViewsResponseBody<
  IncludeDetails extends boolean = boolean,
> = {
  dataSourceViews: IncludeDetails extends true
    ? DataSourceViewsWithDetails[]
    : DataSourceViewType[];
};

export type PostVaultDataSourceViewsResponseBody = {
  dataSourceView: DataSourceViewType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetVaultDataSourceViewsResponseBody | PostVaultDataSourceViewsResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const vault = await VaultResource.fetchById(auth, req.query.vId as string);

  if (!vault || !vault.canList(auth)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "vault_not_found",
        message: "The vault you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const category =
        req.query.category && typeof req.query.category === "string"
          ? (req.query.category as DataSourceViewCategory)
          : null;

      const dataSourceViews = (
        await DataSourceViewResource.listByVault(auth, vault, {
          includeEditedBy: !!req.query.includeEditedBy,
        })
      )
        .map((ds) => ds.toJSON())
        .filter((d) => !category || d.category === category);

      if (!req.query.withDetails) {
        return res.status(200).json({
          dataSourceViews,
        });
      } else {
        if (!category) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Cannot get details without specifying a category.",
            },
          });
        }

        let usages: DataSourcesUsageByAgent = {};

        if (vault.isSystem()) {
          // In case of system vault, we want to reflect the usage by datasources themselves so we get usage accross all vaults
          const usagesByDataSources = await getDataSourcesUsageByCategory({
            auth,
            category,
          });

          // Then we remap to the dataSourceViews of the system vaults
          dataSourceViews.forEach((dsView) => {
            usages[dsView.id] = usagesByDataSources[dsView.dataSource.id];
          });
        } else {
          // Directly take the usage by dataSourceViews
          usages = await getDataSourceViewsUsageByCategory({
            auth,
            category,
          });
        }

        const enhancedDataSourceViews: GetVaultDataSourceViewsResponseBody<true>["dataSourceViews"] =
          await Promise.all(
            dataSourceViews.map(async (dataSourceView) => {
              const dataSource = dataSourceView.dataSource;

              if (!isManaged(dataSource)) {
                return {
                  ...dataSourceView,
                  dataSource: {
                    ...dataSource,
                    // As it's not managed, we don't have any connector details
                    connectorDetails: { connector: null, connectorId: null },
                    connector: null,
                    fetchConnectorError: false,
                    fetchConnectorErrorMessage: null,
                  },
                  usage: usages[dataSourceView.id] || {
                    count: 0,
                    agentNames: [],
                  },
                };
              }

              const augmentedDataSource =
                await augmentDataSourceWithConnectorDetails(dataSource);
              return {
                ...dataSourceView,
                dataSource: augmentedDataSource,
                usage: usages[dataSourceView.id] || {
                  count: 0,
                  agentNames: [],
                },
              };
            })
          );
        return res.status(200).json({
          dataSourceViews: enhancedDataSourceViews,
        });
      }
    }

    case "POST": {
      if (!auth.isAdmin() || !auth.isBuilder()) {
        // Only admins, or builders who have to the vault, can create a new view
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "Only users that are `admins` or `builder` can administrate vaults.",
          },
        });
      }

      const bodyValidation = PostDataSourceViewSchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const { name, parentsIn } = bodyValidation.right;

      // Create a new view
      const dataSource = await DataSourceResource.fetchByNameOrId(auth, name, {
        // TODO(DATASOURCE_SID): Clean-up
        origin: "data_source_view_create",
      });
      if (!dataSource) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid data source: ${name}`,
          },
        });
      }
      const existing = await DataSourceViewResource.listForDataSourcesInVault(
        auth,
        [dataSource],
        vault
      );
      if (existing.length > 0) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `View already exists for data source: ${name}`,
          },
        });
      }
      const dataSourceView =
        await DataSourceViewResource.createViewInVaultFromDataSource(
          auth,
          vault,
          dataSource,
          parentsIn
        );
      return res.status(201).json({
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

export default withSessionAuthenticationForWorkspace(handler);
