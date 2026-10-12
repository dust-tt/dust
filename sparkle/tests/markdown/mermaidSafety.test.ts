import { isSafeMermaidChart } from "@sparkle/components/markdown/mermaidSafety";
import { describe, expect, it } from "vitest";

describe("isSafeMermaidChart", () => {
  it.each([
    ["a plain flowchart", "graph TD\n  A[Start] --> B{Ok?}\n  B -->|yes| C"],
    ["bidirectional arrows", "flowchart LR\n  A <--> B\n  C <-.-> D"],
    [
      "a class diagram",
      "classDiagram\n  Animal <|-- Dog\n  class Dog {\n    <<interface>>\n  }",
    ],
    [
      "styles and classes",
      "graph TD\n  A:::c --> B\n  style A fill:#f9f,stroke:#333\n  classDef c fill:#bbf",
    ],
    ["HTML labels", 'graph TD\n  A["<b>Bold</b><br/>line"] --> B'],
    ["a theme directive", "%%{init: {'theme': 'dark'}}%%\ngraph TD\n  A --> B"],
    [
      "a sequence diagram",
      "sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi",
    ],
    ["a same-site path", "graph TD\n  A[\"<img src='/files/chart.png'>\"]"],
    ["a scheme without its colon", "graph TD\n  A[http server] --> B[https]"],
    ["ampersands in text", "graph TD\n  A[R&D] --> B[Sales & Ops]"],
    [
      "colors ending with a semicolon",
      "graph TD\n  A --> B\n  style A fill:#333;\n  classDef c fill: #f9f;stroke:#33aa55ff;",
    ],
  ])("accepts %s", (_, chart) => {
    expect(isSafeMermaidChart(chart)).toBe(true);
  });

  it.each([
    ["an absolute URL", "graph TD\n  A[\"<img src='https://evil.com/x'>\"]"],
    ["a protocol-relative URL", "graph TD\n  A[\"<img src='//evil.com/x'>\"]"],
    [
      "a scheme without slashes",
      "graph TD\n  A[\"<img src='http:evil.com/x'>\"]",
    ],
    ["an uppercase scheme", "graph TD\n  A[\"<img src='HTTPS:evil.com'>\"]"],
    ["a backslash", "graph TD\n  A[\"<img src='/\\\\evil.com/x'>\"]"],
    ["a CSS escape", "graph TD\n  A --> B\n  classDef c background:u\\72l(x)"],
    ["slashes split by a tab", "graph TD\n  A[\"<img src='/\t/evil.com'>\"]"],
    [
      "a scheme split by a line break",
      "graph TD\n  A[\"<img src='ht\ntp:evil.com'>\"]",
    ],
    [
      "a Mermaid-encoded slash",
      "graph TD\n  A[\"<img src='#47;#47;evil.com'>\"]",
    ],
    [
      "an HTML-encoded colon",
      "graph TD\n  A[\"<img src='http&colon;evil.com'>\"]",
    ],
    [
      "a numeric HTML entity",
      "graph TD\n  A[\"<img src='&#47;&#47;evil.com'>\"]",
    ],
    [
      "a numeric HTML entity without semicolon",
      "graph TD\n  A[\"<img src='&#47&#47evil.com'>\"]",
    ],
    [
      "a named entity for a tab",
      "graph TD\n  A[\"<img src='/&Tab;/evil.com'>\"]",
    ],
    ["a Mermaid-encoded tab", "graph TD\n  A[\"<img src='/#Tab;/evil.com'>\"]"],
    [
      "a double-encoded slash",
      "graph TD\n  A[\"<img src='&amp;#47;&amp;#47;evil.com'>\"]",
    ],
    [
      "a color-shaped slash after a colon",
      "graph TD\n  A[\"<img src=':#047;#047;evil.com'>\"]",
    ],
    [
      "a CSS background in a state diagram",
      'stateDiagram-v2\n  state "Hello" as A\n  classDef p background-image:url(https://evil.com/x)\n  class A p',
    ],
    [
      "a font injected by a directive",
      '%%{init: {"fontFamily":"Arial; background-image:url(//evil.com/x)"}}%%\nflowchart TD\n  A --> B',
    ],
    [
      "a flowchart image shape",
      'flowchart TD\n  A@{ img: "https://evil.com/x", label: "x" }',
    ],
    [
      "a sequence participant icon",
      'sequenceDiagram\n  participant A\n  properties A: {"icon": "https://evil.com/x"}',
    ],
  ])("refuses %s", (_, chart) => {
    expect(isSafeMermaidChart(chart)).toBe(false);
  });
});
