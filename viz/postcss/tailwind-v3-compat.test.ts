import path from "node:path";
import tailwind from "@tailwindcss/postcss";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

import compatibility from "./tailwind-v3-compat.cjs";

const marker = ":root { --viz-v3-compat: 1; }";
const compile = async (css: string) =>
  (await postcss([compatibility()]).process(css, { from: undefined })).root;

describe("Tailwind V3 compatibility adapter", () => {
  it.each([
    false,
    true,
  ])("runs after Tailwind (optimize=%s)", async (optimize) => {
    const input = `
      @import "tailwindcss" source(none);
      @import "./tailwind-v3-compat.css";
      @theme inline { --color-red-500: #ef4444; }
      @source inline("bg-red-500 bg-red-500/100 bg-opacity-50 placeholder-red-500 placeholder-opacity-50 hover:bg-red-500");
    `;
    const result = await postcss([
      tailwind({ optimize }),
      compatibility(),
    ]).process(input, {
      from: path.resolve("app/styles/compatibility-test.css"),
    });
    expect(result.css).not.toContain("--viz-v3-compat:");
    expect(result.css).toContain("var(--viz-v3-bg-opacity, 1)");
    expect(result.css).toContain("var(--viz-v3-placeholder-opacity, 1)");
    expect(result.warnings()).toHaveLength(0);
  });

  it("leaves other stylesheets untouched", async () => {
    const css = ".bg-red-500 { background-color: #ef4444; }";
    expect((await compile(css)).toString()).toBe(css);
  });

  it("preserves explicit alpha when the optimizer merges selectors", async () => {
    const root = await compile(`${marker}
      .bg-red-500,.bg-red-500\\/100 { background-color: #ef4444; }
      .bg-red-500\\/50 { background-color: #ef444480; }
    `);
    const rules: Record<string, string> = {};
    root.walkRules((rule) => {
      rules[rule.selector] = rule.toString();
    });
    expect(rules[".bg-red-500"]).toContain("var(--viz-v3-bg-opacity, 1)");
    expect(rules[".bg-red-500\\/100"]).not.toContain("--viz-v3");
    expect(rules[".bg-red-500\\/50"]).not.toContain("--viz-v3");
    expect(Object.keys(rules)).toHaveLength(3);
  });

  it("handles nested development selectors and separate opacity families", async () => {
    const root = await compile(`${marker}
      .hover\\:bg-red-500 { &:hover { @media (hover: hover) { background-color: #ef4444; } } }
      .divide-red-500 { & > :where(:not(:last-child)) { border-color: #ef4444; } }
      .placeholder-red-500 { &::placeholder { color: #ef4444; } }
      .placeholder-red-500\\/100 { &::placeholder { color: #ef4444; } }
      .bg-\\[\\#ff0000\\] { background-color: red; }
    `);
    const resets: string[] = [];
    root.walkDecls(/^--viz-v3-/, ({ prop }) => {
      resets.push(prop);
    });
    expect(resets).toEqual([
      "--viz-v3-bg-opacity",
      "--viz-v3-divide-opacity",
      "--viz-v3-placeholder-opacity",
      "--viz-v3-bg-opacity",
    ]);
    expect(root.toString()).toContain("@media (hover: hover)");
    expect(root.toString()).toContain("&::placeholder");
  });

  it("preserves semantic colors and live palette variables", async () => {
    const root = await compile(`${marker}
      :root { --color-stone-500: #78716c; }
      .bg-stone-500 { background-color: var(--color-stone-500); }
      .bg-background { background-color: var(--background); }
      .text-current { color: currentColor; }
      .bg-inherit { background-color: inherit; }
    `);
    expect(root.toString()).toContain(
      "color-mix(in srgb, var(--color-stone-500)"
    );
    const resets: string[] = [];
    root.walkDecls(/^--viz-v3-/, ({ prop }) => {
      resets.push(prop);
    });
    expect(resets).toEqual(["--viz-v3-bg-opacity"]);
  });
});
