import { ModelId } from "@app/lib/models";
import { BlockType } from "@app/types/run";

export type AppVisibility = "public" | "private" | "unlisted" | "deleted";

export type BlockRunConfig = {
  [key: string]: any;
};

export type AppType = {
  id: ModelId;
  uId: string;
  sId: string;
  name: string;
  description?: string;
  visibility: AppVisibility;
  savedSpecification?: string;
  savedConfig?: string;
  savedRun?: string;
  dustAPIProjectId: string;
};

export type SpecificationBlockType = {
  type: BlockType;
  name: string;
  spec: any;
  config: BlockRunConfig;
  indent?: number;
};

export type SpecificationType = Array<SpecificationBlockType>;
