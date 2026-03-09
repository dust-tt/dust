import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { DatasourceRetrievalDocuments } from "@app/lib/api/assistant/observability/datasource_retrieval_documents";
import { fetchDatasourceRetrievalDocumentsMetrics } from "@app/lib/api/assistant/observability/datasource_retrieval_documents";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const QuerySchema = z.object({
  days: z.coerce.number().positive().default(DEFAULT_PERIOD_DAYS),
  version: z.string().optional(),
  // For servers with DB configurations, pass comma-separated config sIds.
  mcpServerConfigIds: z
    .string()
    .transform((val) => (val ? val.split(",") : []))
    .default(""),
  // For servers without DB configurations (like data_sources_file_system), pass server name.
  mcpServerName: z.string().optional(),
  dataSourceId: z.string().min(1),
  limit: z.coerce.number().positive().max(200).default(50),
});

export type GetDatasourceRetrievalDocumentsResponse =
  DatasourceRetrievalDocuments;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetDatasourceRetrievalDocumentsResponse>
  >,
  auth: Authenticator
) {
  const { aId } = req.query;
  if (!isString(aId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid agent configuration ID.",
      },
    });
  }

  const assistant = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });

  if (!assistant || (!assistant.canRead && !auth.isAdmin())) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent you're trying to access was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const q = QuerySchema.safeParse(req.query);
      if (!q.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${fromError(q.error).toString()}`,
          },
        });
      }

      const {
        days,
        version,
        mcpServerConfigIds,
        mcpServerName,
        dataSourceId,
        limit,
      } = q.data;

      const documentsResult = await fetchDatasourceRetrievalDocumentsMetrics(
        auth,
        {
          agentId: assistant.sId,
          days,
          version,
          mcpServerConfigIds,
          mcpServerName,
          dataSourceId,
          limit,
        }
      );

      if (documentsResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to retrieve datasource retrieval documents metrics: ${fromError(documentsResult.error).toString()}`,
          },
        });
      }

      return res.status(200).json(documentsResult.value);
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

export default withSessionAuthenticationForWorkspace(handler);
