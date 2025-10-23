import { Daytona } from "@daytonaio/sdk";
import { DaytonaNotFoundError } from "@daytonaio/sdk/src/errors/DaytonaError";

import type * as SandboxTypes from "./types";

export class DaytonaSandboxProvider implements SandboxTypes.SandboxProvider {
  private client: Daytona;

  constructor(apiKey: string) {
    this.client = new Daytona({
      apiKey,
    });
  }

  async getOrCreateSandbox(
    name: string,
    language: SandboxTypes.SandboxLanguage
  ): Promise<SandboxTypes.SandboxInstance> {
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

class DaytonaSandboxInstance implements SandboxTypes.SandboxInstance {
  constructor(private sandbox: any) {}

  async executeCode(code: string): Promise<SandboxTypes.CodeExecutionResult> {
    const response = await this.sandbox.process.codeRun(code);

    return {
      exitCode: response.exitCode,
      result: response.result ?? "",
      error: response.error,
    };
  }
}
