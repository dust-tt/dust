import { transformAsync } from "@babel/core";
import { describe, expect, it } from "vitest";

import { LINGUI_MACRO_BABEL_OPTIONS } from "./lingui-macro.mjs";

async function expandMacros(code: string, filename: string) {
  const result = await transformAsync(code, {
    ...LINGUI_MACRO_BABEL_OPTIONS,
    filename,
  });
  if (!result?.code) {
    throw new Error(`Babel returned no code for ${filename}`);
  }
  return result.code;
}

describe("LINGUI_MACRO_BABEL_OPTIONS", () => {
  it("expands macros in a .tsx file and leaves TS and JSX to the next compiler", async () => {
    const code = await expandMacros(
      `import { Trans, useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";

type Props = { name: string };

export const LABEL = msg\`Label\`;

export function Greeting({ name }: Props) {
  const { t } = useLingui();
  return <div title={t\`Hello \${name}\`}><Trans>Welcome, {name}</Trans></div>;
}
`,
      "/viz/components/Greeting.tsx"
    );

    expect(code).not.toMatch(/@lingui\/[a-z]+\/macro/);
    expect(code).toContain('from "@lingui/react"');
    expect(code).toContain('message: "Label"');
    expect(code).toContain('message: "Hello {name}"');
    expect(code).toContain('message: "Welcome, {name}"');

    // TS and JSX are only parsed, not compiled.
    expect(code).toMatch(/type Props = \{\s*name: string;\s*\}/);
    expect(code).toContain("}: Props)");
    expect(code).toContain("<div title=");
    expect(code).toContain("<_Trans ");
    expect(code).not.toContain("react/jsx-runtime");
  });

  it("parses a .ts file without JSX, so angle-bracket casts survive", async () => {
    const code = await expandMacros(
      `import { t } from "@lingui/core/macro";

declare const value: unknown;
export const count = <number>value;
export const greeting: string = t\`Hi\`;
`,
      "/viz/lib/greeting.ts"
    );

    expect(code).not.toMatch(/@lingui\/[a-z]+\/macro/);
    expect(code).toContain('from "@lingui/core"');
    expect(code).toContain('message: "Hi"');
    expect(code).toMatch(/<number>\s*value/);
    expect(code).toContain("greeting: string");
  });
});
