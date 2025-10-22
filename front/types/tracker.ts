import type {
  ModelIdType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";

import type { DataSourceViewSelectionConfigurations } from "./data_source_view";
import type { ModelId } from "./shared/model_id";
import type { SpaceType } from "./space";

type TrackerStatus = "active" | "inactive";

export type TrackerConfigurationType = {
  id: ModelId;
  sId: string;
  name: string;
  status: TrackerStatus;
  description: string | null;
  modelId: ModelIdType;
  providerId: ModelProviderIdType;
  temperature: number;
  prompt: string | null;
  frequency: string;
  skipEmptyEmails: boolean;
  recipients: string[];
  space: SpaceType;
  maintainedDataSources: TrackerDataSourceConfigurationType[];
  watchedDataSources: TrackerDataSourceConfigurationType[];
  generations?: TrackerGenerationToProcess[];
  createdAt: number;
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
  status: TrackerStatus;
  nameError: string | null;
  description: string | null;
  descriptionError: string | null;
  prompt: string | null;
  promptError: string | null;
  frequency: string;
  frequencyError: string | null;
  skipEmptyEmails: boolean;
  recipients: string | null;
  recipientsError: string | null;
  modelId: ModelIdType;
  providerId: ModelProviderIdType;
  temperature: number;
  maintainedDataSources: DataSourceViewSelectionConfigurations;
  watchedDataSources: DataSourceViewSelectionConfigurations;
};

export const TRACKER_FREQUENCIES = [
  { label: "Daily (Mon-Fri)", value: "0 17 * * 1-5" },
  { label: "Weekly on Monday", value: "0 17 * * 1" },
  { label: "Weekly on Tuesday", value: "0 17 * * 2" },
  { label: "Weekly on Wednesday", value: "0 17 * * 3" },
  { label: "Weekly on Thursday", value: "0 17 * * 4" },
  { label: "Weekly on Friday", value: "0 17 * * 5" },
];

export type TrackerIdWorkspaceId = {
  trackerId: number;
  workspaceId: string;
};

export type TrackerDataSource = {
  id: ModelId;
  name: string;
  dustAPIProjectId: string;
  dustAPIDataSourceId: string;
};

export type TrackerGenerationToProcess = {
  id: ModelId;
  content: string;
  thinking: string | null;
  documentId: string;
  dataSource: TrackerDataSource;
  maintainedDocumentDataSource: TrackerDataSource | null;
  maintainedDocumentId: string | null;
};
