import { MCPError } from "@app/lib/actions/mcp_errors";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

export async function ensureAuthorizedDataSourceViews(
  auth: Authenticator,
  viewIds: string[]
): Promise<Result<DataSourceViewResource[], MCPError>> {
  const unique = [...new Set(viewIds)];
  const views = await DataSourceViewResource.fetchByIds(auth, unique);
  if (views.length !== unique.length || views.some((v) => !v.canRead(auth))) {
    return new Err(
      new MCPError("Access denied to one or more configured data sources.")
    );
  }
  return new Ok(views);
}
