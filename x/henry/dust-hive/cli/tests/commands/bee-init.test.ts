import { describe, expect, test } from "bun:test";
import { buildBeeMetadata } from "../../src/commands/bee-init";
import { isEnvironmentMetadata } from "../../src/lib/environment";

describe("buildBeeMetadata", () => {
  const base = {
    name: "my-bee",
    repoRoot: "/srv/dust",
    workspaceBranch: "feature/x",
    createdAt: "2026-06-26T00:00:00.000Z",
  };

  test("uses the checkout as both repoRoot and worktreePath", () => {
    const metadata = buildBeeMetadata(base);
    expect(metadata.repoRoot).toBe("/srv/dust");
    expect(metadata.worktreePath).toBe("/srv/dust");
  });

  test("marks the env as external-owned and beeMode so destroy never removes the checkout", () => {
    const metadata = buildBeeMetadata(base);
    expect(metadata.worktreeOwner).toBe("external");
    expect(metadata.beeMode).toBe(true);
  });

  test("produces valid environment metadata", () => {
    expect(isEnvironmentMetadata(buildBeeMetadata(base))).toBe(true);
  });
});
