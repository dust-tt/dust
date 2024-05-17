import {
  DataSourceConfiguration,
  RetrievalTimeframe,
  TimeFrame,
} from "../../../front/assistant/actions/retrieval";
import { BaseAction } from "../../../front/lib/api/assistant/actions/index";
import { ModelId } from "../../../shared/model_id";

// Properties in the process configuration table are stored as an array of objects.
export type ProcessSchemaPropertyType = {
  name: string;
  type: "string" | "number" | "boolean";
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
  tagsFilter: ProcessTagsFilter | null;
  schema: ProcessSchemaPropertyType[];

  name: string | null;
  description: string | null;
  forceUseAtIteration: number | null;
};

export type ProcessActionOutputsType = {
  data: unknown[];
  min_timestamp: number;
  total_documents: number;
  total_chunks: number;
  total_tokens: number;
  skip_documents: number;
  skip_chunks: number;
  skip_tokens: number;
};

// Use top_k of 512 which is already a large number. We might want to bump to 1024.
export const PROCESS_ACTION_TOP_K = 512;

export interface ProcessActionType extends BaseAction {
  id: ModelId; // AgentProcessAction
  agentMessageId: ModelId; // AgentMessage

  params: {
    relativeTimeFrame: TimeFrame | null;
  };
  schema: ProcessSchemaPropertyType[];
  outputs: ProcessActionOutputsType | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
}
