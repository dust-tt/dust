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
  CREATE_CONTENT_CREATION_FILE_TOOL_NAME,
  EDIT_CONTENT_CREATION_FILE_TOOL_NAME,
  RENAME_CONTENT_CREATION_FILE_TOOL_NAME,
  RETRIEVE_CONTENT_CREATION_FILE_TOOL_NAME,
  REVERT_CONTENT_CREATION_FILE_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/servers/content_creation/types";

export const CONTENT_CREATION_INSTRUCTIONS = `\
## CREATING VISUALIZATIONS WITH CONTENT CREATION

You have access to a Content Creation system that allows you to create and update executable files. When creating visualizations, you should create files instead of using the :::visualization directive.
This toolset is called Frame in the product, users may refer to it as such.

### File Management Guidelines:
- Use the \`${CREATE_CONTENT_CREATION_FILE_TOOL_NAME}\` tool to create JavaScript/TypeScript files
- Use MIME type \`${VIZ_MIME_TYPE}\`
- Supported file extensions: .js, .jsx, .ts, .tsx
- Files are automatically made available to the user for execution

### Updating Existing Files:
- To modify existing Content Creation files, always use \`${RETRIEVE_CONTENT_CREATION_FILE_TOOL_NAME}\` first to read the current content
- Then use \`${EDIT_CONTENT_CREATION_FILE_TOOL_NAME}\` to make targeted changes by replacing specific text
- The edit tool requires exact text matching - include surrounding context for unique identification
- Never attempt to edit without first retrieving the current file content

### Reverting Files:
- Use \`${REVERT_CONTENT_CREATION_FILE_TOOL_NAME}\` to revert the edits or file renames made in the last agent message.

### Renaming Files:
- Use \`${RENAME_CONTENT_CREATION_FILE_TOOL_NAME}\` to rename an existing Content Creation file
- The new file name must include a valid extension (e.g., .js, .jsx, .ts, .tsx)
- Renaming only changes the file name; the content remains unchanged

${VIZ_REACT_COMPONENT_GUIDELINES}

${VIZ_STYLING_GUIDELINES}

${VIZ_FILE_HANDLING_GUIDELINES}

${VIZ_LIBRARY_USAGE}

${VIZ_MISCELLANEOUS_GUIDELINES}

- When to Create Files:
  - Create files for data visualizations such as graphs, charts, and plots
  - Create files for interactive React components that require user interaction
  - Create files for complex visualizations that benefit from being standalone components
  - Do not create files for simple text-based content that can be rendered in Markdown
  - Only create files for truly interactive output that requires React components

${VIZ_USE_FILE_EXAMPLES}

Example File Creation:

\`\`\`
${CREATE_CONTENT_CREATION_FILE_TOOL_NAME}({
  file_name: "SineCosineChart.tsx",
  mime_type: "${VIZ_MIME_TYPE}",
  content: \`[React component code]\`
})
\`\`\`

Example File Editing Workflow:

**Step 1: Retrieve the current file content first**
\`\`\`
${RETRIEVE_CONTENT_CREATION_FILE_TOOL_NAME}({
  file_id: "fil_abc123"
})
// This returns the current file content - examine it carefully to identify the exact text to replace
\`\`\`

**Step 2: Make targeted edits using the retrieved content**
\`\`\`
${EDIT_CONTENT_CREATION_FILE_TOOL_NAME}({
  file_id: "fil_abc123",
  old_string: "  for (let x = 0; x <= 360; x += 10) {\\n    const radians = (x * Math.PI) / 180;\\n    data.push({",
  new_string: "  for (let x = 0; x <= 720; x += 5) {\\n    const radians = (x * Math.PI) / 180;\\n    data.push({",
  expected_replacements: 1,
})
\`\`\`

The edit tool requires exact text matching, so retrieving the current content first ensures your edits will succeed.

${VIZ_CHART_EXAMPLES}
`;
