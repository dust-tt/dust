import {
  VIZ_CHART_EXAMPLES,
  VIZ_FILE_HANDLING_GUIDELINES,
  VIZ_LIBRARY_USAGE,
  VIZ_MIME_TYPE,
  VIZ_MISCELLANEOUS_GUIDELINES,
  VIZ_REACT_COMPONENT_GUIDELINES,
  VIZ_STYLING_GUIDELINES,
  VIZ_USE_FILE_EXAMPLES,
} from "@app/lib/actions/mcp_internal_actions/servers/common/viz/instructions";
import {
  CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  RENAME_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  REVERT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
} from "@app/lib/api/actions/servers/interactive_content/metadata";

export const INTERACTIVE_CONTENT_INSTRUCTIONS = `\
## CREATING VISUALIZATIONS WITH INTERACTIVE CONTENT

You have access to an Interactive Content system that allows you to create and update executable files. When creating visualizations, you should create files instead of using the :::visualization directive.
This toolset is called Frame in the product, users may refer to it as such.

### Creating Files

Use the \`${CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME}\` tool to create JavaScript/TypeScript files:
- Use MIME type \`${VIZ_MIME_TYPE}\`
- Supported file extensions: .js, .jsx, .ts, .tsx
- Files are automatically made available to the user for execution

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
- You can then customize it using \`${EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME}\`
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
Common pattern: Create from template, then use \`${EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME}\` to customize.
This approach works well when adapting existing templates (preserves structure/style, no token cost for base content).
Typical use cases: Suitable template exists, adapting existing code, saving tokens on large files.

### Updating Existing Files:
- To modify existing Interactive Content files, always use \`${RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME}\` first to read the current content
- Then use \`${EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME}\` to make targeted changes by replacing specific text
- The edit tool requires exact text matching - include surrounding context for unique identification
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


### Validation

Validation is performed automatically when you create or edit files.

**Tailwind validation (non-blocking):** Files are saved even with Tailwind warnings. When you
receive warnings in the tool response, they include the exact \`old_string\` and
\`expected_replacements\` count. Fix these warnings using \`${EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME}\`
with the provided values. If you receive multiple warnings, fix all of them in a single response
using multiple edit tool calls. Common warning: "Forbidden Tailwind arbitrary value 'h-[600px]'"
means you should replace with predefined classes like h-96 or use inline styles. Do not regenerate
the entire file; use targeted edits only.

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
${EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME}({
  file_id: "fil_abc123",
  old_string: "className=\\"text-[14px]\\"",  // EXACTLY as provided in warning
  new_string: "className=\\"text-sm\\"",
  expected_replacements: 5  // EXACTLY as provided in warning
})
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

${VIZ_REACT_COMPONENT_GUIDELINES}

${VIZ_STYLING_GUIDELINES}

${VIZ_FILE_HANDLING_GUIDELINES}

${VIZ_LIBRARY_USAGE}

${VIZ_MISCELLANEOUS_GUIDELINES}

- When to Create Files:
  - Create files for data visualizations such as graphs, charts, and plots
  - Create files for complex visualizations that require user interaction
  - Do not create files for simple text-based content that can be rendered in Markdown
  - Do not create files for content that does not require user interaction

${VIZ_USE_FILE_EXAMPLES}

Examples:

${VIZ_CHART_EXAMPLES}
`;
