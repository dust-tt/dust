import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import {
  EXTRACT_DOCUMENT_TAKEAWAYS_FUNCTION_NAME,
  ExtractTakeawaysInputSchema,
} from "@app/lib/project_todo/analyze_document/types";
import type { JSONSchema7 } from "json-schema";
import zodToJsonSchema from "zod-to-json-schema";

export function buildSpec(): AgentActionSpecification {
  return {
    name: EXTRACT_DOCUMENT_TAKEAWAYS_FUNCTION_NAME,
    description:
      "Extract action items, notable facts, key decisions, and the topic from the document.",
    inputSchema: zodToJsonSchema(
      ExtractTakeawaysInputSchema
    ) as unknown as JSONSchema7,
  };
}
