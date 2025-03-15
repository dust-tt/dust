import type {
  DataSourceConfiguration,
  RetrievalTimeframe,
} from "@app/lib/actions/types/retrieval";
import type { ModelId, TimeFrame } from "@app/types";

import type { BaseAction } from "./index";

export const PROCESS_SCHEMA_ALLOWED_TYPES = [
  "string",
  "number",
  "boolean",
] as const;

// Properties in the process configuration table are stored as an array of objects.
export type ProcessSchemaPropertyType = {
  name: string;
  type: (typeof PROCESS_SCHEMA_ALLOWED_TYPES)[number];
  description: string;
};

export function renderSchemaPropertiesAsJSONSchema(
  schema: ProcessSchemaPropertyType[]
): { [name: string]: { type: string; description: string } } {
  let jsonSchema: { [name: string]: { type: string; description: string } } =
    {};

  if (schema.length > 0) {
    schema.forEach((f) => {
      jsonSchema[f.name] = {
        type: f.type,
        description: f.description,
      };
    });
  } else {
    // Default schema for extraction.
    jsonSchema = {
      required_data: {
        type: "string",
        description:
          "Minimal (short and concise) piece of information extracted to follow instructions",
      },
    };
  }

  return jsonSchema;
}

export type ProcessTagsFilter = {
  in: string[];
};

export type ProcessConfigurationType = {
  id: ModelId;
  sId: string;

  type: "process_configuration";

  dataSources: DataSourceConfiguration[];
  relativeTimeFrame: RetrievalTimeframe;
  schema: ProcessSchemaPropertyType[];

  name: string;
  description: string | null;
};

export type ProcessActionOutputsType = {
  data: unknown[];
  min_timestamp: number;
  total_documents: number;
  total_chunks: number;
  total_tokens: number;
};

// Use top_k of 768 as 512 worked really smoothly during initial tests. Might update to 1024 in the
// future based on user feedback.
export const PROCESS_ACTION_TOP_K = 768;

export interface ProcessActionType extends BaseAction {
  id: ModelId; // AgentProcessAction
  agentMessageId: ModelId; // AgentMessage

  params: {
    relativeTimeFrame: TimeFrame | null;
    tagsIn: string[] | null;
    tagsNot: string[] | null;
  };
  schema: ProcessSchemaPropertyType[];
  outputs: ProcessActionOutputsType | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
  type: "process_action";
}

/**
 * Process Action Events
 */

// Event sent before the execution with the finalized params to be used.
export type ProcessParamsEvent = {
  type: "process_params";
  created: number;
  configurationId: string;
  messageId: string;
  dataSources: DataSourceConfiguration[];
  action: ProcessActionType;
};

export type ProcessErrorEvent = {
  type: "process_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

export type ProcessSuccessEvent = {
  type: "process_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: ProcessActionType;
};
