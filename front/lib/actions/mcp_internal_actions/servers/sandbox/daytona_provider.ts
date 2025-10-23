import { Daytona } from "@daytonaio/sdk";
import { DaytonaNotFoundError } from "@daytonaio/sdk/src/errors/DaytonaError";

import type {
  CodeExecutionResult,
  SandboxInstance,
  SandboxLanguage,
  SandboxProvider,
} from "./types";

export class DaytonaSandboxProvider implements SandboxProvider {
  private client: Daytona;

  constructor(apiKey: string) {
    this.client = new Daytona({
      apiKey,
    });
  }

  async getOrCreateSandbox(
    name: string,
    language: SandboxLanguage
  ): Promise<SandboxInstance> {
    let sandbox;
    try {
      sandbox = await this.client.get(name);
    } catch (error) {
      if (error instanceof DaytonaNotFoundError) {
        sandbox = await this.client.create({
          language,
          networkBlockAll: true,
          name,
          autoDeleteInterval: 60 * 60 * 24 * 30, // 30 days
        });
      } else {
        throw error;
      }
    }

    return new DaytonaSandboxInstance(sandbox);
  }
}

class DaytonaSandboxInstance implements SandboxInstance {
  constructor(private sandbox: any) {}

  async executeCode(code: string): Promise<CodeExecutionResult> {
    const response = await this.sandbox.process.codeRun(code);

    return {
      exitCode: response.exitCode,
      result: response.result || "",
      error: response.error,
    };
  }
}
