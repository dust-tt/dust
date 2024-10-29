import type {
  SupportedEnterpriseConnectionStrategies,
  WithAPIErrorResponse,
  WorkspaceEnterpriseConnection,
} from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import DataSource from "@app/components/app/blocks/DataSource";
import {
  createEnterpriseConnection,
  deleteEnterpriseConnection,
  getEnterpriseConnectionForWorkspace,
} from "@app/lib/api/enterprise_connection";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { TrackedDocument } from "@app/lib/models/doc_tracker";
import { Workspace, WorkspaceHasDomain } from "@app/lib/models/workspace";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

import config from "./api/config";

export type GetEnterpriseConnectionResponseBody = {
  connection: WorkspaceEnterpriseConnection;
};

const PostCreateEnterpriseConnectionRequestBodySchema = t.type({
  clientId: t.string,
  clientSecret: t.string,
  domain: t.string,
  // SAML creation is not supported yet.
  strategy: t.union([t.literal("okta"), t.literal("waad")]),
});

export type PostCreateEnterpriseConnectionRequestBodySchemaType = t.TypeOf<
  typeof PostCreateEnterpriseConnectionRequestBodySchema
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetEnterpriseConnectionResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `builders` for the current workspace can access this resource.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();
  const user = auth.user();

  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "The user was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      // TODO(DOC_TRACKER) workspace id
      const trackedDocuments = await TrackedDocument.findAll({
        where: {
          userId: user.id,
        },
      });
      const dataSourceMap = Object.fromEntries(
        (
          await DataSourceResource.fetchByModelIds(
            auth,
            trackedDocuments.map((td) => td.dataSourceId)
          )
        ).map((ds) => [ds.id, ds])
      );
      const coreApi = new CoreAPI(config.getCoreAPIConfig(), logger);
      const dataSourceDocuments = await Promise.all(
        trackedDocuments.map(async (td) => {
          const dataSource = await DataSource.findByPk(td.dataSourceId);
          const document = await coreApi.getDataSourceDocument({
            projectId: dataSource.dustAPIProjectId,
            dataSourceId: dataSource.dustAPIDataSourceId,
            documentId: td.documentId,
          });
        })
      );
      break;

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

export default withSessionAuthenticationForWorkspace(handler);
