import { describe, expect, test } from "vitest";
import { SandboxImage } from "./sandbox_image";
import type { SandboxImageId } from "./types";

describe("SandboxImage.fromUbuntu()", () => {
  test("creates image with ubuntu base", () => {
    const image = SandboxImage.fromUbuntu("22.04");

    expect(image.baseImage.type).toBe("ubuntu");
    if (image.baseImage.type === "ubuntu") {
      expect(image.baseImage.version).toBe("22.04");
    }
  });

  test("uses default version when not provided", () => {
    const image = SandboxImage.fromUbuntu();

    if (image.baseImage.type === "ubuntu") {
      expect(image.baseImage.version).toBe("22.04");
    }
  });

  test("starts with empty operations and tools", () => {
    const image = SandboxImage.fromUbuntu();

    expect(image.operations).toHaveLength(0);
    expect(image.tools).toHaveLength(0);
  });

  test("has default resources", () => {
    const image = SandboxImage.fromUbuntu();

    expect(image.resources.vcpu).toBe(1);
    expect(image.resources.memoryMb).toBe(512);
  });

  test("has default network policy", () => {
    const image = SandboxImage.fromUbuntu();

    expect(image.network.mode).toBe("deny_all");
  });

  test("has default workdir", () => {
    const image = SandboxImage.fromUbuntu();

    expect(image.workdir).toBe("/home/user");
  });
});

describe("SandboxImage.fromTemplate()", () => {
  test("creates image with template reference", () => {
    const id: SandboxImageId = { imageName: "dust-base", tag: "staging" };
    const image = SandboxImage.fromTemplate(id);

    expect(image.baseImage.type).toBe("template");
    if (image.baseImage.type === "template") {
      expect(image.baseImage.id).toEqual(id);
    }
  });
});

describe("SandboxImage.runCmd()", () => {
  test("adds run operation", () => {
    const image = SandboxImage.fromUbuntu().runCmd("echo hello");

    expect(image.operations).toHaveLength(1);
    expect(image.operations[0].type).toBe("run");
    if (image.operations[0].type === "run") {
      expect(image.operations[0].command).toBe("echo hello");
    }
    expect(image.tools).toHaveLength(0);
  });

  test("returns new image instance", () => {
    const original = SandboxImage.fromUbuntu();
    const modified = original.runCmd("echo hello");

    expect(modified).not.toBe(original);
    expect(original.operations).toHaveLength(0);
    expect(modified.operations).toHaveLength(1);
  });
});

describe("SandboxImage.registerTool()", () => {
  test("registers single tool without installCmd", () => {
    const image = SandboxImage.fromUbuntu().registerTool({
      name: "dsbx",
      description: "Dust CLI",
    });

    expect(image.operations).toHaveLength(0);
    expect(image.tools).toHaveLength(1);
    expect(image.tools[0].name).toBe("dsbx");
    expect(image.tools[0].description).toBe("Dust CLI");
  });

  test("registers single tool with installCmd", () => {
    const image = SandboxImage.fromUbuntu().registerTool(
      { name: "curl", description: "HTTP client" },
      { installCmd: "apt-get install -y curl" }
    );

    expect(image.operations).toHaveLength(1);
    expect(image.operations[0].type).toBe("run");
    if (image.operations[0].type === "run") {
      expect(image.operations[0].command).toBe("apt-get install -y curl");
    }
    expect(image.tools).toHaveLength(1);
    expect(image.tools[0].name).toBe("curl");
  });

  test("registers multiple tools with single installCmd", () => {
    const image = SandboxImage.fromUbuntu().registerTool(
      [
        { name: "pandas", description: "Data analysis" },
        { name: "numpy", description: "Numerical computing" },
        { name: "matplotlib", description: "Plotting library" },
      ],
      { installCmd: "pip install pandas numpy matplotlib" }
    );

    expect(image.operations).toHaveLength(1);
    expect(image.operations[0].type).toBe("run");
    if (image.operations[0].type === "run") {
      expect(image.operations[0].command).toBe(
        "pip install pandas numpy matplotlib"
      );
    }
    expect(image.tools).toHaveLength(3);
    expect(image.tools.map((t) => t.name)).toEqual([
      "pandas",
      "numpy",
      "matplotlib",
    ]);
  });

  test("returns new image instance", () => {
    const original = SandboxImage.fromUbuntu();
    const modified = original.registerTool({
      name: "curl",
      description: "HTTP client",
    });

    expect(modified).not.toBe(original);
    expect(original.tools).toHaveLength(0);
    expect(modified.tools).toHaveLength(1);
  });
});

describe("SandboxImage.copy()", () => {
  test("adds copy operation", () => {
    const image = SandboxImage.fromUbuntu().copy("./src", "/app/src");

    expect(image.operations).toHaveLength(1);
    expect(image.operations[0].type).toBe("copy");
    if (image.operations[0].type === "copy") {
      expect(image.operations[0].src).toBe("./src");
      expect(image.operations[0].dest).toBe("/app/src");
    }
  });
});

describe("SandboxImage.setWorkdir()", () => {
  test("adds workdir operation and updates workdir property", () => {
    const image = SandboxImage.fromUbuntu().setWorkdir("/app");

    expect(image.workdir).toBe("/app");
    expect(image.operations).toHaveLength(1);
    expect(image.operations[0].type).toBe("workdir");
    if (image.operations[0].type === "workdir") {
      expect(image.operations[0].path).toBe("/app");
    }
  });
});

describe("SandboxImage.withResources()", () => {
  test("updates resources", () => {
    const image = SandboxImage.fromUbuntu().withResources({
      vcpu: 4,
      memoryMb: 8192,
    });

    expect(image.resources.vcpu).toBe(4);
    expect(image.resources.memoryMb).toBe(8192);
  });

  test("returns new image instance", () => {
    const original = SandboxImage.fromUbuntu();
    const modified = original.withResources({ vcpu: 4, memoryMb: 8192 });

    expect(modified).not.toBe(original);
    expect(original.resources.vcpu).toBe(1);
  });
});

describe("SandboxImage.withNetwork()", () => {
  test("updates network policy", () => {
    const image = SandboxImage.fromUbuntu().withNetwork({
      mode: "deny_all",
      allowlist: ["example.com", "api.example.com"],
    });

    expect(image.network.mode).toBe("deny_all");
    expect(image.network.allowlist).toContain("example.com");
  });
});

describe("SandboxImage immutability", () => {
  test("chained operations preserve original instances", () => {
    const original = SandboxImage.fromUbuntu();
    const afterInstall = original.registerTool(
      { name: "curl", description: "HTTP client" },
      { installCmd: "apt-get install -y curl" }
    );
    const afterRun = afterInstall.runCmd("echo hello");
    const afterCopy = afterRun.copy("./src", "/app");

    expect(original.operations).toHaveLength(0);
    expect(original.tools).toHaveLength(0);

    expect(afterInstall.operations).toHaveLength(1);
    expect(afterInstall.tools).toHaveLength(1);

    expect(afterRun.operations).toHaveLength(2);
    expect(afterRun.tools).toHaveLength(1);

    expect(afterCopy.operations).toHaveLength(3);
  });
});

describe("SandboxImage.toManifest()", () => {
  test("generates manifest with version 1.0", () => {
    const image = SandboxImage.fromUbuntu();
    const manifest = image.toManifest();

    expect(manifest.version).toBe("1.0");
  });

  test("includes generatedAt timestamp", () => {
    const image = SandboxImage.fromUbuntu();
    const manifest = image.toManifest();

    expect(manifest.generatedAt).toBeDefined();
    expect(() => new Date(manifest.generatedAt)).not.toThrow();
  });

  test("includes all tools", () => {
    const image = SandboxImage.fromUbuntu()
      .registerTool(
        { name: "curl", description: "HTTP client" },
        { installCmd: "apt-get install -y curl" }
      )
      .registerTool(
        { name: "pandas", description: "Data analysis" },
        { installCmd: "pip install pandas" }
      )
      .registerTool(
        { name: "custom", description: "Custom tool" },
        { installCmd: "./setup-custom.sh" }
      );

    const manifest = image.toManifest();

    expect(manifest.tools).toHaveLength(3);
    expect(manifest.tools.map((t) => t.name)).toEqual([
      "curl",
      "pandas",
      "custom",
    ]);
  });
});
