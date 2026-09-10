// @vitest-environment node

import { collectFrameFunctionWarnings } from "@app/lib/api/frames/validate_frame_functions";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { describe, expect, it } from "vitest";

const ADD_TASK_INPUT_SCHEMA: JSONSchema = {
  additionalProperties: false,
  properties: {
    done: { type: "boolean" },
    title: { type: "string" },
  },
  required: ["title"],
  type: "object",
};

const LIST_TASKS_INPUT_SCHEMA: JSONSchema = {
  additionalProperties: false,
  properties: {},
  type: "object",
};

const FUNCTIONS = [
  { inputSchema: ADD_TASK_INPUT_SCHEMA, name: "add-task" },
  { inputSchema: LIST_TASKS_INPUT_SCHEMA, name: "list-tasks" },
];

function sourceFiles(
  files: Record<string, string>
): { content: Buffer; relativePath: string }[] {
  return Object.entries(files).map(([relativePath, content]) => ({
    content: Buffer.from(content, "utf8"),
    relativePath,
  }));
}

async function warningsFor(
  files: Record<string, string>,
  functions = FUNCTIONS
) {
  return collectFrameFunctionWarnings({
    functions,
    sourceFiles: sourceFiles(files),
  });
}

describe("collectFrameFunctionWarnings", () => {
  it("returns nothing when the UI calls no function hook", async () => {
    const warnings = await warningsFor({
      "index.tsx": `export default function App() { return <div>Hi</div>; }`,
    });

    expect(warnings).toEqual([]);
  });

  it("returns nothing for a declared reference with a matching input", async () => {
    const warnings = await warningsFor({
      "index.tsx": `
import { usePodFunction } from "@dust/react-hooks";

export default function App() {
  const { data } = usePodFunction("add-task", { title: "Write tests" });
  return <div>{JSON.stringify(data)}</div>;
}
`,
    });

    expect(warnings).toEqual([]);
  });

  it("flags a reference the manifest does not declare", async () => {
    const warnings = await warningsFor({
      "index.tsx": `
import { usePodFunction } from "@dust/react-hooks";

export default function App() {
  usePodFunction("add-tasks", { title: "Typo" });
  return null;
}
`,
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe("frame_function");
    expect(warnings[0].message).toContain("index.tsx:5:18");
    expect(warnings[0].message).toContain("'add-tasks'");
    expect(warnings[0].suggestion).toBe(
      "Declared functions: 'add-task', 'list-tasks'."
    );
  });

  it("flags a Pod-style reference and suggests the bare name", async () => {
    const warnings = await warningsFor({
      "index.tsx": `
import { usePodFunction } from "@dust/react-hooks";

export default function App() {
  usePodFunction("spc_1234/add-task", { title: "Write tests" });
  return null;
}
`,
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("<podId>/<slug>");
    expect(warnings[0].suggestion).toBe("Use 'add-task'.");
  });

  it("flags an input that does not match the declared contract", async () => {
    const warnings = await warningsFor({
      "index.tsx": `
import { usePodFunction } from "@dust/react-hooks";

export default function App() {
  usePodFunction("add-task", { titel: "Misspelled property" });
  return null;
}
`,
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe("frame_function");
    expect(warnings[0].message).toContain("index.tsx:5:32");
    expect(warnings[0].message).toContain(
      "'titel' does not exist in type 'Input'. Did you mean to write 'title'?"
    );
  });

  it("flags a missing required input property", async () => {
    const warnings = await warningsFor({
      "index.tsx": `
import { usePodFunction } from "@dust/react-hooks";

export default function App() {
  usePodFunction("add-task", { done: false });
  return null;
}
`,
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("title");
  });

  it("flags a mutation triggered with a mismatched input", async () => {
    const warnings = await warningsFor({
      "index.tsx": `
import { usePodFunctionMutation } from "@dust/react-hooks";

export default function App() {
  const { trigger } = usePodFunctionMutation("add-task");
  return <button onClick={() => trigger({ title: 42 })}>Add</button>;
}
`,
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("index.tsx:6:43");
  });

  it("returns nothing for a mutation triggered with a matching input", async () => {
    const warnings = await warningsFor({
      "index.tsx": `
import { usePodFunctionMutation } from "@dust/react-hooks";

export default function App() {
  const { trigger } = usePodFunctionMutation("add-task");
  return <button onClick={() => trigger({ title: "ok" })}>Add</button>;
}
`,
    });

    expect(warnings).toEqual([]);
  });

  it("follows an aliased import", async () => {
    const warnings = await warningsFor({
      "index.tsx": `
import { usePodFunction as useFrameFunction } from "@dust/react-hooks";

export default function App() {
  useFrameFunction("nope", {});
  return null;
}
`,
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("'nope'");
  });

  it("follows a namespace import", async () => {
    const warnings = await warningsFor({
      "index.tsx": `
import * as hooks from "@dust/react-hooks";

export default function App() {
  hooks.usePodFunction("nope", {});
  return null;
}
`,
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("'nope'");
  });

  it("skips a computed reference", async () => {
    const warnings = await warningsFor({
      "index.tsx": `
import { usePodFunction } from "@dust/react-hooks";

export default function App({ name }: { name: string }) {
  usePodFunction(name, { anything: true });
  return null;
}
`,
    });

    expect(warnings).toEqual([]);
  });

  it("checks a hook call in an imported component", async () => {
    const warnings = await warningsFor({
      "components/TaskList.tsx": `
import { usePodFunction } from "@dust/react-hooks";

export function TaskList() {
  usePodFunction("add-task", { title: false });
  return null;
}
`,
      "index.tsx": `
import { TaskList } from "./components/TaskList";

export default function App() { return <TaskList />; }
`,
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("components/TaskList.tsx");
  });

  it("reports the reference when the manifest declares no functions", async () => {
    const warnings = await warningsFor(
      {
        "index.tsx": `
import { usePodFunction } from "@dust/react-hooks";

export default function App() {
  usePodFunction("add-task", { title: "No manifest entry" });
  return null;
}
`,
      },
      []
    );

    // An empty contract map would make `keyof` never and reject the input too; only the reference
    // is reported.
    expect(warnings).toHaveLength(1);
    expect(warnings[0].suggestion).toBe(
      "This Frame's manifest declares no functions."
    );
  });

  it("caps the reported warnings", async () => {
    const calls = Array.from(
      { length: 7 },
      (_, index) => `  usePodFunction("missing-${index}", {});`
    ).join("\n");
    const warnings = await warningsFor({
      "index.tsx": `
import { usePodFunction } from "@dust/react-hooks";

export default function App() {
${calls}
  return null;
}
`,
    });

    expect(warnings).toHaveLength(6);
    expect(warnings[5].message).toBe(
      "2 more Frame function warning(s) not shown."
    );
  });

  it("ignores type errors outside the function inputs", async () => {
    const warnings = await warningsFor({
      "index.tsx": `
import { usePodFunction } from "@dust/react-hooks";

export default function App() {
  const broken: number = "not a number";
  usePodFunction("add-task", { title: "fine" });
  return <div>{broken}</div>;
}
`,
    });

    expect(warnings).toEqual([]);
  });
});
