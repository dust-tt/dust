import {
  deriveSandboxFunctionSlug,
  sandboxFunctionNameFromSlug,
} from "@app/lib/api/sandbox_functions/slug";
import { describe, expect, it } from "vitest";

const POD_ID = "vlt_abc123";

function derive(sourcePath: string, name: string) {
  return deriveSandboxFunctionSlug({ sourcePath, podId: POD_ID, name });
}

describe("deriveSandboxFunctionSlug", () => {
  it("prefixes the name with the app folder", () => {
    const result = derive(
      `pod-${POD_ID}/TaskList/functions/add-task.ts`,
      "add-task"
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value).toBe("tasklist__add-task");
  });

  it("ignores folders between the app folder and the source", () => {
    const nested = derive(
      `pod-${POD_ID}/TaskList/functions/admin/purge.ts`,
      "purge"
    );
    const flat = derive(`pod-${POD_ID}/TaskList/purge.ts`, "purge");

    expect(nested.isOk()).toBe(true);
    expect(flat.isOk()).toBe(true);
    if (nested.isErr() || flat.isErr()) {
      return;
    }
    // Moving a source inside its app must not rename the published function.
    expect(nested.value).toBe("tasklist__purge");
    expect(flat.value).toBe("tasklist__purge");
  });

  it("normalizes an app folder that is not already slug-shaped", () => {
    const spaced = derive(`pod-${POD_ID}/Task List/functions/x.ts`, "x");
    const underscored = derive(`pod-${POD_ID}/my_app/functions/x.ts`, "x");

    expect(spaced.isOk()).toBe(true);
    expect(underscored.isOk()).toBe(true);
    if (spaced.isErr() || underscored.isErr()) {
      return;
    }
    expect(spaced.value).toBe("task-list__x");
    expect(underscored.value).toBe("my-app__x");
  });

  it("resolves a legacy pod-scoped path", () => {
    const result = derive("pod/TaskList/functions/add-task.ts", "add-task");

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value).toBe("tasklist__add-task");
  });

  it("leaves a source at the pod root unprefixed", () => {
    const result = derive(`pod-${POD_ID}/greet.ts`, "greet");

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value).toBe("greet");
  });

  // An unprefixed slug can never collide with an app's: the name is one segment so it carries no
  // `__`, and a prefix never contains one either, so every prefixed slug has exactly one.
  it("keeps root and app namespaces disjoint", () => {
    const root = derive(`pod-${POD_ID}/refresh.ts`, "refresh");
    const app = derive(
      `pod-${POD_ID}/TaskList/functions/refresh.ts`,
      "refresh"
    );

    expect(root.isOk()).toBe(true);
    expect(app.isOk()).toBe(true);
    if (root.isErr() || app.isErr()) {
      return;
    }
    expect(root.value).not.toBe(app.value);
    expect(root.value).not.toContain("__");
    expect(app.value.match(/__/g)).toHaveLength(1);
  });

  it("rejects a path with no file component", () => {
    const result = derive(`pod-${POD_ID}`, "greet");

    expect(result.isErr()).toBe(true);
  });

  it("rejects an app folder that normalizes to nothing", () => {
    const result = derive(`pod-${POD_ID}/---/functions/x.ts`, "x");

    expect(result.isErr()).toBe(true);
  });

  it("rejects a path outside the pod scope", () => {
    const result = derive("conversation-abc/TaskList/functions/x.ts", "x");

    expect(result.isErr()).toBe(true);
  });

  it("rejects a name that is not slug-shaped", () => {
    const result = derive(`pod-${POD_ID}/TaskList/functions/x.ts`, "Add_Task");

    expect(result.isErr()).toBe(true);
  });
});

describe("sandboxFunctionNameFromSlug", () => {
  it("inverts the slug composition for an app's function", () => {
    const slug = derive(
      `pod-${POD_ID}/PeopleTracker2/functions/add-person.ts`,
      "add-person"
    );
    if (slug.isErr()) {
      throw slug.error;
    }

    expect(slug.value).toBe("peopletracker2__add-person");
    expect(sandboxFunctionNameFromSlug(slug.value)).toBe("add-person");
  });

  it("returns the whole slug for a function published outside an app folder", () => {
    expect(sandboxFunctionNameFromSlug("greet")).toBe("greet");
  });

  it("keeps hyphens in a multi-word app's function name", () => {
    expect(sandboxFunctionNameFromSlug("task-list__add-task")).toBe("add-task");
  });
});
