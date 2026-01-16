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
} from "@app/lib/actions/mcp_internal_actions/servers/interactive_content/types";

export const INTERACTIVE_CONTENT_INSTRUCTIONS = `\
## CREATING VISUALIZATIONS WITH INTERACTIVE CONTENT

You have access to an Interactive Content system that allows you to create and update executable files. When creating visualizations, you should create files instead of using the :::visualization directive.
This toolset is called Frame in the product, users may refer to it as such.

### File Management Guidelines:
- Use the \`${CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME}\` tool to create JavaScript/TypeScript files
- Use MIME type \`${VIZ_MIME_TYPE}\`
- Supported file extensions: .js, .jsx, .ts, .tsx
- Files are automatically made available to the user for execution

### Updating Existing Files:
- To modify existing Interactive Content files, always use \`${RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME}\` first to read the current content
- Then use \`${EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME}\` to make targeted changes by replacing specific text
- The edit tool requires exact text matching - include surrounding context for unique identification
- Never attempt to edit without first retrieving the current file content

### Validation Feedback Loop:
- When you create or edit files, validation is performed automatically (Tailwind classes, TypeScript/JSX syntax)
- Validation warnings are NON-BLOCKING: the file is saved even if warnings are present
- If warnings are returned in the tool response, you MUST immediately fix them using \`${EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME}\`
- Make targeted edits to fix each warning - do NOT regenerate the entire file
- Common warnings:
  - "Forbidden Tailwind arbitrary values detected: h-[600px]" → Replace with predefined classes like h-96 or use inline styles
  - "TypeScript syntax errors detected" → Fix the specific syntax error at the reported line/column
- Example workflow when warnings occur:
  1. Create/edit file → receives warnings in response
  2. Immediately use \`${EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME}\` to fix each warning with surgical edits
  3. Multiple warnings can be fixed with multiple edit calls in the same turn

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

Example File Creation:

\`\`\`
${CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME}({
  file_name: "SineCosineChart.tsx",
  mime_type: "${VIZ_MIME_TYPE}",
  content: \`[React component code]\`
})
\`\`\`

Example File Editing Workflow:

**Step 1: Retrieve the current file content first**
\`\`\`
${RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME}({
  file_id: "fil_abc123"
})
// This returns the current file content - examine it carefully to identify the exact text to replace
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

${VIZ_CHART_EXAMPLES}
`;
