import {
  Document,
  type DocumentComment,
  type DocumentCommentAuthor,
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
      within(panel).getByRole("heading", { name: /Comments/ })
    ).toHaveTextContent("Comments2");
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
      canvasElement.querySelector('[aria-pressed="true"]')
    ).toBeNull();

    await userEvent.click(
      within(wording).getByRole("button", { name: "Show commented text" })
    );
    await expect(wording).toHaveAttribute("aria-current", "true");
    await expect(
      canvas.getByRole("button", { name: "Show comment by Liam Ortiz" })
    ).toHaveAttribute("aria-pressed", "true");
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
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      canvas.queryByRole("button", { name: /Show comment by/ })
    ).not.toBeInTheDocument();

    await userEvent.click(editor);
    const paragraph = editor.querySelector("p");
    if (!paragraph) {
      throw new Error("Expected a document paragraph");
    }
    selectContents(paragraph);
    const toolbar = await page.findByRole("toolbar", {
      name: "Format selection",
    });
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
    const saved = JSON.parse(
      (args.onSave as ReturnType<typeof fn>).mock.calls[0][0] as string
    );
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
    const paragraph = editor.querySelector("p");
    if (!paragraph) {
      throw new Error("Expected a document paragraph");
    }
    selectContents(paragraph);
    await userEvent.keyboard("{Control>}{Alt>}m{/Alt}{/Control}");
    const composer = await canvas.findByRole("dialog", { name: "New comment" });
    await userEvent.keyboard("Never posted");
    await userEvent.keyboard("{Escape}");
    await expect(composer).not.toBeInTheDocument();
    await expect(editor.querySelector("[data-comment-draft]")).toBeNull();
    await expect(editor).toHaveFocus();

    selectContents(paragraph);
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
      within(reach).getByRole("button", { name: "Show commented text" })
    );
    await userEvent.type(
      within(reach).getByRole("textbox", { name: "Reply" }),
      "Target was 30%, so we are ahead.{Enter}"
    );
    await expect(reach).toHaveTextContent("Target was 30%, so we are ahead.");
    await expect(
      within(reach).getByRole("textbox", { name: "Reply" })
    ).toHaveValue("");

    await userEvent.click(
      within(reach).getByRole("button", { name: "Resolve" })
    );
    await expect(highlights(editor)).toEqual(["wording"]);
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
    await expect(
      editor.querySelector("[data-comment-id='wording']")
    ).toBeNull();

    // Cmd/Ctrl+S saves from the editor, so leave the panel first.
    await userEvent.click(editor);
    await userEvent.keyboard("{Control>}s{/Control}");
    await waitFor(() => expect(args.onSave).toHaveBeenCalledTimes(1));
    const saved = JSON.parse(
      (args.onSave as ReturnType<typeof fn>).mock.calls[0][0] as string
    );
    await expect(
      saved.attrs.comments.map((comment: DocumentComment) => comment.id)
    ).toEqual(["reach", "typo"]);
    await expect(saved.attrs.comments[0].replies).toHaveLength(2);
    await expect(JSON.stringify(saved)).not.toContain("wording");
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
    const paragraph = editor.querySelector("p");
    if (!paragraph) {
      throw new Error("Expected a document paragraph");
    }
    selectContents(paragraph);
    const toolbar = await within(canvasElement.ownerDocument.body).findByRole(
      "toolbar",
      { name: "Format selection" }
    );
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
    const toolbar = await within(canvasElement.ownerDocument.body).findByRole(
      "toolbar",
      { name: "Format selection" }
    );
    await expect(
      within(toolbar).queryByRole("button", { name: "Comment" })
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: /Comments/ })
    ).not.toBeInTheDocument();
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

/** @summary The panel open in the dark theme. */
export const DarkCommentedDocument: Story = {
  globals: { theme: "dark" },
  play: async ({ canvas }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: /Comments/ })
    );
    await expect(
      await canvas.findByRole("complementary", { name: "Comments" })
    ).toBeVisible();
  },
};

/** @summary In a narrow container the panel overlays the text instead of pushing it. */
export const NarrowCommentedDocument: Story = {
  ...DarkCommentedDocument,
  globals: { theme: "light" },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-120">
        <Story />
      </div>
    ),
  ],
};
