import { deriveSandboxFunctionSlug } from "@app/lib/api/sandbox_functions/slug";
import {
  isRelativePodFunctionReference,
  normalizeAppPrefix,
  podFunctionScopeFromFramePath,
  resolvePodFunctionReference,
} from "@app/types/api/pod_function_reference";
import { describe, expect, it } from "vitest";

// viz cannot be imported by alias from front; the same relative hop as sandbox_functions.test.ts.
import { POD_FUNCTION_REFERENCE_REGEX } from "../../../viz/app/lib/pod-function-slug";

const POD_ID = "vlt_abc123";

describe("podFunctionScopeFromFramePath", () => {
  it("derives the scope from the Frame's app folder", () => {
    expect(
      podFunctionScopeFromFramePath(`pod-${POD_ID}/TaskList/TaskList.tsx`)
    ).toEqual({ podId: POD_ID, appPrefix: "tasklist" });
  });

  it("uses the app folder, not the folder the Frame sits in", () => {
    // Only the first segment under the pod root names the app, matching deriveAppPrefix.
    expect(
      podFunctionScopeFromFramePath(`pod-${POD_ID}/TaskList/ui/Board.tsx`)
    ).toEqual({ podId: POD_ID, appPrefix: "tasklist" });
  });

  it("has no scope for a Frame at the Pod root", () => {
    // Nothing namespaces it, so it has no app to resolve bare names against.
    expect(
      podFunctionScopeFromFramePath(`pod-${POD_ID}/Dashboard.tsx`)
    ).toBeNull();
  });

  it("has no scope for a conversation Frame or a missing path", () => {
    expect(
      podFunctionScopeFromFramePath("conversation-abc/Dashboard.tsx")
    ).toBeNull();
    expect(podFunctionScopeFromFramePath(null)).toBeNull();
    expect(podFunctionScopeFromFramePath(undefined)).toBeNull();
  });

  it("has no scope when the app folder normalizes to nothing", () => {
    expect(
      podFunctionScopeFromFramePath(`pod-${POD_ID}/---/Frame.tsx`)
    ).toBeNull();
  });
});

describe("resolvePodFunctionReference", () => {
  const scope = { podId: POD_ID, appPrefix: "tasklist" };

  it("expands a bare name against the Frame's app", () => {
    const result = resolvePodFunctionReference("add-task", scope);

    expect(result.isOk()).toBe(true);
    expect(result.isOk() && result.value).toBe(`${POD_ID}/tasklist__add-task`);
  });

  it("agrees with the slug publish derives for the same app folder", () => {
    // The whole point: the reference a Frame writes must resolve to the slug publish created from
    // that Frame's own app folder. If these drifted, the Frame would call a function that does not
    // exist.
    const published = deriveSandboxFunctionSlug({
      sourcePath: `pod-${POD_ID}/TaskList/functions/add-task.ts`,
      podId: POD_ID,
      name: "add-task",
    });
    if (published.isErr()) {
      throw published.error;
    }

    const frameScope = podFunctionScopeFromFramePath(
      `pod-${POD_ID}/TaskList/TaskList.tsx`
    );
    const resolved = resolvePodFunctionReference("add-task", frameScope);

    expect(resolved.isOk() && resolved.value).toBe(
      `${POD_ID}/${published.value}`
    );
  });

  it("passes an absolute reference through untouched", () => {
    const reference = `${POD_ID}/other-app__list-notes`;
    const result = resolvePodFunctionReference(reference, scope);

    expect(result.isOk() && result.value).toBe(reference);
  });

  it("passes an absolute reference through even with no scope", () => {
    // Conversation Frames and Pod-root Frames keep working exactly as before.
    const reference = `${POD_ID}/list-notes`;
    const result = resolvePodFunctionReference(reference, null);

    expect(result.isOk() && result.value).toBe(reference);
  });

  it("refuses a bare name when the Frame has no app folder", () => {
    const result = resolvePodFunctionReference("add-task", null);

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.message).toContain(
      "only works from a Frame that lives in an app folder"
    );
  });

  it("refuses a reference that is neither form rather than forwarding it", () => {
    for (const reference of ["Add_Task", "add task", "", "tasklist__add"]) {
      expect(resolvePodFunctionReference(reference, scope).isErr()).toBe(true);
    }
  });
});

describe("isRelativePodFunctionReference", () => {
  it("accepts a bare slug segment only", () => {
    expect(isRelativePodFunctionReference("add-task")).toBe(true);
    expect(isRelativePodFunctionReference("greet")).toBe(true);
    // A prefixed-but-podless form is deliberately not relative: dropping the prefix is the point.
    expect(isRelativePodFunctionReference("tasklist__add-task")).toBe(false);
    expect(isRelativePodFunctionReference("vlt_x/add-task")).toBe(false);
  });
});

describe("relative references and the viz grammar", () => {
  it("are rejected by the fully qualified regex viz applies today", () => {
    // The hazard this feature has to clear: viz turns a reference its regex rejects into a null SWR
    // key, so the Frame silently issues no request. Until POD_FUNCTION_REFERENCE_REGEX is widened in
    // viz (step 2), no Frame may use the relative form — this test pins that dependency so the
    // rollout order cannot be forgotten.
    expect(POD_FUNCTION_REFERENCE_REGEX.test("add-task")).toBe(false);
    expect(POD_FUNCTION_REFERENCE_REGEX.test(`${POD_ID}/add-task`)).toBe(true);
  });
});

describe("normalizeAppPrefix", () => {
  it("lowercases without camel-case splitting", () => {
    expect(normalizeAppPrefix("TaskList")).toBe("tasklist");
    expect(normalizeAppPrefix("MyAPIApp")).toBe("myapiapp");
  });

  it("collapses non-alphanumeric runs to single hyphens", () => {
    expect(normalizeAppPrefix("Task List")).toBe("task-list");
    expect(normalizeAppPrefix("Task__List")).toBe("task-list");
    expect(normalizeAppPrefix("-Task-")).toBe("task");
  });

  it("is empty when there is nothing to normalize", () => {
    expect(normalizeAppPrefix("---")).toBe("");
  });
});
