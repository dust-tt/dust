import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";

import type { DataSourcesUsageByAgent } from "@app/lib/api/agent_data_sources";
import {
  getDataSourcesUsageByCategory,
  getDataSourceViewsUsageByCategory,
} from "@app/lib/api/agent_data_sources";
import { augmentDataSourceWithConnectorDetails } from "@app/lib/api/data_sources";
import { isManaged, isWebsite } from "@app/lib/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { ContentSchema } from "@app/types/api/internal/spaces";
import type { DataSourceViewCategory } from "@app/types/api/public/spaces";

import { spaceResource } from "@front-api/middleware/space_resource";
import { validate } from "@front-api/middleware/validator";

import dsvId from "./[dsvId]";

// Mounted under /api/w/:wId/spaces/:spaceId/data_source_views.
const app = new Hono();

app.get(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const category = c.req.query("category") as
      | DataSourceViewCategory
      | undefined;
    const withDetails = c.req.query("withDetails");
    const includeEditedBy = c.req.query("includeEditedBy");

    const dataSourceViews = (
      await DataSourceViewResource.listBySpace(auth, space, {
        includeEditedBy: !!includeEditedBy,
      })
    )
      .map((ds) => ds.toJSON())
      .filter((d) => !category || d.category === category);

    if (!withDetails) {
      return c.json({ dataSourceViews });
    }

    if (!category) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Cannot get details without specifying a category.",
        },
      });
    }

    let usages: DataSourcesUsageByAgent = {};
    if (space.isSystem()) {
      // In system spaces, reflect usage by data sources themselves (across all
      // spaces), then remap onto this space's views.
      const usagesByDataSources = await getDataSourcesUsageByCategory({
        auth,
        category,
      });
      dataSourceViews.forEach((dsView) => {
        usages[dsView.id] = usagesByDataSources[dsView.dataSource.id];
      });
    } else {
      usages = await getDataSourceViewsUsageByCategory({ auth, category });
    }

    const enhancedDataSourceViews = await Promise.all(
      dataSourceViews.map(async (dataSourceView) => {
        const dataSource = dataSourceView.dataSource;

        if (!isManaged(dataSource) && !isWebsite(dataSource)) {
          return {
            ...dataSourceView,
            dataSource: {
              ...dataSource,
              connectorDetails: { connector: null, connectorId: null },
              connector: null,
              fetchConnectorError: false,
              fetchConnectorErrorMessage: null,
            },
            usage: usages[dataSourceView.id] ?? { count: 0, agents: [] },
          };
        }

        const augmentedDataSource =
          await augmentDataSourceWithConnectorDetails(dataSource);
        return {
          ...dataSourceView,
          dataSource: augmentedDataSource,
          usage: usages[dataSourceView.id] ?? { count: 0, agents: [] },
        };
      })
    );
    return c.json({ dataSourceViews: enhancedDataSourceViews });
  }
);

app.post(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  validate("json", ContentSchema),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");

    if (!space.canAdministrate(auth)) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Only users that are `admins` can administrate spaces.",
        },
      });
    }

    const isSaveDataSourceViewsEnabled =
      await KillSwitchResource.isKillSwitchEnabled("save_data_source_views");
    if (isSaveDataSourceViewsEnabled) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "app_auth_error",
          message:
            "Saving data source views is temporarily disabled, try again later.",
        },
      });
    }

    const { dataSourceId, parentsIn } = c.req.valid("json");

    const dataSource = await DataSourceResource.fetchById(auth, dataSourceId);
    if (!dataSource) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid data source: ${dataSourceId}`,
        },
      });
    }

    const existing = await DataSourceViewResource.listForDataSourcesInSpace(
      auth,
      [dataSource],
      space
    );
    if (existing.length > 0) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `View already exists for data source: ${dataSourceId}`,
        },
      });
    }

    const dataSourceViewRes =
      await DataSourceViewResource.createViewInSpaceFromDataSource(
        auth,
        space,
        dataSource,
        parentsIn
      );
    if (dataSourceViewRes.isErr()) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message: dataSourceViewRes.error.message,
        },
      });
    }

    return c.json({ dataSourceView: dataSourceViewRes.value.toJSON() }, 201);
  }
);

app.route("/:dsvId", dsvId);

export default app;
