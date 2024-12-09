import { ModelId } from "../shared/model_id";
import { ioTsEnum } from "../shared/utils/iots_utils";
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
  frequency: string | null;
  recipients: string[];
  space: SpaceType;
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
};

export const TRACKER_FREQUENCY_TYPES: TrackerFrequencyType[] = [
  "daily",
  "weekly",
  "monthly",
];
export type TrackerFrequencyType = "daily" | "weekly" | "monthly";

export const FrequencyCodec = ioTsEnum<
  (typeof TRACKER_FREQUENCY_TYPES)[number]
>(TRACKER_FREQUENCY_TYPES);
