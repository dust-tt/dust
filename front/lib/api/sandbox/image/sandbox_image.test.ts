import { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import { describe, expect, test } from "vitest";

describe("SandboxImage.fromSandboxImage()", () => {
  test("clones image preserving baseImage", () => {
    const original = SandboxImage.fromDocker("ubuntu:22.04");
    const cloned = SandboxImage.fromSandboxImage(original);

    expect(cloned.baseImage).toEqual(original.baseImage);
  });

  test("clones image preserving operations", () => {
    const original = SandboxImage.fromDocker("ubuntu:22.04")
      .runCmd("echo hello")
      .runCmd("echo world");
    const cloned = SandboxImage.fromSandboxImage(original);

    expect(cloned.operations).toHaveLength(2);
    expect(cloned.operations).toEqual(original.operations);
  });

  test("clones image preserving tools", () => {
    const original = SandboxImage.fromDocker("ubuntu:22.04").registerTool({
      name: "curl",
      description: "HTTP client",
      runtime: "system",
    });
    const cloned = SandboxImage.fromSandboxImage(original);

    expect(cloned.tools).toHaveLength(1);
    expect(cloned.tools).toEqual(original.tools);
  });

  test("clones image preserving resources", () => {
    const original = SandboxImage.fromDocker("ubuntu:22.04").withResources({
      vcpu: 4,
      memoryMb: 8192,
    });
    const cloned = SandboxImage.fromSandboxImage(original);

    expect(cloned.resources).toEqual({ vcpu: 4, memoryMb: 8192 });
  });

  test("clones image preserving network policy", () => {
    const original = SandboxImage.fromDocker("ubuntu:22.04").withNetwork({
      mode: "deny_all",
      allowlist: ["example.com"],
    });
    const cloned = SandboxImage.fromSandboxImage(original);

    expect(cloned.network).toEqual({
      mode: "deny_all",
      allowlist: ["example.com"],
    });
  });

  test("clones image preserving workdir", () => {
    const original = SandboxImage.fromDocker("ubuntu:22.04").setWorkdir("/app");
    const cloned = SandboxImage.fromSandboxImage(original);

    expect(cloned.workdir).toBe("/app");
  });

  test("clones image preserving runEnv", () => {
    const original = SandboxImage.fromDocker("ubuntu:22.04").setRunEnv({
      FOO: "bar",
    });
    const cloned = SandboxImage.fromSandboxImage(original);

    expect(cloned.runEnv).toEqual({ FOO: "bar" });
  });

  test("clones image preserving capabilities", () => {
    const original =
      SandboxImage.fromDocker("ubuntu:22.04").withCapability("gcsfuse");
    const cloned = SandboxImage.fromSandboxImage(original);

    expect(cloned.hasCapability("gcsfuse")).toBe(true);
  });

  test("clones image preserving imageId", () => {
    const original = SandboxImage.fromDocker("ubuntu:22.04").register({
      imageName: "dust-base",
      tag: "production",
    });
    const cloned = SandboxImage.fromSandboxImage(original);

    expect(cloned.imageId).toEqual({
      imageName: "dust-base",
      tag: "production",
    });
  });

  test("returns new instance (not same reference)", () => {
    const original = SandboxImage.fromDocker("ubuntu:22.04");
    const cloned = SandboxImage.fromSandboxImage(original);

    expect(cloned).not.toBe(original);
  });

  test("modifications to clone do not affect original", () => {
    const original = SandboxImage.fromDocker("ubuntu:22.04");
    const cloned = SandboxImage.fromSandboxImage(original).runCmd("echo hello");

    expect(original.operations).toHaveLength(0);
    expect(cloned.operations).toHaveLength(1);
  });
});

describe("SandboxImage.runCmd()", () => {
  test("adds run operation", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04").runCmd("echo hello");

    expect(image.operations).toHaveLength(1);
    expect(image.operations[0].type).toBe("run");
    if (image.operations[0].type === "run") {
      expect(image.operations[0].command).toBe("echo hello");
    }
    expect(image.tools).toHaveLength(0);
  });

  test("returns new image instance", () => {
    const original = SandboxImage.fromDocker("ubuntu:22.04");
    const modified = original.runCmd("echo hello");

    expect(modified).not.toBe(original);
    expect(original.operations).toHaveLength(0);
    expect(modified.operations).toHaveLength(1);
  });
});

describe("SandboxImage.registerTool()", () => {
  test("registers single tool without installCmd", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04").registerTool({
      name: "dsbx",
      description: "Dust CLI",
      runtime: "system",
    });

    expect(image.operations).toHaveLength(0);
    expect(image.tools).toHaveLength(1);
    expect(image.tools[0].name).toBe("dsbx");
    expect(image.tools[0].description).toBe("Dust CLI");
    expect(image.tools[0].runtime).toBe("system");
  });

  test("registers single tool with installCmd", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04").registerTool(
      { name: "curl", description: "HTTP client", runtime: "system" },
      { installCmd: "apt-get install -y curl" }
    );

    expect(image.operations).toHaveLength(1);
    expect(image.operations[0].type).toBe("run");
    if (image.operations[0].type === "run") {
      expect(image.operations[0].command).toBe("apt-get install -y curl");
    }
    expect(image.tools).toHaveLength(1);
    expect(image.tools[0].name).toBe("curl");
    expect(image.tools[0].runtime).toBe("system");
  });

  test("registers multiple tools with single installCmd", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04").registerTool(
      [
        { name: "pandas", description: "Data analysis", runtime: "python" },
        {
          name: "numpy",
          description: "Numerical computing",
          runtime: "python",
        },
        {
          name: "matplotlib",
          description: "Plotting library",
          runtime: "python",
        },
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
    expect(image.tools.every((t) => t.runtime === "python")).toBe(true);
  });

  test("registers tool with profile", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04").registerTool({
      name: "special",
      description: "OpenAI-only tool",
      runtime: "system",
      profile: "openai",
    });

    expect(image.tools).toHaveLength(1);
    expect(image.tools[0].profile).toBe("openai");
  });

  test("returns new image instance", () => {
    const original = SandboxImage.fromDocker("ubuntu:22.04");
    const modified = original.registerTool({
      name: "curl",
      description: "HTTP client",
      runtime: "system",
    });

    expect(modified).not.toBe(original);
    expect(original.tools).toHaveLength(0);
    expect(modified.tools).toHaveLength(1);
  });
});

describe("SandboxImage.copy()", () => {
  test("accepts string path", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04").copy(
      "./src",
      "/app/src"
    );

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
    const image = SandboxImage.fromDocker("ubuntu:22.04").copy(
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
    const image = SandboxImage.fromDocker("ubuntu:22.04").copy(
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
    const image = SandboxImage.fromDocker("ubuntu:22.04").setWorkdir("/app");

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
    const image = SandboxImage.fromDocker("ubuntu:22.04").withResources({
      vcpu: 4,
      memoryMb: 8192,
    });

    expect(image.resources.vcpu).toBe(4);
    expect(image.resources.memoryMb).toBe(8192);
  });

  test("returns new image instance", () => {
    const original = SandboxImage.fromDocker("ubuntu:22.04");
    const modified = original.withResources({ vcpu: 4, memoryMb: 8192 });

    expect(modified).not.toBe(original);
    expect(original.resources.vcpu).toBe(1);
  });
});

describe("SandboxImage.withNetwork()", () => {
  test("updates network policy", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04").withNetwork({
      mode: "deny_all",
      allowlist: ["example.com", "api.example.com"],
    });

    expect(image.network.mode).toBe("deny_all");
    expect(image.network.allowlist).toContain("example.com");
  });
});

describe("SandboxImage immutability", () => {
  test("chained operations preserve original instances", () => {
    const original = SandboxImage.fromDocker("ubuntu:22.04");
    const afterInstall = original.registerTool(
      { name: "curl", description: "HTTP client", runtime: "system" },
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
    const image = SandboxImage.fromDocker("ubuntu:22.04").withToolManifest();

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
    const image = SandboxImage.fromDocker("ubuntu:22.04").withToolManifest({
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
    const jsonImage = SandboxImage.fromDocker("ubuntu:22.04").withToolManifest({
      format: "json",
    });

    if (jsonImage.operations[0].type === "copy") {
      expect(jsonImage.operations[0].dest).toBe(
        "/home/user/tool-manifest.json"
      );
    }
  });

  test("returns new instance (immutability)", () => {
    const original = SandboxImage.fromDocker("ubuntu:22.04");
    const modified = original.withToolManifest();

    expect(modified).not.toBe(original);
    expect(original.operations).toHaveLength(0);
    expect(modified.operations).toHaveLength(1);
  });

  test("chains with other operations", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04")
      .registerTool({
        name: "curl",
        description: "HTTP client",
        runtime: "system",
      })
      .runCmd("echo hello")
      .withToolManifest()
      .runCmd("echo done");

    expect(image.operations).toHaveLength(3);
    expect(image.operations[0].type).toBe("run");
    expect(image.operations[1].type).toBe("copy");
    expect(image.operations[2].type).toBe("run");
  });

  test("includes registered tools in manifest content", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04")
      .registerTool({
        name: "curl",
        description: "HTTP client",
        runtime: "system",
      })
      .registerTool({
        name: "jq",
        description: "JSON processor",
        runtime: "system",
      })
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
    const baseImage = SandboxImage.fromDocker("ubuntu:22.04").registerTool({
      name: "curl",
      description: "HTTP client",
      runtime: "system",
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

describe("SandboxImage.setBuildEnv()", () => {
  test("adds env operation", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04").setBuildEnv({
      FOO: "bar",
      BAZ: "qux",
    });

    expect(image.operations).toHaveLength(1);
    expect(image.operations[0].type).toBe("env");
    if (image.operations[0].type === "env") {
      expect(image.operations[0].vars).toEqual({ FOO: "bar", BAZ: "qux" });
    }
  });

  test("returns new image instance", () => {
    const original = SandboxImage.fromDocker("ubuntu:22.04");
    const modified = original.setBuildEnv({ FOO: "bar" });

    expect(modified).not.toBe(original);
    expect(original.operations).toHaveLength(0);
    expect(modified.operations).toHaveLength(1);
  });
});

describe("SandboxImage.setRunEnv()", () => {
  test("sets runtime environment variables", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04").setRunEnv({
      API_KEY: "secret",
      DEBUG: "true",
    });

    expect(image.runEnv).toEqual({ API_KEY: "secret", DEBUG: "true" });
  });

  test("merges with existing runEnv", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04")
      .setRunEnv({ FOO: "bar" })
      .setRunEnv({ BAZ: "qux" });

    expect(image.runEnv).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  test("later values override earlier ones", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04")
      .setRunEnv({ FOO: "original" })
      .setRunEnv({ FOO: "updated" });

    expect(image.runEnv).toEqual({ FOO: "updated" });
  });

  test("does not add operations (runtime-only)", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04").setRunEnv({
      FOO: "bar",
    });

    expect(image.operations).toHaveLength(0);
  });

  test("returns new image instance", () => {
    const original = SandboxImage.fromDocker("ubuntu:22.04");
    const modified = original.setRunEnv({ FOO: "bar" });

    expect(modified).not.toBe(original);
    expect(original.runEnv).toEqual({});
    expect(modified.runEnv).toEqual({ FOO: "bar" });
  });
});

describe("SandboxImage.toCreateConfig()", () => {
  test("returns network and resources from image", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04")
      .withResources({ vcpu: 2, memoryMb: 1024 })
      .withNetwork({ mode: "allow_all" })
      .register({ imageName: "test-image", tag: "v1" });

    const config = image.toCreateConfig();

    expect(config.network).toEqual({ mode: "allow_all" });
    expect(config.resources).toEqual({ vcpu: 2, memoryMb: 1024 });
  });

  test("returns undefined envVars when runEnv is empty", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04").register({
      imageName: "test-image",
      tag: "v1",
    });

    const config = image.toCreateConfig();

    expect(config.envVars).toBeUndefined();
  });

  test("returns envVars when runEnv is non-empty", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04")
      .setRunEnv({
        FOO: "bar",
        BAZ: "qux",
      })
      .register({ imageName: "test-image", tag: "v1" });

    const config = image.toCreateConfig();

    expect(config.envVars).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  test("returns a copy of runEnv (not the same reference)", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04")
      .setRunEnv({
        KEY: "value",
      })
      .register({ imageName: "test-image", tag: "v1" });

    const config = image.toCreateConfig();

    expect(config.envVars).not.toBe(image.runEnv);
  });

  test("returns default values for new image", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04").register({
      imageName: "test-image",
      tag: "v1",
    });

    const config = image.toCreateConfig();

    expect(config.envVars).toBeUndefined();
    expect(config.network).toEqual({ mode: "deny_all" });
    expect(config.resources).toEqual({ vcpu: 1, memoryMb: 512 });
  });

  test("throws error when not registered", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04");

    expect(() => image.toCreateConfig()).toThrow(
      "Cannot create config from unregistered SandboxImage"
    );
  });

  test("returns imageId when registered", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04").register({
      imageName: "dust-base",
      tag: "production",
    });

    const config = image.toCreateConfig();

    expect(config.imageId).toEqual({
      imageName: "dust-base",
      tag: "production",
    });
  });
});

describe("SandboxImage.register()", () => {
  test("sets imageId with string tag", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04").register({
      imageName: "dust-base",
      tag: "production",
    });

    expect(image.imageId).toEqual({
      imageName: "dust-base",
      tag: "production",
    });
  });

  test("returns new image instance", () => {
    const original = SandboxImage.fromDocker("ubuntu:22.04");
    const modified = original.register({
      imageName: "dust-base",
      tag: "production",
    });

    expect(modified).not.toBe(original);
    expect(original.imageId).toBeUndefined();
    expect(modified.imageId).toEqual({
      imageName: "dust-base",
      tag: "production",
    });
  });

  test("chains with other operations", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04")
      .registerTool({
        name: "curl",
        description: "HTTP client",
        runtime: "system",
      })
      .withResources({ vcpu: 2, memoryMb: 1024 })
      .register({ imageName: "dust-base", tag: "staging" })
      .setRunEnv({ DEBUG: "true" });

    expect(image.imageId).toEqual({ imageName: "dust-base", tag: "staging" });
    expect(image.tools).toHaveLength(1);
    expect(image.resources.vcpu).toBe(2);
    expect(image.runEnv).toEqual({ DEBUG: "true" });
  });

  test("has undefined imageId by default", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04");

    expect(image.imageId).toBeUndefined();
  });
});
