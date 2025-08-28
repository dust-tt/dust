export const SLIDESHOW_INSTRUCTIONS = `
### Slideshow Guidelines:
- For presentations, slide decks, or step-by-step content, use the slideshow components
- Import slideshow primitives: \`import { Slideshow } from "@dust/slideshow/v1"\`
- Wrap content in \`<Slideshow>\` with multiple \`<Slide>\` children
- Each slide can contain any React content: charts, text, images, interactive components

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
        <h1>Welcome to our presentation</h1>
      </Slideshow.Slide>
      <Slideshow.Slide>
        <LineChart data={analysisData} />
      </Slideshow.Slide>
    </Slideshow>
  );
}
\`\`\`

- When to use slideshows: presentations, tutorials, step-by-step analysis, before/after comparisons
- When to use regular Canvas: single visualizations, dashboards, interactive tools
`;
