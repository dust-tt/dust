// What the co-edition playground is made of: conversations with agents, and
// the documents they write.

export interface ChatAgent {
  id: string;
  name: string;
  description: string;
  pictureUrl: string;
}

export interface ToolStep {
  name: string;
  status: "running" | "done";
}

/** A document an agent wrote in a conversation, keyed by its file name. */
export interface ChatFile {
  key: string;
  title: string;
  contentType: string;
  createdAt: Date;
}

export type ChatMessage =
  | { id: string; role: "user"; content: string; createdAt: Date }
  | {
      id: string;
      role: "agent";
      agent: ChatAgent;
      content: string;
      tools: ToolStep[];
      files: ChatFile[];
      status: "streaming" | "done";
      createdAt: Date;
    };

export type AgentMessage = Extract<ChatMessage, { role: "agent" }>;

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  isRunning: boolean;
}

/** A request from a document's comment thread. */
export interface CommentRequest {
  agentName: string;
  fileKey: string;
  /** The document as it is now, with the user's edits. */
  markdown: string;
  /** The commented passage. */
  passage: string;
  request: string;
}

export interface Conversations {
  agents: ChatAgent[];
  conversations: Conversation[];
  active: Conversation;
  setActiveId: (id: string) => void;
  startNewConversation: () => void;
  /**
   * Sends `text` to `agent`. With a document open, the agent may edit it:
   * `openDocument` is its current content.
   */
  send: (
    conversation: Conversation,
    text: string,
    agent: ChatAgent,
    openDocument?: { fileKey: string; markdown: string }
  ) => Promise<void>;
  /** Asks an agent from a comment; resolves with its reply and the document. */
  askFromComment: (
    conversation: Conversation,
    request: CommentRequest
  ) => Promise<{ reply: string; markdown: string }>;
  /** A document's current content. */
  readFile: (conversation: Conversation, fileKey: string) => Promise<string>;
}
