import type { BaseAction } from "@app/lib/actions/types";
import type {
  ContentFragmentVersion,
  SupportedContentFragmentType,
} from "@app/types";
import type { ModelId } from "@app/types";

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
