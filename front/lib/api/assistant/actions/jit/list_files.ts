import type {
  FunctionCallType,
  FunctionMessageTypeModel,
  JITFileType,
  JITListFilesConfigurationType,
  JITListFilesSuccessEvent,
  ModelId,
} from "@dust-tt/types";
import type { AgentActionSpecification } from "@dust-tt/types";
import type { Result } from "@dust-tt/types";
import {
  BaseAction,
  getTablesQueryResultsFileTitle,
  isAgentMessageType,
  isContentFragmentType,
  isTablesQueryActionType,
} from "@dust-tt/types";
import { Ok } from "@dust-tt/types";

import type { BaseActionRunParams } from "@app/lib/api/assistant/actions/types";
import { BaseActionConfigurationServerRunner } from "@app/lib/api/assistant/actions/types";
import type { Authenticator } from "@app/lib/auth";

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
    for (const file of this.files) {
      content += `${file}\n`;
    }

    return {
      role: "function" as const,
      name: this.functionCallName ?? "list_conversation_files",
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
      content,
    };
  }
}

/**
 * Params generation.
 */

export class JITListFileConfigurationServerRunner extends BaseActionConfigurationServerRunner<JITListFilesConfigurationType> {
  // Generates the action specification for generation of rawInputs passed to `run`.
  async buildSpecification(
    _auth: Authenticator,
    { name, description }: { name: string; description: string | null }
  ): Promise<Result<AgentActionSpecification, Error>> {
    return new Ok({
      name,
      description:
        description ||
        "Retrieve the list of files attached to the conversation",
      inputs: [],
    });
  }

  async *run(
    _auth: Authenticator,
    {
      agentConfiguration,
      conversation,
      agentMessage,
      functionCallId,
      step,
    }: BaseActionRunParams
  ): AsyncGenerator<JITListFilesSuccessEvent | void> {
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

    yield {
      type: "jit_list_files_success",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: new JITListFilesAction({
        functionCallId,
        functionCallName: "list_conversation_files",
        files: jitFiles,
        agentMessageId: agentMessage.agentMessageId,
        step: step,
      }),
    };
  }
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
