import { BlockType } from "../front/run";
import { VaultType } from "../front/vault";
import { ModelId } from "../shared/model_id";
export type AppVisibility = "private" | "deleted";

export type BlockRunConfig = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

export type AppType = {
  id: ModelId;
  sId: string;
  name: string;
  description: string | null;
  savedSpecification: string | null;
  savedConfig: string | null;
  savedRun: string | null;
  dustAPIProjectId: string;
  vault: VaultType;
};

export type SpecificationBlockType = {
  type: BlockType;
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spec: any;
  config: BlockRunConfig;
  indent: number | null;
};

export type SpecificationType = Array<SpecificationBlockType>;
