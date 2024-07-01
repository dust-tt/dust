import { ModelId } from "../../../../../shared/model_id";
import { FunctionCallType, FunctionMessageTypeModel } from "../generation";

type BaseActionType =
  | "dust_app_run_action"
  | "tables_query_action"
  | "retrieval_action"
  | "process_action"
  | "websearch_action"
  | "browse_action"
  | "visualization_action";

export abstract class BaseAction {
  readonly id: ModelId;
  readonly type: BaseActionType;

  constructor(id: ModelId, type: BaseActionType) {
    this.id = id;
    this.type = type;
  }

  abstract renderForFunctionCall(): FunctionCallType;
  abstract renderForMultiActionsModel(): FunctionMessageTypeModel;
}
