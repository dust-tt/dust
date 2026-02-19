import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { DatasourceRetrievalData } from "@app/lib/api/assistant/observability/datasource_retrieval";
import { fetchDatasourceRetrievalMetrics } from "@app/lib/api/assistant/observability/datasource_retrieval";
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

export type PokeGetDatasourceRetrievalResponse = {
  datasources: DatasourceRetrievalData[];
  total: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PokeGetDatasourceRetrievalResponse>
  >,
  session: SessionWithUser
): Promise<void> {
  const { wId, aId } = req.query;
  if (!isString(wId) || !isString(aId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace or agent ID.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);
  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
  }

  const assistant = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });

  if (!assistant) {
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

      const days = q.data.days;

      const datasourceRetrievalResult = await fetchDatasourceRetrievalMetrics(
        auth,
        {
          agentId: assistant.sId,
          days,
        }
      );

      if (datasourceRetrievalResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to retrieve datasource retrieval metrics: ${fromError(datasourceRetrievalResult.error).toString()}`,
          },
        });
      }

      const datasources = datasourceRetrievalResult.value;
      const total = datasources.reduce((sum, ds) => sum + ds.count, 0);

      return res.status(200).json({
        datasources,
        total,
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

export default withSessionAuthenticationForPoke(handler);
