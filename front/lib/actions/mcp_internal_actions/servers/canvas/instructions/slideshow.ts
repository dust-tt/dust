export const SLIDESHOW_INSTRUCTIONS = `
### Slideshow Guidelines:
- For presentations, slide decks, or step-by-step content, use the slideshow components
- Import slideshow primitives: \`import { Slideshow } from "@dust/slideshow/v1"\`
- Wrap content in \`<Slideshow>\` with multiple \`<Slideshow.Slide>\` children
- Each slide can contain any React content: charts, text, images, interactive components

**Typography Components** - Use these for professional, consistent text formatting:
- \`<Slideshow.Title>\` - Large title text (7xl, for main slide titles)
- \`<Slideshow.Heading>\` - Section headings (5xl, for slide sections) 
- \`<Slideshow.Text>\` - Body text (sm, for regular content)

**Customization** - These components accept \`className\` prop for flexible styling:
- \`<Slideshow>\` - Main container (background, spacing, etc.)
- \`<Slideshow.Slide>\` - Individual slides (background, layout, padding, etc.)
- \`<Slideshow.Title>\`, \`<Slideshow.Heading>\`, \`<Slideshow.Text>\` - Typography (colors, alignment, spacing, etc.)

**Navigation is handled automatically** - the slideshow environment provides:
- Carousel navigation (arrow keys, prev/next buttons)
- Slide preview thumbnails
- Professional transitions and styling
- Full-screen presentation mode
- Slide counter and progress indicators

**Focus on content, not controls** - don't implement your own navigation, buttons, or slide management.
The slideshow container handles all user interactions and presentation flow.

Example slideshow structure:
\`\`\`tsx
import { Slideshow } from "@dust/slideshow/v1";
import { LineChart } from "recharts";

export default function Presentation() {
  return (
    <Slideshow>
      <Slideshow.Slide>
        <Slideshow.Title>Welcome to Our Presentation</Slideshow.Title>
        <Slideshow.Text>Overview of key findings and insights</Slideshow.Text>
      </Slideshow.Slide>
      <Slideshow.Slide className="bg-blue-50">
        <Slideshow.Heading className="text-blue-900">Sales Performance</Slideshow.Heading>
        <LineChart data={analysisData} />
        <Slideshow.Text className="text-green-600 font-medium">
          Revenue increased 25% year-over-year
        </Slideshow.Text>
      </Slideshow.Slide>
    </Slideshow>
  );
}
\`\`\`

- When to use slideshows: presentations, tutorials, step-by-step analysis, before/after comparisons
- When to use regular Canvas: single visualizations, dashboards, interactive tools
`;
