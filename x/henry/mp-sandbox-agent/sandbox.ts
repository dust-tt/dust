import {
  loadMicroPython,
  type MicroPythonInstance,
} from "@micropython/micropython-webassembly-pyscript/micropython.mjs";
import * as z from "zod";
import { logger } from "./utils/logger";
import { SandboxError, wrapError } from "./utils/errors";

export interface CodeExecutionResult {
  result: unknown;
  stdout: string;
}

type ExposedFunction = {
  fn: (input: any) => Promise<any>;
  input: z.ZodType<any>;
  output: z.ZodType<any>;
  description: string;
};

export class PythonSandbox {
  private mp!: MicroPythonInstance;
  private exposedFunctions: { [key: string]: ExposedFunction } = {};
  private module: Record<string, any> = {};
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

  expose(name: string, func: ExposedFunction) {
    this.exposedFunctions[name] = func;

    const wrapper = (_args: string, _kwargs: string) => {
      // Parse input according to schema
      const args = JSON.parse(_args);
      const kwargs = JSON.parse(_kwargs);

      const toParse: any = {};
      const inputObject = func.input as z.ZodObject<z.ZodRawShape>;
      for (const [i, key] of Object.keys(inputObject.shape).entries()) {
        if (kwargs[key]) {
          toParse[key] = kwargs[key];
        } else {
          toParse[key] = args[i];
        }
      }

      const params = func.input.parse(toParse);

      const r = func.fn(params);

      const maybeParseValue = (value: unknown) =>
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
          ? value
          : JSON.stringify(value);

      if (r instanceof Promise) {
        return r.then(maybeParseValue);
      }

      return maybeParseValue(r);
    };

    // Create an object to hold our exposed functions
    this.module[name] = wrapper;
    this.mp.registerJsModule(this.moduleId, this.module);
  }

  private generateWrapperFunction(name: string): string {
    return `
async def ${name}(*args, **kwargs):
    args = json.dumps(args)
    kwargs = json.dumps(kwargs)

    r = await _${name}(args, kwargs)
    try:
      return json.loads(r)
    except:
      return r`;
  }

  private generateImports(): string {
    const imports = ["import json"];

    for (const name of Object.keys(this.exposedFunctions)) {
      imports.push(`from ${this.moduleId} import ${name} as _${name}`);
      imports.push(this.generateWrapperFunction(name));
    }

    return imports.join("\n");
  }

  async runCode(code: string): Promise<{ stdout: string; stderr: string }> {
    this.clearBuffers();
    
    const codeLength = code.length;
    const codeSummary = code.length > 50 
      ? `${code.substring(0, 47)}...` 
      : code;
    
    logger.debug(`Running code (${codeLength} chars): ${codeSummary}`);
    const importCode = this.generateImports();

    try {
      const fullCode = `${importCode}\n\n${code.trim()}`;
      await this.mp.runPythonAsync(fullCode);
      const output = this.getOutput();
      logger.debug(`Code execution successful with ${output.stdout.length} bytes of stdout`);
      return output;
    } catch (error) {
      // Get stdout and stderr before creating error object
      const { stdout, stderr } = this.getOutput();
      
      logger.debug(`Code execution failed with ${stderr.length} bytes of stderr`);
      
      // Create a SandboxError with context
      const errorMessage = error instanceof Error ? error.message : String(error);
      const sandboxError = new SandboxError(
        `Python code execution failed: ${errorMessage}`,
        stdout,
        stderr,
        { cause: error instanceof Error ? error : undefined }
      ).addContext({
        codeLength,
        codeSummary,
        moduleId: this.moduleId,
        hasStdout: stdout.length > 0,
        hasStderr: stderr.length > 0
      });
      
      throw sandboxError;
    }
  }
}
