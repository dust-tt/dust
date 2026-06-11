import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { EXA_TOOLS_METADATA } from "@app/lib/api/actions/servers/exa/metadata";
import logger from "@app/logger/logger";
import { dustManagedServiceCredentials } from "@app/types/api/credentials";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import Exa from "exa-js";

const credentials = dustManagedServiceCredentials();

async function exaSearch({
  query,
  num_results,
  type,
  category,
}: {
  query: string;
  num_results?: number;
  type?: "auto" | "instant" | "fast" | "deep-lite" | "deep" | "deep-reasoning";
  category: "people" | "company";
}) {
  if (!credentials.EXA_API_KEY) {
    return new Err(new MCPError("EXA_API_KEY is required for Exa search."));
  }
  const exa = new Exa(credentials.EXA_API_KEY);

  let res;
  try {
    res = await exa.search(query, {
      numResults: num_results ?? 5,
      type: type ?? "auto",
      category,
      contents: { highlights: true },
    });
  } catch (error) {
    logger.error({ error, category }, "Unexpected error on Exa search");
    return new Err(new MCPError(normalizeError(error).message));
  }

  return new Ok(
    res.results.map((result) => ({
      type: "resource" as const,
      resource: {
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.WEBSEARCH_RESULT,
        title: result.title ?? result.url ?? "Untitled result",
        text: result.highlights?.[0] ?? "",
        uri: result.url,
        reference: "",
      },
    }))
  );
}

const handlers: ToolHandlers<typeof EXA_TOOLS_METADATA> = {
  search_people: (params) => exaSearch({ ...params, category: "people" }),
  search_companies: (params) => exaSearch({ ...params, category: "company" }),
};

export const TOOLS = buildTools(EXA_TOOLS_METADATA, handlers);
