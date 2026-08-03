import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";

const WorkdayConnectionMetadataSchema = z.object({
  token_endpoint: z.string(),
});

// Workday OAuth and REST share host + tenant under /ccx/; the REST base swaps
// the oauth2/{tenant} segment for api/v1/{tenant}.
export function getApiBaseUrl(authInfo?: AuthInfo): Result<string, MCPError> {
  const parsed = WorkdayConnectionMetadataSchema.safeParse(authInfo?.extra);
  if (!parsed.success) {
    return new Err(
      new MCPError(
        "Workday connection metadata is missing or invalid. Please reconnect your Workday account."
      )
    );
  }

  const match = parsed.data.token_endpoint.match(
    /^(https:\/\/[^/]+)\/ccx\/oauth2\/([^/]+)\/token\/?$/
  );
  if (!match) {
    return new Err(
      new MCPError(
        `Unexpected Workday token endpoint format: cannot derive the REST API base URL from "${parsed.data.token_endpoint}".`
      )
    );
  }

  const [, origin, tenant] = match;
  return new Ok(`${origin}/ccx/api/v1/${tenant}`);
}

export async function withAuth(
  { authInfo }: ToolHandlerExtra,
  action: (
    accessToken: string,
    apiBaseUrl: string
  ) => Promise<ToolHandlerResult>
): Promise<ToolHandlerResult> {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return new Err(new MCPError("No Workday access token found."));
  }

  const apiBaseUrlRes = getApiBaseUrl(authInfo);
  if (apiBaseUrlRes.isErr()) {
    return apiBaseUrlRes;
  }

  return action(accessToken, apiBaseUrlRes.value);
}
