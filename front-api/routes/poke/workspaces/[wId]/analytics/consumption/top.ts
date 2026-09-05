import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionTopGroupsBodySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import type {
  ConsumptionScopeFilter,
  ConsumptionTopGroupSortBy,
  ConsumptionTopSortOrder,
} from "@app/lib/api/analytics/consumption/scope";
import type { GetConsumptionTopAgentsResponse } from "@app/lib/api/analytics/consumption/top_agents";
import type { GetConsumptionTopApiKeysResponse } from "@app/lib/api/analytics/consumption/top_api_keys";
import type { GetConsumptionTopGroupsResponse } from "@app/lib/api/analytics/consumption/top_groups";
import type { GetConsumptionTopModelsResponse } from "@app/lib/api/analytics/consumption/top_models";
import type { GetConsumptionTopReasoningEffortsResponse } from "@app/lib/api/analytics/consumption/top_reasoning_efforts";
import type { GetConsumptionTopSkillsResponse } from "@app/lib/api/analytics/consumption/top_skills";
import type { GetConsumptionTopSourcesResponse } from "@app/lib/api/analytics/consumption/top_sources";
import type { GetConsumptionTopToolsResponse } from "@app/lib/api/analytics/consumption/top_tools";
import type { GetConsumptionTopUsersResponse } from "@app/lib/api/analytics/consumption/top_users";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

type ConsumptionTopResponse =
  | GetConsumptionTopAgentsResponse
  | GetConsumptionTopApiKeysResponse
  | GetConsumptionTopGroupsResponse
  | GetConsumptionTopModelsResponse
  | GetConsumptionTopReasoningEffortsResponse
  | GetConsumptionTopSkillsResponse
  | GetConsumptionTopSourcesResponse
  | GetConsumptionTopToolsResponse
  | GetConsumptionTopUsersResponse;

type ConsumptionTopFetcher = (
  auth: Authenticator,
  input: {
    period: ConsumptionPeriod;
    limit: number;
    offset?: number;
    search?: string;
    filter?: ConsumptionScopeFilter;
    sortBy?: ConsumptionTopGroupSortBy;
    sortOrder?: ConsumptionTopSortOrder;
  }
) => Promise<Result<ConsumptionTopResponse, ElasticsearchError>>;

export function createConsumptionTopRoute({
  fetcher,
  failureMessage,
}: {
  fetcher: ConsumptionTopFetcher;
  failureMessage: string;
}) {
  const app = pokeApp();

  /** @ignoreswagger */
  app.post(
    "/",
    validate("json", ConsumptionTopGroupsBodySchema),
    async (ctx): HandlerResult<ConsumptionTopResponse> => {
      const auth = ctx.get("auth");
      const {
        limit,
        offset,
        search,
        filter,
        sortBy,
        sortOrder,
        ...periodQuery
      } = ctx.req.valid("json");

      const period = await resolveConsumptionPeriod(
        auth,
        toConsumptionPeriodInput(periodQuery)
      );

      const result = await fetcher(auth, {
        period,
        limit,
        offset,
        search,
        filter,
        ...(sortBy ? { sortBy } : {}),
        sortOrder,
      });
      if (result.isErr()) {
        return apiError(
          ctx,
          {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: failureMessage,
            },
          },
          result.error
        );
      }

      return ctx.json(result.value);
    }
  );

  return app;
}
