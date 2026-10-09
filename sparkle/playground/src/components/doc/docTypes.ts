// State of one document opened in the co-edition panel. Lives for the page
// session.

export interface DocAuthor {
  name: string;
  pictureUrl?: string;
}

export interface DocReply {
  id: string;
  author: DocAuthor;
  body: string;
  createdAt: Date;
  /** An agent's reply still being written ("Thinking…"). */
  pending?: boolean;
}

export interface DocComment {
  id: string;
  /** The text the comment is anchored to, as it was when commented. */
  quote: string;
  author: DocAuthor;
  body: string;
  createdAt: Date;
  replies: DocReply[];
  resolved: boolean;
  /**
   * A suggested edit (from someone who can't edit): the passage's proposed
   * new text. `body` is then an optional note.
   */
  suggestion?: {
    text: string;
    status: "pending" | "accepted" | "rejected";
  };
}

/** A comment being written, anchored on `quote`. */
export interface DocDraft {
  id: string;
  quote: string;
  /** A suggested edit rather than a comment. */
  suggest?: boolean;
}

export interface DocSession {
  /** The document as last loaded or edited by an agent. */
  savedMarkdown: string;
  /** Current content, including local manual edits. */
  markdown: string;
  /** Editor state, so comment anchors survive closing the panel. */
  editorJson: Record<string, unknown> | null;
  comments: DocComment[];
}
