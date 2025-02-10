import { ExecutionResult, InterpreterOptions } from "../types/interpreter";
import { micropython } from "./micropython";

export class InterpreterService {
  private static instance: InterpreterService;
  private isInitialized = false;

  constructor() {
    if (!InterpreterService.instance) {
      InterpreterService.instance = this;
    }
    return InterpreterService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await micropython.init();
      this.isInitialized = true;
    } catch (error) {
      console.error("Failed to initialize interpreter:", error);
      throw error;
    }
  }

  async executeCode(
    options: InterpreterOptions & { code: string }
  ): Promise<ExecutionResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const output = await micropython.runPython(options.code);
      return { output };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        output: "",
      };
    }
  }

  terminate() {
    this.isInitialized = false;
  }
}
