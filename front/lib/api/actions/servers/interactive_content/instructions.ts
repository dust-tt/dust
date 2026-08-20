import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  VIZ_MIME_TYPE,
  VIZ_SLIDESHOW_MIME_TYPE,
} from "@app/lib/api/actions/servers/common/viz/instructions";
import {
  FILES_CAT_ACTION_NAME,
  FILES_EDIT_ACTION_NAME,
  FILES_LIST_ACTION_NAME,
  FILES_MOVE_ACTION_NAME,
  FILES_RESOLVE_ACTION_NAME,
  FILES_SERVER_NAME,
} from "@app/lib/api/actions/servers/files/metadata";
import {
  INTERACTIVE_CONTENT_AUTHORING_PROSE_V2,
  INTERACTIVE_CONTENT_CHART_EXAMPLES_V2,
  INTERACTIVE_CONTENT_FRAME_IMPORT_EXAMPLE_V2,
  INTERACTIVE_CONTENT_USE_FILE_EXAMPLES_V2,
} from "@app/lib/api/actions/servers/interactive_content/instructions_v2";
import {
  CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  FRAME_RECREATE_WASTE_RATIONALE,
  PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  RENAME_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  REVERT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
} from "@app/lib/api/actions/servers/interactive_content/metadata";

const FILES_EDIT_TOOL = getPrefixedToolName(
  FILES_SERVER_NAME,
  FILES_EDIT_ACTION_NAME
);
const FILES_CAT_TOOL = getPrefixedToolName(
  FILES_SERVER_NAME,
  FILES_CAT_ACTION_NAME
);
const FILES_LIST_TOOL = getPrefixedToolName(
  FILES_SERVER_NAME,
  FILES_LIST_ACTION_NAME
);
const FILES_RESOLVE_TOOL = getPrefixedToolName(
  FILES_SERVER_NAME,
  FILES_RESOLVE_ACTION_NAME
);
const FILES_MOVE_TOOL = getPrefixedToolName(
  FILES_SERVER_NAME,
  FILES_MOVE_ACTION_NAME
);

const UPDATING_SECTION_LEGACY = `\
### Updating Existing Files:
- To modify existing Interactive Content files, always use \`${RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME}\` first to read the current content
- Then use \`${EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME}\` to make targeted changes by replacing specific text
- The edit tool requires exact text matching, include surrounding context for unique identification
- Never attempt to edit without first retrieving the current file content

Example:

**Step 1: Retrieve the current file content first**
\`\`\`
${RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME}({
  file_id: "fil_abc123"
})
// This returns the current file content. Examine it carefully to identify the exact text to replace.
\`\`\`

**Step 2: Make targeted edits using the retrieved content**
\`\`\`
${EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME}({
  file_id: "fil_abc123",
  old_string: "  for (let x = 0; x <= 360; x += 10) {\\n    const radians = (x * Math.PI) / 180;\\n    data.push({",
  new_string: "  for (let x = 0; x <= 720; x += 5) {\\n    const radians = (x * Math.PI) / 180;\\n    data.push({",
  expected_replacements: 1,
})
\`\`\`

The edit tool requires exact text matching, so retrieving the current content first ensures your edits will succeed.
`;

const PUBLISH_PARAGRAPH = `\
Publishing rebuilds the Frame from its source so viewers and shares see the new version. It updates the existing Frame in place, keeping its identity and share URL. Until you publish, edits to the source do not change the rendered Frame. Multi-file Frames work the same way: edit any source file under that directory, keep every source file under it, then publish. A TypeScript or JSX syntax error blocks publishing and is reported back so you can fix it.`;

// Shared decision gate between the creating and updating flows. Kept generic so it holds for
// every variant, including legacy conversations whose edit flow goes through the file-id tool.
const CREATE_VS_UPDATE_SECTION = `\
### Creating vs. Updating

Create a Frame only when the content does not exist yet. When the user asks for changes to a Frame that already exists in the conversation (fixing a bug, updating data, changing colors, text, charts, or layout, adding a section), update that Frame in place following "Updating Existing Files" below. Never create a new Frame, and never resend the full source, to change an existing one: ${FRAME_RECREATE_WASTE_RATIONALE}, while targeted edits are cheap.
`;

// Computer-first variant, used when the Computer is available. The Frame's source is mounted in
// the Computer, so the model edits the file in place and republishes.
const UPDATING_SECTION_COMPUTER_FIRST = `\
### Updating Existing Files (edit the source, then publish):

After a Frame is created, its source file is already mounted in the Computer at \`/files/conversation-<conversationId>/<FrameName>.tsx\`. A Frame whose source was moved elsewhere, for example into a Pod app folder, is mounted at its current path instead; resolve it with \`${FILES_RESOLVE_TOOL}\` from its file id, or list the file system with \`${FILES_LIST_TOOL}\` when you know neither. To update the Frame:
1. Edit that file in place with your file tools, changing only the parts that need to change. Do not rewrite the whole file for partial changes. When the Computer is not available, edit it with \`${FILES_EDIT_TOOL}\` using its scoped path, e.g. \`conversation-<conversationId>/<FrameName>.tsx\`.
2. Publish with \`${PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME}\`, passing \`path\` set to the source file's own scoped path (the entry file itself, not the directory holding it), e.g. \`conversation-<conversationId>/<FrameName>.tsx\`.

If an edit fails because the text to replace is not found, the file differs from what you remember: re-read it and retry the targeted edit. Never respond to a failed match by resending the whole file.

${PUBLISH_PARAGRAPH}
`;

// Files-tools variant, used when the conversation has the file system but no Computer. The
// model edits the Frame's source through the files server, then republishes.
const UPDATING_SECTION_FILES_FIRST = `\
### Updating Existing Files (edit the source, then publish):

After a Frame is created, its source file is available to your file tools at \`conversation-<conversationId>/<FrameName>.tsx\`. A Frame whose source was moved elsewhere, for example into a Pod app folder, is available at its current path instead. To update the Frame:
1. Read the source with \`${FILES_CAT_TOOL}\` if you need the current content. If you are unsure of the exact path, list the directory with \`${FILES_LIST_TOOL}\` or resolve the Frame's file id with \`${FILES_RESOLVE_TOOL}\`.
2. Make targeted edits with \`${FILES_EDIT_TOOL}\`, replacing only the text that changes. Do not rewrite the whole file for partial changes.
3. Publish with \`${PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME}\`, passing \`path\` set to the source file's own scoped path (the entry file itself, not the directory holding it).

If an edit fails because the text to replace is not found, the file differs from what you remember: re-read it with \`${FILES_CAT_TOOL}\` and retry the targeted edit. Never respond to a failed match by resending the whole file.

Example, updating one value of an existing Frame:
\`\`\`
${FILES_EDIT_TOOL}({
  path: "conversation-<conversationId>/Dashboard.tsx",
  old_string: "const REGIONS = [\\"EMEA\\", \\"AMER\\"];",
  new_string: "const REGIONS = [\\"EMEA\\", \\"AMER\\", \\"APAC\\"];",
})
${PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME}({
  file_id: "fil_abc123",
  path: "conversation-<conversationId>/Dashboard.tsx",
})
\`\`\`

${PUBLISH_PARAGRAPH}
`;

// Pod conversations only. A Pod's Frames belong to the Pod rather than to the conversation that
// happened to create them, and each one gets its own folder so the pod functions and database
// schema it may grow later land next to it instead of forcing a second move.
const POD_APP_SECTION = `\
### Frames In A Pod

This conversation belongs to a Pod, so its Frames belong to the Pod, not to this conversation: every conversation in the Pod sees the same Frame, and it outlives this one.

Give each Frame its own folder on the Pod file system, named after the Frame, and keep the Frame's source inside it:

\`\`\`
/files/pod-<podId>/
  MyApp/
    MyApp.tsx
\`\`\`

\`${CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME}\` creates the Frame's source in the current conversation, so move it into its folder before publishing. Use \`${FILES_MOVE_TOOL}\` — never \`mv\` or \`cp\` in the Computer, and never a copy: only \`${FILES_MOVE_TOOL}\` carries the Frame's file record along with its bytes — then publish it from its Pod path:

\`\`\`
${FILES_MOVE_TOOL}({
  source: "conversation-<conversationId>/MyApp.tsx",
  dest: "pod-<podId>/MyApp/MyApp.tsx",
})
${PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME}({
  file_id: "fil_abc123",
  path: "pod-<podId>/MyApp/MyApp.tsx",
})
\`\`\`

From then on, edit the source at its Pod path and publish it again. Anything the Frame imports relatively must live under its folder, which is the bundling root.

#### Changing An Existing Pod Frame

A Pod frame you are asked to change was usually built in an earlier conversation, so you know neither its source path nor its file id, and publishing needs both. Never recreate it, and never guess either value: read them off the Pod listing.

1. List the Pod file system with \`${FILES_LIST_TOOL}\` (\`scope: { type: "pod" }\`). Every Frame is listed as its Pod path followed by \`[id: fil_...]\`, which is its \`file_id\`. Find the frame you're after.
2. Edit that source in place as described under "Updating Existing Files" below.
3. Publish with \`${PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME}\`, passing the \`path\` and \`file_id\` exactly as listed in step 1.
`;

// Pod conversations where pod functions are available. Without this, a Frame asked to hold data
// silently ends up with a `useState` array that dies on reload, and the user only finds out after
// entering real data.
const podStorageSection = (podFunctionsSkillName: string) => `\
### Where The Frame's Data Lives

If the Frame lets people add, edit, check off, reorder, delete, save, assign, comment, vote, or upload, its data has to survive the page: store it in a Pod database behind pod functions, and enable the \`${podFunctionsSkillName}\` skill to do it. That is the default for a task list, tracker, backlog, roster, inventory, log, queue, notes app, or any form that keeps its answers.

Keep in component state only what is genuinely throwaway. e.g. the selected tab, a filter, or a sort order.
`;

interface InstructionsVariant {
  updatingSection: string;
  validationFixExample: string;
  // Pod-specific sections, empty outside a Pod conversation.
  podSections: string;
}

const interactiveContentProseBeforeAuthoring = ({
  podSections,
  updatingSection,
  validationFixExample,
}: InstructionsVariant) => `\
## CREATING VISUALIZATIONS WITH INTERACTIVE CONTENT

You have access to an Interactive Content system that allows you to create and update executable files. When creating visualizations, you should create files instead of using the :::visualization directive.
This toolset is called Frame in the product, users may refer to it as such.

${CREATE_VS_UPDATE_SECTION}
${podSections}### Creating Files

Use the \`${CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME}\` tool to create JavaScript/TypeScript files:
- Use MIME type \`${VIZ_MIME_TYPE}\` for visualizations/dashboards or \`${VIZ_SLIDESHOW_MIME_TYPE}\` for slideshows
- Supported file extensions: .js, .jsx, .ts, .tsx
- Files are automatically made available to the user for execution
- The MIME type is set at creation and cannot be changed afterward. To switch content type, create a new file.

The tool supports two creation modes via the \`mode\` parameter. The mode determines where the
React component code comes from:

**Inline mode** (\`mode: "inline"\`):
Use when: Creating new visualizations from scratch or providing code you've written.
How it works: You provide the complete React component code directly as a string in the source parameter.
Example:
\`\`\`
${CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME}({
  file_name: "SineCosineChart.tsx",
  mime_type: "${VIZ_MIME_TYPE}",
  mode: "inline",
  source: \`[React component code]\`
})
\`\`\`
Typical use cases: No suitable template exists, complete rewrite needed, or full code visibility required upfront.


**Template mode** (\`mode: "template"\`):
Use when: Reusing existing React code already stored in the company's knowledge base (data sources).
How it works:
- Reference existing content by its ID (found in <knowledge id="..."> tags from company data searches)
- Pass that ID to the source parameter
- Content is fetched server-side without consuming context tokens
- You can then customize it with targeted edits
Example:
\`\`\`
// After finding code with <knowledge id="template_node_id">
${CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME}({
  file_name: "NewVisualization.tsx",
  mime_type: "${VIZ_MIME_TYPE}",
  mode: "template",
  source: "template_node_id",  // ID from the knowledge tag
  description: "Sales dashboard"
})
\`\`\`
When using template mode, you don't need to read the template content first.
Just pass the knowledge ID to the tool and the content will be fetched server-side.
Common pattern: Create from template, then customize it with targeted edits.
This approach works well when adapting existing templates (preserves structure/style, no token cost for base content).
Typical use cases: Suitable template exists, adapting existing code, saving tokens on large files.

${updatingSection}

### Validation

Validation is performed automatically when you create or edit files.

**Tailwind validation (non-blocking):** Files are saved even with Tailwind warnings. When you
receive warnings in the tool response, they include the exact \`old_string\` and
\`expected_replacements\` count. Fix these warnings with targeted edits using the provided values.
If you receive multiple warnings, fix all of them in a single response using multiple edit tool
calls. Common warning: "Forbidden Tailwind arbitrary value 'h-[600px]'" means you should replace
with predefined classes like h-96 or use inline styles. Do not regenerate the entire file; use
targeted edits only.

When fixing validation warnings, use the exact values provided. Do not add context, modify them,
interpret them, or retrieve the file first.

Example warning response:
\`\`\`
{
  old_string: "className=\\"text-[14px]\\"",
  expected_replacements: 5
}
\`\`\`

Correct fix:
\`\`\`
${validationFixExample}
\`\`\`

**TypeScript validation (blocking):** Files are rejected if TypeScript/JSX syntax is invalid.
Fix syntax errors before the file can be created/edited.

### Reverting Files:
- Use \`${REVERT_INTERACTIVE_CONTENT_FILE_TOOL_NAME}\` to restore the file to its previous version.
- Each revert moves back one version in the file's history. Reverting multiple times in sequence moves progressively backward through versions (not a toggle).
- Each edit creates a new version. If you made multiple edits in a single message, one revert will only undo the most recent edit.

### Renaming Files:
- Use \`${RENAME_INTERACTIVE_CONTENT_FILE_TOOL_NAME}\` to rename an existing Interactive Content file
- The new file name must include a valid extension (e.g., .js, .jsx, .ts, .tsx)
- Renaming only changes the file name; the content remains unchanged
`;

const INTERACTIVE_CONTENT_TOOLS_PROSE_AFTER_AUTHORING = `\
- When to Create Files:
  - Create files for data visualizations such as graphs, charts, and plots
  - Create files for complex visualizations that require user interaction
  - Create files for slideshow presentations (use the Slideshow component)
  - Do not create files for simple text-based content that can be rendered in Markdown
  - Do not create files for content that does not require user interaction

### Slideshows

When the user asks for a presentation, slideshow, deck, or multi-slide content, create an interactive
content file using the \`Slideshow\` and \`Slide\` components.

**MIME type:** Always set \`mime_type\` to \`${VIZ_SLIDESHOW_MIME_TYPE}\` when creating a slideshow.

**Import:** \`import { Slideshow, Slide } from "@dust/slideshow/v2";\`

**Components:**
- \`<Slideshow>\` wraps all slides. It handles navigation (prev/next arrows, dot indicators, keyboard
  arrow keys) and PDF export automatically. Accepts an optional \`className\` prop.
- \`<Slide>\` represents one slide. Each slide takes the full viewport height, centers its children,
  and accepts a \`className\` prop (commonly used for background colors like \`bg-slate-50\`).
  Inside a \`<Slide>\`, use any React and Tailwind, standard HTML elements, Recharts charts,
  grid layouts, etc.

**Content guidelines:**
- One main idea per slide. Avoid overcrowding.
- Use a consistent background color across slides for cohesion (e.g. all \`bg-white\` or all \`bg-slate-50\`).
  Use 1-2 accent colors for emphasis elements.
- Structure content with clear hierarchy: title, then visuals or key points, then supporting text.
- For data-heavy slides, prefer charts (Recharts) over tables or bullet lists.

**Do not:**
- Do not build navigation controls (buttons, arrows, dots, keyboard handlers). They are built in.
- Do not import from \`@dust/slideshow/v1\`. Always use \`@dust/slideshow/v2\`.
- Do not set explicit heights on \`<Slide>\`, it fills the viewport automatically.
- Do not use gradients unless the user explicitly requests them.

\`\`\`tsx
import { Slideshow, Slide } from "@dust/slideshow/v2";

export default function Deck() {
  return (
    <Slideshow>
      <Slide className="bg-slate-50">
        <h1 className="text-6xl font-bold text-slate-900 mb-4">Q4 Revenue Analysis</h1>
        <p className="text-xl text-slate-500">Annual review & key insights</p>
      </Slide>
      <Slide className="bg-white">
        <h2 className="text-4xl font-semibold mb-8">Key Metrics</h2>
        <div className="grid grid-cols-3 gap-8">
          <div className="text-center">
            <p className="text-5xl font-bold text-blue-600">+25%</p>
            <p className="text-lg text-slate-500 mt-2">YoY Growth</p>
          </div>
          <div className="text-center">
            <p className="text-5xl font-bold text-green-600">92%</p>
            <p className="text-lg text-slate-500 mt-2">Retention</p>
          </div>
          <div className="text-center">
            <p className="text-5xl font-bold text-purple-600">1.2k</p>
            <p className="text-lg text-slate-500 mt-2">New Customers</p>
          </div>
        </div>
      </Slide>
      <Slide className="bg-slate-50">
        <h2 className="text-4xl font-semibold mb-6">Next Steps</h2>
        <ul className="space-y-4 text-xl text-slate-700">
          <li>Expand into EU markets</li>
          <li>Launch premium tier</li>
          <li>Revamp onboarding flow</li>
        </ul>
      </Slide>
    </Slideshow>
  );
}
\`\`\`

${INTERACTIVE_CONTENT_USE_FILE_EXAMPLES_V2}

${INTERACTIVE_CONTENT_FRAME_IMPORT_EXAMPLE_V2}

Examples:

${INTERACTIVE_CONTENT_CHART_EXAMPLES_V2}
`;

const VALIDATION_FIX_EXAMPLE_LEGACY = `\
${EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME}({
  file_id: "fil_abc123",
  old_string: "className=\\"text-[14px]\\"",  // EXACTLY as provided in warning
  new_string: "className=\\"text-sm\\"",
  expected_replacements: 5  // EXACTLY as provided in warning
})`;

const VALIDATION_FIX_EXAMPLE_SOURCE_EDIT = `\
${FILES_EDIT_TOOL}({
  path: "conversation-<conversationId>/Dashboard.tsx",
  old_string: "className=\\"text-[14px]\\"",  // EXACTLY as provided in warning
  new_string: "className=\\"text-sm\\"",
  expected_replacements: 5  // EXACTLY as provided in warning
})
// Then publish the Frame so the fixes reach the rendered version.`;

const buildInstructions = (variant: InstructionsVariant) =>
  `${interactiveContentProseBeforeAuthoring(variant)}\n${INTERACTIVE_CONTENT_AUTHORING_PROSE_V2}\n${INTERACTIVE_CONTENT_TOOLS_PROSE_AFTER_AUTHORING}`;

// Legacy conversations (no conversation file system): the Frame's source is not reachable by
// path, so the model updates Frames through the retrieve and file-id edit tools. Legacy Pod
// conversations get no Pod sections either, since promoting a Frame into the Pod needs the
// path-based files tools.
export const INTERACTIVE_CONTENT_INSTRUCTIONS = buildInstructions({
  updatingSection: UPDATING_SECTION_LEGACY,
  validationFixExample: VALIDATION_FIX_EXAMPLE_LEGACY,
  podSections: "",
});

// Sections are newline-terminated, so joining and terminating again leaves exactly one blank line
// between them and before the section that follows.
const joinPodSections = (sections: string[]): string =>
  sections.length > 0 ? `${sections.join("\n")}\n` : "";

/**
 * Instructions for a conversation that has the file system.
 *
 * `hasComputer` picks how the Frame's source is edited (in the Computer mount, or through the
 * files server). `isPod` adds the Pod app layout, and `hasPodFunctions` the storage decision that
 * depends on the Pod Functions skill actually being available in the workspace.
 */
export const buildInteractiveContentInstructions = ({
  hasComputer,
  isPod,
  hasPodFunctions,
  podFunctionsSkillName,
}: {
  hasComputer: boolean;
  isPod: boolean;
  hasPodFunctions: boolean;
  podFunctionsSkillName: string;
}): string =>
  buildInstructions({
    updatingSection: hasComputer
      ? UPDATING_SECTION_COMPUTER_FIRST
      : UPDATING_SECTION_FILES_FIRST,
    validationFixExample: VALIDATION_FIX_EXAMPLE_SOURCE_EDIT,
    // The app layout is Pod-shaped guidance and only makes sense with a Pod to lay it out in. The
    // storage decision is not: a standalone conversation gets a hidden Pod of its own the moment it
    // needs one, so the Frame's data belongs behind pod functions there too, and the model has to
    // know that before it reaches for `useState`.
    podSections: joinPodSections([
      ...(isPod ? [POD_APP_SECTION] : []),
      ...(hasPodFunctions ? [podStorageSection(podFunctionsSkillName)] : []),
    ]),
  });
