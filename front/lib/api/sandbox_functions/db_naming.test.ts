import {
  podDatabaseNameWithoutAppPrefix,
  podDatabasePrefixFromSlug,
} from "@app/lib/api/sandbox_functions/db_naming";
import { describe, expect, it } from "vitest";

describe("podDatabasePrefixFromSlug", () => {
  it("derives the prefix from the slug's app segment", () => {
    expect(podDatabasePrefixFromSlug("myapp__post-message")).toBe("myapp__");
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

describe("podDatabaseNameWithoutAppPrefix", () => {
  it("strips the app prefix, leaving the name the schema file declares", () => {
    expect(podDatabaseNameWithoutAppPrefix("people_tracker__people")).toBe(
      "people"
    );
  });

  it("returns the whole name for a database with no app prefix", () => {
    expect(podDatabaseNameWithoutAppPrefix("chat")).toBe("chat");
  });
});
