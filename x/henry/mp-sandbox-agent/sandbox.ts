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

/**
 * Represents a parsed JSON value (string, number, boolean, null, array, or object)
 */
export type JsonValue = 
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Represents a function that can be exposed to the sandbox
 */
export interface ExposedFunction<
  TInput = unknown,
  TOutput = unknown
> {
  /** Function to execute when called from Python */
  fn: (input: TInput) => Promise<TOutput>;
  /** Schema to validate and parse the input */
  input: z.ZodType<TInput>;
  /** Schema to validate and parse the output */
  output: z.ZodType<TOutput>;
  /** Description of the function */
  description: string;
}

/**
 * Untyped version of ExposedFunction for internal use
 */
type AnyExposedFunction = ExposedFunction<unknown, unknown>;

export class PythonSandbox {
  private mp!: MicroPythonInstance;
  private exposedFunctions: { [key: string]: AnyExposedFunction } = {};
  private module: Record<string, Function> = {};
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

  /**
   * Expose a function to the Python environment
   * @param name The name of the function in Python
   * @param func The function to expose
   */
  expose<TInput, TOutput>(name: string, func: ExposedFunction<TInput, TOutput>): void {
    this.exposedFunctions[name] = func as AnyExposedFunction;

    // Create a wrapper function that handles JSON serialization/deserialization
    const wrapper = (_args: string, _kwargs: string): Promise<string | number | boolean> => {
      // Parse input JSON strings
      const args: JsonValue[] = JSON.parse(_args);
      const kwargs: Record<string, JsonValue> = JSON.parse(_kwargs);

      // Convert positional and keyword arguments to an object that can be validated
      // against the input schema
      const paramsObj: Record<string, JsonValue> = {};
      
      // Handle object schemas differently than other schemas
      if (func.input instanceof z.ZodObject) {
        // Map parameters from positional args and keyword args
        for (const [i, key] of Object.keys(func.input.shape).entries()) {
          if (key in kwargs) {
            paramsObj[key] = kwargs[key];
          } else if (i < args.length) {
            paramsObj[key] = args[i];
          }
        }
      } else {
        // For non-object schemas, just use the first argument
        if (args.length > 0) {
          return Promise.resolve(JSON.stringify(args[0]));
        }
      }

      // Parse with the input schema to validate and transform
      const params = func.input.parse(paramsObj);

      // Call the function
      const result = func.fn(params);

      // Function to convert result to a JSON-compatible value
      const serializeValue = (value: unknown): string | number | boolean => {
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          return value;
        }
        return JSON.stringify(value);
      };

      // Handle async results
      if (result instanceof Promise) {
        return result.then(serializeValue);
      }

      return Promise.resolve(serializeValue(result));
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
