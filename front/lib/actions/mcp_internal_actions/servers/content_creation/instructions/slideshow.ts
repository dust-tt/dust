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
- Structure: \`<Slideshow.Root><Slideshow.Slide.Base>content</Slideshow.Slide.Base></Slideshow.Root>\`

**Pre-built Slide Layouts:**
- \`<Slideshow.Slide.Cover title="Title" subtitle="Subtitle" />\` - Title slide with centered title and subtitle
- \`<Slideshow.Slide.TitleCentered title="Title" />\` - Title only, centered vertically and horizontally
- \`<Slideshow.Slide.TitleTop title="Title">content</Slideshow.Slide.TitleTop>\` - Title at top, content below
- \`<Slideshow.Slide.Bullets title="Title" items={["Item 1", "Item 2"]} />\` - Title with bulleted list
- \`<Slideshow.Slide.BulletsOnly items={["Item 1", "Item 2"]} />\` - Bulleted list without title
- \`<Slideshow.Slide.Quote quote="Quote text" author="Author Name" />\` - Centered quote with author
- \`<Slideshow.Slide.Split>{[leftContent, rightContent]}</Slideshow.Slide.Split>\` - Two-column layout
- \`<Slideshow.Slide.Full>content</Slideshow.Slide.Full>\` - Full-width custom content

**Typography Components (Automatically Responsive):**
- \`<Slideshow.Title>\` - Main slide titles
- \`<Slideshow.Heading1>\` - Section headings
- \`<Slideshow.Heading2>\` - Section headings
- \`<Slideshow.Heading3>\` - Section headings
- \`<Slideshow.Text>\` - Body content

**Responsive Design Built-In:**
All typography and spacing automatically scales smoothly across devices.
No need for responsive classes like \`sm:text-4xl md:text-6xl\` - just use the components as-is for
perfect mobile-to-desktop scaling.

**Customization** - All components accept \`className\` for styling:
- \`<Slideshow.Slide className="bg-blue-50">\` - Background colors and themes
- \`<Slideshow.Title className="text-center text-red-600">\` - Alignment and colors (size is automatic)

DESIGN PRINCIPLES:
- Create visual hierarchy: Title → Visual → Supporting text
- White space is your friend - don't fill every pixel
- Typography automatically scales - focus on content, not font sizes
- Components look great on all devices without manual responsive classes

**Navigation is automatic** - arrow keys, thumbnails, prev/next buttons provided.
Focus on content quality, not navigation controls.

Example using pre-built layouts:
\`\`\`tsx
<Slideshow.Root>
  {/* Cover slide - title + subtitle */}
  <Slideshow.Slide.Cover
    title="Q4 Revenue Analysis"
    subtitle="Key findings from our performance data"
    className="bg-blue-50"
  />

  {/* Title centered - title only */}
  <Slideshow.Slide.TitleCentered
    title="Executive Summary"
    className="bg-white"
  />

  {/* Title at top with content below */}
  <Slideshow.Slide.TitleTop title="Key Achievements">
    <div className="text-center space-y-4">
      <div className="text-4xl font-semibold text-green-600">25%</div>
      <Slideshow.Text>Revenue Growth</Slideshow.Text>
    </div>
  </Slideshow.Slide.TitleTop>

  {/* Bullets with title */}
  <Slideshow.Slide.Bullets
    title="Growth Drivers"
    items={[
      "Product improvements",
      "Market expansion",
      "Customer retention"
    ]}
  />

  {/* Bullets only - no title */}
  <Slideshow.Slide.BulletsOnly
    items={[
      "Launch product in European market",
      "Hire additional engineering talent",
      "Optimize customer acquisition cost"
    ]}
  />

  {/* Quote slide */}
  <Slideshow.Slide.Quote
    quote="This quarter's results demonstrate our team's dedication to excellence and innovation."
    author="CEO, Jane Smith"
    className="bg-gray-50"
  />
</Slideshow.Root>
\`\`\`

**Custom slide example:**
\`\`\`tsx
<Slideshow.Root>
  <Slideshow.Slide.Base>
    <Slideshow.Title>Custom Layout</Slideshow.Title>
    <Slideshow.Text>Build any custom layout using typography components</Slideshow.Text>
    <div className="grid grid-cols-2 gap-8 mt-8">
      <div className="text-center">
        <div className="text-4xl font-bold text-blue-600">87%</div>
        <Slideshow.Text>Success Rate</Slideshow.Text>
      </div>
      <div className="text-center">
        <div className="text-4xl font-bold text-green-600">$2.3M</div>
        <Slideshow.Text>Revenue</Slideshow.Text>
      </div>
    </div>
  </Slideshow.Slide.Base>
</Slideshow.Root>
\`\`\`

AVOID: Long paragraphs, technical jargon, navigation controls, manual responsive classes
FOCUS: Clear insights, visual data, brand consistency, story flow, using built-in components

Pro Tip: Use \`text-4xl\`, \`text-2xl\`, etc. for custom elements - they automatically become responsive inside slides!
`;
