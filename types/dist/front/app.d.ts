import { BlockType } from "../front/run";
import { ModelId } from "../shared/model_id";
import { SpaceType } from "./space";
export type AppVisibility = "private" | "deleted";
export declare const APP_NAME_REGEXP: RegExp;
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
//# sourceMappingURL=app.d.ts.map