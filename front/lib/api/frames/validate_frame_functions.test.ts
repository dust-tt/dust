// @vitest-environment node

import {
  collectFrameFunctionWarnings,
  validateFrameFunctionReferences,
} from "@app/lib/api/frames/validate_frame_functions";
import assert from "assert";
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

function referencesFor(files: Record<string, string>, functions = FUNCTIONS) {
  return validateFrameFunctionReferences({
    declaredFunctionNames: functions.map((fn) => fn.name),
    sourceFiles: sourceFiles(files),
  });
}

function referenceError(files: Record<string, string>, functions = FUNCTIONS) {
  const result = referencesFor(files, functions);
  assert(result.isErr(), "expected a reference error");

  return result.error;
}

describe("validateFrameFunctionReferences", () => {
  it("accepts a Frame whose UI calls no function hook", () => {
    const result = referencesFor({
      "index.tsx": `export default function App() { return <div>Hi</div>; }`,
    });

    expect(result.isOk()).toBe(true);
  });

  it("accepts every declared reference", () => {
    const result = referencesFor({
      "index.tsx": `
import { usePodFunction, usePodFunctionMutation } from "@dust/react-hooks";

export default function App() {
  usePodFunction("list-tasks", {});
  usePodFunctionMutation("add-task");
  return null;
}
`,
    });

    expect(result.isOk()).toBe(true);
  });

  it("rejects a reference the manifest does not declare", () => {
    const error = referenceError({
      "index.tsx": `
import { usePodFunction } from "@dust/react-hooks";

export default function App() {
  usePodFunction("add-tasks", { title: "Typo" });
  return null;
}
`,
    });

    expect(error.code).toBe("invalid_function_reference");
    expect(error.message).toContain("index.tsx:5:18");
    expect(error.message).toContain("'add-tasks'");
    expect(error.message).toContain(
      "Declared functions: 'add-task', 'list-tasks'."
    );
  });

  it("rejects a Pod-style reference and names the bare form", () => {
    const error = referenceError({
      "index.tsx": `
import { usePodFunction } from "@dust/react-hooks";

export default function App() {
  usePodFunction("spc_1234/add-task", { title: "Write tests" });
  return null;
}
`,
    });

    expect(error.message).toContain("<podId>/<slug>");
    expect(error.message).toContain("Use 'add-task'.");
  });

  it("follows an aliased import", () => {
    const error = referenceError({
      "index.tsx": `
import { usePodFunction as useFrameFunction } from "@dust/react-hooks";

export default function App() {
  useFrameFunction("nope", {});
  return null;
}
`,
    });

    expect(error.message).toContain("'nope'");
  });

  it("follows a namespace import", () => {
    const error = referenceError({
      "index.tsx": `
import * as hooks from "@dust/react-hooks";

export default function App() {
  hooks.usePodFunction("nope", {});
  return null;
}
`,
    });

    expect(error.message).toContain("'nope'");
  });

  it("accepts a computed reference", () => {
    const result = referencesFor({
      "index.tsx": `
import { usePodFunction } from "@dust/react-hooks";

export default function App({ name }: { name: string }) {
  usePodFunction(name, { anything: true });
  return null;
}
`,
    });

    expect(result.isOk()).toBe(true);
  });

  it("rejects a reference from an imported component", () => {
    const error = referenceError({
      "components/TaskList.tsx": `
import { usePodFunction } from "@dust/react-hooks";

export function TaskList() {
  usePodFunction("nope", {});
  return null;
}
`,
      "index.tsx": `
import { TaskList } from "./components/TaskList";

export default function App() { return <TaskList />; }
`,
    });

    expect(error.message).toContain("components/TaskList.tsx");
  });

  it("rejects a reference when the manifest declares no functions", () => {
    const error = referenceError(
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

    expect(error.message).toContain(
      "This Frame's manifest declares no functions."
    );
  });

  it("caps the listed references", () => {
    const calls = Array.from(
      { length: 7 },
      (_, index) => `  usePodFunction("missing-${index}", {});`
    ).join("\n");
    const error = referenceError({
      "index.tsx": `
import { usePodFunction } from "@dust/react-hooks";

export default function App() {
${calls}
  return null;
}
`,
    });

    expect(error.message).toContain("'missing-4'");
    expect(error.message).not.toContain("'missing-5'");
    expect(error.message).toContain("2 more not shown.");
  });
});

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

  it("returns nothing when the manifest declares no functions", async () => {
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

    // An empty contract map would make `keyof` never and reject every input. The reference check
    // owns this case, and it blocks the publish outright.
    expect(warnings).toEqual([]);
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
