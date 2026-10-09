import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  FILES_COPY_ACTION_NAME,
  FILES_LIST_ACTION_NAME,
  FILES_RESOLVE_ACTION_NAME,
  FILES_SERVER_NAME,
} from "@app/lib/api/actions/servers/files/metadata";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";

const MARKDOWN_DOCUMENTS_INSTRUCTIONS = `
Markdown documents (\`.md\`) in the conversation's or pod's files open in an editor where people read and edit them, and discuss passages in comment threads.

**Writing a document.** Write ordinary Markdown. Tables, task lists, HTML, reference-style links and \`~~~\` fences make the document read-only in the editor: avoid them unless asked. Leave the \`:comment-start{…}\` and \`:comment-end{…}\` anchors and the \`:::annotations\` block at the end of the file as they are: they hold the comment threads.

**Images.** To show an image in a document, embed it on its own line with its file path as the destination: \`![Revenue by quarter](pod-<id>/charts/revenue.png)\`.
- The destination is the full path, starting with \`conversation-<id>/\` or \`pod-<id>/\`, as \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_LIST_ACTION_NAME)}\` returns it. Only such a path displays: an external URL or a relative path shows as the alt text.
- For an image you generated, or one attached without a path, get its path with \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_RESOLVE_ACTION_NAME)}\`.
- Readers see an image only if they can read its file. In a document of a pod, embed images from the pod: copy a conversation's image into the pod, next to the document, with \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_COPY_ACTION_NAME)}\`, then embed the copy's path.
- Write alt text that says what the image shows.
`;

/**
 * @cc [owner:tdraier,label:product] markdown-documents-skill
 * In workspaces with `co_edition`, the skill MUST be offered to agents to enable in every agent
 * run, and MUST NOT be offered by itself in other workspaces. Its instructions MUST tell agents
 * how to write a document the editor can open and how to embed an image by the file path
 * `resolveDocumentImageSource` displays.
 */
export const markdownDocumentsSkill = {
  sId: "markdown_documents",
  kind: "global",
  name: "Markdown Document Edition",
  userFacingDescription:
    "Write and edit Markdown documents that open in the editor, with images from the " +
    "conversation or pod.",
  agentFacingDescription:
    "Enable before creating or editing a Markdown (.md) document, including to add an image " +
    "to one: explains the Markdown the document editor opens and how to embed generated or " +
    "attached images.",
  instructions: MARKDOWN_DOCUMENTS_INSTRUCTIONS,
  exposeInstructions: true,
  version: 1,
  icon: "ActionDocumentTextIcon",
  isRestricted: async (auth: Authenticator) =>
    !(await hasFeatureFlag(auth, "co_edition")),
  getAutoEnabledOrEquippedForAgentLoop: () => "equipped",
} as const satisfies GlobalSkillDefinition;
