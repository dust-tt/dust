import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  DOCUMENTS_ADD_COMMENT_ACTION_NAME,
  DOCUMENTS_REPLY_TO_COMMENT_ACTION_NAME,
  DOCUMENTS_SERVER_NAME,
} from "@app/lib/api/actions/servers/documents/metadata";
import {
  FILES_CAT_ACTION_NAME,
  FILES_GREP_ACTION_NAME,
  FILES_SERVER_NAME,
} from "@app/lib/api/actions/servers/files/metadata";
import {
  GET_MENTION_MARKDOWN_TOOL_NAME,
  SEARCH_AVAILABLE_USERS_TOOL_NAME,
  USER_MENTIONS_SERVER_NAME,
} from "@app/lib/api/actions/servers/user_mentions/metadata";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import type { SystemSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";

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

const DOCUMENT_COMMENTS_INSTRUCTIONS = `
People discuss Markdown documents in comment threads anchored on passages of the text, and read your answers there rather than in this conversation.

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

/**
 * @cc [owner:tdraier,label:product] document-comments-skill
 * In workspaces with `co_edition`, the skill MUST be always active, its instructions in the
 * system prompt from the first step, in an agent run whose user message opens as
 * `documentCommentMessageHeading` does, up to the document path (``Comment in thread `<id>` of
 * the document ` ``), and MUST be unavailable in any other agent run. Skill
 * resolution without the run's user message, such as for sandbox child tool calls, MAY include
 * it, as for every auto-enabled system skill. Its instructions
 * MUST tell agents how to recognize and answer that message and find the thread it omits in the
 * document, and it MUST bring the user mention tools they name.
 */
export const documentCommentsSkill = {
  sId: "document_comments",
  kind: "system",
  name: "Document Comments",
  userFacingDescription:
    "Let agents answer document comments with suggested changes and mentions.",
  agentFacingDescription:
    "Answer comment threads on Markdown documents, suggest changes to the commented text " +
    "and mention users.",
  instructions: DOCUMENT_COMMENTS_INSTRUCTIONS,
  mcpServers: [{ name: USER_MENTIONS_SERVER_NAME }],
  version: 1,
  icon: "ActionDocumentTextIcon",
  isRestricted: async (auth: Authenticator) =>
    !(await hasFeatureFlag(auth, "co_edition")),
  getAutoEnabledOrEquippedForAgentLoop: () => "enabled",
  isDisabledForAgentLoop: ({ userMessage }) =>
    !isDocumentCommentMessage(userMessage.content),
} as const satisfies SystemSkillDefinition;
