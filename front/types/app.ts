import { ModelId } from "@app/lib/databases";
import { BlockType } from "@app/types/run";
export type AppVisibility = "public" | "private" | "unlisted" | "deleted";

export type BlockRunConfig = {
  [key: string]: any;
};

export type AppType = {
  id: ModelId;
  sId: string;
  name: string;
  description: string | null;
  visibility: AppVisibility;
  savedSpecification: string | null;
  savedConfig: string | null;
  savedRun: string | null;
  dustAPIProjectId: string;
};

export type SpecificationBlockType = {
  type: BlockType;
  name: string;
  spec: any;
  config: BlockRunConfig;
  indent: number | null;
};

export type SpecificationType = Array<SpecificationBlockType>;
