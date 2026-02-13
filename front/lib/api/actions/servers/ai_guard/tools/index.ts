import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolDefinition,
  ToolHandlerExtra,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AIGuardConfig } from "@app/lib/api/actions/servers/ai_guard/ai_guard_client";
import { evaluateWithAIGuard } from "@app/lib/api/actions/servers/ai_guard/ai_guard_client";
import { AI_GUARD_TOOLS_METADATA } from "@app/lib/api/actions/servers/ai_guard/metadata";
import { Err, normalizeError, Ok } from "@app/types";

const AIGuardEvaluationSchema = z
  .object({
    action: z.enum(["ALLOW", "DENY", "ABORT"]),
    reason: z.string(),
  })
  .strip();

function getConfigFromHeaders(
  authInfo: { extra?: Record<string, unknown> } | undefined,
  endpoint: string
): AIGuardConfig | null {
  const headers = (authInfo?.extra?.customHeaders ?? {}) as Record<
    string,
    string
  >;
  const apiKey = headers["DD-API-KEY"];
  const appKey = headers["DD-APPLICATION-KEY"];

  if (!apiKey || !appKey) {
    return null;
  }

  return { apiKey, appKey, endpoint };
}

async function handleAiGuard(
  endpoint: string,
  { message, raw_response }: { message: string; raw_response: boolean },
  extra: ToolHandlerExtra
) {
  const config = getConfigFromHeaders(extra.authInfo, endpoint);
  if (!config) {
    return new Err(
      new MCPError(
        "Datadog AI Guard requires DD-API-KEY and DD-APPLICATION-KEY custom headers. " +
          "Configure them in the tool settings."
      )
    );
  }

  const instructions =
    extra.agentLoopContext?.runContext?.agentConfiguration?.instructions ??
    "You are an AI Assistant";

  try {
    const result = await evaluateWithAIGuard(
      [
        { role: "system", content: instructions },
        { role: "user", content: message },
      ],
      config
    );

    if (raw_response) {
      return new Ok([{ type: "text" as const, text: JSON.stringify(result, null, 2) }]);
    }

    const parsed = AIGuardEvaluationSchema.safeParse(result);
    if (!parsed.success) {
      return new Err(
        new MCPError(
          `Datadog AI Guard returned invalid result: ${parsed.error.message}`
        )
      );
    }

    return new Ok([{ type: "text" as const, text: JSON.stringify(parsed.data, null, 2) }]);
  } catch (error) {
    return new Err(
      new MCPError(
        `Failed to evaluate prompt: ${normalizeError(error).message}`
      )
    );
  }
}

export function createAIGuardTools(endpoint: string): ToolDefinition[] {
  const handlers: ToolHandlers<typeof AI_GUARD_TOOLS_METADATA> = {
    ai_guard: (params, extra) => handleAiGuard(endpoint, params, extra),
  };

  return buildTools(AI_GUARD_TOOLS_METADATA, handlers);
}
