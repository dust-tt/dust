import { ModelId } from "../shared/model_id";
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
  space: SpaceType;
};
