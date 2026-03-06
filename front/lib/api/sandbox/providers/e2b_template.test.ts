import type { SandboxImageId } from "@app/lib/api/sandbox/image";
import { DUST_BASE_IMAGE } from "@app/lib/api/sandbox/image/dust-base";
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

vi.mock("@app/lib/api/config", () => ({
  default: {
    getE2BSandboxConfig: () => ({
      apiKey: "default-api-key",
      domain: "e2b.dev",
    }),
  },
}));

// Untyped mock for TemplateBuilder - keeps vi.fn() mock properties accessible
const mockTemplateBuilder = {
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

// Mock for Template() factory (has fromUbuntuImage, fromTemplate, etc.)
const mockE2BTemplateFactory = {
  fromUbuntuImage: vi.fn().mockReturnValue(mockTemplateBuilder),
  fromTemplate: vi.fn().mockReturnValue(mockTemplateBuilder),
  fromGCPRegistry: vi.fn().mockReturnValue(mockTemplateBuilder),
};

// Type-safe factory wrapper - the runtime mock satisfies TemplateBuilder interface
function createMockDockerRegistryFactory(): DockerRegistryFactory {
  return (_imageRef: string): TemplateBuilder => {
    // The mock has all required methods; return type annotation satisfies TypeScript
    return mockTemplateBuilder;
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

    const result = await buildSandboxImage(DUST_BASE_IMAGE, TEST_IMAGE_ID, {
      apiKey: "test-api-key",
      dockerRegistryFactory: mockDockerRegistryFactory,
    });

    expect(result.isOk()).toBe(true);
    expect(mockDockerRegistryFactory).toHaveBeenCalled();
    expect(mockTemplateBuilder.runCmd).toHaveBeenCalled();
    expect(mockTemplateBuilder.setEnvs).toHaveBeenCalled();
    expect(mockTemplateBuilder.setWorkdir).toHaveBeenCalledWith("/home/user");
  });

  test("returns templateId from E2B build result", async () => {
    mockBuild.mockResolvedValueOnce({ templateId: "my-template-123" });

    const result = await buildSandboxImage(DUST_BASE_IMAGE, STAGING_IMAGE_ID, {
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

    await buildSandboxImage(DUST_BASE_IMAGE, PRODUCTION_IMAGE_ID, {
      apiKey: "test-api-key",
      domain: "custom.e2b.dev",
      dockerRegistryFactory: mockDockerRegistryFactory,
    });

    expect(mockBuild).toHaveBeenCalledWith(
      mockTemplateBuilder,
      "dust-base_production",
      expect.objectContaining({
        apiKey: "test-api-key",
        domain: "custom.e2b.dev",
        cpuCount: DUST_BASE_IMAGE.resources.vcpu,
        memoryMB: DUST_BASE_IMAGE.resources.memoryMb,
      })
    );
  });

  test("returns Err when E2B build fails", async () => {
    mockBuild.mockRejectedValueOnce(new Error("Build failed"));

    const result = await buildSandboxImage(DUST_BASE_IMAGE, TEST_IMAGE_ID, {
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

    await buildSandboxImage(DUST_BASE_IMAGE, TEST_IMAGE_ID, {
      apiKey: "test-api-key",
      dockerRegistryFactory: mockDockerRegistryFactory,
    });

    const runCmdCalls = mockTemplateBuilder.runCmd.mock.calls;
    const hasNpmInstall = runCmdCalls.some((call: string[]) =>
      call[0].includes("npm install -g")
    );
    expect(hasNpmInstall).toBe(true);
  });

  test("processes operations in correct order", async () => {
    mockBuild.mockResolvedValueOnce({ templateId: "built-template-id" });

    const callOrder: string[] = [];
    const trackingDockerRegistryFactory: DockerRegistryFactory = (
      _imageRef: string
    ): TemplateBuilder => {
      callOrder.push("fromDockerRegistry");
      return mockTemplateBuilder;
    };
    mockTemplateBuilder.setEnvs.mockImplementation(() => {
      callOrder.push("setEnvs");
      return mockTemplateBuilder;
    });
    mockTemplateBuilder.runCmd.mockImplementation((cmd: string) => {
      if (cmd.includes("uv pip install")) {
        callOrder.push("runCmd:pip");
      } else if (cmd.includes("npm install")) {
        callOrder.push("runCmd:npm");
      } else if (cmd.includes("apt-get install")) {
        callOrder.push("runCmd:apt");
      } else {
        callOrder.push("runCmd");
      }
      return mockTemplateBuilder;
    });
    mockTemplateBuilder.setWorkdir.mockImplementation(() => {
      callOrder.push("setWorkdir");
      return mockTemplateBuilder;
    });

    await buildSandboxImage(DUST_BASE_IMAGE, TEST_IMAGE_ID, {
      apiKey: "test-api-key",
      dockerRegistryFactory: trackingDockerRegistryFactory,
    });

    expect(callOrder[0]).toBe("fromDockerRegistry");
    expect(callOrder).toContain("setEnvs");
    expect(callOrder).toContain("runCmd:pip");
    expect(callOrder).toContain("runCmd:npm");
    expect(callOrder[callOrder.length - 1]).toBe("setWorkdir");
  });

  test("passes correct apt packages via runCmd", async () => {
    mockBuild.mockResolvedValueOnce({ templateId: "built-template-id" });

    await buildSandboxImage(DUST_BASE_IMAGE, TEST_IMAGE_ID, {
      apiKey: "test-api-key",
      dockerRegistryFactory: mockDockerRegistryFactory,
    });

    const runCmdCalls = mockTemplateBuilder.runCmd.mock.calls;
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

    await buildSandboxImage(DUST_BASE_IMAGE, TEST_IMAGE_ID, {
      apiKey: "test-api-key",
      dockerRegistryFactory: mockDockerRegistryFactory,
    });

    const runCmdCalls = mockTemplateBuilder.runCmd.mock.calls;
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
