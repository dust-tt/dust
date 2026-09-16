// @vitest-environment node

import { validateFrameFunctionReferences } from "@app/lib/api/frames/validate_frame_functions";
import assert from "assert";
import { describe, expect, it } from "vitest";

const DECLARED_FUNCTION_NAMES = ["add-task", "list-tasks"];

function referencesFor(
  files: Record<string, string>,
  declaredFunctionNames = DECLARED_FUNCTION_NAMES
) {
  return validateFrameFunctionReferences({
    declaredFunctionNames,
    sourceFiles: Object.entries(files).map(([relativePath, content]) => ({
      content: Buffer.from(content, "utf8"),
      relativePath,
    })),
  });
}

function referenceError(
  files: Record<string, string>,
  declaredFunctionNames = DECLARED_FUNCTION_NAMES
) {
  const result = referencesFor(files, declaredFunctionNames);
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
import { useFrameFunction, useFrameFunctionMutation } from "@dust/react-hooks";

export default function App() {
  useFrameFunction("list-tasks", {});
  useFrameFunctionMutation("add-task");
  return null;
}
`,
    });

    expect(result.isOk()).toBe(true);
  });

  it("rejects a reference the manifest does not declare", () => {
    const error = referenceError({
      "index.tsx": `
import { useFrameFunction } from "@dust/react-hooks";

export default function App() {
  useFrameFunction("add-tasks", { title: "Typo" });
  return null;
}
`,
    });

    expect(error.code).toBe("invalid_function_reference");
    expect(error.message).toContain(
      "index.tsx:5:20: useFrameFunction('add-tasks')"
    );
    expect(error.message).toContain(
      "Declared functions: 'add-task', 'list-tasks'."
    );
  });

  it("follows an aliased import", () => {
    const error = referenceError({
      "index.tsx": `
import { useFrameFunction as useFunction } from "@dust/react-hooks";

export default function App() {
  useFunction("nope", {});
  return null;
}
`,
    });

    expect(error.message).toContain("useFrameFunction('nope')");
  });

  it("checks the legacy usePodFunction names", () => {
    const error = referenceError({
      "index.tsx": `
import { usePodFunction, usePodFunctionMutation } from "@dust/react-hooks";

export default function App() {
  usePodFunction("nope", {});
  usePodFunctionMutation("also-nope");
  return null;
}
`,
    });

    expect(error.message).toContain("usePodFunction('nope')");
    expect(error.message).toContain("usePodFunctionMutation('also-nope')");
  });

  it("follows a namespace import", () => {
    const error = referenceError({
      "index.tsx": `
import * as hooks from "@dust/react-hooks";

export default function App() {
  hooks.useFrameFunction("nope", {});
  return null;
}
`,
    });

    expect(error.message).toContain("useFrameFunction('nope')");
  });

  it("ignores hooks that are not imported from @dust/react-hooks", () => {
    const result = referencesFor({
      "index.tsx": `
import { useFrameFunction } from "./my-hooks";

export default function App() {
  useFrameFunction("nope", {});
  return null;
}
`,
    });

    expect(result.isOk()).toBe(true);
  });

  it("accepts a computed reference", () => {
    const result = referencesFor({
      "index.tsx": `
import { useFrameFunction } from "@dust/react-hooks";

export default function App({ name }: { name: string }) {
  useFrameFunction(name, { anything: true });
  return null;
}
`,
    });

    expect(result.isOk()).toBe(true);
  });

  it("rejects a reference from an imported component", () => {
    const error = referenceError({
      "components/TaskList.tsx": `
import { useFrameFunction } from "@dust/react-hooks";

export function TaskList() {
  useFrameFunction("nope", {});
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
import { useFrameFunction } from "@dust/react-hooks";

export default function App() {
  useFrameFunction("add-task", { title: "No manifest entry" });
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
      (_, index) => `  useFrameFunction("missing-${index}", {});`
    ).join("\n");
    const error = referenceError({
      "index.tsx": `
import { useFrameFunction } from "@dust/react-hooks";

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
