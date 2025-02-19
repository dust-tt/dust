import { AIService } from "../services/ai";
import { SerpService } from "../services/serp";
import { FirecrawlService } from "../services/firecrawl";
import { ResearchAction } from "../services/ai";

export interface Topic {
  id: string;
  title: string;
  description: string;
  searchQueries: Array<{
    query: string;
    explanation: string;
  }>;
  status?: "exploring" | "completed" | "pending";
  tokenCount?: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type ProgressEventType =
  | "unified_spec"
  | "topic"
  | "complete"
  | "error"
  | "progress"
  | "clarifying_questions"
  | "connected"
  | "token_update"
  | "agent_status"
  | "content_extract"
  | "research_action"
  | "report_section"
  | "report_complete";

export interface ContentExtract {
  url: string;
  content: string;
  relevanceScore: number;
  extractedUrls: string[];
  contentTokenCount: number;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface Scratchpad {
  topicId: string;
  searchResults: SearchResult[];
  contentExtracts: ContentExtract[];
  browsedUrls: Set<string>;
  researchActions?: Array<{
    action: ResearchAction;
    topicId: string;
    timestamp: string;
    reason: string;
  }>;
}

export interface ExplorationResult {
  topic: Topic;
  relevantContent: ContentExtract[];
  scratchpad: Scratchpad;
}

export interface ResearchSpec {
  query: string;
  clarifications: Record<string, string>;
  unifiedIntent: string;
}

export interface ProgressEventData {
  topic?: Topic;
  subtopic?: Topic;
  url?: string;
  results?: ExplorationResult[];
  logs?: string[];
  tokenUsage?: TokenUsage;
  agentStatus?: string;
  searchResults?: SearchResult[];
  contentExtract?: ContentExtract;
  contentAnalysis?: {
    url: string;
    content: string;
    relevanceScore: number;
    explanation: string;
  };
  logEntry?: string;
  unifiedSpec?: ResearchSpec;
  questions?: string[];
  message?: string;
  progress?: number;
  researchAction?: {
    action: ResearchAction;
    topicId: string;
    timestamp: string;
    reason: string;
  };
  section?: {
    title: string;
    content: string;
    citations: Array<{
      url: string;
      title: string;
      snippet: string;
    }>;
  };
  sections?: Array<{
    title: string;
    content: string;
  }>;
}

export interface ProgressEvent {
  type: ProgressEventType;
  data?: ProgressEventData;
  error?: string;
}

export interface ResearchOptions {
  maxDepth?: number;
  answers?: Record<string, string>;
}

export interface ResearchServiceOptions {
  aiService?: AIService;
  serpService?: SerpService;
  firecrawlService?: FirecrawlService;
  maxDepth?: number;
  onProgress?: (event: ProgressEvent) => void;
  onUrlProcessing?: (url: string) => void;
  onTopicExploration?: (topic: Topic) => void;
  onSubtopicDiscovery?: (subtopic: Topic) => void;
  answers?: Record<string, string>;
}

export interface ResearchResponse {
  results: ExplorationResult[];
  logs?: string[];
}

export interface ResearchSubTopic {
  title: string;
  description: string;
}

export interface ResearchPlan {
  subTopics: ResearchSubTopic[];
}

export interface SearchQueryPlan {
  queries: Array<{
    query: string;
    explanation: string;
  }>;
}

export interface ResearchRequest {
  query: string;
  answers: Record<string, string>;
}
