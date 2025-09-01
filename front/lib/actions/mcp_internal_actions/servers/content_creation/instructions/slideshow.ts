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
- Import: \`import { Slideshow } from "@dust/slideshow/v1"\`
- Structure: \`<Slideshow><Slideshow.Slide>content</Slideshow.Slide></Slideshow>\`

**Typography Components:**
- \`<Slideshow.Title>\` - Main slide titles (large, impactful)
- \`<Slideshow.Heading>\` - Section headings
- \`<Slideshow.Text>\` - Body content

**Customization** - All components accept \`className\` for styling:
- \`<Slideshow.Slide className="p-8">\` - Slide padding and layout
- \`<Slideshow.Title className="text-center">\` - Title alignment

DESIGN PRINCIPLES:
- Create visual hierarchy: Title → Visual → Supporting text
- White space is your friend - don't fill every pixel
- Keep text large enough to read in thumbnails

**Navigation is automatic** - arrow keys, thumbnails, prev/next buttons provided.
Focus on content quality, not navigation controls.

Example with branding:
\`\`\`tsx
<Slideshow>
  <Slideshow.Slide>
    <Slideshow.Title>Q4 Revenue Analysis</Slideshow.Title>
    <Slideshow.Text>Key findings from our performance data</Slideshow.Text>
  </Slideshow.Slide>
  <Slideshow.Slide>
    <Slideshow.Heading>Growth Metrics</Slideshow.Heading>
    <LineChart data={revenueData} />
    <Slideshow.Text className="font-medium">
      Revenue increased 25% year-over-year
    </Slideshow.Text>
  </Slideshow.Slide>
</Slideshow>
\`\`\`

AVOID: Long paragraphs, technical jargon, navigation controls, generic design
FOCUS: Clear insights, visual data, brand consistency, story flow
`;
