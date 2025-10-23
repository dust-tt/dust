export type SandboxLanguage = "python";

export interface CodeExecutionResult {
  exitCode: number;
  result: string;
  error?: string;
}

export interface SandboxProvider {
  /**
   * Get or create a sandbox with the given name and language
   */
  getOrCreateSandbox(
    name: string,
    language: SandboxLanguage
  ): Promise<SandboxInstance>;
}

export interface SandboxInstance {
  /**
   * Execute code in the sandbox
   */
  executeCode(code: string): Promise<CodeExecutionResult>;
}
