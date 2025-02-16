import {
  loadMicroPython,
  type MicroPythonInstance,
} from "@micropython/micropython-webassembly-pyscript/micropython.mjs";
import * as z from "zod";
import type { Tool } from "./tools/types";

export interface CodeExecutionResult {
  result: unknown;
  stdout: string;
}

export class PythonSandbox {
  private mp!: MicroPythonInstance;
  private exposedFunctions: { [key: string]: Tool } = {};
  private moduleId: string;
  private stdoutBuffer: string[] = [];
  private stderrBuffer: string[] = [];

  private constructor(moduleId?: string) {
    // Generate a unique ID for this sandbox instance
    this.moduleId =
      moduleId ?? `sandbox_${Math.random().toString(36).slice(2)}`;
  }

  static async create(moduleId?: string): Promise<PythonSandbox> {
    const sandbox = new PythonSandbox(moduleId);

    // Initialize MicroPython with stdout capture
    sandbox.mp = await loadMicroPython({
      stdout: (text: string) => {
        sandbox.stdoutBuffer.push(text);
      },
      stderr: (text: string) => {
        sandbox.stderrBuffer.push(text);
      },
      linebuffer: true, // Ensure we get line-by-line output
    });

    return sandbox;
  }

  private clearBuffers() {
    this.stdoutBuffer = [];
    this.stderrBuffer = [];
  }

  private getOutput(): { stdout: string; stderr: string } {
    // Join with newlines and ensure it ends with a newline if there's any output
    const stdout =
      this.stdoutBuffer.length > 0 ? this.stdoutBuffer.join("\n") + "\n" : "";
    const stderr =
      this.stderrBuffer.length > 0 ? this.stderrBuffer.join("\n") + "\n" : "";
    return { stdout, stderr };
  }

  expose(name: string, func: Tool) {
    this.exposedFunctions[name] = func;

    const wrapper = (...args: unknown[]) => {
      // Parse input according to schema
      const inputObject = func.input as z.ZodObject<z.ZodRawShape>;
      const params = func.input.parse(
        args.length === 1 && typeof args[0] === "object"
          ? args[0]
          : {
              [Object.keys(inputObject.shape)[0]]: args[0],
              [Object.keys(inputObject.shape)[1]]: args[1],
            }
      );
      return func.fn(params);
    };

    // Create an object to hold our exposed functions
    const module = { [name]: wrapper };
    this.mp.registerJsModule(this.moduleId, module);
  }

  async runCode(code: string): Promise<{ stdout: string; stderr: string }> {
    // Clear stdout and stderr buffers before running new code
    this.clearBuffers();

    // Import exposed functions if any
    const importCode = Object.keys(this.exposedFunctions)
      .map((name) => `from ${this.moduleId} import ${name}`)
      .join("\n");

    try {
      // Run the actual code
      await this.mp.runPythonAsync(`${importCode}\n${code.trim()}`);

      return this.getOutput();
    } catch (error) {
      // Get stdout before throwing
      const { stdout, stderr } = this.getOutput();

      // Create a proper error object
      let errorObj: Error;
      if (error instanceof Error) {
        errorObj = error;
      } else if (typeof error === "string") {
        errorObj = new Error(error);
      } else {
        errorObj = new Error(String(error));
      }

      // Add stdout and stderr to the error
      Object.defineProperty(errorObj, "stdout", {
        value: stdout,
        enumerable: true,
        writable: false,
      });
      Object.defineProperty(errorObj, "stderr", {
        value: stderr,
        enumerable: true,
        writable: false,
      });

      throw errorObj;
    }
  }
}
