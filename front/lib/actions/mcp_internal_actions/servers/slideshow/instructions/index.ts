import {
  COMMON_CHART_EXAMPLES,
  COMMON_FILE_EXAMPLES,
  COMMON_FILE_HANDLING_GUIDELINES,
  COMMON_LIBRARY_USAGE,
  COMMON_MIME_TYPE,
  COMMON_MISCELLANEOUS_GUIDELINES,
  COMMON_REACT_COMPONENT_GUIDELINES,
  COMMON_STYLING_GUIDELINES,
} from "@app/lib/actions/mcp_internal_actions/servers/common/instructions";

export const SLIDESHOW_INSTRUCTIONS = `
## CREATING SLIDESHOWS WITH CONTENT CREATION

You have access to a Content Creation system that allows you to create and update executable files for slideshow presentations. When creating slideshows, you should create files instead of using the :::visualization directive.

### File Management Guidelines:
- Use the \`create_content_creation_file\` tool to create JavaScript/TypeScript files
- Use MIME type \`${COMMON_MIME_TYPE}\`
- Supported file extensions: .js, .jsx, .ts, .tsx
- Files are automatically made available to the user for execution

### Updating Existing Files:
- To modify existing Content Creation files, always use \`retrieve_content_creation_file\` first to read the current content
- Then use \`edit_content_creation_file\` to make targeted changes by replacing specific text
- The edit tool requires exact text matching - include surrounding context for unique identification
- Never attempt to edit without first retrieving the current file content

${COMMON_REACT_COMPONENT_GUIDELINES}

${COMMON_STYLING_GUIDELINES}

${COMMON_FILE_HANDLING_GUIDELINES}

${COMMON_LIBRARY_USAGE}

${COMMON_MISCELLANEOUS_GUIDELINES}

${COMMON_FILE_EXAMPLES}

### Using Slideshow Components in Content Creation Files

### When to Use Slideshow Components:
Use the Slideshow component in Content Creation files for: presentations, tutorials, step-by-step analysis, comparisons, reports

WORKFLOW ENFORCEMENT:
- STEP 1: ALWAYS use create_slideshow_outline tool first
- STEP 2: Wait for explicit user confirmation of the outline
- STEP 3: Only after confirmation, proceed with slide creation
- FORBIDDEN: Never create slides directly without outline approval

CONTENT PRINCIPLES:
- Start with your key insight, not background context
- One main point per slide - don't overcrowd
- Prioritize data visualizations over text walls
- End with clear takeaways or next steps
- Tell a story: Problem → Analysis → Insights → Action

COMMON SLIDESHOW STRUCTURES:
- **Analysis**: Problem → Data → Key Insights → Recommendations
- **Report**: Executive Summary → Key Metrics → Trends → Next Steps
- **Tutorial**: Learning Goal → Step-by-Step → Examples → Practice
- **Comparison**: Options → Criteria → Analysis → Decision

### Technical Implementation:

**REQUIRED IMPORTS** (must be at the top of every slideshow file):
- import { Slideshow } from "@dust/slideshow/v1"

Core pattern
- Always wrap slides with <Slideshow.Root>…</Slideshow.Root>.
- Each Slideshow.Preset.* component creates one complete slide
- Slideshow.Preset.* components are direct children of Slideshow.Root only
- Never nest Slideshow.Preset.* components inside each other
- Use content components (Slideshow.Content.*) inside slide presets

Choose the right preset:
- Need 2-4 structured content cards? → Use Columns2/3/4
- Need title + freeform content? → Use TitleTop/TitleTopH2
- Need full-screen chart or media? → Use Full
- Need chart with text explanation? → Use ChartSplit
- Need cover slide? → Use Cover
- Need quote slide? → Use Quote


API Structure:
- Slideshow.Preset.* = Complete slide layouts (direct children of Root)
- Slideshow.Content.* = Components that go inside slide presets
- Slideshow.Text.* = Typography components for any content

Available slide presets (only these)
- <Slideshow.Preset.Cover title="…" />
- <Slideshow.Preset.TitleTop title="…">children</Slideshow.Preset.TitleTop>
- <Slideshow.Preset.TitleTopH2 title="…">children</Slideshow.Preset.TitleTopH2>
- <Slideshow.Preset.Columns2 title="…" description="…"> <Slideshow.Content.Item heading="…">children</Slideshow.Content.Item> … </Slideshow.Preset.Columns2>
- <Slideshow.Preset.Columns3 title="…" description="…"> <Slideshow.Content.Item heading="…">children</Slideshow.Content.Item> … </Slideshow.Preset.Columns3>
- <Slideshow.Preset.Columns4 title="…" description="…"> <Slideshow.Content.Item heading="…">children</Slideshow.Content.Item> … </Slideshow.Preset.Columns4>
- <Slideshow.Preset.Full>media or chart</Slideshow.Preset.Full>
- <Slideshow.Preset.ChartSplit title="…" description="…"> chart </Slideshow.Preset.ChartSplit>
- <Slideshow.Preset.Quote quote="…" author="…" />

Customization Options:
- All slide presets support theme="light" or theme="dark". Use the light theme by default, if a user specifies a background color, choose the theme based on the color luminance.
- All preset layout components accept className prop to customize the top-level component (commonly used for background colors)
- All preset layout components with titles accept titleClassName prop to customize the title styling

Typography (responsive—no breakpoints needed)
- <Slideshow.Text.Title>  // largest, used on covers
- <Slideshow.Text.Heading1> / <Slideshow.Text.Heading2> / <Slideshow.Text.Heading3>
- <Slideshow.Text.Body1> / <Slideshow.Text.Body2> / <Slideshow.Text.Body3>

Responsive Design Built-In:
All typography and spacing automatically scales smoothly across devices.
No need for responsive classes like \`sm:text-4xl md:text-6xl\` - just use the components as-is for
perfect mobile-to-desktop scaling.

Helpers
- <Slideshow.Content.Item heading="…">Body (any JSX or text)</Slideshow.Content.Item>   // use inside Columns*
- <Slideshow.Content.BulletList><Slideshow.Content.BulletItem>Point</Slideshow.Content.BulletItem></Slideshow.Content.BulletList>

Important rules:
1) Each Slideshow.Preset.* creates a complete slide. Never put one Preset inside another.
2) Columns presets (Columns2/3/4) are complete slides with built-in title and description props.
3) Keep body text concise. Use BulletList for 3–5 bullets when appropriate.
4) Always include className="h-full w-full" on ChartContainer for proper sizing.
5) When creating custom templates, do not use any of the default presets (Slideshow.Preset.*) as they can cause unexpected layout issues. Custom templates should be built from scratch.

DESIGN PRINCIPLES:
- Create visual hierarchy: Title → Visual → Supporting text
- White space is your friend - don't fill every pixel
- Typography automatically scales - focus on content, not font sizes
- Components look great on all devices without manual responsive classes

COLOR STRATEGY:
- Use neutral bright backgrounds consistently (bg-white, bg-gray-50, bg-slate-50)
 - Avoid gradients unless explicitly requested by the user (no bg-gradient-to-br, from-blue-50, etc.)
- Apply color strategically to key elements that need emphasis
- Maintain the same background color across all slides for visual cohesion
- Select 1-2 accent colors for the ENTIRE presentation and use them consistently
- Choose subtle colors for backgrounds and large areas

CONTENT STYLING STRATEGY:
- For emphasis boxes: use simple colored backgrounds (bg-blue-100) or clean borders (border border-blue-500 bg-white)
- Keep styling minimal and clean with generous white space
- Structure content with typography hierarchy rather than decorative boxes

**Navigation is automatic** - arrow keys, thumbnails, prev/next buttons provided.
Focus on content quality, not navigation controls.

Example using pre-built layouts:
\`\`\`tsx
import { Slideshow } from "@dust/slideshow/v1";

export default function Deck() {
  return (
    <Slideshow.Root>
      <Slideshow.Preset.Cover title="Q4 Revenue Analysis" />

      <Slideshow.Preset.TitleTop title="Executive Summary">
        <Slideshow.Text.Body2>
          +25% YoY growth driven by retention and EU expansion.
        </Slideshow.Text.Body2>
      </Slideshow.Preset.TitleTop>

      <Slideshow.Preset.Columns3 title="Key Goals">
        <Slideshow.Content.Item heading="Retention">
          <Slideshow.Content.BulletList>
            <Slideshow.Content.BulletItem>
              Onboarding revamp
            </Slideshow.Content.BulletItem>
            <Slideshow.Content.BulletItem>
              Proactive success
            </Slideshow.Content.BulletItem>
          </Slideshow.Content.BulletList>
        </Slideshow.Content.Item>
        <Slideshow.Content.Item heading="Expansion">
          Enter EU markets
        </Slideshow.Content.Item>
        <Slideshow.Content.Item heading="Pricing">
          Launch new tiers
        </Slideshow.Content.Item>
      </Slideshow.Preset.Columns3>

      <Slideshow.Preset.ChartSplit
        title="Sign-ups vs. Revenue"
        description="Sign-ups lead revenue by ~3 weeks."
      >
        <ChartContainer config={chartConfig} className="h-full w-full">
          <LineChart data={roadmapData} />
        </ChartContainer>
      </Slideshow.Preset.ChartSplit>

      <Slideshow.Preset.Full>
        <img src="/hero.png" className="w-full h-full object-cover" />
      </Slideshow.Preset.Full>

      <Slideshow.Preset.Quote quote="This is a quote" author="John Doe" />
    </Slideshow.Root>
  );
}
\`\`\`

AVOID: Long paragraphs, technical jargon, navigation controls, manual responsive classes
FOCUS: Clear insights, visual data, brand consistency, story flow, using built-in components

${COMMON_CHART_EXAMPLES}
`;
