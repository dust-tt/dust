import {
  formatSandboxImageId,
  type SandboxImageId,
} from "@app/lib/api/sandbox/image";
import { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import type { TemplateBuilder } from "e2b";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { DockerRegistryFactory } from "./e2b_template";
import { buildSandboxImage } from "./e2b_template";

function createTestImage(): SandboxImage {
  return SandboxImage.fromDocker("test-image:v1")
    .registerTool(
      { name: "tool-a", description: "Test tool A" },
      { installCmd: "apt-get install -y tool-a" }
    )
    .registerTool(
      { name: "tool-b", description: "Test tool B" },
      { installCmd: "pip install tool-b" }
    )
    .withResources({ vcpu: 2, memoryMb: 1024 })
    .setWorkdir("/workspace");
}

vi.mock("@app/lib/api/config", () => ({
  default: {
    getE2BSandboxConfig: () => ({
      apiKey: "default-api-key",
      domain: "e2b.dev",
    }),
  },
}));

const mockDockerRegistryBuilder = {
  copy: vi.fn().mockReturnThis(),
  copyItems: vi.fn().mockReturnThis(),
  remove: vi.fn().mockReturnThis(),
  rename: vi.fn().mockReturnThis(),
  makeDir: vi.fn().mockReturnThis(),
  makeSymlink: vi.fn().mockReturnThis(),
  runCmd: vi.fn().mockReturnThis(),
  setWorkdir: vi.fn().mockReturnThis(),
  setUser: vi.fn().mockReturnThis(),
  pipInstall: vi.fn().mockReturnThis(),
  npmInstall: vi.fn().mockReturnThis(),
  bunInstall: vi.fn().mockReturnThis(),
  aptInstall: vi.fn().mockReturnThis(),
  addMcpServer: vi.fn().mockReturnThis(),
  gitClone: vi.fn().mockReturnThis(),
  setEnvs: vi.fn().mockReturnThis(),
  skipCache: vi.fn().mockReturnThis(),
  setStartCmd: vi.fn().mockReturnThis(),
  setReadyCmd: vi.fn().mockReturnThis(),
  betaDevContainerPrebuild: vi.fn().mockReturnThis(),
  betaSetDevContainerStart: vi.fn().mockReturnThis(),
};

const mockE2BTemplateFactory = {
  fromTemplate: vi.fn().mockReturnValue(mockDockerRegistryBuilder),
};

function createMockDockerRegistryFactory(): DockerRegistryFactory {
  return (_imageRef: string): TemplateBuilder => {
    return mockDockerRegistryBuilder;
  };
}

const mockDockerRegistryFactory = vi.fn(createMockDockerRegistryFactory());

const mockBuild = vi.fn();

vi.mock("e2b", () => ({
  Template: Object.assign(() => mockE2BTemplateFactory, {
    build: (...args: unknown[]) => mockBuild(...args),
  }),
  defaultBuildLogger: vi.fn(() => vi.fn()),
}));

describe("formatSandboxImageId()", () => {
  test("replaces dots with hyphens in tag", () => {
    const id: SandboxImageId = { imageName: "dust-base", tag: "v0.1.1" };
    expect(formatSandboxImageId(id)).toBe("dust-base_v0-1-1");
  });

  test("replaces underscores with hyphens in tag", () => {
    const id: SandboxImageId = { imageName: "dust-base", tag: "my_tag" };
    expect(formatSandboxImageId(id)).toBe("dust-base_my-tag");
  });

  test("lowercases uppercase characters", () => {
    const id: SandboxImageId = { imageName: "dust-base", tag: "Staging" };
    expect(formatSandboxImageId(id)).toBe("dust-base_staging");
  });

  test("sanitizes both imageName and tag", () => {
    const id: SandboxImageId = { imageName: "dust-base", tag: "v0.1.1" };
    expect(formatSandboxImageId(id)).toBe("dust-base_v0-1-1");
  });

  test("handles alphanumeric and hyphens without modification", () => {
    const id: SandboxImageId = { imageName: "dust-base", tag: "edge" };
    expect(formatSandboxImageId(id)).toBe("dust-base_edge");
  });
});

describe("buildSandboxImage()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("calls E2B Template builder methods in operation order", async () => {
    mockBuild.mockResolvedValueOnce({ templateId: "built-template-id" });
    const testImage = createTestImage();
    const imageId: SandboxImageId = { imageName: "dust-base", tag: "edge" };

    const result = await buildSandboxImage(testImage, imageId, {
      apiKey: "test-api-key",
      dockerRegistryFactory: mockDockerRegistryFactory,
    });

    expect(result.isOk()).toBe(true);
    if (testImage.baseImage.type === "docker") {
      expect(mockDockerRegistryFactory).toHaveBeenCalledWith(
        testImage.baseImage.imageRef
      );
    }
    expect(mockDockerRegistryBuilder.runCmd).toHaveBeenCalled();
    expect(mockDockerRegistryBuilder.setWorkdir).toHaveBeenCalledWith(
      "/workspace"
    );
  });

  test("returns templateId from E2B build result", async () => {
    mockBuild.mockResolvedValueOnce({ templateId: "my-template-123" });
    const testImage = createTestImage();
    const imageId: SandboxImageId = { imageName: "dust-base", tag: "staging" };

    const result = await buildSandboxImage(testImage, imageId, {
      apiKey: "test-api-key",
      dockerRegistryFactory: mockDockerRegistryFactory,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("my-template-123");
    }
  });

  test("passes sanitized name_tag format to E2B build", async () => {
    mockBuild.mockResolvedValueOnce({ templateId: "built-template-id" });
    const testImage = createTestImage();
    const imageId: SandboxImageId = { imageName: "dust-base", tag: "v0.1.1" };

    await buildSandboxImage(testImage, imageId, {
      apiKey: "test-api-key",
      domain: "custom.e2b.dev",
      dockerRegistryFactory: mockDockerRegistryFactory,
    });

    expect(mockBuild).toHaveBeenCalledWith(
      mockDockerRegistryBuilder,
      "dust-base_v0-1-1",
      expect.objectContaining({
        apiKey: "test-api-key",
        domain: "custom.e2b.dev",
        cpuCount: testImage.resources.vcpu,
        memoryMB: testImage.resources.memoryMb,
      })
    );
  });

  test("returns Err when E2B build fails", async () => {
    mockBuild.mockRejectedValueOnce(new Error("Build failed"));
    const testImage = createTestImage();
    const imageId: SandboxImageId = { imageName: "dust-base", tag: "edge" };

    const result = await buildSandboxImage(testImage, imageId, {
      apiKey: "test-api-key",
      dockerRegistryFactory: mockDockerRegistryFactory,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Build failed");
    }
  });

  test("processes operations in correct order", async () => {
    mockBuild.mockResolvedValueOnce({ templateId: "built-template-id" });
    const testImage = createTestImage();
    const imageId: SandboxImageId = { imageName: "dust-base", tag: "edge" };

    const callOrder: string[] = [];
    const trackingDockerRegistryFactory: DockerRegistryFactory = (
      _imageRef: string
    ): TemplateBuilder => {
      callOrder.push("fromDockerRegistry");
      return mockDockerRegistryBuilder;
    };
    mockDockerRegistryBuilder.setEnvs.mockImplementation(() => {
      callOrder.push("setEnvs");
      return mockDockerRegistryBuilder;
    });
    mockDockerRegistryBuilder.runCmd.mockImplementation((cmd: string) => {
      if (cmd.includes("apt-get install")) {
        callOrder.push("runCmd:apt");
      } else if (cmd.includes("pip install")) {
        callOrder.push("runCmd:pip");
      } else {
        callOrder.push("runCmd");
      }
      return mockDockerRegistryBuilder;
    });
    mockDockerRegistryBuilder.setWorkdir.mockImplementation(() => {
      callOrder.push("setWorkdir");
      return mockDockerRegistryBuilder;
    });

    await buildSandboxImage(testImage, imageId, {
      apiKey: "test-api-key",
      dockerRegistryFactory: trackingDockerRegistryFactory,
    });

    expect(callOrder[0]).toBe("fromDockerRegistry");
    expect(callOrder).toContain("runCmd:apt");
    expect(callOrder).toContain("runCmd:pip");
    expect(callOrder[callOrder.length - 1]).toBe("setWorkdir");
  });
});
