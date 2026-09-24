import {
  Document,
  type DocumentComment,
  type DocumentCommentAuthor,
  type DocumentProps,
  type DocumentSaveOutcome,
  type DocumentSaveResult,
} from "@sparkle/components/Document";
import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

const MAYA: DocumentCommentAuthor = { name: "Maya Chen" };
const LIAM: DocumentCommentAuthor = {
  name: "Liam Ortiz",
  avatarUrl: "https://dust.tt/static/droidavatar/Droid_Lime_3.jpg",
};
const HOUR_MS = 3_600_000;
const agoIso = (hours: number) =>
  new Date(Date.now() - hours * HOUR_MS).toISOString();

const commented = (text: string, id: string) => ({
  type: "text",
  text,
  marks: [{ type: "comment", attrs: { id } }],
});

const COMMENTS: DocumentComment[] = [
  {
    id: "reach",
    body: "Can we quantify this against the original target?",
    author: MAYA,
    createdAt: agoIso(2),
    resolved: false,
    replies: [
      {
        id: "reach-reply",
        body: "Adding the numbers from the Q3 deck this afternoon.",
        author: LIAM,
        createdAt: agoIso(1),
      },
    ],
  },
  {
    id: "wording",
    body: "Let’s soften this. Support logged two minor tickets.",
    author: LIAM,
    createdAt: agoIso(26),
    resolved: false,
    replies: [],
  },
  {
    id: "typo",
    body: "Typo: “regions”, not “regoins”.",
    author: MAYA,
    createdAt: agoIso(72),
    resolved: true,
    replies: [],
  },
];

const commentedDocument = (comments: DocumentComment[]) =>
  JSON.stringify({
    type: "doc",
    attrs: { comments },
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Launch readiness review" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "The rollout " },
          commented("reached 40% of workspaces", "reach"),
          { type: "text", text: " during the first week." },
        ],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Support reported " },
          commented("no regressions", "wording"),
          { type: "text", text: " across the cohort." },
        ],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Next, we expand to " },
          commented("all remaining regions", "typo"),
          { type: "text", text: " before the end of the quarter." },
        ],
      },
    ],
  });

const meta = {
  title: "Documents/Document Comments",
  component: Document,
  decorators: [
    (Story) => (
      <React.StrictMode>
        <Story />
      </React.StrictMode>
    ),
  ],
  args: {
    initialContent: commentedDocument(COMMENTS),
    contentType: "json",
    commentAuthor: MAYA,
    onSave: fn(async (): Promise<DocumentSaveResult> => ({ ok: true })),
  },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  render: (args) => <Document {...args} />,
} satisfies Meta<typeof Document>;
export default meta;
type Story = StoryObj<typeof meta>;

const selectContents = (element: Element) => {
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  const selection = element.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  element.ownerDocument.dispatchEvent(new Event("selectionchange"));
};

const selectFirstParagraph = (editor: HTMLElement) => {
  const paragraph = editor.querySelector("p");
  if (!paragraph) {
    throw new Error("Expected a document paragraph");
  }
  selectContents(paragraph);
};

const undoText = async () => {
  const modifier = /Mac|iP(hone|ad|od)/.test(navigator.platform)
    ? "Meta"
    : "Control";
  await userEvent.keyboard(`{${modifier}>}z{/${modifier}}`);
};

const findSelectionToolbar = (canvasElement: HTMLElement) =>
  within(canvasElement.ownerDocument.body).findByRole("toolbar", {
    name: "Format selection",
  });

const lastSavedDocument = (onSave: DocumentProps["onSave"]) =>
  JSON.parse(
    (onSave as ReturnType<typeof fn>).mock.lastCall?.[0] as string
  ) as { attrs: { comments: DocumentComment[] } };

const openPanel: Story["play"] = async ({ canvas }) => {
  await userEvent.click(
    await canvas.findByRole("button", { name: /Comments/ })
  );
  await expect(
    await canvas.findByRole("complementary", { name: "Comments" })
  ).toBeVisible();
};

const highlights = (editor: HTMLElement) =>
  Array.from(
    new Set(
      Array.from(
        editor.querySelectorAll<HTMLElement>("[data-comment-highlight]")
      ).map((element) => element.dataset.commentHighlight)
    )
  );

/** @summary Highlights and margin markers on a reviewed document. */
export const CommentedDocument: Story = {};

/** @summary Browse threads in the panel and jump to their text. */
export const BrowseComments: Story = {
  play: async ({ canvas, canvasElement, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await expect(highlights(editor)).toEqual(["reach", "wording"]);
    await expect(
      await canvas.findAllByRole("button", { name: /^Show comment by/ })
    ).toHaveLength(2);
    await expect(
      canvas.queryByRole("complementary", { name: "Comments" })
    ).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: /Comments/ }));
    const panel = await canvas.findByRole("complementary", {
      name: "Comments",
    });
    await expect(within(panel).getAllByRole("article")).toHaveLength(2);
    await expect(
      within(panel).getByRole("heading", { name: "Comments, 2 unresolved" })
    ).toHaveFocus();
    await expect(within(panel).getByText("Resolved (1)")).toBeVisible();
    await expect(
      within(panel).queryByText(/Typo: “regions”/)
    ).not.toBeInTheDocument();
    await userEvent.click(within(panel).getByText("Resolved (1)"));
    await expect(
      await within(panel).findByText(/Typo: “regions”/)
    ).toBeVisible();

    const wording = within(panel).getByRole("article", {
      name: "Comment by Liam Ortiz",
    });
    await expect(wording).toHaveTextContent("no regressions");
    await expect(wording).toHaveTextContent("Let’s soften this.");
    await expect(
      canvasElement.querySelector('[aria-current="true"]')
    ).toBeNull();

    await userEvent.click(
      within(wording).getByRole("button", {
        name: "Commented text: no regressions",
      })
    );
    await expect(wording).toHaveAttribute("aria-current", "true");
    await expect(
      canvas.getByRole("button", { name: "Show comment by Liam Ortiz" })
    ).toHaveAttribute("aria-current", "true");
    await expect(
      within(wording).getByRole("textbox", { name: "Reply" })
    ).toBeVisible();
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** @summary Comment a selection from the toolbar and save the thread inside the JSON. */
export const AddComment: Story = {
  args: {
    initialContent: "# Draft\n\nSelect these words to comment on them.",
    contentType: "markdown",
  },
  play: async ({ canvas, canvasElement, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await expect(
      canvas.queryByRole("button", { name: /Show comment by/ })
    ).not.toBeInTheDocument();

    await userEvent.click(editor);
    selectFirstParagraph(editor);
    const toolbar = await findSelectionToolbar(canvasElement);
    await userEvent.click(
      within(toolbar).getByRole("button", { name: "Comment" })
    );

    const composer = await canvas.findByRole("dialog", { name: "New comment" });
    await expect(
      editor.querySelector("[data-comment-draft]")
    ).toHaveTextContent("Select these words to comment on them.");
    const input = within(composer).getByRole("textbox", { name: "Comment" });
    await expect(input).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(composer).toBeVisible();
    await userEvent.keyboard(
      "Could we make this{Shift>}{Enter}{/Shift}shorter?"
    );
    await expect(input).toHaveValue("Could we make this\nshorter?");
    await userEvent.keyboard("{Enter}");

    await expect(
      canvas.queryByRole("dialog", { name: "New comment" })
    ).not.toBeInTheDocument();
    await expect(highlights(editor)).toHaveLength(1);
    const panel = await canvas.findByRole("complementary", {
      name: "Comments",
    });
    const thread = within(panel).getByRole("article", {
      name: "Comment by Maya Chen",
    });
    await expect(thread).toHaveAttribute("aria-current", "true");
    await expect(thread).toHaveTextContent(
      "Select these words to comment on them."
    );
    await expect(thread).toHaveTextContent("Could we make this shorter?");
    await expect(
      canvas.getByRole("button", { name: "Show comment by Maya Chen" })
    ).toBeVisible();

    await userEvent.keyboard("{Control>}s{/Control}");
    await waitFor(() => expect(args.onSave).toHaveBeenCalledTimes(1));
    const saved = lastSavedDocument(args.onSave);
    await expect(saved.attrs.comments).toHaveLength(1);
    await expect(saved.attrs.comments[0]).toMatchObject({
      body: "Could we make this\nshorter?",
      author: MAYA,
      resolved: false,
      replies: [],
    });
    await expect(JSON.stringify(saved)).toContain(
      `"marks":[{"type":"comment","attrs":{"id":"${saved.attrs.comments[0].id}"}}]`
    );
  },
};

/** @summary Escape or clicking away discards a draft without touching the document. */
export const CancelDraft: Story = {
  args: {
    initialContent: "A sentence worth discussing.",
    contentType: "markdown",
    autosaveDebounceMs: 300,
  },
  play: async ({ canvas, canvasElement, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.click(editor);
    selectFirstParagraph(editor);
    await userEvent.keyboard("{Control>}{Alt>}m{/Alt}{/Control}");
    const composer = await canvas.findByRole("dialog", { name: "New comment" });
    await userEvent.keyboard("Never posted");
    // Escape works from any control in the composer, not only the field.
    await userEvent.tab();
    await expect(
      within(composer).getByRole("button", { name: "Send" })
    ).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect(composer).not.toBeInTheDocument();
    await expect(editor.querySelector("[data-comment-draft]")).toBeNull();
    await expect(editor).toHaveFocus();

    selectFirstParagraph(editor);
    await userEvent.keyboard("{Control>}{Alt>}m{/Alt}{/Control}");
    await canvas.findByRole("dialog", { name: "New comment" });
    await userEvent.click(canvasElement.ownerDocument.body);
    await waitFor(() =>
      expect(
        canvas.queryByRole("dialog", { name: "New comment" })
      ).not.toBeInTheDocument()
    );

    await new Promise((resolve) => setTimeout(resolve, 500));
    await expect(args.onSave).not.toHaveBeenCalled();
    await expect(
      canvas.queryByRole("button", { name: /Comments/ })
    ).toBeVisible();
  },
};

/** @summary Reply, resolve, reopen and delete threads from the panel. */
export const ManageThreads: Story = {
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.click(canvas.getByRole("button", { name: /Comments/ }));
    const panel = await canvas.findByRole("complementary", {
      name: "Comments",
    });
    const reach = within(panel).getByRole("article", {
      name: "Comment by Maya Chen",
    });
    await expect(reach).toHaveTextContent("Adding the numbers");

    await userEvent.click(
      within(reach).getByRole("button", { name: /^Commented text/ })
    );
    const replyField = within(reach).getByRole("textbox", { name: "Reply" });
    await userEvent.type(replyField, "A discarded{Shift>}{Enter}{/Shift}draft");
    const grownHeight = replyField.getBoundingClientRect().height;
    // Escape clears the reply and hands focus to the thread, without closing the panel.
    await userEvent.keyboard("{Escape}");
    await expect(replyField).toHaveValue("");
    await expect(replyField.getBoundingClientRect().height).toBeLessThan(
      grownHeight
    );
    await expect(reach).toHaveFocus();
    await expect(panel).toBeVisible();

    await userEvent.type(replyField, "Target was 30%, so we are ahead.{Enter}");
    await expect(reach).toHaveTextContent("Target was 30%, so we are ahead.");
    await expect(replyField).toHaveValue("");

    await userEvent.click(
      within(reach).getByRole("button", { name: "Resolve" })
    );
    await expect(highlights(editor)).toEqual(["wording"]);
    // Focus moves to the neighbouring thread instead of falling off the page.
    await expect(
      within(panel).getByRole("article", { name: "Comment by Liam Ortiz" })
    ).toHaveFocus();
    await expect(
      canvas.getAllByRole("button", { name: /^Show comment by/ })
    ).toHaveLength(1);
    await expect(within(panel).getByText("Resolved (2)")).toBeVisible();
    await userEvent.click(within(panel).getByText("Resolved (2)"));
    const resolvedReach = (
      await within(panel).findAllByRole("article", {
        name: "Comment by Maya Chen",
      })
    ).find((thread) => thread.textContent?.includes("reached 40%"));
    if (!resolvedReach) {
      throw new Error("Expected the resolved thread in the panel");
    }
    await expect(
      within(resolvedReach).queryByRole("textbox", { name: "Reply" })
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(resolvedReach).getByRole("button", { name: "Reopen" })
    );
    await expect(highlights(editor)).toEqual(["reach", "wording"]);

    const wording = within(panel).getByRole("article", {
      name: "Comment by Liam Ortiz",
    });
    await userEvent.click(
      within(wording).getByRole("button", { name: "Delete comment" })
    );
    await expect(wording).not.toBeInTheDocument();
    await expect(highlights(editor)).toEqual(["reach"]);
    // Resolving and reopening remounted the thread, so query it again.
    await expect(
      within(panel)
        .getAllByRole("article", { name: "Comment by Maya Chen" })
        .find((thread) => thread.textContent?.includes("reached 40%"))
    ).toHaveFocus();

    // Cmd/Ctrl+S saves from the editor, so leave the panel first.
    await userEvent.click(editor);
    // Posted replies, resolution and deletion are explicit actions, outside text undo.
    await undoText();
    await expect(highlights(editor)).toEqual(["reach"]);
    await userEvent.keyboard("{Control>}s{/Control}");
    await waitFor(() => expect(args.onSave).toHaveBeenCalledTimes(1));
    const saved = lastSavedDocument(args.onSave);
    await expect(saved.attrs.comments.map((comment) => comment.id)).toEqual([
      "reach",
      "typo",
    ]);
    await expect(saved.attrs.comments[0].replies).toHaveLength(2);
    await expect(JSON.stringify(saved)).not.toContain("wording");
  },
};

/** @summary Concurrent replies survive conflict recovery and subsequent text undo. */
export const ConcurrentReplies: Story = {
  args: {
    onSave: fn(
      async (): Promise<DocumentSaveResult> => ({
        ok: false,
        error: "Another reviewer saved first.",
        conflict: {
          content: commentedDocument([
            {
              ...COMMENTS[0],
              replies: [
                ...COMMENTS[0].replies,
                {
                  id: "remote-reply",
                  body: "The latest rollout numbers are confirmed.",
                  author: LIAM,
                  createdAt: agoIso(0),
                },
              ],
            },
            ...COMMENTS.slice(1),
          ]),
          adoptAndSave: fn(
            async (): Promise<DocumentSaveOutcome> => ({ ok: true })
          ),
        },
      })
    ),
  },
  play: async ({ canvas, args }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.click(canvas.getByRole("button", { name: /Comments/ }));
    const panel = await canvas.findByRole("complementary", {
      name: "Comments",
    });
    const thread = within(panel).getByRole("article", {
      name: "Comment by Maya Chen",
    });
    await userEvent.click(
      within(thread).getByRole("button", { name: /^Commented text/ })
    );
    await userEvent.type(
      within(thread).getByRole("textbox", { name: "Reply" }),
      "Ready for the next review.{Enter}"
    );
    await userEvent.click(editor);
    await userEvent.keyboard("{Control>}s{/Control}");
    await waitFor(() => expect(args.onSave).toHaveBeenCalledTimes(1));
    await expect(await canvas.findByText("Saved")).toBeVisible();
    await expect(thread).toHaveTextContent(
      "The latest rollout numbers are confirmed."
    );
    await expect(thread).toHaveTextContent("Ready for the next review.");

    selectFirstParagraph(editor);
    await userEvent.keyboard(" A later text change.");
    await expect(editor).toHaveTextContent("A later text change.");
    await undoText();
    await expect(editor).not.toHaveTextContent("A later text change.");
    await undoText();
    await expect(thread).toHaveTextContent(
      "The latest rollout numbers are confirmed."
    );
    await expect(thread).toHaveTextContent("Ready for the next review.");
  },
};

/** @summary Overlapping comments share a marker and cycle on repeated clicks. */
export const OverlappingComments: Story = {
  args: {
    initialContent: JSON.stringify({
      type: "doc",
      attrs: {
        comments: [
          {
            id: "outer",
            body: "This whole clause reads long.",
            author: MAYA,
            createdAt: agoIso(3),
            resolved: false,
            replies: [],
          },
          {
            id: "inner",
            body: "“Very” adds nothing.",
            author: LIAM,
            createdAt: agoIso(2),
            resolved: false,
            replies: [],
          },
        ],
      },
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "The results were " },
            commented("clear and ", "outer"),
            {
              type: "text",
              text: "very",
              marks: [
                { type: "comment", attrs: { id: "outer" } },
                { type: "comment", attrs: { id: "inner" } },
              ],
            },
            commented(" encouraging", "outer"),
            { type: "text", text: "." },
          ],
        },
      ],
    }),
  },
  play: async ({ canvas }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    const marker = await canvas.findByRole("button", {
      name: "Show 2 comments",
    });
    await expect(marker).toHaveTextContent("2");

    // Highlights are decorations, re-rendered after each selection change. A pointer
    // lands on the deepest span, so click that one like a user would.
    const veryHighlight = () => {
      let element = editor.querySelector<HTMLElement>(
        '[data-comment-highlight="inner"]'
      );
      if (!element) {
        throw new Error("Expected the inner comment highlight");
      }
      while (
        element.firstElementChild instanceof HTMLElement &&
        element.firstElementChild.hasAttribute("data-comment-highlight")
      ) {
        element = element.firstElementChild;
      }
      return element;
    };
    await userEvent.click(veryHighlight());
    const panel = await canvas.findByRole("complementary", {
      name: "Comments",
    });
    await expect(
      within(panel).getByRole("article", { name: "Comment by Liam Ortiz" })
    ).toHaveAttribute("aria-current", "true");
    await userEvent.click(veryHighlight());
    await expect(
      within(panel).getByRole("article", { name: "Comment by Maya Chen" })
    ).toHaveAttribute("aria-current", "true");
    await userEvent.click(marker);
    await expect(
      within(panel).getByRole("article", { name: "Comment by Liam Ortiz" })
    ).toHaveAttribute("aria-current", "true");
  },
};

/** @summary Read-only viewers browse comments without reply or moderation controls. */
export const ReadOnlyComments: Story = {
  args: { readOnly: true },
  play: async ({ canvas }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await expect(editor).toHaveAttribute("contenteditable", "false");
    await expect(highlights(editor)).toEqual(["reach", "wording"]);

    const highlight = editor.querySelector<HTMLElement>(
      '[data-comment-highlight="reach"]'
    );
    if (!highlight) {
      throw new Error("Expected a comment highlight");
    }
    await userEvent.click(highlight);
    const panel = await canvas.findByRole("complementary", {
      name: "Comments",
    });
    const thread = within(panel).getByRole("article", {
      name: "Comment by Maya Chen",
    });
    await expect(thread).toHaveAttribute("aria-current", "true");
    await expect(thread).toHaveFocus();
    await expect(within(panel).queryByRole("textbox")).not.toBeInTheDocument();
    await expect(
      within(panel).queryByRole("button", {
        name: /^(Resolve|Reopen|Delete comment)$/,
      })
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(panel).getByRole("button", { name: "Close comments" })
    );
    await waitFor(() =>
      expect(
        canvas.queryByRole("complementary", { name: "Comments" })
      ).not.toBeInTheDocument()
    );
    await expect(
      canvas.getByRole("button", { name: "Comments, 2 unresolved" })
    ).toHaveFocus();
  },
};

/** @summary Without an author, editors keep existing comments but cannot add new ones. */
export const WithoutAuthor: Story = {
  args: { commentAuthor: undefined },
  play: async ({ canvas, canvasElement }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.click(editor);
    selectFirstParagraph(editor);
    const toolbar = await findSelectionToolbar(canvasElement);
    await expect(
      within(toolbar).queryByRole("button", { name: "Comment" })
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Control>}{Alt>}m{/Alt}{/Control}");
    await expect(
      canvas.queryByRole("dialog", { name: "New comment" })
    ).not.toBeInTheDocument();
    await expect(
      canvas.getAllByRole("button", { name: /^Show comment by/ })
    ).toHaveLength(2);
  },
};

/** @summary Markdown documents save no comments, so the toolbar offers none. */
export const MarkdownSaveFormat: Story = {
  args: {
    initialContent: "Select these words.",
    contentType: "markdown",
    saveFormat: "markdown",
  },
  play: async ({ canvas, canvasElement }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.click(editor);
    selectContents(editor);
    const toolbar = await findSelectionToolbar(canvasElement);
    await expect(
      within(toolbar).queryByRole("button", { name: "Comment" })
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: /Comments/ })
    ).not.toBeInTheDocument();
  },
};

/** @summary Code blocks and inline code cannot anchor a comment, so the action stays away. */
export const UnsupportedSelections: Story = {
  args: {
    initialContent: JSON.stringify({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          content: [{ type: "text", text: "const answer = 42;" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "npm install",
              marks: [{ type: "code" }],
            },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Plain prose still works." }],
        },
      ],
    }),
  },
  play: async ({ canvas, canvasElement }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.click(editor);

    for (const selector of ["pre", "p:has(code)"]) {
      const element = editor.querySelector(selector);
      if (!element) {
        throw new Error(`Expected ${selector} in the document`);
      }
      selectContents(element);
      const toolbar = await findSelectionToolbar(canvasElement);
      await expect(
        within(toolbar).queryByRole("button", { name: "Comment" })
      ).not.toBeInTheDocument();
      await userEvent.keyboard("{Control>}{Alt>}m{/Alt}{/Control}");
      await expect(
        canvas.queryByRole("dialog", { name: "New comment" })
      ).not.toBeInTheDocument();
    }

    const prose = editor.querySelectorAll("p")[1];
    selectContents(prose);
    const toolbar = await findSelectionToolbar(canvasElement);
    await expect(
      await within(toolbar).findByRole("button", { name: "Comment" })
    ).toBeVisible();
  },
};

/** @summary Malformed stored comments keep the document closed and unchanged. */
export const InvalidComments: Story = {
  args: {
    initialContent: JSON.stringify({
      type: "doc",
      attrs: { comments: [{ id: "broken" }] },
      content: [{ type: "paragraph" }],
    }),
  },
  play: async ({ canvas, args }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "saved content has not been changed"
    );
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** @summary The composer open under a selection, left for the accessibility check. */
export const ComposerOpen: Story = {
  args: {
    initialContent: "Select these words to comment on them.",
    contentType: "markdown",
  },
  play: async ({ canvas, canvasElement }) => {
    const editor = await canvas.findByRole("textbox", {
      name: "Document content",
    });
    await userEvent.click(editor);
    selectFirstParagraph(editor);
    const toolbar = await findSelectionToolbar(canvasElement);
    await userEvent.click(
      within(toolbar).getByRole("button", { name: "Comment" })
    );
    await canvas.findByRole("dialog", { name: "New comment" });
    await userEvent.keyboard("Left open for review.");
  },
};

/** @summary The panel open on an active thread in the dark theme. */
export const DarkCommentedDocument: Story = {
  globals: { theme: "dark" },
  play: async ({ canvas }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Show comment by Maya Chen" })
    );
    await expect(
      await canvas.findByRole("complementary", { name: "Comments" })
    ).toBeVisible();
  },
};

/** @summary In a narrow container the panel overlays the text instead of pushing it. */
export const NarrowCommentedDocument: Story = {
  play: openPanel,
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-120">
        <Story />
      </div>
    ),
  ],
};
