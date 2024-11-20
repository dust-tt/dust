import {
  FunctionCallType,
  FunctionMessageTypeModel,
} from "../../../front/assistant/generation";
import { ModelConfigurationType } from "../../../front/lib/assistant";
import { ModelId } from "../../../shared/model_id";
import { ConversationType } from "../conversation";

type BaseActionType =
  | "dust_app_run_action"
  | "tables_query_action"
  | "retrieval_action"
  | "process_action"
  | "websearch_action"
  | "browse_action"
  | "visualization_action"
  | "conversation_list_files_action"
  | "conversation_include_file_action";

export abstract class BaseAction {
  readonly id: ModelId;
  readonly type: BaseActionType;

  constructor(id: ModelId, type: BaseActionType) {
    this.id = id;
    this.type = type;
  }

  abstract renderForFunctionCall(): FunctionCallType;
  abstract renderForMultiActionsModel({
    conversation,
    model,
  }: {
    conversation: ConversationType;
    model: ModelConfigurationType;
  }): Promise<FunctionMessageTypeModel>;
}
