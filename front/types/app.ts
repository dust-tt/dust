import type { BlockType } from "./run";
import type { ModelId } from "./shared/model_id";
import type { SpaceType } from "./space";

export type AppVisibility = "private" | "deleted";

export const APP_NAME_REGEXP = /^[a-zA-Z0-9_-]{1,64}$/;

export type BlockRunConfig = {
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
  space: SpaceType;
};

export type SpecificationBlockType = {
  type: BlockType;
  name: string;

  spec: any;
  config: BlockRunConfig;
  indent: number | null;
};

export type SpecificationType = Array<SpecificationBlockType>;

// TODO Daph refactor this we could simplify this.
export type DustAppRunConfigurationType = {
  id: ModelId;
  sId: string;

  type: "dust_app_run_configuration";

  appWorkspaceId: string;
  appId: string;

  name: string;
  description: string | null;
};
