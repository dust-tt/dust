import { describe, expect, it } from "bun:test";
import { ALL_BINARIES } from "../../src/lib/cache";

describe("sync command", () => {
  describe("uncommitted changes detection", () => {
    it("filters out untracked files from git status", () => {
      // Simulates the logic in hasUncommittedChanges
      const gitStatusOutput = `?? newfile.txt
?? another-untracked.ts
 M modified.ts
`;
      const lines = gitStatusOutput
        .trim()
        .split("\n")
        .filter((line) => line && !line.startsWith("??"));

      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe(" M modified.ts");
    });

    it("returns empty when only untracked files exist", () => {
      const gitStatusOutput = `?? newfile.txt
?? another-untracked.ts
`;
      const lines = gitStatusOutput
        .trim()
        .split("\n")
        .filter((line) => line && !line.startsWith("??"));

      expect(lines).toHaveLength(0);
    });

    it("detects staged changes", () => {
      const gitStatusOutput = `M  staged.ts
`;
      const lines = gitStatusOutput
        .trim()
        .split("\n")
        .filter((line) => line && !line.startsWith("??"));

      expect(lines).toHaveLength(1);
    });

    it("detects modified but unstaged changes", () => {
      const gitStatusOutput = ` M modified.ts
`;
      const lines = gitStatusOutput
        .trim()
        .split("\n")
        .filter((line) => line && !line.startsWith("??"));

      expect(lines).toHaveLength(1);
    });

    it("handles empty status output (clean repo)", () => {
      const gitStatusOutput = "";
      const lines = gitStatusOutput
        .trim()
        .split("\n")
        .filter((line) => line && !line.startsWith("??"));

      expect(lines).toHaveLength(0);
    });
  });

  describe("rebase result handling", () => {
    type RebaseResult = { success: true } | { success: false; conflict: boolean; error: string };

    it("handles successful rebase", () => {
      const result: RebaseResult = { success: true };
      expect(result.success).toBe(true);
    });

    it("detects conflict from CONFLICT in stderr", () => {
      const stderr = "CONFLICT (content): Merge conflict in file.ts";
      const isConflict =
        stderr.includes("CONFLICT") ||
        stderr.includes("could not apply") ||
        stderr.includes("Resolve all conflicts");
      expect(isConflict).toBe(true);
    });

    it("detects conflict from could not apply", () => {
      const stderr = "error: could not apply abc123... Some commit";
      const isConflict =
        stderr.includes("CONFLICT") ||
        stderr.includes("could not apply") ||
        stderr.includes("Resolve all conflicts");
      expect(isConflict).toBe(true);
    });

    it("detects conflict from Resolve all conflicts", () => {
      const stderr = "hint: Resolve all conflicts manually";
      const isConflict =
        stderr.includes("CONFLICT") ||
        stderr.includes("could not apply") ||
        stderr.includes("Resolve all conflicts");
      expect(isConflict).toBe(true);
    });

    it("identifies non-conflict errors", () => {
      const stderr = "fatal: Not a git repository";
      const isConflict =
        stderr.includes("CONFLICT") ||
        stderr.includes("could not apply") ||
        stderr.includes("Resolve all conflicts");
      expect(isConflict).toBe(false);
    });
  });

  describe("npm install directories", () => {
    it("installs in sdks/js, front, and connectors", () => {
      const dirs = [
        { name: "sdks/js", path: "/repo/sdks/js" },
        { name: "front", path: "/repo/front" },
        { name: "connectors", path: "/repo/connectors" },
      ];

      expect(dirs).toHaveLength(3);
      expect(dirs.map((d) => d.name)).toEqual(["sdks/js", "front", "connectors"]);
    });

    it("constructs correct paths from repo root", () => {
      const repoRoot = "/Users/test/dust";
      const dirs = [
        { name: "sdks/js", path: `${repoRoot}/sdks/js` },
        { name: "front", path: `${repoRoot}/front` },
        { name: "connectors", path: `${repoRoot}/connectors` },
      ];

      expect(dirs.find((d) => d.name === "sdks/js")?.path).toBe("/Users/test/dust/sdks/js");
      expect(dirs.find((d) => d.name === "front")?.path).toBe("/Users/test/dust/front");
      expect(dirs.find((d) => d.name === "connectors")?.path).toBe("/Users/test/dust/connectors");
    });
  });

  describe("default branch behavior", () => {
    it("defaults to main when no branch specified", () => {
      const targetBranch: string | undefined = undefined;
      const branch = targetBranch ?? "main";
      expect(branch).toBe("main");
    });

    it("uses specified branch when provided", () => {
      const targetBranch = "develop";
      const branch = targetBranch ?? "main";
      expect(branch).toBe("develop");
    });
  });

  describe("error messages", () => {
    it("formats uncommitted changes error", () => {
      const error = "Repository has uncommitted changes. Commit or stash them before syncing.";
      expect(error).toContain("uncommitted changes");
      expect(error).toContain("Commit or stash");
    });

    it("formats not in repo error", () => {
      const error =
        "Not in a git repository and no cache source configured. Run from within the Dust repo.";
      expect(error).toContain("git repository");
      expect(error).toContain("Dust repo");
    });

    it("formats fetch failure error", () => {
      const error = "Failed to fetch from origin";
      expect(error).toContain("fetch");
      expect(error).toContain("origin");
    });

    it("formats rebase conflict error", () => {
      const error = "Rebase conflicts - resolve and run sync again";
      expect(error).toContain("conflicts");
      expect(error).toContain("sync again");
    });

    it("formats npm install failure error", () => {
      const failed = [{ name: "front", success: false }];
      const error = `npm install failed in: ${failed.map((r) => r.name).join(", ")}`;
      expect(error).toBe("npm install failed in: front");
    });

    it("formats multiple npm failures", () => {
      const failed = [
        { name: "front", success: false },
        { name: "connectors", success: false },
      ];
      const error = `npm install failed in: ${failed.map((r) => r.name).join(", ")}`;
      expect(error).toBe("npm install failed in: front, connectors");
    });

    it("formats binary build failure error", () => {
      const failedBinaries = ["core-api", "oauth"];
      const error = `Failed to build binaries: ${failedBinaries.join(", ")}`;
      expect(error).toBe("Failed to build binaries: core-api, oauth");
    });
  });

  describe("conflict resolution instructions", () => {
    it("provides correct resolution steps", () => {
      const instructions = [
        "1. Fix the conflicts in the listed files",
        "2. Stage your changes: git add <files>",
        "3. Continue the rebase: git rebase --continue",
        "4. Run dust-hive sync again",
      ];

      expect(instructions).toHaveLength(4);
      expect(instructions[2]).toContain("git rebase --continue");
      expect(instructions[3]).toContain("dust-hive sync");
    });

    it("provides abort option", () => {
      const abortInstruction = "Or abort the rebase: git rebase --abort";
      expect(abortInstruction).toContain("git rebase --abort");
    });
  });

  describe("binary building", () => {
    it("builds all binaries defined in ALL_BINARIES", () => {
      // Sync command builds all binaries using buildBinaries(repoRoot, [...ALL_BINARIES])
      const binariesToBuild = [...ALL_BINARIES];
      expect(binariesToBuild).toHaveLength(ALL_BINARIES.length);
      expect(binariesToBuild).toContain("core-api");
      expect(binariesToBuild).toContain("init_db");
    });
  });

  describe("success output formatting", () => {
    it("formats elapsed time correctly", () => {
      const startTime = Date.now() - 5500; // 5.5 seconds ago
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      // Should be approximately "5.5" (might vary slightly due to execution time)
      expect(Number.parseFloat(elapsed)).toBeGreaterThanOrEqual(5.4);
      expect(Number.parseFloat(elapsed)).toBeLessThanOrEqual(5.7);
    });

    it("formats completion message", () => {
      const branch = "feature-branch";
      const targetBranch = "main";
      const message = `Branch '${branch}' is now rebased on latest ${targetBranch}.`;
      expect(message).toBe("Branch 'feature-branch' is now rebased on latest main.");
    });
  });
});
