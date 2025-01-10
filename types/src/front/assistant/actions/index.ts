import {
  FunctionCallType,
  FunctionMessageTypeModel,
} from "../../../front/assistant/generation";
import { ModelConfigurationType } from "../../../front/lib/assistant";
import { ModelId } from "../../../shared/model_id";
import { SupportedFileContentType } from "../../files";
import { ConversationType } from "../conversation";

export type ActionGeneratedFileType = {
  fileId: string;
  title: string;
  contentType: SupportedFileContentType;
  snippet: string | null;
};

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
  readonly generatedFiles: ActionGeneratedFileType[];

  constructor(
    id: ModelId,
    type: BaseActionType,
    generatedFiles: ActionGeneratedFileType[] = []
  ) {
    this.id = id;
    this.type = type;
    this.generatedFiles = generatedFiles;
  }

  getGeneratedFiles(): ActionGeneratedFileType[] {
    return this.generatedFiles;
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
