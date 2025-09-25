import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { visit } from 'unist-util-visit';
import { StreamingMarkdown, Markdown } from '../index_with_tw_base';

// Mock types and components for citations and mentions (only for Storybook demos)
type MarkdownCitation = {
  href?: string;
  title: string;
  [key: string]: any;
};

type CitationsContextType = {
  references: {
    [key: string]: MarkdownCitation;
  };
  updateActiveReferences: (doc: MarkdownCitation, index: number) => void;
};

const CitationsContext = React.createContext<CitationsContextType>({
  references: {},
  updateActiveReferences: () => null,
});

// Mock CiteBlock component for Storybook
function CiteBlock(props: any) {
  const { references, updateActiveReferences } = React.useContext(CitationsContext);
  const refs = props.references
    ? (JSON.parse(props.references) as { counter: number; ref: string }[])
        .filter((r) => r.ref in references)
    : undefined;

  React.useEffect(() => {
    if (refs) {
      refs.forEach((r) => {
        const document = references[r.ref];
        updateActiveReferences(document, r.counter);
      });
    }
  }, [refs, references, updateActiveReferences]);

  if (!refs || refs.length === 0) return null;

  return (
    <sup>
      {refs.map((r, idx) => (
        <span key={r.ref}>
          <span
            className="s-inline-flex s-items-center s-justify-center s-h-4 s-w-4 s-rounded-full s-text-xs s-font-medium s-cursor-pointer s-bg-primary-600 dark:s-bg-primary-600-night s-text-primary-200 dark:s-text-primary-200-night"
            title={references[r.ref]?.title}
          >
            {r.counter}
          </span>
          {idx < refs.length - 1 && ','}
        </span>
      ))}
    </sup>
  );
}

// Mock MentionBlock component for Storybook
function MentionBlock({ agentName, agentSId, onClick }: { agentName: string; agentSId: string; onClick?: (agentSId: string) => void }) {
  return (
    <span
      className="s-inline-block s-cursor-pointer s-font-medium s-text-highlight dark:s-text-highlight-night"
      onClick={() => onClick?.(agentSId)}
    >
      @{agentName}
    </span>
  );
}

// Mock directive functions for Storybook
function getCiteDirective() {
  return () => {
    let refCounter = 1;
    const refSeen: { [ref: string]: number } = {};

    return (tree: any) => {
      visit(tree, ["textDirective"], (node) => {
        if (node.name === "cite" && node.children[0]?.value) {
          const references = node.children[0]?.value
            .split(",")
            .map((ref: string) => ({
              counter: refSeen[ref] || (refSeen[ref] = refCounter++),
              ref,
            }));

          node.data = node.data || {};
          node.data.hName = "sup";
          node.data.hProperties = { references: JSON.stringify(references) };
        }
      });
    };
  };
}

function getMentionDirective() {
  return () => (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.name === "mention" && node.children[0]) {
        node.data = node.data || {};
        node.data.hName = "mention";
        node.data.hProperties = {
          agentSId: node.attributes?.sId,
          agentName: node.children[0].value,
        };
      }
    });
  };
}

const meta: Meta<typeof StreamingMarkdown> = {
  title: 'Components/StreamingMarkdown',
  component: StreamingMarkdown,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'Streaming-aware Markdown that animates only newly appended text.',
      },
    },
  },
  argTypes: {
    animationName: { control: 'text' },
    animationDuration: { control: 'text' },
    animationTimingFunction: { control: 'text' },
    animationCurve: {
      control: 'select',
      options: ['linear', 'accelerate', 'accelerate-fast', 'custom'],
      description: 'Animation curve type for opacity transition',
    },
  },
  args: {
    animationDuration: '600ms',
    animationTimingFunction: 'ease-out',
    animationCurve: 'linear',
  },
};

export default meta;

export const AnimationCurveComparison: Story = {
  name: 'Animation Curve Comparison',
  parameters: {
    docs: {
      description: {
        story: 'Compare different animation curves for the fade-in effect. Accelerate curves start slower and speed up, reducing the time spent at low opacity.',
      },
    },
  },
  render: (args) => {
    const testContent = `This text demonstrates different animation curves. Notice how the **accelerate** curve starts slowly then speeds up, spending less time at low opacity levels. The *accelerate-fast* option is even more aggressive, quickly jumping to higher opacity values.`;

    const [restart, setRestart] = React.useState(0);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <button
          onClick={() => setRestart(r => r + 1)}
          style={{
            width: 'fit-content',
            padding: '8px 16px',
            borderRadius: 6,
            border: '1px solid #ddd',
            background: '#f7f7f7',
            cursor: 'pointer'
          }}
        >
          🔄 Restart Animations
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ border: '1px solid #ddd', padding: 16, borderRadius: 8 }}>
            <h3 style={{ marginTop: 0, color: '#666' }}>Linear (Default)</h3>
            <StreamingMarkdown
              key={`linear-${restart}`}
              {...args}
              content={testContent}
              animationCurve="linear"
              animationDuration="4000ms"
            />
          </div>

          <div style={{ border: '1px solid #ddd', padding: 16, borderRadius: 8 }}>
            <h3 style={{ marginTop: 0, color: '#666' }}>Accelerate (Slow start)</h3>
            <StreamingMarkdown
              key={`accelerate-${restart}`}
              {...args}
              content={testContent}
              animationCurve="accelerate"
              animationDuration="4000ms"
            />
          </div>

          <div style={{ border: '1px solid #ddd', padding: 16, borderRadius: 8 }}>
            <h3 style={{ marginTop: 0, color: '#666' }}>Accelerate Fast</h3>
            <StreamingMarkdown
              key={`accelerate-fast-${restart}`}
              {...args}
              content={testContent}
              animationCurve="accelerate-fast"
              animationDuration="4000ms"
            />
          </div>

          <div style={{ border: '1px solid #ddd', padding: 16, borderRadius: 8 }}>
            <h3 style={{ marginTop: 0, color: '#666' }}>Short Duration (600ms)</h3>
            <StreamingMarkdown
              key={`short-${restart}`}
              {...args}
              content={testContent}
              animationCurve="accelerate"
              animationDuration="600ms"
            />
          </div>
        </div>
      </div>
    );
  },
};

export const MathStreamingTest: Story = {
  name: 'Math Streaming Test',
  parameters: {
    docs: {
      description: {
        story: 'Test that block math does not block streaming of subsequent content.',
      },
    },
  },
  render: (args) => {
    const testContent = `# Math Streaming Test

This text should appear and animate immediately.

## Block Math Below

The following block math should not prevent the text after it from streaming:

$$
\\begin{align}
E &= mc^2 \\\\
F &= ma \\\\
\\nabla \\cdot \\vec{E} &= \\frac{\\rho}{\\epsilon_0}
\\end{align}
$$

## Text After Math

This text should stream in smoothly even while the math block above is incomplete.

Here's some inline math too: $a^2 + b^2 = c^2$ which should also stream properly.

### More Content

- List item 1
- List item 2 with **bold**
- List item 3 with \`code\`

The streaming should work continuously throughout.`;

    const [content, setContent] = React.useState<string>('');
    const [isStreaming, setIsStreaming] = React.useState(false);

    const startStreaming = () => {
      setContent('');
      setIsStreaming(true);
      let i = 0;
      const chunkSize = 5; // Small chunks to see the effect clearly
      const interval = setInterval(() => {
        if (i >= testContent.length) {
          clearInterval(interval);
          setIsStreaming(false);
          return;
        }
        const next = testContent.slice(i, i + chunkSize);
        i += chunkSize;
        setContent((prev) => prev + next);
      }, 50);
    };

    return (
      <div>
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={startStreaming}
            style={{
              padding: '8px 16px',
              borderRadius: 4,
              border: '1px solid #ccc',
              cursor: 'pointer',
            }}
          >
            Start Streaming
          </button>
          <span style={{ marginLeft: 10 }}>
            {isStreaming ? '🔴 Streaming...' : '⭐ Ready'}
          </span>
        </div>
        <div style={{ border: '1px solid #ddd', padding: 20, borderRadius: 8 }}>
          <StreamingMarkdown {...args} content={content} />
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>
          Content length: {content.length} / {testContent.length}
        </div>
      </div>
    );
  },
};

export const StaticVsStreaming: Story = {
  name: 'Static vs Streaming Comparison',
  parameters: {
    docs: {
      description: {
        story: 'Compare static and streaming rendering side by side.',
      },
    },
  },
  render: (args) => {
    const sampleContent = `
## Comparison Demo

### Math Example
Einstein's famous equation: $E = mc^2$

### Citations
This is referenced material :cite[r1] with multiple sources :cite[r2,r3].

### Task List
- [x] Completed task
- [ ] Pending task
- [ ] Another pending task

### Mentions
Ping :mention[assistant]{sId:bot-1} for help.
`;

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <h3>Static (isStreaming=false)</h3>
          <CitationsContext.Provider value={{
            references: mockReferences,
            updateActiveReferences: () => {},
          }}>
            <StreamingMarkdown
              {...args}
              content={sampleContent}
              isStreaming={false}
              additionalMarkdownComponents={{
                sup: CiteBlock,
                mention: MentionBlock,
              } as any}
              additionalMarkdownPlugins={[
                getCiteDirective(),
                getMentionDirective(),
              ]}
            />
          </CitationsContext.Provider>
        </div>
        <div>
          <h3>Streaming (isStreaming=true)</h3>
          <CitationsContext.Provider value={{
            references: mockReferences,
            updateActiveReferences: () => {},
          }}>
            <StreamingMarkdown
              {...args}
              content={sampleContent}
              isStreaming={true}
              additionalMarkdownComponents={{
                sup: CiteBlock,
                mention: MentionBlock,
              } as any}
              additionalMarkdownPlugins={[
                getCiteDirective(),
                getMentionDirective(),
              ]}
            />
          </CitationsContext.Provider>
        </div>
      </div>
    );
  },
};
type Story = StoryObj<typeof StreamingMarkdown>;

// Utility: simple seeded RNG for reproducible chunk sizes
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

const ADVANCED_MD = `# 🚀 Enhanced Streaming Markdown Demo

This document demonstrates **all new features** including directives, math, and citations.

## 🔢 Math Support

### Inline Math

The quadratic formula is $ax^2 + bx + c = 0$ and its solution is $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$.

### Block Math

$$
\\begin{align}
\\nabla \\times \\vec{\\mathbf{B}} -\\, \\frac{1}{c}\\, \\frac{\\partial\\vec{\\mathbf{E}}}{\\partial t} &= \\frac{4\\pi}{c}\\vec{\\mathbf{j}} \\\\
\\nabla \\cdot \\vec{\\mathbf{E}} &= 4 \\pi \\rho \\\\
\\nabla \\times \\vec{\\mathbf{E}}\\, +\\, \\frac{1}{c}\\, \\frac{\\partial\\vec{\\mathbf{B}}}{\\partial t} &= \\vec{\\mathbf{0}} \\\\
\\nabla \\cdot \\vec{\\mathbf{B}} &= 0
\\end{align}
$$

## 📚 Citations and References

According to recent research :cite[r1], streaming markdown improves user experience. Further studies :cite[r2,r3] confirm these findings.

The implementation details :cite[r1] show significant performance gains, especially when combined with modern React patterns :cite[r2].

## 💬 Mentions

You can mention agents like :mention[assistant]{sId:assistant-123} or :mention[helper]{sId:helper-456} directly in the text.

## ✅ Task Lists

- [ ] Implement streaming support
- [x] Add directive system
- [x] Support math rendering
- [ ] Add custom visualizations
  - [x] Basic charts
  - [ ] Interactive graphs
- [x] Test all features
`;

const LONG_MD = `# 🚀 Comprehensive Streaming Markdown Demo

Welcome to the **complete showcase** of our streaming markdown renderer! This document demonstrates *every* supported feature with rich examples.

## 📖 Long Form Content

The streaming markdown renderer excels at displaying long-form content with smooth, progressive animation. As you read this paragraph, notice how the text appears naturally, character by character, creating a dynamic reading experience. This first paragraph contains **bold text**, *italicized content*, and even \`inline code\` to demonstrate that formatting is preserved throughout the streaming process. The animation maintains readability while adding visual interest, making it perfect for displaying AI-generated responses, real-time documentation, or any content that benefits from a progressive reveal. Whether you're building a chatbot interface, a documentation system, or an interactive tutorial, the streaming effect helps guide the reader's attention and creates a sense of immediacy and engagement with the content.

Furthermore, the streaming system handles complex markdown structures with ease. This second lengthy paragraph showcases how the renderer maintains performance even with dense content that includes multiple formatting styles. Consider how ***combined bold and italic text*** flows seamlessly alongside regular prose, and how [links to external resources](https://example.com) appear without interrupting the animation flow. The system is intelligent enough to handle edge cases like \`multiple\` instances of \`inline code\` within the same sentence, or even ~~strikethrough text that has been deprecated~~. The streaming animation respects word boundaries, ensuring that text remains readable throughout the animation process. This is particularly important for accessibility, as users can still read and comprehend the content even while it's being streamed in, without experiencing jarring visual artifacts or layout shifts that might disturb the reading experience.

Finally, this third substantial paragraph demonstrates the renderer's ability to handle technical content with precision. When dealing with mathematical expressions like $E = mc^2$ or more complex formulas such as $\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$, the streaming animation gracefully incorporates these elements without breaking the flow. The renderer also excels at presenting mixed content types within a single paragraph, seamlessly transitioning between regular text, **formatted sections**, [hyperlinks with descriptive text](https://github.com), and technical notations. This capability makes it ideal for educational content, technical documentation, or any scenario where rich, formatted text needs to be presented progressively. The underlying architecture ensures that even as content streams in, all interactive elements remain functional, links remain clickable, and the overall document structure remains intact and navigable throughout the entire streaming process.

## 📝 Text Formatting

This paragraph demonstrates basic text with **bold emphasis**, *italic text*, ***bold italic combination***, and \`inline code snippets\`. We can also use ~~strikethrough text~~ and combine multiple styles for ***\`formatted code\`*** within emphasis.

## 🧮 Mathematical Expressions

### Inline Math

The quadratic formula is $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$, which gives us the roots of a quadratic equation. We can also write simple expressions like $e^{i\\pi} + 1 = 0$ (Euler's identity) or $\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$ inline with text.

### Block Math

Here's the famous Gaussian integral:

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

And Maxwell's equations in differential form:

$$
\\begin{align}
\\nabla \\cdot \\vec{E} &= \\frac{\\rho}{\\epsilon_0} \\\\
\\nabla \\cdot \\vec{B} &= 0 \\\\
\\nabla \\times \\vec{E} &= -\\frac{\\partial \\vec{B}}{\\partial t} \\\\
\\nabla \\times \\vec{B} &= \\mu_0 \\vec{J} + \\mu_0 \\epsilon_0 \\frac{\\partial \\vec{E}}{\\partial t}
\\end{align}
$$

Matrix multiplication example:

$$
\\begin{bmatrix}
a & b \\\\
c & d
\\end{bmatrix}
\\begin{bmatrix}
x \\\\
y
\\end{bmatrix}
=
\\begin{bmatrix}
ax + by \\\\
cx + dy
\\end{bmatrix}
$$

## 🎯 Custom Directives

### Citations

Here's a statement with a citation :cite[r1], and another with multiple citations :cite[r2,r3]. These custom directives demonstrate how we can extend the markdown syntax with domain-specific features :cite[r1].

### Mentions

You can mention agents like :mention[dust]{sId="assistant"} or :mention[gpt4]{sId="gpt4-helper"} in your text. These mentions are interactive and can trigger actions when clicked.

### Links and References

Here are different types of links:
- [External link to Dust](https://dust.tt)
- [Link with title](https://github.com "Visit GitHub")
- Direct URL: https://example.com
- Reference-style link: [Dust Platform][dust-ref]

[dust-ref]: https://dust.tt "Dust - AI Platform"

## 📋 Lists Showcase

### Unordered Lists with Nesting

- First level item with regular text
- Second item with **bold** and *italic* formatting
  - Nested item 2.1 with \`inline code\`
  - Nested item 2.2 with a [link](https://example.com)
    - Deep nesting level 3.1
    - Deep nesting level 3.2 with ***combined formatting***
  - Back to level 2
- Back to first level
- Another first level item with multiple lines of text that demonstrates how longer content wraps properly in list items

### Ordered Lists

1. First ordered item
2. Second item with **emphasis**
   1. Nested ordered 2.1
   2. Nested ordered 2.2
      1. Deep nested 2.2.1
      2. Deep nested 2.2.2
   3. Nested ordered 2.3
3. Third item with mixed content
4. Fourth item

### Mixed Lists

1. Ordered at top level
   - Unordered nested under ordered
   - Another unordered item
     1. Ordered under unordered
     2. Second ordered item
2. Back to top level ordered
   - Another mixed nested list
     - Deeper unordered
       1. Even deeper ordered

### Task Lists

- [ ] Unchecked task item
- [x] Completed task item
- [ ] Task with **formatted text**
  - [x] Nested completed task
  - [ ] Nested incomplete task

## 💻 Code Blocks

### Inline Code

Here's some \`inline code\` in the middle of a sentence, and \`const x = 42\` with actual code.

### JavaScript/TypeScript

\`\`\`javascript
// Fibonacci sequence generator
function* fibonacci() {
  let [a, b] = [0, 1];
  while (true) {
    yield a;
    [a, b] = [b, a + b];
  }
}

// Usage example
const fib = fibonacci();
for (let i = 0; i < 10; i++) {
  console.log(\`F(\${i}) = \${fib.next().value}\`);
}
\`\`\`

### Python

\`\`\`python
# Python example with classes
class DataProcessor:
    def __init__(self, data):
        self.data = data
        self.processed = False

    def process(self):
        """Process the data with transformations"""
        if not self.processed:
            self.data = [x * 2 for x in self.data if x > 0]
            self.processed = True
        return self.data

# Usage
processor = DataProcessor([1, -2, 3, 4, -5])
result = processor.process()
print(f"Processed: {result}")
\`\`\`

### React Component (JSX)

\`\`\`jsx
import React, { useState, useEffect } from 'react';

const StreamingDemo = ({ content }) => {
  const [displayText, setDisplayText] = useState('');

  useEffect(() => {
    let index = 0;
    const timer = setInterval(() => {
      if (index < content.length) {
        setDisplayText(content.slice(0, ++index));
      } else {
        clearInterval(timer);
      }
    }, 50);

    return () => clearInterval(timer);
  }, [content]);

  return (
    <div className="streaming-text">
      {displayText}
    </div>
  );
};

export default StreamingDemo;
\`\`\`

### Shell/Bash

\`\`\`bash
#!/bin/bash

# System information script
echo "System Information"
echo "=================="
echo "Hostname: $(hostname)"
echo "OS: $(uname -s)"
echo "Kernel: $(uname -r)"
echo "CPU: $(sysctl -n machdep.cpu.brand_string 2>/dev/null || lscpu | grep 'Model name')"
echo "Memory: $(free -h 2>/dev/null || vm_stat | grep 'Pages free')"
echo "Disk Usage:"
df -h | head -5
\`\`\`

### JSON

\`\`\`json
{
  "name": "streaming-markdown",
  "version": "1.0.0",
  "features": {
    "streaming": true,
    "syntaxHighlight": true,
    "animations": {
      "fadeIn": "600ms",
      "timing": "ease-out"
    }
  },
  "supported": ["lists", "code", "tables", "images", "math", "directives"]
}
\`\`\`

### Mermaid Diagram

\`\`\`mermaid
graph TD
    A[Start] --> B{Is Streaming?}
    B -->|Yes| C[Stream Characters]
    B -->|No| D[Render Static]
    C --> E[Apply Animation]
    E --> F[Display Content]
    D --> F
    F --> G[End]

    style A fill:#f9f,stroke:#333,stroke-width:2px
    style G fill:#9f9,stroke:#333,stroke-width:2px
    style C fill:#bbf,stroke:#333,stroke-width:2px
\`\`\`

### CSV Data (Downloadable)

\`\`\`csv
Name,Department,Score,Status
Alice Johnson,Engineering,95,Active
Bob Smith,Marketing,87,Active
Charlie Brown,Sales,92,Active
Diana Prince,HR,88,Active
Eve Adams,Engineering,91,Active
\`\`\`

## 📊 Tables

### Basic Table

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| Streaming | ✅ Done | High | Core functionality |
| Lists | ✅ Done | High | With nesting support |
| Code blocks | ✅ Done | Medium | With syntax highlighting |
| Tables | ✅ Done | Low | Basic support |
| Images | ✅ Done | Low | With loading animation |

### Complex Table with Formatting

| Language | **Typing** | *Performance* | \`hello()\` | Rating |
|----------|------------|---------------|-------------|--------|
| TypeScript | Static | ⚡ Fast | \`console.log\` | ⭐⭐⭐⭐⭐ |
| Python | Dynamic | 🐢 Moderate | \`print()\` | ⭐⭐⭐⭐ |
| Rust | Static | 🚀 Very Fast | \`println!\` | ⭐⭐⭐⭐⭐ |
| Ruby | Dynamic | 🐌 Slow | \`puts\` | ⭐⭐⭐ |

## 🎨 Blockquotes

> This is a simple blockquote with a single paragraph.

> ### Blockquote with Heading
>
> This blockquote contains multiple elements:
> - A list item
> - Another item with **bold text**
>
> And even a code block:
> \`\`\`js
> const quote = "Nested code in quote";
> \`\`\`

> > Nested blockquotes are also supported
> > > And can go multiple levels deep
> > > > Even deeper if needed

## 🖼️ Images

### Single Image

![Sample Image](https://via.placeholder.com/600x300/4A90E2/FFFFFF?text=Streaming+Markdown)

### Multiple Images

![Small Image 1](https://via.placeholder.com/200x150/E94B3C/FFFFFF?text=Image+1)
![Small Image 2](https://via.placeholder.com/200x150/6DBD28/FFFFFF?text=Image+2)
![Small Image 3](https://via.placeholder.com/200x150/F39C12/FFFFFF?text=Image+3)

## 🔤 Special Characters & Emojis

Special characters: & < > " ' © ® ™ € £ ¥ ° ± × ÷ ≤ ≥ ≠

Math symbols: ∑ ∏ ∫ √ ∞ α β γ δ ε θ λ μ π σ φ ω

Emojis: 😀 🎉 🚀 💻 📱 🌟 ⚡ 🔥 💡 🎨 🏆 ✅ ❌ ⚠️ 📝

## ➖ Horizontal Rules

Above this line

---

Between these lines

***

Another separator

___

Below this line

## 🔄 Escaping & Special Cases

Escaping special characters: \\*not italic\\*, \\**not bold\\**, \\[not a link\\](url)

HTML entities: &lt;tag&gt; &amp; &quot;quotes&quot; &apos;apostrophe&apos;

Preserving spacing:    Multiple    spaces    between    words

## 🎯 Advanced Combinations

### List with Everything

1. **First item** with [a link](https://example.com) and \`code\`
   - Nested with *italic* and ~~strikethrough~~
   - Another with emoji 🎉 and **bold**
     1. Deep ordered with \`code block\`:
        \`\`\`js
        const nested = true;
        \`\`\`
     2. And an image:
        ![Tiny](https://via.placeholder.com/100x50)
   - Back to unordered
2. Second main item with a table:

   | Col1 | Col2 |
   |------|------|
   | A    | B    |

3. Third item with blockquote:
   > Quoted text in a list

## 📚 Long Prose Section

Lorem ipsum dolor sit amet, consectetur adipiscing elit. **Sed do eiusmod** tempor incididunt ut labore et dolore magna aliqua. *Ut enim ad minim veniam*, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in ***reprehenderit in voluptate*** velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. This demonstrates how longer paragraphs stream in naturally, maintaining readability while the content appears progressively.

### Technical Documentation Style

The \`StreamingMarkdown\` component accepts the following props:

- \`content\` (string, required): The markdown content to render
- \`animationName\` (string, optional): CSS animation name for streaming effect
- \`animationDuration\` (string, optional): Duration of the fade-in animation
- \`animationTimingFunction\` (string, optional): CSS timing function
- \`codeStyle\` (object, optional): Syntax highlighting theme

## 🎬 Conclusion

This comprehensive demo showcases **all supported markdown features** in our streaming renderer:

1. ✅ Text formatting and emphasis
2. ✅ Multiple list types with deep nesting
3. ✅ Code blocks with syntax highlighting
4. ✅ Tables with complex content
5. ✅ Blockquotes with nesting
6. ✅ Images with loading animations
7. ✅ Links and references
8. ✅ Special characters and emojis
9. ✅ Horizontal rules
10. ✅ Mixed and nested content

The streaming animation ensures a smooth, progressive reveal of content while maintaining full markdown compatibility.

---

*Thank you for exploring our streaming markdown renderer!* 🎉`;


const mockReferences = {
  r1: {
    title: "Streaming Markdown Performance Study",
    href: "https://example.com/study1",
    authors: ["John Doe", "Jane Smith"],
    year: 2024,
  },
  r2: {
    title: "React Patterns for Real-time UIs",
    href: "https://example.com/study2",
    authors: ["Alice Johnson"],
    year: 2023,
  },
  r3: {
    title: "User Experience in AI Interfaces",
    href: "https://example.com/study3",
    authors: ["Bob Wilson", "Carol White"],
    year: 2024,
  },
};

export const EnhancedFeaturesDemo: Story = {
  name: 'Enhanced Features Demo',
  parameters: {
    docs: {
      description: {
        story: 'Demonstrates new features: math rendering, citations, mentions, task lists, and custom directives.',
      },
    },
  },
  render: (args) => {
    const [content, setContent] = React.useState<string>('');
    const [restart, setRestart] = React.useState<number>(0);
    const { streamingSpeedMs = 30, chunkMin = 10, chunkMax = 50, seed = 42 } = args as any;

    React.useEffect(() => {
      const full = ADVANCED_MD.trim();
      setContent('');
      let i = 0;
      const rand = makeRng(Number(seed) || 42);
      const min = Math.max(1, Number(chunkMin) || 1);
      const max = Math.max(min, Number(chunkMax) || min);
      const step = Math.max(10, Number(streamingSpeedMs) || 30);
      const id = setInterval(() => {
        if (i >= full.length) {
          clearInterval(id);
          return;
        }
        const r = rand();
        const size = Math.floor(min + r * (max - min));
        const next = full.slice(i, i + size);
        i += size;
        setContent((c) => c + next);
      }, step);
      return () => clearInterval(id);
    }, [streamingSpeedMs, chunkMin, chunkMax, seed, restart]);

    const handleMentionClick = React.useCallback((agentSId: string) => {
      console.log('Mention clicked:', agentSId);
      alert(`Clicked mention: ${agentSId}`);
    }, []);

    const citationsContextValue: CitationsContextType = React.useMemo(
      () => ({
        references: mockReferences,
        updateActiveReferences: (doc, index) => {
          console.log('Citation active:', doc.title, index);
        },
      }),
      []
    );

    const additionalComponents = React.useMemo(
      () => ({
        sup: CiteBlock,
        mention: (props: any) => (
          <MentionBlock
            agentName={props.agentName}
            agentSId={props.agentSId}
            onClick={handleMentionClick}
          />
        ),
      } as any),
      [handleMentionClick]
    );

    const additionalPlugins = React.useMemo(
      () => [
        getCiteDirective(),
        getMentionDirective(),
      ],
      []
    );

    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <button
            type="button"
            onClick={() => setRestart((r) => r + 1)}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--sb-border, #ddd)',
              background: 'var(--sb-bg, #f7f7f7)',
              cursor: 'pointer',
            }}
          >
            Restart Streaming
          </button>
        </div>
        <CitationsContext.Provider value={citationsContextValue}>
          <StreamingMarkdown
            key={restart}
            {...args}
            content={content}
            isStreaming={true}
            additionalMarkdownComponents={additionalComponents}
            additionalMarkdownPlugins={additionalPlugins}
          />
        </CitationsContext.Provider>
      </div>
    );
  },
  args: {
    streamingSpeedMs: 30,
    chunkMin: 10,
    chunkMax: 50,
    seed: 42,
  } as any,
  argTypes: {
    streamingSpeedMs: {
      control: { type: 'range', min: 10, max: 500, step: 10 },
      description: 'Speed of streaming (ms between chunks)'
    },
    chunkMin: {
      control: { type: 'range', min: 1, max: 50, step: 1 },
      description: 'Minimum chunk size'
    },
    chunkMax: {
      control: { type: 'range', min: 10, max: 200, step: 5 },
      description: 'Maximum chunk size'
    },
    seed: {
      control: { type: 'number' },
      description: 'Random seed'
    },
    isStreaming: {
      control: 'boolean',
      description: 'Enable streaming animations'
    },
  } as any,
};

export const ComprehensiveDemo: Story = {
  name: 'Comprehensive Streaming Demo',
  parameters: {
    docs: {
      description: {
        story: 'Complete demonstration of all supported markdown features with streaming animation. Includes text formatting, lists (nested, ordered, unordered), code blocks with syntax highlighting, tables, blockquotes, images, links, special characters, emojis, and more.',
      },
    },
  },
  render: (args) => {
    const [content, setContent] = React.useState<string>('');
    const [restart, setRestart] = React.useState<number>(0);
    const { streamingSpeedMs = 50, chunkMin = 15, chunkMax = 80, seed = 42 } = args as any;

    React.useEffect(() => {
      const full = LONG_MD.trim();
      setContent('');
      let i = 0;
      const rand = makeRng(Number(seed) || 42);
      const min = Math.max(1, Number(chunkMin) || 1);
      const max = Math.max(min, Number(chunkMax) || min);
      const step = Math.max(10, Number(streamingSpeedMs) || 120);
      const id = setInterval(() => {
        if (i >= full.length) {
          clearInterval(id);
          return;
        }
        // Pick a variable chunk size between [min, max]
        const r = rand();
        const size = Math.floor(min + r * (max - min));
        const next = full.slice(i, i + size);
        i += size;
        setContent((c) => c + next);
      }, step);
      return () => clearInterval(id);
    }, [streamingSpeedMs, chunkMin, chunkMax, seed, restart]);

    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <button
            type="button"
            onClick={() => {
              setRestart((r) => r + 1);
            }}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--sb-border, #ddd)',
              background: 'var(--sb-bg, #f7f7f7)',
              cursor: 'pointer',
            }}
          >
            Restart Streaming
          </button>
        </div>
        <StreamingMarkdown key={restart} {...args} content={content} />
      </div>
    );
  },
  args: {
    streamingSpeedMs: 50,
    chunkMin: 15,
    chunkMax: 80,
    seed: 42,
  } as any,
  argTypes: {
    streamingSpeedMs: {
      control: { type: 'range', min: 10, max: 500, step: 10 },
      description: 'Speed of streaming (ms between chunks)'
    },
    chunkMin: {
      control: { type: 'range', min: 1, max: 50, step: 1 },
      description: 'Minimum chunk size'
    },
    chunkMax: {
      control: { type: 'range', min: 10, max: 200, step: 5 },
      description: 'Maximum chunk size'
    },
    seed: {
      control: { type: 'number' },
      description: 'Random seed'
    },
  } as any,
};

export const StreamingVsProductionComparison: Story = {
  name: 'StreamingMarkdown vs Production Markdown Comparison',
  parameters: {
    docs: {
      description: {
        story: 'Side-by-side comparison of the new StreamingMarkdown component with the current production Markdown component, showing the same comprehensive content with streaming animation.',
      },
    },
  },
  render: (args) => {
    const [content, setContent] = React.useState<string>('');
    const [restart, setRestart] = React.useState<number>(0);
    const { streamingSpeedMs = 30, chunkMin = 10, chunkMax = 50, seed = 42 } = args as any;

    React.useEffect(() => {
      const full = LONG_MD.trim();
      setContent('');
      let i = 0;
      const rand = makeRng(Number(seed) || 42);
      const min = Math.max(1, Number(chunkMin) || 1);
      const max = Math.max(min, Number(chunkMax) || min);
      const step = Math.max(10, Number(streamingSpeedMs) || 120);
      const id = setInterval(() => {
        if (i >= full.length) {
          clearInterval(id);
          return;
        }
        // Pick a variable chunk size between [min, max]
        const r = rand();
        const size = Math.floor(min + r * (max - min));
        const next = full.slice(i, i + size);
        i += size;
        setContent((c) => c + next);
      }, step);
      return () => clearInterval(id);
    }, [streamingSpeedMs, chunkMin, chunkMax, seed, restart]);

    const handleMentionClick = React.useCallback((agentSId: string) => {
      console.log('Mention clicked:', agentSId);
      alert(`Clicked mention: ${agentSId}`);
    }, []);

    const citationsContextValue: CitationsContextType = React.useMemo(
      () => ({
        references: mockReferences,
        updateActiveReferences: (doc, index) => {
          console.log('Citation active:', doc.title, index);
        },
      }),
      []
    );

    const additionalComponents = React.useMemo(
      () => ({
        sup: CiteBlock,
        mention: (props: any) => (
          <MentionBlock
            agentName={props.agentName}
            agentSId={props.agentSId}
            onClick={handleMentionClick}
          />
        ),
      } as any),
      [handleMentionClick]
    );

    const additionalPlugins = React.useMemo(
      () => [
        getCiteDirective(),
        getMentionDirective(),
      ],
      []
    );

    // Determine if content is still streaming
    const isStillStreaming = content.length < LONG_MD.trim().length;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => setRestart((r) => r + 1)}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid var(--sb-border, #ddd)',
              background: 'var(--sb-bg, #f7f7f7)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            🔄 Restart Streaming
          </button>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 20,
            background: isStillStreaming ? '#fef3c7' : '#d1fae5',
            color: isStillStreaming ? '#92400e' : '#065f46',
            fontSize: 14,
            fontWeight: 500
          }}>
            {isStillStreaming ? (
              <>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', animation: 'pulse 1.5s infinite' }}></span>
                Streaming... {Math.round(content.length / LONG_MD.trim().length * 100)}%
              </>
            ) : (
              <>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#10b981' }}></span>
                Complete
              </>
            )}
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 20,
          minHeight: 600
        }}>
          {/* New StreamingMarkdown */}
          <div style={{
            border: '2px solid #3b82f6',
            borderRadius: 8,
            padding: 16,
            background: 'var(--sb-bg-secondary, #fafafa)',
            position: 'relative',
            overflow: 'auto'
          }}>
            <div style={{
              position: 'sticky',
              top: -16,
              background: 'var(--sb-bg-secondary, #fafafa)',
              padding: '8px 0 12px',
              marginTop: -8,
              marginBottom: 16,
              borderBottom: '1px solid #e5e7eb',
              zIndex: 10
            }}>
              <h3 style={{
                margin: 0,
                color: '#3b82f6',
                fontSize: 16,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                ✨ NEW: StreamingMarkdown
                {isStillStreaming && (
                  <span style={{
                    fontSize: 12,
                    background: '#3b82f6',
                    color: 'white',
                    padding: '2px 8px',
                    borderRadius: 12
                  }}>
                    with animation
                  </span>
                )}
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
                Token-based streaming with character animation
              </p>
            </div>
            <CitationsContext.Provider value={citationsContextValue}>
              <StreamingMarkdown
                key={`streaming-${restart}`}
                {...args}
                content={content}
                isStreaming={isStillStreaming}
                additionalMarkdownComponents={additionalComponents}
                additionalMarkdownPlugins={additionalPlugins}
              />
            </CitationsContext.Provider>
          </div>

          {/* Current Production Markdown */}
          <div style={{
            border: '2px solid #6b7280',
            borderRadius: 8,
            padding: 16,
            background: 'var(--sb-bg-secondary, #fafafa)',
            position: 'relative',
            overflow: 'auto'
          }}>
            <div style={{
              position: 'sticky',
              top: -16,
              background: 'var(--sb-bg-secondary, #fafafa)',
              padding: '8px 0 12px',
              marginTop: -8,
              marginBottom: 16,
              borderBottom: '1px solid #e5e7eb',
              zIndex: 10
            }}>
              <h3 style={{
                margin: 0,
                color: '#6b7280',
                fontSize: 16,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                📋 CURRENT: Production Markdown
                {isStillStreaming && (
                  <span style={{
                    fontSize: 12,
                    background: '#6b7280',
                    color: 'white',
                    padding: '2px 8px',
                    borderRadius: 12
                  }}>
                    isStreaming={isStillStreaming}
                  </span>
                )}
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
                Currently used in production for agent messages
              </p>
            </div>
            <CitationsContext.Provider value={citationsContextValue}>
              <Markdown
                key={`production-${restart}`}
                content={content}
                isStreaming={isStillStreaming}
                additionalMarkdownComponents={additionalComponents}
                additionalMarkdownPlugins={additionalPlugins}
              />
            </CitationsContext.Provider>
          </div>
        </div>

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  },
  args: {
    streamingSpeedMs: 30,
    chunkMin: 10,
    chunkMax: 50,
    seed: 42,
  } as any,
  argTypes: {
    streamingSpeedMs: {
      control: { type: 'range', min: 10, max: 500, step: 10 },
      description: 'Speed of streaming (ms between chunks)'
    },
    chunkMin: {
      control: { type: 'range', min: 1, max: 50, step: 1 },
      description: 'Minimum chunk size'
    },
    chunkMax: {
      control: { type: 'range', min: 10, max: 200, step: 5 },
      description: 'Maximum chunk size'
    },
    seed: {
      control: { type: 'number' },
      description: 'Random seed for chunk sizes'
    },
  } as any,
};
