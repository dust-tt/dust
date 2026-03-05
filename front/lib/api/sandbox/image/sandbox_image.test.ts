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
  test("accepts string path", () => {
    const image = SandboxImage.fromUbuntu().copy("./src", "/app/src");

    expect(image.operations).toHaveLength(1);
    expect(image.operations[0].type).toBe("copy");
    if (image.operations[0].type === "copy") {
      expect(image.operations[0].src.type).toBe("path");
      if (image.operations[0].src.type === "path") {
        expect(image.operations[0].src.path).toBe("./src");
      }
      expect(image.operations[0].dest).toBe("/app/src");
    }
  });

  test("accepts content generator callback", () => {
    const image = SandboxImage.fromUbuntu().copy(
      () => "hello world",
      "/app/file.txt"
    );

    expect(image.operations).toHaveLength(1);
    expect(image.operations[0].type).toBe("copy");
    if (image.operations[0].type === "copy") {
      expect(image.operations[0].src.type).toBe("content");
      if (image.operations[0].src.type === "content") {
        expect(image.operations[0].src.getContent()).toBe("hello world");
      }
      expect(image.operations[0].dest).toBe("/app/file.txt");
    }
  });

  test("accepts content generator returning Buffer", () => {
    const image = SandboxImage.fromUbuntu().copy(
      () => Buffer.from("binary data"),
      "/app/data.bin"
    );

    expect(image.operations).toHaveLength(1);
    if (image.operations[0].type === "copy") {
      expect(image.operations[0].src.type).toBe("content");
      if (image.operations[0].src.type === "content") {
        const content = image.operations[0].src.getContent();
        expect(Buffer.isBuffer(content)).toBe(true);
      }
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

describe("SandboxImage.withToolManifest()", () => {
  test("adds copy operation with content generator", () => {
    const image = SandboxImage.fromUbuntu().withToolManifest();

    expect(image.operations).toHaveLength(1);
    expect(image.operations[0].type).toBe("copy");
    if (image.operations[0].type === "copy") {
      expect(image.operations[0].src.type).toBe("content");
      expect(image.operations[0].dest).toBe("/home/user/tool-manifest.yaml");
      if (image.operations[0].src.type === "content") {
        const content = image.operations[0].src.getContent();
        expect(typeof content).toBe("string");
        expect(content).toContain("version:");
      }
    }
  });

  test("accepts custom path and format", () => {
    const image = SandboxImage.fromUbuntu().withToolManifest({
      path: "/custom/path/manifest.json",
      format: "json",
    });

    expect(image.operations).toHaveLength(1);
    if (image.operations[0].type === "copy") {
      expect(image.operations[0].dest).toBe("/custom/path/manifest.json");
      if (image.operations[0].src.type === "content") {
        const content = image.operations[0].src.getContent();
        expect(content).toContain('"version"');
      }
    }
  });

  test("uses correct default extension based on format", () => {
    const jsonImage = SandboxImage.fromUbuntu().withToolManifest({
      format: "json",
    });

    if (jsonImage.operations[0].type === "copy") {
      expect(jsonImage.operations[0].dest).toBe(
        "/home/user/tool-manifest.json"
      );
    }
  });

  test("returns new instance (immutability)", () => {
    const original = SandboxImage.fromUbuntu();
    const modified = original.withToolManifest();

    expect(modified).not.toBe(original);
    expect(original.operations).toHaveLength(0);
    expect(modified.operations).toHaveLength(1);
  });

  test("chains with other operations", () => {
    const image = SandboxImage.fromUbuntu()
      .registerTool({ name: "curl", description: "HTTP client" })
      .runCmd("echo hello")
      .withToolManifest()
      .runCmd("echo done");

    expect(image.operations).toHaveLength(3);
    expect(image.operations[0].type).toBe("run");
    expect(image.operations[1].type).toBe("copy");
    expect(image.operations[2].type).toBe("run");
  });

  test("includes registered tools in manifest content", () => {
    const image = SandboxImage.fromUbuntu()
      .registerTool({ name: "curl", description: "HTTP client" })
      .registerTool({ name: "jq", description: "JSON processor" })
      .withToolManifest();

    if (
      image.operations[0].type === "copy" &&
      image.operations[0].src.type === "content"
    ) {
      const content = image.operations[0].src.getContent();
      expect(content).toContain("curl");
      expect(content).toContain("HTTP client");
      expect(content).toContain("jq");
      expect(content).toContain("JSON processor");
    }
  });

  test("lazily generates content (captures tools at call time)", () => {
    const baseImage = SandboxImage.fromUbuntu().registerTool({
      name: "curl",
      description: "HTTP client",
    });

    const imageWithManifest = baseImage.withToolManifest();

    if (
      imageWithManifest.operations[0].type === "copy" &&
      imageWithManifest.operations[0].src.type === "content"
    ) {
      const content = imageWithManifest.operations[0].src.getContent();
      expect(content).toContain("curl");
    }
  });
});
