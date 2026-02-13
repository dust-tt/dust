import { MCPError } from "@app/lib/actions/mcp_errors";
import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { getCoreSearchArgs } from "@app/lib/actions/mcp_internal_actions/tools/utils";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { TextContent } from "@modelcontextprotocol/sdk/types.js";
import trim from "lodash/trim";

const DEFAULT_SEARCH_LABELS_UPPER_LIMIT = 2000;

export async function executeFindTags(
  auth: Authenticator,
  query: string,
  dataSources: DataSourcesToolConfigurationType
): Promise<Result<TextContent[], MCPError>> {
  const coreSearchArgsResults = await concurrentExecutor(
    dataSources,
    async (dataSourceConfiguration) =>
      getCoreSearchArgs(auth, dataSourceConfiguration),
    { concurrency: 10 }
  );

  if (coreSearchArgsResults.some((res) => res.isErr())) {
    return new Err(
      new MCPError(
        "Invalid data sources: " +
          removeNulls(
            coreSearchArgsResults.map((res) => (res.isErr() ? res.error : null))
          )
            .map((error) => error.message)
            .join("\n")
      )
    );
  }

  const coreSearchArgs = removeNulls(
    coreSearchArgsResults.map((res) => (res.isOk() ? res.value : null))
  );

  if (coreSearchArgs.length === 0) {
    return new Err(
      new MCPError(
        "Search action must have at least one data source configured.",
        {
          tracked: false,
        }
      )
    );
  }

  const dataSourceViews = coreSearchArgs.map((arg) => arg.dataSourceView);

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  let result = await coreAPI.searchTags({
    dataSourceViews,
    query,
    queryType: "match",
  });

  if (result.isErr()) {
    return new Err(new MCPError("Error searching for labels"));
  }

  if (result.value.tags.length === 0) {
    // Performing an additional search with a higher limit to catch uncommon tags.
    result = await coreAPI.searchTags({
      dataSourceViews,
      limit: DEFAULT_SEARCH_LABELS_UPPER_LIMIT,
      query,
      queryType: "match",
    });

    if (result.isErr()) {
      return new Err(new MCPError("Error searching for labels"));
    }
  }

  if (result.value.tags.length === 0) {
    return new Ok([
      {
        type: "text",
        text: "No labels found matching the search criteria.",
      },
    ]);
  }

  return new Ok([
    {
      type: "text",
      text:
        "Labels found:\n\n" +
        removeNulls(
          result.value.tags.map((tag) =>
            tag.tag && trim(tag.tag)
              ? `${tag.tag} (${tag.match_count} matches)`
              : null
          )
        ).join("\n"),
    },
  ]);
}
