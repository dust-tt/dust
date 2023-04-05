import { RunConfig, BlockType } from "@app/types/run";

export type AppVisibility = "public" | "private" | "unlisted";

export type AppType = {
  uId: string;
  sId: string;
  name: string;
  description: string;
  visibility: AppVisibility;
  savedSpecification: string;
  savedConfig: string;
  savedRun: string;
  dustAPIProjectId: string;
};

export type SpecificationBlockType = {
  type: BlockType;
  name: string;
  spec: any;
  config: RunConfig;
  indent?: number;
};

export type SpecificationType = Array<SpecificationBlockType>;
