import type { SandboxImage } from "@app/lib/api/sandbox/image";
import {
  getSandboxImageFromRegistry,
  type SandboxImageId,
} from "@app/lib/api/sandbox/image";
import type { TemplateBuilder } from "e2b";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { DockerRegistryFactory } from "./e2b_template";
import { buildSandboxImage } from "./e2b_template";

const TEST_IMAGE_ID: SandboxImageId = { imageName: "dust-base", tag: "edge" };
const STAGING_IMAGE_ID: SandboxImageId = {
  imageName: "dust-base",
  tag: "staging",
};
const PRODUCTION_IMAGE_ID: SandboxImageId = {
  imageName: "dust-base",
  tag: "production",
};

function getTestImage(): SandboxImage {
  const result = getSandboxImageFromRegistry({
    imageName: "dust-base",
    tag: "v0.1.1",
  });
  if (result.isErr()) {
    throw new Error("Test setup failed: dust-base image not in registry");
  }
  return result.value;
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

describe("buildSandboxImage()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("calls E2B Template builder methods in operation order", async () => {
    mockBuild.mockResolvedValueOnce({ templateId: "built-template-id" });
    const testImage = getTestImage();

    const result = await buildSandboxImage(testImage, TEST_IMAGE_ID, {
      apiKey: "test-api-key",
      dockerRegistryFactory: mockDockerRegistryFactory,
    });

    expect(result.isOk()).toBe(true);
    expect(mockDockerRegistryFactory).toHaveBeenCalledWith(
      "dust-sbx-bedrock:v0.1.1"
    );
    expect(mockDockerRegistryBuilder.runCmd).toHaveBeenCalled();
    expect(mockDockerRegistryBuilder.setWorkdir).toHaveBeenCalledWith(
      "/home/user"
    );
  });

  test("returns templateId from E2B build result", async () => {
    mockBuild.mockResolvedValueOnce({ templateId: "my-template-123" });
    const testImage = getTestImage();

    const result = await buildSandboxImage(testImage, STAGING_IMAGE_ID, {
      apiKey: "test-api-key",
      dockerRegistryFactory: mockDockerRegistryFactory,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("my-template-123");
    }
  });

  test("passes name_tag format to E2B build", async () => {
    mockBuild.mockResolvedValueOnce({ templateId: "built-template-id" });
    const testImage = getTestImage();

    await buildSandboxImage(testImage, PRODUCTION_IMAGE_ID, {
      apiKey: "test-api-key",
      domain: "custom.e2b.dev",
      dockerRegistryFactory: mockDockerRegistryFactory,
    });

    expect(mockBuild).toHaveBeenCalledWith(
      mockDockerRegistryBuilder,
      "dust-base_production",
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
    const testImage = getTestImage();

    const result = await buildSandboxImage(testImage, TEST_IMAGE_ID, {
      apiKey: "test-api-key",
      dockerRegistryFactory: mockDockerRegistryFactory,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Build failed");
    }
  });

  test("installs npm packages via runCmd", async () => {
    mockBuild.mockResolvedValueOnce({ templateId: "built-template-id" });
    const testImage = getTestImage();

    await buildSandboxImage(testImage, TEST_IMAGE_ID, {
      apiKey: "test-api-key",
      dockerRegistryFactory: mockDockerRegistryFactory,
    });

    const runCmdCalls = mockDockerRegistryBuilder.runCmd.mock.calls;
    const hasNpmInstall = runCmdCalls.some((call: string[]) =>
      call[0].includes("npm install -g")
    );
    expect(hasNpmInstall).toBe(true);
  });

  test("processes operations in correct order", async () => {
    mockBuild.mockResolvedValueOnce({ templateId: "built-template-id" });
    const testImage = getTestImage();

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
      if (cmd.includes("uv pip install")) {
        callOrder.push("runCmd:pip");
      } else if (cmd.includes("npm install")) {
        callOrder.push("runCmd:npm");
      } else if (cmd.includes("apt-get install")) {
        callOrder.push("runCmd:apt");
      } else {
        callOrder.push("runCmd");
      }
      return mockDockerRegistryBuilder;
    });
    mockDockerRegistryBuilder.setWorkdir.mockImplementation(() => {
      callOrder.push("setWorkdir");
      return mockDockerRegistryBuilder;
    });

    await buildSandboxImage(testImage, TEST_IMAGE_ID, {
      apiKey: "test-api-key",
      dockerRegistryFactory: trackingDockerRegistryFactory,
    });

    expect(callOrder[0]).toBe("fromDockerRegistry");
    expect(callOrder).toContain("runCmd:pip");
    expect(callOrder).toContain("runCmd:npm");
    expect(callOrder[callOrder.length - 1]).toBe("setWorkdir");
  });

  test("passes correct apt packages via runCmd", async () => {
    mockBuild.mockResolvedValueOnce({ templateId: "built-template-id" });
    const testImage = getTestImage();

    await buildSandboxImage(testImage, TEST_IMAGE_ID, {
      apiKey: "test-api-key",
      dockerRegistryFactory: mockDockerRegistryFactory,
    });

    const runCmdCalls = mockDockerRegistryBuilder.runCmd.mock.calls;
    const aptInstallCall = runCmdCalls.find(
      (call: string[]) =>
        call[0].includes("apt-get install") &&
        call[0].includes("jq") &&
        call[0].includes("pandoc")
    );
    expect(aptInstallCall).toBeDefined();
  });

  test("passes correct pip packages via runCmd", async () => {
    mockBuild.mockResolvedValueOnce({ templateId: "built-template-id" });
    const testImage = getTestImage();

    await buildSandboxImage(testImage, TEST_IMAGE_ID, {
      apiKey: "test-api-key",
      dockerRegistryFactory: mockDockerRegistryFactory,
    });

    const runCmdCalls = mockDockerRegistryBuilder.runCmd.mock.calls;
    const pipInstallCall = runCmdCalls.find(
      (call: string[]) =>
        call[0].includes("uv pip install") &&
        call[0].includes("pandas") &&
        call[0].includes("numpy") &&
        call[0].includes("matplotlib")
    );
    expect(pipInstallCall).toBeDefined();
  });
});
