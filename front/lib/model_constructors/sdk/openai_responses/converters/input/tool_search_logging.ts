import {
  logToolSearchRequest,
  logToolSearchResults,
} from "@app/lib/model_constructors/utils/tool_search_logging";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type {
  ResponseToolSearchCall,
  ResponseToolSearchOutputItem,
  Tool,
} from "openai/resources/responses/responses";

type OpenAIToolSearchItem =
  | ResponseToolSearchCall
  | ResponseToolSearchOutputItem;

interface OpenAIToolSearchLogContext {
  tags: string[];
  logFields: Record<string, unknown>;
}

function getToolReferences(tool: Tool): string[] {
  if (tool.type === "namespace") {
    return tool.tools.map((nestedTool) => `${tool.name}.${nestedTool.name}`);
  }

  return "name" in tool && isString(tool.name) ? [tool.name] : [];
}

export function logOpenAIToolSearchItem(
  item: OpenAIToolSearchItem,
  { tags, logFields }: OpenAIToolSearchLogContext
): void {
  switch (item.type) {
    case "tool_search_call": {
      logToolSearchRequest({
        providerName: "OpenAI",
        toolName: "tool_search",
        details: {
          itemId: item.id,
          callId: item.call_id,
          execution: item.execution,
          status: item.status,
          arguments: item.arguments,
        },
        tags,
        logFields,
      });
      break;
    }

    case "tool_search_output": {
      const toolReferences = item.tools.flatMap(getToolReferences);
      logToolSearchResults({
        providerName: "OpenAI",
        details: {
          itemId: item.id,
          callId: item.call_id,
          execution: item.execution,
          status: item.status,
          toolReferences,
          resultCount: toolReferences.length,
        },
        logFields,
      });
      break;
    }

    default:
      assertNever(item);
  }
}
