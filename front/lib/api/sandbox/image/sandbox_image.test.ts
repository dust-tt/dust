import { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import type { SandboxImageId } from "@app/lib/api/sandbox/image/types";
import { describe, expect, test } from "vitest";

describe("SandboxImage.fromSandbox()", () => {
  test("creates image with sandbox base", () => {
    const id: SandboxImageId = { imageName: "dust-base", tag: "staging" };
    const image = SandboxImage.fromSandbox(id);

    expect(image.baseImage.type).toBe("sandbox");
    if (image.baseImage.type === "sandbox") {
      expect(image.baseImage.id).toEqual(id);
    }
  });

  test("starts with empty operations and tools", () => {
    const id: SandboxImageId = { imageName: "dust-base", tag: "staging" };
    const image = SandboxImage.fromSandbox(id);

    expect(image.operations).toHaveLength(0);
    expect(image.tools).toHaveLength(0);
  });

  test("has default resources", () => {
    const id: SandboxImageId = { imageName: "dust-base", tag: "staging" };
    const image = SandboxImage.fromSandbox(id);

    expect(image.resources.vcpu).toBe(1);
    expect(image.resources.memoryMb).toBe(512);
  });

  test("has default network policy", () => {
    const id: SandboxImageId = { imageName: "dust-base", tag: "staging" };
    const image = SandboxImage.fromSandbox(id);

    expect(image.network.mode).toBe("deny_all");
  });

  test("has default workdir", () => {
    const id: SandboxImageId = { imageName: "dust-base", tag: "staging" };
    const image = SandboxImage.fromSandbox(id);

    expect(image.workdir).toBe("/home/user");
  });

  test("has empty runEnv by default", () => {
    const id: SandboxImageId = { imageName: "dust-base", tag: "staging" };
    const image = SandboxImage.fromSandbox(id);

    expect(image.runEnv).toEqual({});
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
      expect(image.operations[0].src.path).toBe("./src");
      expect(image.operations[0].dest).toBe("/app/src");
    }
  });

  test("returns new image instance", () => {
    const original = SandboxImage.fromDocker("ubuntu:22.04");
    const modified = original.copy("./src", "/app/src");

    expect(modified).not.toBe(original);
    expect(original.operations).toHaveLength(0);
    expect(modified.operations).toHaveLength(1);
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
      .withNetwork({ mode: "allow_all" });

    const config = image.toCreateConfig();

    expect(config.network).toEqual({ mode: "allow_all" });
    expect(config.resources).toEqual({ vcpu: 2, memoryMb: 1024 });
  });

  test("returns undefined envVars when runEnv is empty", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04");

    const config = image.toCreateConfig();

    expect(config.envVars).toBeUndefined();
  });

  test("returns envVars when runEnv is non-empty", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04").setRunEnv({
      FOO: "bar",
      BAZ: "qux",
    });

    const config = image.toCreateConfig();

    expect(config.envVars).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  test("returns a copy of runEnv (not the same reference)", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04").setRunEnv({
      KEY: "value",
    });

    const config = image.toCreateConfig();

    expect(config.envVars).not.toBe(image.runEnv);
  });

  test("returns default values for new image", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04");

    const config = image.toCreateConfig();

    expect(config.envVars).toBeUndefined();
    expect(config.network).toEqual({ mode: "deny_all" });
    expect(config.resources).toEqual({ vcpu: 1, memoryMb: 512 });
  });

  test("returns undefined imageId when not registered", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04");

    const config = image.toCreateConfig();

    expect(config.imageId).toBeUndefined();
  });

  test("returns imageId when registered", () => {
    const imageId: SandboxImageId = {
      imageName: "dust-base",
      tag: "production",
    };
    const image = SandboxImage.fromDocker("ubuntu:22.04").register(imageId);

    const config = image.toCreateConfig();

    expect(config.imageId).toEqual(imageId);
  });
});

describe("SandboxImage.register()", () => {
  test("sets imageId", () => {
    const imageId: SandboxImageId = {
      imageName: "dust-base",
      tag: "production",
    };
    const image = SandboxImage.fromDocker("ubuntu:22.04").register(imageId);

    expect(image.imageId).toEqual(imageId);
  });

  test("returns new image instance", () => {
    const imageId: SandboxImageId = {
      imageName: "dust-base",
      tag: "production",
    };
    const original = SandboxImage.fromDocker("ubuntu:22.04");
    const modified = original.register(imageId);

    expect(modified).not.toBe(original);
    expect(original.imageId).toBeUndefined();
    expect(modified.imageId).toEqual(imageId);
  });

  test("chains with other operations", () => {
    const imageId: SandboxImageId = { imageName: "dust-base", tag: "staging" };
    const image = SandboxImage.fromDocker("ubuntu:22.04")
      .registerTool({
        name: "curl",
        description: "HTTP client",
        runtime: "system",
      })
      .withResources({ vcpu: 2, memoryMb: 1024 })
      .register(imageId)
      .setRunEnv({ DEBUG: "true" });

    expect(image.imageId).toEqual(imageId);
    expect(image.tools).toHaveLength(1);
    expect(image.resources.vcpu).toBe(2);
    expect(image.runEnv).toEqual({ DEBUG: "true" });
  });

  test("has undefined imageId by default", () => {
    const image = SandboxImage.fromDocker("ubuntu:22.04");

    expect(image.imageId).toBeUndefined();
  });

  test("has undefined imageId from sandbox base by default", () => {
    const id: SandboxImageId = { imageName: "dust-base", tag: "staging" };
    const image = SandboxImage.fromSandbox(id);

    expect(image.imageId).toBeUndefined();
  });
});
