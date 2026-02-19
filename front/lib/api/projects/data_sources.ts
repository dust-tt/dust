import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Generates a unique data source name for project conversations connector.
 * Do NOT use this function to fetch the data source, use fetchProjectDataSource instead.
 */
export function getProjectConversationsDatasourceName(
  space: SpaceResource
): string {
  return `Project (${space.sId}): ${space.name}`;
}

export async function fetchProjectDataSource(
  auth: Authenticator,
  space: SpaceResource
): Promise<Result<DataSourceResource, DustError<"data_source_not_found">>> {
  const dataSources = await DataSourceResource.listBySpace(
    auth,
    space,
    undefined,
    "dust_project"
  );

  if (dataSources.length === 0) {
    return new Err(
      new DustError(
        "data_source_not_found",
        "No dust_project data source found for project space"
      )
    );
  }

  if (dataSources.length > 1) {
    logger.error(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        spaceId: space.sId,
        dataSources: dataSources.map((ds) => ds.sId),
      },
      "Multiple dust_project data sources found for project space, this should not happen. Fallback by returning the first one but this should be investigated."
    );
  }

  return new Ok(dataSources[0]);
}

export async function fetchProjectDataSourceView(
  auth: Authenticator,
  space: SpaceResource
): Promise<
  Result<
    DataSourceViewResource,
    DustError<"data_source_not_found" | "data_source_view_not_found">
  >
> {
  const r = await fetchProjectDataSource(auth, space);
  if (r.isErr()) {
    return new Err(r.error);
  }

  const dataSourceViews =
    await DataSourceViewResource.listForDataSourcesInSpace(
      auth,
      [r.value],
      space
    );

  if (dataSourceViews.length === 0) {
    return new Err(
      new DustError(
        "data_source_view_not_found",
        "No data source view found for project space"
      )
    );
  }

  if (dataSourceViews.length > 1) {
    logger.error(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        spaceId: space.sId,
        dataSourceViews: dataSourceViews.map((dsv) => dsv.sId),
      },
      "Multiple data source views found for project space, this should not happen. Fallback by returning the first one but this should be investigated."
    );
  }

  return new Ok(dataSourceViews[0]);
}
