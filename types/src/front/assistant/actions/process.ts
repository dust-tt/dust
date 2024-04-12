import {
  DataSourceConfiguration,
  RetrievalQuery,
  RetrievalTimeframe,
  TimeFrame,
} from "../../../front/assistant/actions/retrieval";
import { ModelId } from "../../../shared/model_id";

export const ProcessSchemaPrimitiveTypes = ["string", "number", "boolean"];
export const ProcessSchemaListTypes = [];
export const ProcessSchemaPropertyAllTypes = [
  ...ProcessSchemaPrimitiveTypes,
  ...ProcessSchemaListTypes,
] as const;

// Properties in the process configuration table are stored as an array of objects.
export type ProcessSchemaPropertyType = {
  name: string;
  type: (typeof ProcessSchemaPropertyAllTypes)[number];
  description: string;
};

export type ProcessConfigurationType = {
  id: ModelId;
  sId: string;

  type: "process_configuration";

  dataSources: DataSourceConfiguration[];
  query: RetrievalQuery;
  relativeTimeFrame: RetrievalTimeframe;
  schema: ProcessSchemaPropertyType[];
};

export type ProcessActionType = {
  id: ModelId;

  type: "process_action";

  params: {
    relativeTimeFrame: TimeFrame | null;
    query: string | null;
  };
  outputs: unknown[] | null;
};
