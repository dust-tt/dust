import {
  DUST_BASE_IMAGE,
  type SandboxImageId,
} from "@app/lib/api/sandbox/image";
import { beforeEach, describe, expect, test, vi } from "vitest";

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

const mockE2BTemplateBuilder = {
  fromUbuntuImage: vi.fn().mockReturnThis(),
  fromTemplate: vi.fn().mockReturnThis(),
  runCmd: vi.fn().mockReturnThis(),
  copy: vi.fn().mockReturnThis(),
  setWorkdir: vi.fn().mockReturnThis(),
  setEnvs: vi.fn().mockReturnThis(),
};

const mockBuild = vi.fn();

vi.mock("e2b", () => ({
  Template: Object.assign(() => mockE2BTemplateBuilder, {
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
    });

    expect(result.isOk()).toBe(true);
    expect(mockE2BTemplateBuilder.fromUbuntuImage).toHaveBeenCalled();
    expect(mockE2BTemplateBuilder.runCmd).toHaveBeenCalled();
    expect(mockE2BTemplateBuilder.setEnvs).toHaveBeenCalled();
    expect(mockE2BTemplateBuilder.setWorkdir).toHaveBeenCalledWith(
      "/home/user"
    );
  });

  test("returns templateId from E2B build result", async () => {
    mockBuild.mockResolvedValueOnce({ templateId: "my-template-123" });

    const result = await buildSandboxImage(DUST_BASE_IMAGE, STAGING_IMAGE_ID, {
      apiKey: "test-api-key",
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
    });

    expect(mockBuild).toHaveBeenCalledWith(
      mockE2BTemplateBuilder,
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
    });

    const runCmdCalls = mockE2BTemplateBuilder.runCmd.mock.calls;
    const hasNpmInstall = runCmdCalls.some((call: string[]) =>
      call[0].includes("npm install -g")
    );
    expect(hasNpmInstall).toBe(true);
  });

  test("processes operations in correct order", async () => {
    mockBuild.mockResolvedValueOnce({ templateId: "built-template-id" });

    const callOrder: string[] = [];
    mockE2BTemplateBuilder.fromUbuntuImage.mockImplementation(() => {
      callOrder.push("fromUbuntuImage");
      return mockE2BTemplateBuilder;
    });
    mockE2BTemplateBuilder.setEnvs.mockImplementation(() => {
      callOrder.push("setEnvs");
      return mockE2BTemplateBuilder;
    });
    mockE2BTemplateBuilder.runCmd.mockImplementation((cmd: string) => {
      if (cmd.includes("uv pip install")) {
        callOrder.push("runCmd:pip");
      } else if (cmd.includes("npm install")) {
        callOrder.push("runCmd:npm");
      } else if (cmd.includes("apt-get install")) {
        callOrder.push("runCmd:apt");
      } else {
        callOrder.push("runCmd");
      }
      return mockE2BTemplateBuilder;
    });
    mockE2BTemplateBuilder.setWorkdir.mockImplementation(() => {
      callOrder.push("setWorkdir");
      return mockE2BTemplateBuilder;
    });

    await buildSandboxImage(DUST_BASE_IMAGE, TEST_IMAGE_ID, {
      apiKey: "test-api-key",
    });

    expect(callOrder[0]).toBe("fromUbuntuImage");
    expect(callOrder).toContain("setEnvs");
    expect(callOrder).toContain("runCmd:pip");
    expect(callOrder).toContain("runCmd:npm");
    expect(callOrder[callOrder.length - 1]).toBe("setWorkdir");
  });

  test("passes correct apt packages via runCmd", async () => {
    mockBuild.mockResolvedValueOnce({ templateId: "built-template-id" });

    await buildSandboxImage(DUST_BASE_IMAGE, TEST_IMAGE_ID, {
      apiKey: "test-api-key",
    });

    const runCmdCalls = mockE2BTemplateBuilder.runCmd.mock.calls;
    const aptInstallCall = runCmdCalls.find(
      (call: string[]) =>
        call[0].includes("apt-get install") &&
        call[0].includes("git") &&
        call[0].includes("jq") &&
        call[0].includes("pandoc")
    );
    expect(aptInstallCall).toBeDefined();
  });

  test("passes correct pip packages via runCmd", async () => {
    mockBuild.mockResolvedValueOnce({ templateId: "built-template-id" });

    await buildSandboxImage(DUST_BASE_IMAGE, TEST_IMAGE_ID, {
      apiKey: "test-api-key",
    });

    const runCmdCalls = mockE2BTemplateBuilder.runCmd.mock.calls;
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
