import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  DOCUMENTS_ADD_COMMENT_ACTION_NAME,
  DOCUMENTS_REPLY_TO_COMMENT_ACTION_NAME,
  DOCUMENTS_SERVER_NAME,
} from "@app/lib/api/actions/servers/documents/metadata";
import {
  FILES_CAT_ACTION_NAME,
  FILES_COPY_ACTION_NAME,
  FILES_GREP_ACTION_NAME,
  FILES_LIST_ACTION_NAME,
  FILES_RESOLVE_ACTION_NAME,
  FILES_SERVER_NAME,
} from "@app/lib/api/actions/servers/files/metadata";
import {
  GET_MENTION_MARKDOWN_TOOL_NAME,
  SEARCH_AVAILABLE_USERS_TOOL_NAME,
  USER_MENTIONS_SERVER_NAME,
} from "@app/lib/api/actions/servers/user_mentions/metadata";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";

/** The line that opens the user message posted for a document comment. */
export const documentCommentMessageHeading = ({
  commentId,
  documentPath,
  location,
}: {
  commentId: string;
  documentPath: string;
  location: string;
}) =>
  `Comment in thread \`${commentId}\` of the document \`${documentPath}\`, in ${location}:`;

const COMMENT_MESSAGE_HEADING_PATTERN =
  /^Comment in thread `[^`\n]+` of the document `/;

/** Whether `content` opens as a `documentCommentMessageHeading` does, up to the document path. */
export const isDocumentCommentMessage = (content: string) =>
  COMMENT_MESSAGE_HEADING_PATTERN.test(content);

const MARKDOWN_DOCUMENTS_INSTRUCTIONS = `
Markdown documents (\`.md\`) in the conversation's or pod's files open in an editor where people read and edit them, and discuss passages in comment threads.

**Writing a document.** Write ordinary Markdown. Tables, task lists, HTML, reference-style links and \`~~~\` fences make the document read-only in the editor: avoid them unless asked. Leave the \`:comment-start{…}\` and \`:comment-end{…}\` anchors and the \`:::annotations\` block at the end of the file as they are: they hold the comment threads.

**Images.** To show an image in a document, embed it on its own line with its file path as the destination: \`![Revenue by quarter](pod-<id>/charts/revenue.png)\`.
- The destination is the full path, starting with \`conversation-<id>/\` or \`pod-<id>/\`, as \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_LIST_ACTION_NAME)}\` returns it. Only such a path displays: an external URL or a relative path shows as the alt text.
- For an image you generated, or one attached without a path, get its path with \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_RESOLVE_ACTION_NAME)}\`.
- Readers see an image only if they can read its file. In a document of a pod, embed images from the pod: copy a conversation's image into the pod, next to the document, with \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_COPY_ACTION_NAME)}\`, then embed the copy's path.
- Write alt text that says what the image shows.
`;

const DOCUMENT_COMMENTS_INSTRUCTIONS = `
People read your answers to comments in the document's threads rather than in this conversation.

**Answering a comment.** A message that opens with "Comment in thread \`<thread id>\` of the document \`<path>\`" was left in that thread; it gives the commented passage and the new comment. Read the document with \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_CAT_ACTION_NAME)}\` for context. The thread itself, with its earlier messages, is in the \`:::annotations\` block at the end of the file, under \`::comment{id=<thread id> …}\`, one \`::message{author=… name=… at=…}\` line per message; in a long document, find it with \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_GREP_ACTION_NAME)}\` rather than reading the whole file. Then answer with \`${getPrefixedToolName(DOCUMENTS_SERVER_NAME, DOCUMENTS_REPLY_TO_COMMENT_ACTION_NAME)}\`, passing that path and that thread id as \`comment_id\`, so your answer shows in the document. To open a new thread on a passage, use \`${getPrefixedToolName(DOCUMENTS_SERVER_NAME, DOCUMENTS_ADD_COMMENT_ACTION_NAME)}\`.

Write like a reviewer in the margin: short, about the passage, no headings.

**Suggesting a change.** When the thread asks for new wording, or new wording is the clearest answer, suggest it rather than describe it: add a fenced code block whose language is \`suggestion\`, holding the Markdown that would replace the commented passage.
- The block replaces exactly the commented passage, the quoted text, which is often a single word or phrase, not the sentence or paragraph around it: hold only the new text for that passage. With a comment on "roof" in "The roof held yesterday's rain", suggest \`gutters\`, not \`The gutters held yesterday's rain\`. Keep the passage's Markdown syntax.
- When the change you want reaches beyond the commented passage, describe it in words instead, or open a new thread on the longer passage and suggest it there.
- An empty block suggests deleting the passage.
- Readers can apply a suggestion in one click when it is a single paragraph of inline Markdown; otherwise they apply it by hand.
- Each block is one complete replacement, with a sentence saying why when it is not obvious. To offer alternatives, give each its own block after a short label; readers apply the one they pick.
- When the replacement contains a run of three backticks, fence the block with a longer run.
- Do not edit the document to apply your own suggestion unless asked to.

**Mentioning people.** Mention a user only to ask for their input or tell them something they need to act on, never just to address the person you answer. A mention reads \`:mention_user[Name]{sId=<user id>}\`; for someone in the thread, take both from their message line, \`author=user:<user id> name="Name"\`. For anyone else, find them with \`${getPrefixedToolName(USER_MENTIONS_SERVER_NAME, SEARCH_AVAILABLE_USERS_TOOL_NAME)}\` and get the mention with \`${getPrefixedToolName(USER_MENTIONS_SERVER_NAME, GET_MENTION_MARKDOWN_TOOL_NAME)}\`. Do not mention agents in comments.
`;

/** The skill's instructions for a run whose user message is `userMessageContent`. */
export const getMarkdownDocumentsInstructions = (
  userMessageContent: string | null
) =>
  userMessageContent !== null && isDocumentCommentMessage(userMessageContent)
    ? MARKDOWN_DOCUMENTS_INSTRUCTIONS + DOCUMENT_COMMENTS_INSTRUCTIONS
    : MARKDOWN_DOCUMENTS_INSTRUCTIONS;

/**
 * @cc [owner:tdraier,label:product] markdown-documents-skill
 * In workspaces with `co_edition`, the skill MUST be enabled, its instructions in the system
 * prompt from the first step, in an agent run whose user message opens as
 * `documentCommentMessageHeading` does, up to the document path (``Comment in thread `<id>` of
 * the document ` ``), and MUST be offered to agents to enable in every other agent run, including
 * when skills are resolved without the run's user message. It MUST NOT be offered by itself in
 * other workspaces. Its instructions MUST tell agents how to write a document the editor can open
 * and how to embed an image by the file path `resolveDocumentImageSource` displays, and, if and
 * only if the run's user message opens as that heading does, how to recognize and answer that
 * message and find the thread it omits in the document. It MUST bring the user mention tools
 * they name.
 */
export const markdownDocumentsSkill = {
  sId: "markdown_documents",
  kind: "global",
  name: "Markdown Document Edition",
  userFacingDescription:
    "Write and edit Markdown documents that open in the editor, with images from the " +
    "conversation or pod, and answer their comments.",
  agentFacingDescription:
    "Enable before creating or editing a Markdown (.md) document, including to add an image " +
    "to one: explains the Markdown the document editor opens and how to embed generated or " +
    "attached images.",
  fetchInstructions: async (_auth, { agentLoopData }) =>
    getMarkdownDocumentsInstructions(agentLoopData?.userMessage.content ?? null),
  mcpServers: [{ name: USER_MENTIONS_SERVER_NAME }],
  exposeInstructions: true,
  version: 1,
  icon: "ActionDocumentTextIcon",
  isRestricted: async (auth: Authenticator) =>
    !(await hasFeatureFlag(auth, "co_edition")),
  getAutoEnabledOrEquippedForAgentLoop: ({ userMessage }) =>
    userMessage && isDocumentCommentMessage(userMessage.content)
      ? "enabled"
      : "equipped",
} as const satisfies GlobalSkillDefinition;
