import { DustFileSystem, DustFileSystemError } from "@app/lib/api/file_system";
import {
  formatPodAgentsMdPromptSection,
  readPodAgentsMdContent,
} from "@app/lib/api/projects/agents_md";
import {
  getPodAgentsMdScopedPath,
  POD_AGENTS_MD_MAX_CHARACTER_COUNT,
} from "@app/lib/api/projects/constants";
import { Authenticator } from "@app/lib/auth";
import { constructProjectContext } from "@app/lib/resources/skill/code_defined/projects";
import logger from "@app/logger/logger";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

describe("readPodAgentsMdContent", () => {
  it("returns null when the file does not exist", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const podId = "pod_test";

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok({
        readBuffer: vi.fn().mockResolvedValue(new Ok(null)),
      } as unknown as DustFileSystem)
    );

    const result = await readPodAgentsMdContent(auth, podId);
    expect(result).toBeNull();
    expect(DustFileSystem.fromScopedPath).toHaveBeenCalledWith(
      auth,
      getPodAgentsMdScopedPath(podId)
    );
  });

  it("returns trimmed content when the file exists", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const podId = "pod_test";
    const scopedPath = getPodAgentsMdScopedPath(podId);

    const readBuffer = vi
      .fn()
      .mockResolvedValue(new Ok(Buffer.from("  Always cite sources.\n")));
    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok({
        readBuffer,
      } as unknown as DustFileSystem)
    );

    const result = await readPodAgentsMdContent(auth, podId);
    expect(result).toBe("Always cite sources.");
    expect(readBuffer).toHaveBeenCalledWith(scopedPath);
  });

  it("truncates content to the Pod settings character limit", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const podId = "pod_test";
    const longContent = "x".repeat(POD_AGENTS_MD_MAX_CHARACTER_COUNT + 100);

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok({
        readBuffer: vi
          .fn()
          .mockResolvedValue(new Ok(Buffer.from(longContent, "utf8"))),
      } as unknown as DustFileSystem)
    );

    const result = await readPodAgentsMdContent(auth, podId);
    expect(result).toHaveLength(POD_AGENTS_MD_MAX_CHARACTER_COUNT);
  });

  it("logs a warning when reading AGENTS.md fails unexpectedly", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const podId = "pod_test";
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok({
        readBuffer: vi
          .fn()
          .mockResolvedValue(
            new Err(new DustFileSystemError("internal", "stream read failed"))
          ),
      } as unknown as DustFileSystem)
    );

    const result = await readPodAgentsMdContent(auth, podId);

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it("does not log when AGENTS.md is missing", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const podId = "pod_test";
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Err(new DustFileSystemError("not_found", "Space not found"))
    );

    const result = await readPodAgentsMdContent(auth, podId);

    expect(result).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("formatPodAgentsMdPromptSection", () => {
  it("wraps content in a labeled section", () => {
    const section = formatPodAgentsMdPromptSection("Use Pod tools first.");
    expect(section).toContain("## Pod agent instructions (AGENTS.md)");
    expect(section).toContain("<file_content>");
    expect(section).toContain("Use Pod tools first.");
    expect(section).toContain("</file_content>");
  });
});

describe("constructProjectContext", () => {
  it("returns empty string for non-pod conversations", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });

    const result = await constructProjectContext(auth, { conversation });
    expect(result).toBe("");
  });

  it("includes AGENTS.md instructions for pod conversations", async () => {
    const { workspace, user } = await createResourceTest({
      role: "admin",
    });
    const project = await SpaceFactory.project(workspace, user.id);
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: project.id,
    });

    vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(
      new Ok({
        readBuffer: vi
          .fn()
          .mockResolvedValue(
            new Ok(Buffer.from("Prefer concise answers.", "utf8"))
          ),
      } as unknown as DustFileSystem)
    );

    const result = await constructProjectContext(auth, { conversation });

    expect(result).toContain(`part of the Pod "${project.name}"`);
    expect(result).toContain("## Pod agent instructions (AGENTS.md)");
    expect(result).toContain("Prefer concise answers.");
  });
});
