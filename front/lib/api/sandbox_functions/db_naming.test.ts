import {
  podDatabasePrefixFromPodPath,
  podDatabasePrefixFromSlug,
  qualifyPodDatabaseName,
  resolvePodDatabaseName,
  stripPodDatabasePrefix,
} from "@app/lib/api/sandbox_functions/db_naming";
import { POD_DATABASE_NAME_REGEX } from "@app/types/api/sandbox_functions";
import { describe, expect, it } from "vitest";

const POD_ID = "vlt_abc123";

function prefixForPath(sourcePath: string) {
  const result = podDatabasePrefixFromPodPath({ sourcePath, podId: POD_ID });
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}

describe("podDatabasePrefixFromPodPath", () => {
  it("derives the prefix from the app folder", () => {
    expect(prefixForPath(`pod-${POD_ID}/MyApp/databases/chat.db.ts`)).toBe(
      "myapp__"
    );
  });

  it("uses underscores where the slug prefix would use hyphens", () => {
    // Database names admit [a-z0-9_] only, so `Task List` cannot become `task-list`.
    const prefix = prefixForPath(
      `pod-${POD_ID}/Task List/databases/chat.db.ts`
    );

    expect(prefix).toBe("task_list__");
    expect(POD_DATABASE_NAME_REGEX.test(`${prefix}chat`)).toBe(true);
  });

  it("has no prefix for a schema file at the pod root", () => {
    expect(prefixForPath(`pod-${POD_ID}/chat.db.ts`)).toBeNull();
  });

  it("has no prefix when the app folder cannot start a database name", () => {
    // `2048game__chat` would fail the leading-letter contract, so this app keeps bare names.
    expect(
      prefixForPath(`pod-${POD_ID}/2048Game/databases/chat.db.ts`)
    ).toBeNull();
  });

  it("rejects a path outside the pod file system", () => {
    const result = podDatabasePrefixFromPodPath({
      sourcePath: "conversation-abc/databases/chat.db.ts",
      podId: POD_ID,
    });

    expect(result.isErr()).toBe(true);
  });
});

describe("podDatabasePrefixFromSlug", () => {
  it("agrees with the path derivation for the same app", () => {
    expect(podDatabasePrefixFromSlug("myapp__post-message")).toBe(
      prefixForPath(`pod-${POD_ID}/MyApp/databases/chat.db.ts`)
    );
  });

  it("converts the slug's hyphens to underscores", () => {
    expect(podDatabasePrefixFromSlug("task-list__add-task")).toBe(
      "task_list__"
    );
  });

  it("has no prefix for a function published outside an app folder", () => {
    expect(podDatabasePrefixFromSlug("greet")).toBeNull();
  });
});

describe("qualifyPodDatabaseName", () => {
  it("qualifies with the prefix", () => {
    expect(qualifyPodDatabaseName({ prefix: "myapp__", name: "chat" })).toBe(
      "myapp__chat"
    );
  });

  it("returns the bare name when there is no prefix", () => {
    expect(qualifyPodDatabaseName({ prefix: null, name: "chat" })).toBe("chat");
  });

  it("falls back to the bare name when the prefix would break the length cap", () => {
    const prefix = `${"a".repeat(60)}__`;

    expect(qualifyPodDatabaseName({ prefix, name: "chat" })).toBe("chat");
  });
});

describe("stripPodDatabasePrefix", () => {
  it("makes qualifying idempotent for an already-qualified name", () => {
    const prefix = "myapp__";
    const stripped = stripPodDatabasePrefix({ prefix, name: "myapp__chat" });

    expect(qualifyPodDatabaseName({ prefix, name: stripped })).toBe(
      "myapp__chat"
    );
  });

  it("leaves another app's prefix in place", () => {
    expect(
      stripPodDatabasePrefix({ prefix: "myapp__", name: "other__chat" })
    ).toBe("other__chat");
  });
});

describe("resolvePodDatabaseName", () => {
  const prefix = "myapp__";

  it("creates a new database under the app prefix", () => {
    expect(
      resolvePodDatabaseName({ prefix, name: "chat", existingNames: [] })
    ).toBe("myapp__chat");
  });

  it("keeps using an app-prefixed database that already exists", () => {
    expect(
      resolvePodDatabaseName({
        prefix,
        name: "chat",
        existingNames: ["myapp__chat", "chat"],
      })
    ).toBe("myapp__chat");
  });

  it("falls back to an existing unprefixed database", () => {
    // Transitional: databases created before app namespacing keep their bare filenames, and
    // their litestream replica prefixes are keyed on those.
    expect(
      resolvePodDatabaseName({
        prefix,
        name: "chat",
        existingNames: ["chat"],
      })
    ).toBe("chat");
  });

  it("does not prefix when the source has no app folder", () => {
    expect(
      resolvePodDatabaseName({
        prefix: null,
        name: "chat",
        existingNames: ["chat"],
      })
    ).toBe("chat");
  });

  it("gives a copied app its own database rather than the original's", () => {
    // The copy's source is unchanged and still says db("chat"); only its prefix differs.
    expect(
      resolvePodDatabaseName({
        prefix: "myappcopy__",
        name: "chat",
        existingNames: ["myapp__chat"],
      })
    ).toBe("myappcopy__chat");
  });
});
