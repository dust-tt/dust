import { BaseAction } from "../../../../front/lib/api/assistant/actions/index";
import { ModelId } from "../../../../shared/model_id";

export type JITFileType = {
  fileId: string;
  title: string;
  contentType: string;
};

export interface JITListFilesActionType extends BaseAction {
  agentMessageId: ModelId;
  files: JITFileType[];
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
  type: "jit_list_files_action";
}
