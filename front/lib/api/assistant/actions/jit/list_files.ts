import type {
  AgentMessageType,
  ConversationType,
  FunctionCallType,
  FunctionMessageTypeModel,
  JITFileType,
  JITListFilesActionType,
  ModelId,
} from "@dust-tt/types";
import {
  BaseAction,
  getTablesQueryResultsFileTitle,
  isAgentMessageType,
  isContentFragmentType,
  isTablesQueryActionType,
} from "@dust-tt/types";

interface JITListFilesActionBlob {
  agentMessageId: ModelId;
  functionCallId: string | null;
  functionCallName: string | null;
  files: JITFileType[];
  step: number;
}

export class JITListFilesAction extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly files: JITFileType[];
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number;
  readonly type = "jit_list_files_action";

  constructor(blob: JITListFilesActionBlob) {
    super(-1, "jit_list_files_action");

    this.agentMessageId = blob.agentMessageId;
    this.files = blob.files;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
  }

  renderForFunctionCall(): FunctionCallType {
    return {
      id: this.functionCallId ?? `call_${this.id.toString()}`,
      name: this.functionCallName ?? "list_conversation_files",
      arguments: JSON.stringify({}),
    };
  }

  renderForMultiActionsModel(): FunctionMessageTypeModel {
    let content = "CONVERSATION FILES:\n";
    for (const f of this.files) {
      content += `<file id="${f.fileId}" name="${f.title}" type="${f.contentType}" />\n`;
    }

    return {
      role: "function" as const,
      name: this.functionCallName ?? "list_conversation_files",
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
      content,
    };
  }
}

export function makeJITListFilesAction(
  step: number,
  agentMessage: AgentMessageType,
  conversation: ConversationType
): JITListFilesActionType | null {
  const jitFiles: JITFileType[] = [];

  for (const m of conversation.content.flat(1)) {
    if (isContentFragmentType(m)) {
      if (m.fileId) {
        jitFiles.push({
          fileId: m.fileId,
          title: m.title,
          contentType: m.contentType,
        });
      }
    } else if (isAgentMessageType(m)) {
      for (const a of m.actions) {
        if (isTablesQueryActionType(a)) {
          if (a.resultsFileId && a.resultsFileSnippet) {
            jitFiles.push({
              fileId: a.resultsFileId,
              contentType: "text/csv",
              title: getTablesQueryResultsFileTitle({ output: a.output }),
            });
          }
        }
      }
    }
  }

  if (jitFiles.length === 0) {
    return null;
  }

  return new JITListFilesAction({
    functionCallId: "call_" + Math.random().toString(36).substring(7),
    functionCallName: "list_conversation_files",
    files: jitFiles,
    agentMessageId: agentMessage.agentMessageId,
    step: step,
  });
}

/**
 * Action rendering.
 */

// JITListFilesAction are never stored in DB so they are never rendered to the user.
export async function jitListFilesTypesFromAgentMessageIds(): Promise<
  JITListFilesAction[]
> {
  return [];
}
