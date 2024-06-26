import { ModelId } from "../../../shared/model_id";
import { BaseAction } from "../../lib/api/assistant/actions";

export type CodeInterpreterRuntypeEnvironmentType =
  | "javascript"
  | "javascript_with_react"
  | "python";

// Configuration
export type CodeInterpreterConfigurationType = {
  id: ModelId; // AgentCodeInterpreterConfiguration ID
  sId: string;
  type: "code_interpreter_configuration";
  runtimeEnvironment: CodeInterpreterRuntypeEnvironmentType;
  name: string;
  description: string | null;
};

// Dust App output
export type CodeInterpreterActionOutputType = {
  code: string;
};

// Action execution
export interface CodeInterpreterActionType extends BaseAction {
  agentMessageId: ModelId;
  query: string;
  output: CodeInterpreterActionOutputType | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
  type: "code_interpreter_action";
}
