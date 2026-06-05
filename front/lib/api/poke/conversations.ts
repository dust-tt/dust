import type { AvailableTool } from "@app/lib/api/assistant/workspace_capabilities";
import type {
  ConversationVisibility,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";

export type PokeListConversationItem = ConversationWithoutContentType & {
  visibility?: ConversationVisibility;
};

export type PokeListConversations = {
  conversations: PokeListConversationItem[];
};

export type PokeGetConversationConfig = {
  conversationDataSourceId: string | null;
  langfuseUiBaseUrl: string | null;
  temporalWorkspace: string;
};

export interface ReinforcementTestCaseMockAction {
  functionCallName: string;
  status: "succeeded" | "failed";
  params?: Record<string, unknown>;
  output?: string | null;
}

export interface ReinforcementTestCaseMockFeedback {
  direction: "up" | "down";
  comment?: string;
}

export interface ReinforcementTestCaseMockMessage {
  role: "user" | "agent";
  content: string;
  feedback?: ReinforcementTestCaseMockFeedback;
  actions?: ReinforcementTestCaseMockAction[];
}

export interface ReinforcementTestCaseMockSkillTool {
  name: string;
  sId: string;
}

export interface ReinforcementTestCaseMockSkillConfig {
  name: string;
  sId: string;
  description?: string;
  instructions?: string;
  tools?: ReinforcementTestCaseMockSkillTool[];
}

export interface ReinforcementTestCaseWorkspaceContext {
  tools: AvailableTool[];
}

export interface ReinforcementTestCaseType {
  scenarioId: string;
  type: "analysis";
  skillConfigs: ReinforcementTestCaseMockSkillConfig[];
  conversation: ReinforcementTestCaseMockMessage[];
  workspaceContext: ReinforcementTestCaseWorkspaceContext;
  expectedToolCalls: [];
  judgeCriteria: string;
}

export type GetReinforcementTestCaseResponseBody = {
  testCase: ReinforcementTestCaseType;
};
