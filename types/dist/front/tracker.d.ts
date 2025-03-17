import { ModelId } from "../shared/model_id";
import { DataSourceViewSelectionConfigurations } from "./data_source_view";
import { ModelIdType, ModelProviderIdType } from "./lib/assistant";
import { SpaceType } from "./space";
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
export declare const TRACKER_FREQUENCIES: {
    label: string;
    value: string;
}[];
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
export {};
//# sourceMappingURL=tracker.d.ts.map