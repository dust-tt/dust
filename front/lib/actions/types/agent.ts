import type { JSONSchema7 as JSONSchema } from "json-schema";

import type {
  MCPServerConfigurationType,
  MCPToolConfigurationType,
} from "@app/lib/actions/mcp";

/**
 * Agent Action configuration when setting up the agent.
 */
export type AgentActionConfigurationType = MCPServerConfigurationType;

/**
 * Action configuration type that can be used to run the action.
 */
export type ActionConfigurationType = MCPToolConfigurationType;

/**
 * Type guard to check if a value is of type ActionConfigurationType
 */
export function isActionConfigurationType(
  value: AgentActionConfigurationType | ActionConfigurationType
): value is ActionConfigurationType {
  switch (value.type) {
    case "mcp_configuration":
      return true;
    case "mcp_server_configuration":
      return false;
  }
}

// We need to apply "Omit" to each member of the union separately rather than the whole union
// because Omit<A | B, "k"> is different from Omit<A, "k"> | Omit<B, "k">.
// The first form loses the discriminated union properties needed for type narrowing.
type UnsavedConfiguration<T> = Omit<T, "id" | "sId" | "mcpServerName">;
export type UnsavedAgentActionConfigurationType = {
  [K in AgentActionConfigurationType["type"]]: UnsavedConfiguration<
    Extract<AgentActionConfigurationType, { type: K }>
  >;
}[AgentActionConfigurationType["type"]];

// Each AgentActionConfigurationType is capable of generating this type at runtime to specify which
// inputs should be generated by the model. As an example, to run the retrieval action for which the
// `relativeTimeFrame` has been specified in the configuration but for which the `query` is "auto",
// it would generate:
//
// ```
// { inputs: [{ name: "query", description: "...", type: "string" }]
// ```
//
// The params generator model for this action would be tasked to generate that query. If the
// retrieval configuration sets `relativeTimeFrame` to "auto" as well, we would get:
//
// ```
// {
//   inputs: [
//     { name: "query", description: "...", type: "string" },
//     { name: "relativeTimeFrame", description: "...", type: "string" },
//   ]
// }
// ```

export type DustAppRunInputType = {
  name: string;
  description: string;
  type: "string" | "number" | "boolean" | "array";
  items?: {
    type: "string" | "number" | "boolean";
  };
};

export type AgentActionSpecification = {
  name: string;
  description: string;
  inputSchema: JSONSchema;
};

export function dustAppRunInputsToInputSchema(
  inputs: DustAppRunInputType[]
): JSONSchema {
  const properties: JSONSchema["properties"] = {};
  for (const i of inputs) {
    properties[i.name] = {
      type: i.type,
      description: i.description,
      items: i.items,
    };
  }
  return {
    type: "object",
    properties: properties,
    required: inputs.map((i) => i.name),
  };
}

export function inputSchemaToDustAppRunInputs(
  inputSchema: JSONSchema
): DustAppRunInputType[] {
  return Object.entries(inputSchema.properties || {}).map(
    ([name, property]) => {
      let type: DustAppRunInputType["type"] = "string";
      let description: DustAppRunInputType["description"] = "";

      if (property !== null && typeof property === "object") {
        if (
          "type" in property &&
          typeof property.type === "string" &&
          ["string", "number", "boolean", "array"].includes(property.type)
        ) {
          type = property.type as DustAppRunInputType["type"];
        }
        if ("description" in property) {
          description =
            property.description as DustAppRunInputType["description"];
        }
      }

      return {
        name,
        type,
        description,
      };
    }
  );
}
