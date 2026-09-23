import postcss from "postcss";
import { describe, expect, it } from "vitest";

import { scopeSparkle } from "./scope-sparkle.mjs";

describe("Sparkle style isolation", () => {
  it("excludes resets and keeps responsive rules inside the component boundary", () => {
    const result = postcss.parse(
      scopeSparkle(`
        @layer base { input { padding: 8px; } }
        @layer utilities {
          .text-sm { font-size: 14px; }
          @media (width >= 640px) { .text-lg { font-size: 18px; } }
        }
      `)
    );

    expect(result.toString()).not.toContain("input");
    expect(result.first?.type).toBe("atrule");
    result.walkAtRules("scope", (scope) => {
      expect(scope.params).toBe("(.viz-sparkle) to ([data-viz-sparkle-slot])");
    });
    result.walkRules((rule) => {
      let ancestor = rule.parent;
      while (ancestor && ancestor.type !== "root") {
        if (ancestor.type === "atrule" && ancestor.name === "scope") {
          return;
        }
        ancestor = ancestor.parent;
      }
      expect.fail(`Unscoped selector: ${rule.selector}`);
    });
  });

  it("isolates properties and animations without renaming classes or external variables", () => {
    const result = scopeSparkle(`
      @property --tw-shadow { syntax: "*"; inherits: false; initial-value: none; }
      :root { --foreground: red; --animate-pulse: pulse 2s infinite; }
      .animate-pulse {
        animation: var(--animate-pulse);
        color: var(--foreground);
        box-shadow: var(--tw-shadow);
        transform-origin: var(--radix-tooltip-content-transform-origin);
        content: "pulse --foreground";
      }
      @keyframes pulse { to { opacity: .5; } }
    `);

    expect(result).toContain("@property --viz-sparkle-tw-shadow");
    expect(result).toContain("@keyframes viz-sparkle-pulse");
    expect(result).toContain("--viz-sparkle-animate-pulse: viz-sparkle-pulse");
    expect(result).toContain("animation: var(--viz-sparkle-animate-pulse)");
    expect(result).toContain("color: var(--viz-sparkle-foreground)");
    expect(result).toContain("box-shadow: var(--viz-sparkle-tw-shadow)");
    expect(result).toContain(".animate-pulse");
    expect(result).toContain("var(--radix-tooltip-content-transform-origin)");
    expect(result).toContain('content: "pulse --foreground"');
  });

  it("puts light and dark tokens on the scope root", () => {
    const result = scopeSparkle(`
      :root, :host { --foreground: black; }
      .dark { --foreground: white; }
      .dark .border { border-color: var(--foreground); }
    `);

    expect(result).toContain(":scope, :scope");
    expect(result).toContain(":scope:where(.dark, .dark *)");
    expect(result).toContain(":scope:where(.dark, .dark *) .border");
    expect(result).not.toContain(":root");
    expect(result).not.toContain(":host");
  });
});
