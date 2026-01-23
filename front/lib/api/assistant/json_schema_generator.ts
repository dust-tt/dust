import type { JSONSchema7 } from "json-schema";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { Authenticator } from "@app/lib/auth";
import { isJSONSchemaObject } from "@app/lib/utils/json_schemas";
import type {
  ModelConversationTypeMultiActions,
  ModelIdType,
  ModelProviderIdType,
  Result,
} from "@app/types";
import { Err, Ok, safeParseJSON } from "@app/types";

const PROMPT = `Based on the instructions provided, generate a JSON schema that will be embedded in the following JSON schema:
\`\`\`
{
  "name": "extract_data",
  "description": "Call this function with an array of extracted data points",
  "parameters": {
    "type": "object",
    "properties": {
      "schema": $SCHEMA,
      "description": "The schema following instructions."
    },
    "required": ["schema"]
  }
}
\`\`\`

$SCHEMA MUST be a valid JSON schema. Use only standard JSON Schema 7 core fields (type, properties, required, description) and avoid custom keywords or extensions that are not part of the core specification.

This schema will be used as signature to extract the relevant information based on selected documents to properly follow instructions.`;

const FUNCTION_NAME = "set_extraction_schema";

const specifications: AgentActionSpecification[] = [
  {
    name: FUNCTION_NAME,
    description:
      "Call this function to set the extraction schema to follow instructions.",
    inputSchema: {
      type: "object",
      properties: {
        schema: {
          type: "string",
          description:
            "The JSON schema to use for data extraction as stringified JSON",
        },
      },
      required: ["schema"],
    },
  },
];

export async function getBuilderJsonSchemaGenerator(
  auth: Authenticator,
  inputs: {
    instructions: string;
    modelId: ModelIdType;
    providerId: ModelProviderIdType;
  }
): Promise<Result<{ status: "ok"; schema: JSONSchema7 }, Error>> {
  const conversation: ModelConversationTypeMultiActions = {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: inputs.instructions }],
        name: "",
      },
    ],
  };
  const res = await runMultiActionsAgent(
    auth,
    {
      functionCall: FUNCTION_NAME,
      modelId: inputs.modelId,
      providerId: inputs.providerId,
      temperature: 0.7,
      useCache: false,
    },
    {
      conversation,
      prompt: PROMPT,
      specifications,
    },
    {
      context: {
        operationType: "process_schema_generator",
        userId: auth.user()?.sId,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
    }
  );

  if (res.isErr()) {
    return new Err(res.error);
  }

  const args = res.value.actions?.[0]?.arguments;
  if (!args || !("schema" in args) || !(typeof args.schema === "string")) {
    return new Err(
      new Error(
        `Error retrieving schema from arguments: ${JSON.stringify(args)}`
      )
    );
  }

  const parsedSchema = safeParseJSON(args.schema);

  if (
    parsedSchema.isErr() ||
    parsedSchema.value === null ||
    !isJSONSchemaObject(parsedSchema.value)
  ) {
    return new Err(
      new Error(`Error parsing schema from arguments: ${JSON.stringify(args)}`)
    );
  }

  return new Ok({
    status: "ok",
    schema: parsedSchema.value,
  });
}
