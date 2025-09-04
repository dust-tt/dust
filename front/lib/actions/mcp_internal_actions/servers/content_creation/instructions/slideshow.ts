export const SLIDESHOW_INSTRUCTIONS = `
### Using Slideshow Components in Content Creation Files

### When to Use Slideshow Components:
Use the Slideshow component in Content Creation files for: presentations, tutorials, step-by-step analysis, comparisons, reports

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

Import
- import { Slideshow } from "@dust/slideshow/v1"

Core pattern
- Always wrap slides with <Slideshow.Root>…</Slideshow.Root>.
- Use the provided slide presets.

Available slide presets (only these)
- <Slideshow.Slide.Cover title="…" />
- <Slideshow.Slide.TitleTop title="…">children</Slideshow.Slide.TitleTop>
- <Slideshow.Slide.TitleTopH2 title="…">children</Slideshow.Slide.TitleTopH2>
- <Slideshow.Slide.Columns2|Columns3|Columns4> <Slideshow.Slide.Item heading="…">children</Slideshow.Slide.Item> … </Slideshow.Slide.ColumnsN>
- <Slideshow.Slide.Full>media or chart</Slideshow.Slide.Full>
- <Slideshow.Slide.ChartSplit title="…" description="…"> chart </Slideshow.Slide.ChartSplit>
- <Slideshow.Slide.Quote quote="…" author="…" />

All slide presets support theme="light" or theme="dark". Mix themes within the same slideshow as needed.

Typography (responsive—no breakpoints needed)
- <Slideshow.Text.Title>  // largest, used on covers
- <Slideshow.Text.Heading1> / <Slideshow.Text.Heading2> / <Slideshow.Text.Heading3>
- <Slideshow.Text.Body1> / <Slideshow.Text.Body2> / <Slideshow.Text.Body3>

Responsive Design Built-In:
All typography and spacing automatically scales smoothly across devices.
No need for responsive classes like \`sm:text-4xl md:text-6xl\` - just use the components as-is for
perfect mobile-to-desktop scaling.

Helpers
- <Slideshow.Slide.Item heading="…">Body (any JSX or text)</Slideshow.Slide.Item>   // use inside Columns*
- <Slideshow.Slide.BulletList><Slideshow.Slide.BulletItem>Point</Slideshow.Slide.BulletItem></Slideshow.Slide.BulletList>

Important rules:
1) Prefer ColumnsN + Item for multi-card content (goals, metrics, features). Keep one main idea per slide.
2) Keep body text concise. Use BulletList for 3–5 bullets when appropriate.
3) Always include className="h-full w-full" on ChartContainer for proper sizing.

DESIGN PRINCIPLES:
- Create visual hierarchy: Title → Visual → Supporting text
- White space is your friend - don't fill every pixel
- Typography automatically scales - focus on content, not font sizes
- Components look great on all devices without manual responsive classes

**Navigation is automatic** - arrow keys, thumbnails, prev/next buttons provided.
Focus on content quality, not navigation controls.

Example using pre-built layouts:
\`\`\`tsx
import { Slideshow } from "@dust/slideshow/v1";

export default function Deck() {
  return (
    <Slideshow.Root>
      <Slideshow.Slide.Cover title="Q4 Revenue Analysis" />

      <Slideshow.Slide.TitleTop title="Executive Summary">
        <Slideshow.Text.Body2>
          +25% YoY growth driven by retention and EU expansion.
        </Slideshow.Text.Body2>
      </Slideshow.Slide.TitleTop>

      <Slideshow.Slide.Columns3 title="Key Goals">
        <Slideshow.Slide.Item heading="Retention">
          <Slideshow.Slide.BulletList>
            <Slideshow.Slide.BulletItem>
              Onboarding revamp
            </Slideshow.Slide.BulletItem>
            <Slideshow.Slide.BulletItem>
              Proactive success
            </Slideshow.Slide.BulletItem>
          </Slideshow.Slide.BulletList>
        </Slideshow.Slide.Item>
        <Slideshow.Slide.Item heading="Expansion">
          Enter EU markets
        </Slideshow.Slide.Item>
        <Slideshow.Slide.Item heading="Pricing">
          Launch new tiers
        </Slideshow.Slide.Item>
      </Slideshow.Slide.Columns3>

      <Slideshow.Slide.ChartSplit
        title="Sign-ups vs. Revenue"
        description="Sign-ups lead revenue by ~3 weeks."
      >
        <ChartContainer config={chartConfig} className="h-full w-full">
          <LineChart data={roadmapData} />
        </ChartContainer>
      </Slideshow.Slide.ChartSplit>

      <Slideshow.Slide.Full>
        <img src="/hero.png" className="w-full h-full object-cover" />
      </Slideshow.Slide.Full>

      <Slideshow.Slide.Quote quote="This is a quote" author="John Doe" />
    </Slideshow.Root>
  );
}
\`\`\`

AVOID: Long paragraphs, technical jargon, navigation controls, manual responsive classes
FOCUS: Clear insights, visual data, brand consistency, story flow, using built-in components
`;
