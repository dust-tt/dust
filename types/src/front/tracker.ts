import { ModelId } from "../shared/model_id";
import { DataSourceViewSelectionConfigurations } from "./data_source_view";
import { ModelIdType, ModelProviderIdType } from "./lib/assistant";
import { SpaceType } from "./space";

export type TrackerConfigurationType = {
  id: ModelId;
  sId: string;
  name: string;
  status: "active" | "inactive";
  description: string | null;
  modelId: ModelIdType;
  providerId: ModelProviderIdType;
  temperature: number;
  prompt: string | null;
  frequency: string;
  recipients: string[];
  space: SpaceType;
  maintainedDataSources: TrackerDataSourceConfigurationType[];
  watchedDataSources: TrackerDataSourceConfigurationType[];
  generations?: TrackerGenerationToProcess[];
};

export type TrackerDataSourceConfigurationType = {
  dataSourceViewId: string;
  filter: {
    parents: {
      in: string[];
      not: string[];
    } | null;
  };
};

export type TrackerConfigurationStateType = {
  name: string | null;
  nameError: string | null;
  description: string | null;
  descriptionError: string | null;
  prompt: string | null;
  promptError: string | null;
  frequency: string;
  frequencyError: string | null;
  recipients: string | null;
  recipientsError: string | null;
  modelId: ModelIdType;
  providerId: ModelProviderIdType;
  temperature: number;
  maintainedDataSources: DataSourceViewSelectionConfigurations;
  watchedDataSources: DataSourceViewSelectionConfigurations;
};

export const TRACKER_FREQUENCIES = [
  { label: "Daily", value: "0 17 * * 1-5" },
  { label: "Weekly", value: "0 17 * * 5" },
];

export type TrackerIdWorkspaceId = {
  trackerId: number;
  workspaceId: string;
};

export type TrackerGenerationToProcess = {
  id: ModelId;
  content: string;
  thinking: string | null;
  documentId: string;
  // TODO: Add info about the document.
};
