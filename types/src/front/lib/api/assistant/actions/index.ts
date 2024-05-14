import { ModelId } from "../../../../../shared/model_id";
import {
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelMessageType,
} from "../generation";

type BaseActionType = "dust_app_run_action";

export abstract class BaseAction {
  readonly id: ModelId;
  readonly type: BaseActionType;

  constructor(id: ModelId, type: BaseActionType) {
    this.id = id;
    this.type = type;
  }

  abstract renderForModel(): ModelMessageType;
  abstract renderForFunctionCall(): FunctionCallType;
  abstract renderForMultiActionsModel(): FunctionMessageTypeModel;
}
