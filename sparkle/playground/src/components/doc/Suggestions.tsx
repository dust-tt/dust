import { Button, Check, cn, Input, TextArea, XClose } from "@dust-tt/sparkle";
import { createContext, type ReactNode, useContext, useState } from "react";

import type { DocComment } from "./docTypes";

// SUGGESTIONS — a person who can't edit the document proposes a change to a
// passage. It's a comment that carries the new text: the passage shows the
// change inline (old text struck, new text after it), and the thread shows a
// before/after with Accept and Reject for the people who can edit.

interface SuggestionActions {
  /** The viewer can edit the document, so decides on suggestions. */
  canEdit: boolean;
  onAccept: (commentId: string) => void;
  onReject: (commentId: string) => void;
}

const SuggestionContext = createContext<SuggestionActions>({
  canEdit: true,
  onAccept: () => {},
  onReject: () => {},
});

export function SuggestionProvider({
  children,
  ...actions
}: SuggestionActions & { children: ReactNode }) {
  return (
    <SuggestionContext.Provider value={actions}>
      {children}
    </SuggestionContext.Provider>
  );
}

const CONTEXT_WORDS = 3;

/**
 * The change between two passages, by words: what they share at the start
 * and end (trimmed to a few words of context), what goes and what comes.
 */
export function wordDiff(before: string, after: string) {
  const a = before.split(/(\s+)/);
  const b = after.split(/(\s+)/);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) {
    head++;
  }
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++;
  }
  // Tokens alternate word / space: two tokens per word of context.
  const keep = CONTEXT_WORDS * 2;
  const lead = a.slice(0, head);
  const trail = a.slice(a.length - tail);
  return {
    leadCut: lead.length > keep,
    lead: lead.slice(-keep).join(""),
    removed: a.slice(head, a.length - tail).join(""),
    added: b.slice(head, b.length - tail).join(""),
    trail: trail.slice(0, keep).join(""),
    trailCut: trail.length > keep,
  };
}

/**
 * Where to show a suggestion in the passage: only the words that change.
 * Offsets are in `quote`. A pure insertion has nothing to strike, so it's
 * anchored on the word before it (`insert`: shown after it, kept on accept).
 */
export function narrowSuggestion(quote: string, text: string) {
  const a = quote.split(/(\s+)/);
  const b = text.split(/(\s+)/);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) {
    head++;
  }
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++;
  }
  const offset = (count: number) => a.slice(0, count).join("").length;
  const start = offset(head);
  const end = offset(a.length - tail);
  const added = b.slice(head, b.length - tail).join("");
  if (quote.slice(start, end).trim()) {
    return { start, end, suggestion: added, insert: false };
  }
  // Insertion: anchor on the word before it (and the spaces up to it).
  let word = head - 1;
  while (word >= 0 && !a[word].trim()) {
    word--;
  }
  if (word < 0) {
    return { start: 0, end: quote.length, suggestion: text, insert: false };
  }
  return { start: offset(word), end, suggestion: added, insert: true };
}

/** The change, inline: struck old words, new words, a little context. */
export function SuggestionDiff({
  quote,
  text,
  className,
}: {
  quote: string;
  text: string;
  className?: string;
}) {
  const d = wordDiff(quote, text);
  return (
    <div
      className={cn(
        "rounded-lg bg-muted-background px-2.5 py-1.5 text-sm leading-relaxed text-muted-foreground",
        className
      )}
    >
      {d.leadCut && "…"}
      {d.lead}
      {d.removed && (
        <span className="text-rose-700 line-through decoration-rose-500 dark:text-rose-300">
          {d.removed}
        </span>
      )}
      {d.added && (
        <span className="rounded-sm bg-emerald-100 px-0.5 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
          {d.added}
        </span>
      )}
      {d.trail}
      {d.trailCut && "…"}
    </div>
  );
}

/**
 * A suggestion comment's content: the change, its note, then Accept /
 * Reject (people who can edit) or its status.
 */
export function SuggestionBlock({
  comment,
  showNote = true,
}: {
  comment: DocComment;
  /** False when the note is shown elsewhere (light style: by the name). */
  showNote?: boolean;
}) {
  const { canEdit, onAccept, onReject } = useContext(SuggestionContext);
  const suggestion = comment.suggestion;
  if (!suggestion) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium text-muted-foreground">
        Suggested edit
      </div>
      <SuggestionDiff quote={comment.quote} text={suggestion.text} />
      {showNote && comment.body && (
        <div className="text-sm text-foreground">{comment.body}</div>
      )}
      {suggestion.status === "pending" ? (
        canEdit ? (
          // Deciding mustn't also open or select the thread around it.
          <div
            className="flex justify-end gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              size="xs"
              variant="outline"
              icon={XClose}
              label="Reject"
              onClick={() => onReject(comment.id)}
            />
            <Button
              size="xs"
              variant="primary"
              icon={Check}
              label="Accept"
              onClick={() => onAccept(comment.id)}
            />
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            Waiting for someone who can edit to review it
          </div>
        )
      ) : (
        <div className="text-xs text-muted-foreground">
          {suggestion.status === "accepted" ? "Accepted" : "Rejected"}
        </div>
      )}
    </div>
  );
}

/**
 * The draft of a suggestion: the passage, editable, and an optional note.
 * Submitting needs a change.
 */
export function SuggestionComposer({
  quote,
  showTitle = true,
  onSubmit,
  onCancel,
}: {
  quote: string;
  /** False when the surrounding card already says what this is. */
  showTitle?: boolean;
  onSubmit: (text: string, note: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(quote);
  const [note, setNote] = useState("");
  const changed = text.trim() !== quote.trim();
  const submit = () => changed && onSubmit(text.trim(), note.trim());
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) {
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape") {
      onCancel();
    }
  };
  return (
    <div className="flex flex-col gap-2">
      {showTitle && (
        <div className="text-xs font-medium text-muted-foreground">
          Suggest an edit
        </div>
      )}
      <TextArea
        value={text}
        minRows={2}
        autoFocus
        onFocus={(e) => {
          const end = e.target.value.length;
          e.target.setSelectionRange(end, end);
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {changed && <SuggestionDiff quote={quote} text={text} />}
      <Input
        value={note}
        placeholder="Add a note (optional)"
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="flex justify-end gap-2">
        <Button size="xs" variant="ghost" label="Cancel" onClick={onCancel} />
        <Button
          size="xs"
          variant="highlight"
          label="Suggest"
          disabled={!changed}
          onClick={submit}
        />
      </div>
    </div>
  );
}
