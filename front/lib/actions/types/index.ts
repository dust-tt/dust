import type {
  ConversationType,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelConfigurationType,
  ModelId,
  SupportedFileContentType,
} from "@app/types";

export type ActionGeneratedFileType = {
  fileId: string;
  title: string;
  contentType: SupportedFileContentType;
  snippet: string | null;
};

export type ConversationBaseActionType =
  | "conversation_list_files_action"
  | "conversation_include_file_action";

export type BaseActionType =
  | "browse_action"
  | "dust_app_run_action"
  | "process_action"
  | "reasoning_action"
  | "retrieval_action"
  | "search_labels_action"
  | "tables_query_action"
  | "visualization_action"
  | "websearch_action"
  | ConversationBaseActionType;

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
