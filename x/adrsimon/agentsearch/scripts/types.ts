export type SpaceKind =
  | "global"
  | "system"
  | "conversations"
  | "regular"
  | "project";

export interface AgentGroupUsage {
  groupId: string;
  groupName: string;
  messages: number;
  users: number;
}

export interface AgentUsage {
  periodDays: number;
  messages: number;
  conversations: number;
  users: number;
  credits: number;
  feedbacksUp: number;
  feedbacksDown: number;
  byGroup: AgentGroupUsage[];
}

export interface ExportedAgent {
  sId: string;
  name: string;
  description: string;
  instructions: string | null;
  scope: "global" | "visible" | "hidden";
  status: string;
  tags: string[];
  templateId: string | null;
  author: string | null;
  editors: string[];
  requestedSpaceIds: string[];
  spaces: { sId: string; name: string | null; kind: SpaceKind | null }[];
  nonPodSpaceIds: string[];
  podSpaceIds: string[];
  usage: AgentUsage;
}

export interface WorkspaceAgentExport {
  workspaceId: string;
  workspaceName: string;
  generatedAt: string;
  usagePeriodDays: number;
  agentCount: number;
  agents: ExportedAgent[];
}

export interface AgentSearchDocument {
  agent_id: string;
  name: string;
  description: string;
  instructions: string | null;
  tags: string[];
  scope: string;
  status: string;
  author: string | null;
  editors: string[];
  non_pod_space_ids: string[];
  non_pod_space_count: number;
  pod_space_ids: string[];
  pod_space_count: number;
  usage: {
    messages: number;
    conversations: number;
    users: number;
    credits: number;
    feedbacks_up: number;
    feedbacks_down: number;
    by_group: {
      group_id: string;
      group_name: string;
      messages: number;
      users: number;
    }[];
  };
}

export interface ProfileSpace {
  sId: string;
  name: string;
  kind: SpaceKind;
}

export interface UserProfile {
  workspaceId: string;
  workspaceName: string;
  generatedAt: string;
  user: { sId: string; email: string; fullName: string };
  role: string;
  groupIds: string[];
  groups: { sId: string; name: string; kind: string }[];
  readableNonPodSpaces: ProfileSpace[];
  readablePodSpaces: ProfileSpace[];
}

export type QueryKind =
  | "name_exact"
  | "name_words"
  | "name_prefix"
  | "name_typo"
  | "name_transpose"
  | "desc_terms"
  | "desc_phrase";

export interface EvalQuery {
  query: string;
  kind: QueryKind;
  targetId: string;
  targetName: string;
}

export interface EvalNegative {
  query: string;
  kind: "oov" | "chimera";
  sources: string[];
}

export interface EvalQuerySet {
  generatedAt: string;
  index: string;
  profile: string | null;
  excludeGlobal: boolean;
  candidateCount: number;
  queries: EvalQuery[];
  negatives: EvalNegative[];
}

export interface EvalMetrics {
  queries: number;
  mrr: number;
  recallAt1: number;
  recallAt5: number;
  recallAt10: number;
  hits: number;
  coverage: number;
  junk: number;
  junkHits: number;
}

export interface NegativeMetrics {
  queries: number;
  meanHits: number;
  zeroHitRate: number;
}

export interface EvalReport {
  ranAt: string;
  querySet: string;
  groupBoost: number;
  excludeGlobal: boolean;
  includeInstructions: boolean;
  minShouldMatch: string;
  matchMode: string;
  nameFallback: string;
  overall: EvalMetrics;
  byKind: Record<string, EvalMetrics>;
  negatives: Record<string, NegativeMetrics>;
}
