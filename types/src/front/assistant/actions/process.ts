import {
  DataSourceConfiguration,
  RetrievalTimeframe,
  TimeFrame,
} from "../../../front/assistant/actions/retrieval";
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

export type ProcessConfigurationType = {
  id: ModelId;
  sId: string;

  type: "process_configuration";

  dataSources: DataSourceConfiguration[];
  relativeTimeFrame: RetrievalTimeframe;
  schema: ProcessSchemaPropertyType[];

  name: string | null;
  description: string | null;
  forceUseAtIteration: number | null;
};

export type ProcessActionOutputsType = {
  data: unknown[];
  minTimestamp: number;
  totalDocuments: number;
  totalChinks: number;
  totalTokens: number;
  skipDocuments: number;
  skipChunks: number;
  skipTokens: number;
};

export type ProcessActionType = {
  id: ModelId; // AgentProcessAction
  agentMessageId: ModelId; // AgentMessage

  type: "process_action";

  params: {
    relativeTimeFrame: TimeFrame | null;
  };
  schema: ProcessSchemaPropertyType[];
  outputs: ProcessActionOutputsType | null;
};
