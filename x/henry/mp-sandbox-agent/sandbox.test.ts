import { describe, expect, test } from "bun:test";
import { PythonSandbox } from "./sandbox";
import { z } from "zod";

describe("PythonSandbox", () => {
  test("should run basic Python code", async () => {
    const sandbox = await PythonSandbox.create();
    const { stdout, stderr } = await sandbox.runCode('print("Hello, World!")');
    expect(stdout).toBe("Hello, World!\n");
    expect(stderr).toBe("");
  });

  test("should support importing and calling exposed functions", async () => {
    const sandbox = await PythonSandbox.create("test");
    sandbox.expose("fake_function", {
      fn: () => "Hello, World!",
      input: z.object({}),
      output: z.string(),
      description: "A fake function that returns a string",
    });
    const { stdout, stderr } = await sandbox.runCode(
      "from test import fake_function\nprint(fake_function())"
    );
    expect(stdout).toBe("Hello, World!\n");
    expect(stderr).toBe("");
  });

  test("should support importing and calling exposed functions with arguments", async () => {
    const sandbox = await PythonSandbox.create("test");
    sandbox.expose("add", {
      fn: ({ a, b }: { a: number; b: number }) => a + b,
      input: z.object({ a: z.number(), b: z.number() }),
      output: z.number(),
      description: "Adds two numbers",
    });
    const { stdout, stderr } = await sandbox.runCode(
      "from test import add\nprint(add(1, 2))"
    );
    expect(stdout).toBe("3\n");
    expect(stderr).toBe("");
  });

  test("should support importing and calling exposed functions with positional arguments", async () => {
    const sandbox = await PythonSandbox.create("test");
    sandbox.expose("sub", {
      fn: ({ b, a }: { a: number; b: number }) => b - a,
      input: z.object({ b: z.number(), a: z.number() }),
      output: z.number(),
      description: "Subtracts two numbers",
    });
    const { stdout, stderr } = await sandbox.runCode(
      "from test import sub\nprint(sub(1, 2))"
    );
    expect(stdout).toBe("-1\n");
    expect(stderr).toBe("");
  });

  test("should support importing and calling exposed functions with keyword arguments", async () => {
    const sandbox = await PythonSandbox.create("test");
    sandbox.expose("multiply", {
      fn: ({ a, b }: { a: number; b: number }) => a * b,
      input: z.object({ a: z.number(), b: z.number() }),
      output: z.number(),
      description: "Multiplies two numbers",
    });
    const { stdout, stderr } = await sandbox.runCode(
      "from test import multiply\nprint(multiply(a=1, b=2))"
    );
    expect(stdout).toBe("2\n");
    expect(stderr).toBe("");
  });

  test("should support importing and calling exposed async functions", async () => {
    const sandbox = await PythonSandbox.create("test");
    sandbox.expose("async_function", {
      fn: async () => "Hello, World!",
      input: z.object({}),
      output: z.string(),
      description: "Returns a string after a delay",
    });
    const { stdout, stderr } = await sandbox.runCode(
      "from test import async_function\nprint(await async_function())"
    );
    expect(stdout).toBe("Hello, World!\n");
    expect(stderr).toBe("");
  });

  test("should support returning stderr", async () => {
    const sandbox = await PythonSandbox.create("test");
    const { stdout, stderr } = await sandbox.runCode(
      "import sys\nprint('Hello, World!', file=sys.stderr)"
    );
    expect(stdout).toBe("");
    expect(stderr).toBe("Hello, World!\n");
  });

  test("should support exceptions", async () => {
    const sandbox = await PythonSandbox.create("test");
    try {
      await sandbox.runCode("raise Exception('This is a test error')");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        'Traceback (most recent call last):\n  File "<stdin>", line 2, in <module>\nException: This is a test error\n'
      );
    }
  });
});
