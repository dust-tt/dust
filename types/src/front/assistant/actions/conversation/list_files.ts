import { BaseAction } from "../../../../front/assistant/actions/index";
import {
  ContentFragmentVersion,
  SupportedContentFragmentType,
} from "../../../../front/content_fragment";
import { ModelId } from "../../../../shared/model_id";

export type ConversationFileType = {
  contentFragmentId: string;
  title: string;
  contentType: SupportedContentFragmentType;
  contentFragmentVersion: ContentFragmentVersion;
  snippet: string | null;
  generatedTables: string[];
  isIncludable: boolean;
  isSearchable: boolean;
  isQueryable: boolean;
};

export interface ConversationListFilesActionType extends BaseAction {
  agentMessageId: ModelId;
  files: ConversationFileType[];
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
  type: "conversation_list_files_action";
}
