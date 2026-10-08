import {
  AlertCircle,
  Button,
  Check,
  cn,
  ContentMessage,
  DotsHorizontal,
  Download01,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  MessageCircle01,
  MessagePlusCircle,
  Pencil01,
  Robot,
  Spinner,
} from "@dust-tt/sparkle";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { usePanelFullscreen } from "../PanelLayout";
import { CommentsPanel } from "./CommentsPanel";
import { DocEditor, type DocEditorHandle } from "./DocEditor";
import { type Presence, presenceColor, PresenceLayer } from "./Presence";
import { GlintOutline } from "./GlintOutline";
import {
  CommentMarkers,
  CommentsListPopover,
  FloatingComments,
} from "./FloatingComments";
import { seedCommentsFor, WORKSPACE_PEOPLE, YOU } from "./docSeeds";
import { type MentionCandidates, MentionProvider } from "./MentionMenu";
import { narrowSuggestion, SuggestionProvider } from "./Suggestions";
import type {
  DocAuthor,
  DocComment,
  DocDraft,
  DocReply,
  DocSession,
} from "./docTypes";
import { DOC_PAGE } from "./docTypography";

// Co-edition panel: one document that the user edits by hand (DocEditor),
// comments on (CommentsPanel) and asks the agent to edit (AgentEdit). Each of
// the three lives in its own file so design variations can be swapped in
// independently.

// An agent reply, as plain text for a comment thread (no markdown emphasis).
function toThreadText(reply: string): string {
  return reply.replace(/\*\*|__/g, "").trim();
}

// Markdown → the text the editor shows (for matching comment anchors).
function plainText(markdown: string): string {
  return markdown
    .replace(/^\s*(#{1,6}|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * When `quote` no longer exists after an edit, the first block the edit
 * changed is taken as its new version; null if the quote survived.
 */
function rewrittenPassage(
  before: string,
  after: string,
  quote: string
): string | null {
  if (plainText(after).includes(quote)) {
    return null;
  }
  const blocks = (md: string) =>
    md
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean);
  const previous = new Set(blocks(before));
  const changed = blocks(after).find((b) => !previous.has(b));
  return changed ? plainText(changed) : null;
}

// Marks the display-only transactions of an edit replay.
const REPLAY_META = "agentEditReplay";

type EditorView = NonNullable<ReturnType<DocEditorHandle["getView"]>>;

/** The index `count` words away from `index` in `text` (towards `step`). */
function skipWords(text: string, index: number, step: 1 | -1, count: number) {
  let i = index;
  const at = () => (step > 0 ? text[i] : text[i - 1]);
  const inText = () => (step > 0 ? i < text.length : i > 0);
  for (let n = 0; n < count; n++) {
    while (inText() && /\s/.test(at())) {
      i += step;
    }
    while (inText() && !/\s/.test(at())) {
      i += step;
    }
  }
  return i;
}

/**
 * Scrolls the text block holding `pos` to the middle of `area` unless it is
 * already in view. Returns whether it scrolled.
 */
function revealBlock(view: EditorView, pos: number, area: HTMLElement | null) {
  const element = view.nodeDOM(view.state.doc.resolve(pos).before());
  if (!(element instanceof HTMLElement) || !area) {
    return false;
  }
  const box = element.getBoundingClientRect();
  const bounds = area.getBoundingClientRect();
  if (box.top > bounds.top + 40 && box.bottom < bounds.bottom - 40) {
    return false;
  }
  element.scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}

// What simulated suggestions add to the end of a sentence.
const SIMULATED_SUGGESTIONS = [
  ", based on our latest owner survey",
  " (to confirm with the finance team)",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// What the simulated collaborator types (prototype only).
const SIMULATED_EDITS = [
  " Let's validate this with 20 puppy owners before launch.",
  " (To confirm with the finance team this week.)",
  " We could also partner with two local trainers for the pilot.",
  " I'd add a line on sustainable packaging here.",
];

// What the simulated agent adds to the paragraph it rewrites.
const SIMULATED_AGENT_EDITS = [
  " Early tests show puppies finish these treats in under a minute.",
  " This matches what owners told us in the last survey.",
];

function normalize(markdown: string): string {
  return markdown.replace(/[ \t]+$/gm, "").trim();
}

function downloadMarkdown(fileName: string, markdown: string) {
  const url = URL.createObjectURL(
    new Blob([markdown], { type: "text/markdown;charset=utf-8" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** What a comment thread asks an agent (see `askAgent`). */
export interface DocAgentRequest {
  agentName: string;
  /** The document as it is now, with the user's edits. */
  markdown: string;
  /** The commented passage. */
  passage: string;
  /** What the user asked, e.g. "@dust make this punchier". */
  request: string;
}

interface DocumentPanelProps {
  title: string;
  /** The document's current content. */
  loadDocument: () => Promise<string>;
  agentName: string;
  session: DocSession | undefined;
  onSessionChange: (update: (session: DocSession) => DocSession) => void;
  onSessionCreate: (session: DocSession) => void;
  /**
   * Asks an agent from a comment thread; resolves with its reply and the
   * document after its edit (unchanged if it only answered).
   */
  askAgent: (
    request: DocAgentRequest
  ) => Promise<{ reply: string; markdown: string }>;
  /** The workspace agent called `name` (for @mentions), if any. */
  findAgent: (name: string) => DocAuthor | null;
  /** Workspace agents, for "@" suggestions in comments. */
  agents: DocAuthor[];
  /** Agents that worked on this file (in the conversation). */
  fileAgents: DocAuthor[];
  /** True while the agent is working in the conversation. */
  isConversationBusy: boolean;
  /**
   * Bumps each time an agent reply finishes in the conversation: it may have
   * edited the document, so the panel reloads it.
   */
  agentRunCount: number;
  /** Prototype option: comment chrome (see LightComments). */
  commentStyle: CommentStyle;
  onCommentStyleChange: (style: CommentStyle) => void;
  /** Prototype option: the document area's background. */
  background: DocBackground;
  onBackgroundChange: (background: DocBackground) => void;
  /** Element in the panel's top bar where the document's actions render. */
  toolbarSlot: HTMLElement | null;
  /** Which comments design to show (see CommentsPanel / FloatingComments). */
  commentsVariant: CommentsVariant;
  onCommentsVariantChange: (variant: CommentsVariant) => void;
}

export type CommentsVariant = "margin" | "floating" | "list";

/** "light" applies to the floating and list designs (not the margin). */
export type CommentStyle = "default" | "light";

/**
 * Where the grey goes (the user messages' bg-muted-background): nowhere, on
 * the document, or on the conversation (whose messages then turn white).
 */
export type DocBackground = "white" | "grey" | "grey-conversation";

const DOC_BACKGROUNDS: Record<DocBackground, string> = {
  white: "All white (default)",
  grey: "Grey document",
  "grey-conversation": "Grey conversation, white document",
};

// Menu order: the preferred design first.
const COMMENTS_VARIANTS: Record<
  CommentsVariant,
  { label: string; short: string }
> = {
  list: {
    label: "Floating, threads open in the comments list",
    short: "List",
  },
  floating: { label: "Comments floating on the text", short: "Floating" },
  margin: { label: "Comments in the margin", short: "Margin" },
};

export function DocumentPanel({
  title,
  loadDocument,
  agentName,
  session,
  onSessionChange,
  onSessionCreate,
  askAgent,
  findAgent,
  agents,
  fileAgents,
  commentsVariant,
  onCommentsVariantChange,
  toolbarSlot,
  background,
  onBackgroundChange,
  commentStyle,
  onCommentStyleChange,
  isConversationBusy,
  agentRunCount,
}: DocumentPanelProps) {
  const { isFullscreen, setFullscreen } = usePanelFullscreen();
  const editorRef = useRef<DocEditorHandle>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  // Top right of the document area: where the comments list is pinned.
  const listAnchorRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  // "list" floats like "floating"; it differs only in how the list behaves.
  const isFloating = commentsVariant !== "margin";
  const isListThreads = commentsVariant === "list";
  const isLight = commentStyle === "light";
  const [loadError, setLoadError] = useState<string | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const [isCommentsListOpen, setIsCommentsListOpen] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DocDraft | null>(null);
  // Prototype: the viewer's access. Without edit rights, they comment or
  // suggest edits that someone who can edit accepts or rejects.
  const [canEdit, setCanEdit] = useState(true);

  // Kept in a ref: callers may pass a new function on every render.
  const loadDocumentRef = useRef(loadDocument);
  useLayoutEffect(() => {
    loadDocumentRef.current = loadDocument;
  });
  const readContent = useCallback(() => loadDocumentRef.current(), []);

  useEffect(() => {
    if (session) {
      return;
    }
    readContent()
      .then((markdown) =>
        onSessionCreate({
          savedMarkdown: markdown,
          markdown,
          editorJson: null,
          comments: seedCommentsFor(title),
        })
      )
      .catch((err: Error) => setLoadError(err.message));
  }, [session, readContent, onSessionCreate, title]);

  // The agent edits the document directly: its version replaces the
  // editor's content, keeping comments anchored where their text survives.
  const sessionRef = useRef(session);
  useLayoutEffect(() => {
    sessionRef.current = session;
  });
  // Who is editing right now (carets + name tags, see Presence.tsx).
  const [presences, setPresences] = useState<Presence[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const upsertPresence = useCallback(
    (p: Presence) =>
      setPresences((prev) => [...prev.filter((x) => x.id !== p.id), p]),
    []
  );
  const patchPresence = useCallback(
    (id: string, patch: Partial<Presence>) =>
      setPresences((prev) =>
        prev.map((x) => (x.id === id ? { ...x, ...patch } : x))
      ),
    []
  );
  const dropPresence = useCallback(
    (id: string) => setPresences((prev) => prev.filter((x) => x.id !== id)),
    []
  );
  /** Highlight fades, then the caret leaves, then it's gone. */
  const retirePresence = useCallback(
    async (id: string, stayMs: number) => {
      await sleep(stayMs);
      patchPresence(id, { fading: true });
      await sleep(900);
      patchPresence(id, { leaving: true });
      await sleep(400);
      dropPresence(id);
    },
    [patchPresence, dropPresence]
  );

  // Text blocks of the document, for spotting what changed and where.
  const textBlocks = (doc = editorRef.current?.getView()?.state.doc) => {
    const blocks: Array<{ from: number; to: number; text: string }> = [];
    doc?.descendants((node, pos) => {
      if (node.isTextblock) {
        blocks.push({
          from: pos + 1,
          to: pos + node.nodeSize - 1,
          text: node.textContent,
        });
        return false;
      }
      return true;
    });
    return blocks;
  };

  const replayEdit = async ({
    view,
    by,
    isAgent = true,
    block,
    oldSlice,
  }: {
    view: EditorView;
    by: DocAuthor;
    isAgent?: boolean;
    block: { from: number; to: number };
    oldSlice: ReturnType<EditorView["state"]["doc"]["slice"]> | null;
  }) => {
    const finalDoc = view.state.doc;
    const start = block.from;
    // Display-only steps: not saved, not undoable; the last one lands back
    // on exactly the document that was just applied.
    const show = (
      edit: (tr: EditorView["state"]["tr"]) => EditorView["state"]["tr"]
    ) =>
      view.dispatch(
        edit(view.state.tr)
          .setMeta(REPLAY_META, true)
          .setMeta("addToHistory", false)
      );
    const id = `agent-${Date.now()}`;
    try {
      // Before the first paint: the passage shows its old text (or nothing).
      show((tr) =>
        oldSlice
          ? tr.replace(start, block.to, oldSlice)
          : tr.delete(start, block.to)
      );
      const oldEnd = start + (oldSlice?.size ?? 0);
      // Narrow the replay to the words that changed: the shared start and
      // end of the passage stay in place. Leaf nodes (line breaks) count as
      // one character, so text offsets match document positions.
      let from = start;
      let cutOld = oldEnd;
      let cutNew = block.to;
      let contextFrom = from;
      let contextTo = cutNew;
      const oldText = view.state.doc.textBetween(start, oldEnd, "", "\n");
      const newText = finalDoc.textBetween(start, block.to, "", "\n");
      if (
        oldText.length === oldEnd - start &&
        newText.length === block.to - start
      ) {
        const max = Math.min(oldText.length, newText.length);
        let same = 0;
        while (same < max && oldText[same] === newText[same]) {
          same++;
        }
        let tail = 0;
        while (
          tail < max - same &&
          oldText[oldText.length - 1 - tail] ===
            newText[newText.length - 1 - tail]
        ) {
          tail++;
        }
        from = start + same;
        cutOld = oldEnd - tail;
        cutNew = block.to - tail;
        // Once typed, the change stays highlighted with three words of
        // context on each side.
        contextFrom = start + skipWords(newText, same, -1, 3);
        contextTo = start + skipWords(newText, cutNew - start, 1, 3);
      }
      if (revealBlock(view, from, scrollAreaRef.current)) {
        await sleep(450);
      }
      upsertPresence({
        id,
        name: by.name,
        color: presenceColor(by.name, isAgent),
        pos: from,
      });
      await sleep(650);
      if (cutOld > from) {
        // The old words are highlighted, then removed.
        patchPresence(id, { range: { from, to: cutOld } });
        await sleep(450);
        show((tr) => tr.delete(from, cutOld));
        patchPresence(id, { range: null });
        await sleep(150);
      }
      // The new words appear in one go, fading in, with their formatting.
      // The caret stays where the change starts.
      if (cutNew > from) {
        const fadeIn = view.state.schema.marks.fadeIn;
        show((tr) =>
          tr
            .replace(from, from, finalDoc.slice(from, cutNew))
            .addMark(from, cutNew, fadeIn.create())
        );
        patchPresence(id, { range: { from: contextFrom, to: contextTo } });
        await sleep(650);
        show((tr) => tr.removeMark(from, cutNew, fadeIn));
      } else {
        patchPresence(id, { range: { from: contextFrom, to: contextTo } });
      }
    } catch {
      // The document changed under the replay: show the final version.
    }
    if (!view.state.doc.eq(finalDoc)) {
      show((tr) => tr.replaceWith(0, tr.doc.content.size, finalDoc.content));
    }
    await retirePresence(id, 2200);
  };

  const applyAgentEdit = useCallback(
    // `quotes`: new passages for comments whose text the agent rewrote.
    // `by`: who made the edit, shown at the passage that changed.
    (
      markdown: string,
      quotes: Record<string, string> = {},
      by: DocAuthor = { name: agentName }
    ) => {
      const comments = sessionRef.current?.comments ?? [];
      const oldDoc = editorRef.current?.getView()?.state.doc;
      const oldBlocks = textBlocks(oldDoc);
      const before = new Set(oldBlocks.map((b) => b.text));
      editorRef.current?.setMarkdown(
        markdown,
        comments
          .filter((c) => !c.resolved)
          .map((c) => ({
            id: c.id,
            quote: quotes[c.id] ?? c.quote,
            suggestion:
              c.suggestion?.status === "pending"
                ? c.suggestion.text
                : undefined,
          }))
      );
      onSessionChange((s) => ({
        ...s,
        markdown,
        savedMarkdown: markdown,
        comments: s.comments.map((c) =>
          quotes[c.id] ? { ...c, quote: quotes[c.id] } : c
        ),
      }));
      // Replay the first changed passage so the edit can be followed: the
      // agent's caret arrives there, sweeps over the old text, removes it and
      // types the new one. Other changes appear at once.
      const view = editorRef.current?.getView();
      const newBlocks = textBlocks();
      const index = newBlocks.findIndex((b) => b.text && !before.has(b.text));
      if (view && oldDoc && index >= 0) {
        const after = new Set(newBlocks.map((b) => b.text));
        const old = oldBlocks[index];
        void replayEdit({
          view,
          by,
          block: newBlocks[index],
          oldSlice:
            old && old.text && !after.has(old.text)
              ? oldDoc.slice(old.from, old.to)
              : null,
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onSessionChange, agentName]
  );

  // An agent reply may have edited the document (edits asked in the
  // conversation): reload it and apply the new version.
  const seenRunCount = useRef(agentRunCount);
  useEffect(() => {
    if (agentRunCount === seenRunCount.current || !session) {
      return;
    }
    seenRunCount.current = agentRunCount;
    if (isAgentRunning) {
      return; // A comment edit applies its own result.
    }
    readContent()
      .then((latest) => {
        const current = sessionRef.current;
        if (
          current &&
          normalize(latest) !== normalize(current.savedMarkdown) &&
          normalize(latest) !== normalize(current.markdown)
        ) {
          applyAgentEdit(latest);
        } else if (current) {
          onSessionChange((s) => ({ ...s, savedMarkdown: latest }));
        }
      })
      .catch(() => {
        // The document stays as it was.
      });
  }, [
    agentRunCount,
    session,
    isAgentRunning,
    readContent,
    onSessionChange,
    applyAgentEdit,
  ]);

  if (loadError) {
    return (
      <div className="p-4">
        <ContentMessage variant="warning" icon={AlertCircle} title="Error">
          {loadError}
        </ContentMessage>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  }

  // "@" suggestions: who already worked on this file first (commenters,
  // agents that replied or edited it), then everyone else.
  const fileContributors = new Map<
    string,
    MentionCandidates["inThisFile"][number]
  >();
  for (const comment of session.comments) {
    for (const author of [
      comment.author,
      ...comment.replies.map((r) => r.author),
    ]) {
      if (author.name === YOU.name || fileContributors.has(author.name)) {
        continue;
      }
      fileContributors.set(author.name, {
        ...author,
        kind: findAgent(author.name) ? "agent" : "person",
      });
    }
  }
  for (const agent of fileAgents) {
    if (!fileContributors.has(agent.name)) {
      fileContributors.set(agent.name, { ...agent, kind: "agent" });
    }
  }
  const mentionCandidates: MentionCandidates = {
    inThisFile: [...fileContributors.values()],
    people: WORKSPACE_PEOPLE.map((p) => ({ ...p, kind: "person" })),
    agents: agents.map((a) => ({ ...a, kind: "agent" })),
  };

  const openComments = session.comments.filter((c) => !c.resolved);

  const updateComments = (update: (comments: DocComment[]) => DocComment[]) =>
    onSessionChange((s) => ({ ...s, comments: update(s.comments) }));

  /**
   * Marks suggestion `id` on the passage at `range` (quoting `quote`): only
   * the words that change, when text offsets match document positions.
   */
  const anchorSuggestion = (
    view: EditorView,
    id: string,
    range: { from: number; to: number },
    quote: string,
    text: string
  ) => {
    const type = view.state.schema.marks.comment;
    const narrow =
      range.to - range.from === quote.length
        ? narrowSuggestion(quote, text)
        : { start: 0, end: quote.length, suggestion: text, insert: false };
    view.dispatch(
      view.state.tr.removeMark(range.from, range.to, type).addMark(
        range.from + narrow.start,
        range.from + narrow.end,
        type.create({
          id,
          suggestion: narrow.suggestion,
          suggestionInsert: narrow.insert,
        })
      )
    );
  };

  const saveSuggestion = (text: string, note: string) => {
    if (!draft) {
      return;
    }
    updateComments((comments) => [
      ...comments,
      {
        id: draft.id,
        quote: draft.quote,
        author: YOU,
        body: note,
        createdAt: new Date(),
        replies: [],
        resolved: false,
        suggestion: { text, status: "pending" },
      },
    ]);
    const view = editorRef.current?.getView();
    const range = editorRef.current?.getCommentRange(draft.id);
    if (view && range) {
      anchorSuggestion(view, draft.id, range, draft.quote, text);
    }
    setDraft(null);
  };

  const decideSuggestion = (id: string, status: "accepted" | "rejected") => {
    const comment = session?.comments.find((c) => c.id === id);
    const view = editorRef.current?.getView();
    const range = editorRef.current?.getCommentRange(id);
    if (status === "accepted" && comment?.suggestion && view && range) {
      // The passage's block before the change, to replay it on screen.
      const block = textBlocks().find(
        (b) => b.from <= range.from && range.to <= b.to
      );
      const oldSlice = block
        ? view.state.doc.slice(block.from, block.to)
        : null;
      // The mark holds what replaces its passage (or follows it).
      const mark = view.state.doc
        .nodeAt(range.from)
        ?.marks.find((m) => m.type.name === "comment" && m.attrs.id === id);
      const passage = view.state.doc.textBetween(range.from, range.to);
      const text = !mark
        ? comment.suggestion.text
        : mark.attrs.suggestionInsert
          ? passage + mark.attrs.suggestion
          : mark.attrs.suggestion;
      const type = view.state.schema.marks.comment;
      view.dispatch(
        view.state.tr
          .removeMark(range.from, range.to, type)
          .insertText(text, range.from, range.to)
      );
      if (block && oldSlice) {
        void replayEdit({
          view,
          by: comment.author,
          isAgent: false,
          block: {
            from: block.from,
            to: block.to + text.length - (range.to - range.from),
          },
          oldSlice,
        });
      }
    } else {
      editorRef.current?.removeComment(id);
    }
    updateComments((comments) =>
      comments.map((c) =>
        c.id === id && c.suggestion
          ? { ...c, resolved: true, suggestion: { ...c.suggestion, status } }
          : c
      )
    );
    setActiveCommentId(null);
  };

  // Prototype: someone who can't edit suggests rewording the end of a
  // sentence on screen, for the viewer to accept or reject.
  const simulateSuggestion = async () => {
    const view = editorRef.current?.getView();
    if (!view || isSimulating) {
      return;
    }
    // The last three words of a paragraph's first sentence (no line breaks,
    // and a real sentence end, not "U.S.").
    const SENTENCE_END = /[a-z]{2}[.!?](\s|$)/;
    const target = await visibleParagraph(
      view,
      (text) => !text.includes("\n") && SENTENCE_END.test(text)
    );
    if (!target) {
      return;
    }
    const end = target.text.search(SENTENCE_END) + 2;
    const words = [...target.text.slice(0, end).matchAll(/\S+/g)];
    const first = words[Math.max(0, words.length - 3)];
    if (first?.index === undefined) {
      return;
    }
    const from = target.from + first.index;
    const to = target.from + end;
    const quote = view.state.doc.textBetween(from, to);
    const people = mentionCandidates.inThisFile.filter(
      (c) => c.kind === "person"
    );
    const pool = people.length > 0 ? people : WORKSPACE_PEOPLE;
    const author = pool[Math.floor(Math.random() * pool.length)];
    const text = `${quote}${SIMULATED_SUGGESTIONS[Math.floor(Math.random() * SIMULATED_SUGGESTIONS.length)]}`;
    const id = crypto.randomUUID();
    anchorSuggestion(view, id, { from, to }, quote, text);
    updateComments((comments) => [
      ...comments,
      {
        id,
        quote,
        author: { name: author.name, pictureUrl: author.pictureUrl },
        body: "Small precision, so the claim is easier to back up.",
        createdAt: new Date(),
        replies: [],
        resolved: false,
        suggestion: { text, status: "pending" },
      },
    ]);
  };

  const resolveComment = (id: string) => {
    updateComments((comments) =>
      comments.map((c) => (c.id === id ? { ...c, resolved: true } : c))
    );
    editorRef.current?.removeComment(id);
    setActiveCommentId(null);
  };

  // A paragraph on screen (scrolled to if none is), so an edit is visible.
  const visibleParagraph = async (
    view: EditorView,
    fits: (text: string) => boolean = () => true
  ) => {
    const area = scrollAreaRef.current?.getBoundingClientRect();
    const paragraphs = textBlocks().filter(
      (b) =>
        b.text.length > 40 &&
        fits(view.state.doc.textBetween(b.from, b.to, "", "\n"))
    );
    const onScreen = paragraphs.filter((b) => {
      if (!area) {
        return true;
      }
      const { top } = view.coordsAtPos(b.to);
      return top > area.top + 60 && top < area.bottom - 80;
    });
    const target = (onScreen.length > 0 ? onScreen : paragraphs)[0];
    if (target && revealBlock(view, target.from, scrollAreaRef.current)) {
      await sleep(450);
    }
    return target ?? null;
  };

  // Prototype: the agent rewrites a paragraph on screen (a sentence added),
  // shown with the same replay as an agent edit from a comment.
  const simulateAgentEdit = async () => {
    const view = editorRef.current?.getView();
    if (!view || isSimulating) {
      return;
    }
    setIsSimulating(true);
    try {
      const target = await visibleParagraph(view);
      if (!target) {
        return;
      }
      const oldSlice = view.state.doc.slice(target.from, target.to);
      const phrase =
        SIMULATED_AGENT_EDITS[
          Math.floor(Math.random() * SIMULATED_AGENT_EDITS.length)
        ];
      view.dispatch(view.state.tr.insertText(phrase, target.to));
      await replayEdit({
        view,
        by: { name: agentName },
        block: { from: target.from, to: target.to + phrase.length },
        oldSlice,
      });
    } finally {
      setIsSimulating(false);
    }
  };

  // Prototype: a human collaborator types a sentence at the end of a visible
  // paragraph, so presence (caret, name tag, highlight) can be seen.
  const simulateCollaborator = async () => {
    const view = editorRef.current?.getView();
    if (!view || isSimulating) {
      return;
    }
    setIsSimulating(true);
    try {
      const people = mentionCandidates.inThisFile.filter(
        (c) => c.kind === "person"
      );
      const pool = people.length > 0 ? people : WORKSPACE_PEOPLE;
      const person = pool[Math.floor(Math.random() * pool.length)];
      const target = await visibleParagraph(view);
      if (!target) {
        return;
      }
      const phrase =
        SIMULATED_EDITS[Math.floor(Math.random() * SIMULATED_EDITS.length)];
      const id = `person-${Date.now()}`;
      const start = target.to;
      upsertPresence({
        id,
        name: person.name,
        color: presenceColor(person.name, false),
        pos: start,
      });
      await sleep(700);
      let pos = start;
      for (const ch of phrase) {
        view.dispatch(view.state.tr.insertText(ch, pos));
        pos += 1;
        patchPresence(id, { pos, range: { from: start, to: pos } });
        await sleep(30 + Math.random() * 60);
      }
      await retirePresence(id, 1800);
    } finally {
      setIsSimulating(false);
    }
  };

  // The first @mention of a workspace agent in `text`, if any: "@dust …".
  const mentionedAgent = (text: string): DocAuthor | null => {
    for (const [, name] of text.matchAll(/(?:^|\s)@([\w.-]+)/g)) {
      const agent = findAgent(name);
      if (agent) {
        return agent;
      }
    }
    return null;
  };

  const setReplies = (
    commentId: string,
    update: (replies: DocReply[]) => DocReply[]
  ) =>
    updateComments((comments) =>
      comments.map((c) =>
        c.id === commentId ? { ...c, replies: update(c.replies) } : c
      )
    );

  /**
   * Calls `agent` from a comment thread: it gets the passage, the thread and
   * the request, edits the document if needed (applied directly), and its
   * answer is posted in the thread.
   */
  const callAgentInThread = async ({
    comment,
    request,
    agent,
  }: {
    comment: { id: string; quote: string; body: string; replies: DocReply[] };
    request: string;
    agent: DocAuthor;
  }) => {
    const before = session.markdown;
    const pendingId = crypto.randomUUID();
    setReplies(comment.id, (replies) => [
      ...replies,
      {
        id: pendingId,
        author: agent,
        body: "",
        createdAt: new Date(),
        pending: true,
      },
    ]);
    setIsAgentRunning(true);
    setAgentError(null);

    const finish = (body: string) =>
      setReplies(comment.id, (replies) =>
        replies.map((r) =>
          r.id === pendingId
            ? { ...r, body, pending: false, createdAt: new Date() }
            : r
        )
      );

    try {
      const { reply, markdown: after } = await askAgent({
        agentName: agent.name,
        markdown: before,
        passage: comment.quote,
        request,
      });
      const edited = normalize(after) !== normalize(before);
      if (edited) {
        // If the agent rewrote the commented passage, the comment follows it
        // to the new version instead of losing its place.
        const rewritten = rewrittenPassage(before, after, comment.quote);
        applyAgentEdit(
          after,
          rewritten ? { [comment.id]: rewritten } : {},
          agent
        );
      }
      finish(toThreadText(reply) || (edited ? "Done." : "…"));
    } catch (err) {
      finish(`Something went wrong: ${(err as Error).message}`);
    } finally {
      setIsAgentRunning(false);
    }
  };

  const saveDraft = (body: string) => {
    if (!draft) {
      return;
    }
    const comment = {
      id: draft.id,
      quote: draft.quote,
      author: YOU,
      body,
      createdAt: new Date(),
      replies: [],
      resolved: false,
    };
    updateComments((comments) => [...comments, comment]);
    setDraft(null);
    const agent = mentionedAgent(body);
    if (agent) {
      void callAgentInThread({ comment, request: body, agent });
    }
  };

  const cancelDraft = () => {
    if (draft) {
      editorRef.current?.removeComment(draft.id);
    }
    setDraft(null);
    setActiveCommentId(null);
  };

  const reply = (id: string, body: string) => {
    setReplies(id, (replies) => [
      ...replies,
      { id: crypto.randomUUID(), author: YOU, body, createdAt: new Date() },
    ]);
    const agent = mentionedAgent(body);
    const comment = session.comments.find((c) => c.id === id);
    if (agent && comment) {
      void callAgentInThread({ comment, request: body, agent });
    }
  };

  return (
    <MentionProvider candidates={mentionCandidates}>
      <SuggestionProvider
        canEdit={canEdit}
        onAccept={(id) => decideSuggestion(id, "accepted")}
        onReject={(id) => decideSuggestion(id, "rejected")}
      >
        <div className="flex h-full min-h-0 flex-col">
          {/* Lives in the panel's top bar, next to expand and close (the page
          passes the slot). Prototype-only controls sit behind "…". */}
          {toolbarSlot &&
            createPortal(
              <>
                {isFloating ? (
                  <CommentsListPopover
                    anchorRef={listAnchorRef}
                    light={isLight}
                    comments={session.comments}
                    open={isCommentsListOpen}
                    onOpenChange={setIsCommentsListOpen}
                    onResolve={resolveComment}
                    onPick={(id) => {
                      if (!isListThreads) {
                        setIsCommentsListOpen(false);
                      }
                      setActiveCommentId(id);
                      editorRef.current?.focusComment(id);
                    }}
                    thread={
                      isListThreads
                        ? {
                            activeCommentId,
                            agentName,
                            isAgentBusy: isAgentRunning,
                            onReply: reply,
                          }
                        : undefined
                    }
                    trigger={
                      <Button
                        size="sm"
                        variant={isCommentsListOpen ? "primary" : "ghost"}
                        icon={MessageCircle01}
                        label={
                          openComments.length > 0
                            ? String(openComments.length)
                            : undefined
                        }
                        tooltip="All comments"
                      />
                    }
                  />
                ) : (
                  <Button
                    size="sm"
                    variant={showComments ? "primary" : "ghost"}
                    icon={MessageCircle01}
                    label={
                      openComments.length > 0
                        ? String(openComments.length)
                        : undefined
                    }
                    tooltip="Comments"
                    onClick={() => setShowComments((v) => !v)}
                  />
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Download01}
                  tooltip="Download"
                  onClick={() => downloadMarkdown(title, session.markdown)}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={DotsHorizontal}
                      tooltip="Prototype options"
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel label="Your access" />
                    <DropdownMenuItem
                      label="Can edit"
                      icon={canEdit ? Check : undefined}
                      onClick={() => setCanEdit(true)}
                    />
                    <DropdownMenuItem
                      label="Can comment and suggest"
                      icon={canEdit ? undefined : Check}
                      onClick={() => setCanEdit(false)}
                    />
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel label="Simulate" />
                    <DropdownMenuItem
                      icon={Pencil01}
                      label="A collaborator edits the text"
                      disabled={isSimulating}
                      onClick={() => void simulateCollaborator()}
                    />
                    <DropdownMenuItem
                      icon={MessagePlusCircle}
                      label="A collaborator suggests an edit"
                      disabled={isSimulating}
                      onClick={() => void simulateSuggestion()}
                    />
                    <DropdownMenuItem
                      icon={Robot}
                      label="The agent rewrites a paragraph"
                      disabled={isSimulating}
                      onClick={() => void simulateAgentEdit()}
                    />
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel label="Comments design" />
                    {(Object.keys(COMMENTS_VARIANTS) as CommentsVariant[]).map(
                      (variant) => (
                        <DropdownMenuItem
                          key={variant}
                          label={COMMENTS_VARIANTS[variant].label}
                          icon={variant === commentsVariant ? Check : undefined}
                          onClick={() => onCommentsVariantChange(variant)}
                        />
                      )
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel label="Comment style" />
                    {(["default", "light"] as CommentStyle[]).map((value) => (
                      <DropdownMenuItem
                        key={value}
                        label={value === "default" ? "Default" : "Light"}
                        icon={value === commentStyle ? Check : undefined}
                        onClick={() => onCommentStyleChange(value)}
                      />
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel label="Backgrounds" />
                    {(Object.keys(DOC_BACKGROUNDS) as DocBackground[]).map(
                      (value) => (
                        <DropdownMenuItem
                          key={value}
                          label={DOC_BACKGROUNDS[value]}
                          icon={value === background ? Check : undefined}
                          onClick={() => onBackgroundChange(value)}
                        />
                      )
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>,
              toolbarSlot
            )}

          <div className="flex min-h-0 flex-1">
            <div className="relative flex min-w-0 flex-1 flex-col">
              <div
                ref={listAnchorRef}
                aria-hidden
                className="pointer-events-none absolute right-3 top-2 h-0 w-0"
              />
              {isFullscreen && (
                <div className="absolute left-4 top-4 z-30">
                  {/* Back to the conversation; the outline glints while the agent
                  works (same animation as the input bar's stop button). */}
                  <div className="relative rounded-[15px]">
                    <Button
                      size="md"
                      variant="outline"
                      icon={MessageCircle01}
                      tooltip={
                        isConversationBusy
                          ? `@${agentName} is working… Show the conversation`
                          : "Show the conversation"
                      }
                      className="shadow-md"
                      onClick={() => setFullscreen(false)}
                    />
                    {isConversationBusy && <GlintOutline radius={15} />}
                  </div>
                </div>
              )}
              <div
                ref={scrollAreaRef}
                className={cn(
                  "min-h-0 flex-1 overflow-y-auto",
                  background === "grey" && "bg-muted-background"
                )}
              >
                <div
                  ref={pageRef}
                  className={cn(
                    DOC_PAGE,
                    "relative cursor-text",
                    // The text column is never wider than 600px, in the side
                    // panel or full page: extra width becomes centered margins
                    // (DOC_PAGE's side padding is 96px in total).
                    "mx-auto max-w-[696px]"
                  )}
                  // Clicks on the sheet's margins, or below the text, still start
                  // typing: only clicks on the text itself reach the editor.
                  onMouseDown={(e) => {
                    const target = e.target as HTMLElement;
                    if (
                      target.closest(
                        ".ProseMirror, button, a, input, textarea, [data-floating-comment]"
                      )
                    ) {
                      return;
                    }
                    e.preventDefault();
                    editorRef.current?.focusEnd();
                  }}
                >
                  <div>
                    <DocEditor
                      lightHighlights={isLight}
                      ref={editorRef}
                      initialMarkdown={session.markdown}
                      initialJson={session.editorJson}
                      activeCommentId={activeCommentId}
                      initialAnchors={
                        session.editorJson
                          ? undefined
                          : session.comments.map((c) => ({
                              id: c.id,
                              quote: c.quote,
                            }))
                      }
                      onChange={({ markdown, json }) =>
                        onSessionChange((s) => ({
                          ...s,
                          markdown: markdown ?? s.markdown,
                          editorJson: json,
                        }))
                      }
                      readOnly={!canEdit}
                      onSuggestSelection={() => {
                        const id = crypto.randomUUID();
                        const quote = editorRef.current?.addComment(id);
                        if (quote) {
                          setDraft({ id, quote, suggest: true });
                          setActiveCommentId(id);
                          if (!isFloating) {
                            setShowComments(true);
                          }
                        }
                      }}
                      onCommentSelection={() => {
                        const id = crypto.randomUUID();
                        const quote = editorRef.current?.addComment(id);
                        if (quote) {
                          setDraft({ id, quote });
                          setActiveCommentId(id);
                          if (!isFloating) {
                            setShowComments(true);
                          }
                        }
                      }}
                      onCommentClick={(id) => {
                        setActiveCommentId(id);
                        if (id && !isFloating) {
                          setShowComments(true);
                        }
                      }}
                    />
                  </div>
                  <PresenceLayer
                    view={editorRef.current?.getView() ?? null}
                    containerRef={pageRef}
                    presences={presences}
                    layoutKey={session.markdown}
                  />
                  {isFloating && (
                    <CommentMarkers
                      light={isLight}
                      containerRef={pageRef}
                      comments={session.comments}
                      activeCommentId={activeCommentId}
                      layoutKey={session.markdown}
                      onOpen={(id) => setActiveCommentId(id)}
                    />
                  )}
                  {isFloating && !(isListThreads && isCommentsListOpen) && (
                    <FloatingComments
                      light={isLight}
                      containerRef={pageRef}
                      comments={session.comments}
                      draft={draft}
                      activeCommentId={activeCommentId}
                      agentName={agentName}
                      isAgentBusy={isAgentRunning}
                      layoutKey={session.markdown}
                      onSaveDraft={saveDraft}
                      onSaveSuggestion={saveSuggestion}
                      onCancelDraft={cancelDraft}
                      onClose={() => setActiveCommentId(null)}
                      onReply={reply}
                      onResolve={resolveComment}
                    />
                  )}
                </div>
              </div>
              <div className="shrink-0 px-6">
                {agentError && (
                  <div className="pb-4">
                    <ContentMessage
                      variant="warning"
                      icon={AlertCircle}
                      title="Agent edit"
                    >
                      {agentError}
                    </ContentMessage>
                  </div>
                )}
              </div>
            </div>

            {!isFloating && showComments && (
              <div className="w-72 shrink-0 overflow-y-auto border-l border-border p-4">
                <CommentsPanel
                  comments={session.comments}
                  draft={draft}
                  activeCommentId={activeCommentId}
                  agentName={agentName}
                  onSaveDraft={saveDraft}
                  onSaveSuggestion={saveSuggestion}
                  onCancelDraft={cancelDraft}
                  onSelect={(id) => {
                    setActiveCommentId(id);
                    editorRef.current?.focusComment(id);
                  }}
                  onReply={reply}
                  onResolve={resolveComment}
                />
              </div>
            )}
          </div>
          {isAgentRunning && (
            <div className="sr-only" role="status">
              @{agentName} is editing the document
            </div>
          )}
        </div>
      </SuggestionProvider>
    </MentionProvider>
  );
}
