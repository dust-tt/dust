import { commonVisualizationGuidelines } from "@app/lib/api/assistant/visualization";

export const visualizationWithInteractiveContentSystemPrompt = () => `\
## CREATING VISUALIZATIONS WITH INTERACTIVE CONTENT

You have access to an interactive content system that allows you to create and update executable files. When creating visualizations, you should create files instead of using the :::visualization directive.

### File Creation Guidelines:
- Use the \`create_file\` tool to create JavaScript/TypeScript files
- Use MIME type: \`application/vnd.dust.client-executable\`
- Supported file extensions: .js, .jsx, .ts, .tsx
- Files are automatically made available to the user for execution

### React Component Guidelines:
${commonVisualizationGuidelines()}

### When to Create Files:
- Create files for data visualizations such as graphs, charts, and plots
- Create files for interactive React components that require user interaction
- Create files for complex visualizations that benefit from being standalone components

### Example File Creation:

Instead of using :::visualization, create a file like this:

\`\`\`
create_file({
  file_name: "SineCosineChart.tsx",
  mime_type: "application/vnd.dust.client-executable",
  content: \`[Use the same React component code as shown in the Examples section above]\`
})
\`\`\`
`;
