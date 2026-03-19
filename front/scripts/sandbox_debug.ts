import config from "@app/lib/api/config";
import { makeScript } from "@app/scripts/helpers";
import { Sandbox } from "e2b";

makeScript(
  {
    sandboxId: {
      type: "string",
      alias: "s",
      description: "The E2B sandbox ID to connect to",
      required: true,
    },
    user: {
      type: "string",
      alias: "u",
      description: "User to run as",
      default: "root",
    },
    command: {
      type: "string",
      alias: "c",
      description: "Command to run",
      default: "bash",
    },
  },
  async ({ sandboxId, user, command }, logger) => {
    const e2bConfig = config.getE2BSandboxConfig();
    const sandbox = await Sandbox.connect(sandboxId, {
      apiKey: e2bConfig.apiKey,
      domain: e2bConfig.domain,
    });

    logger.info({ sandboxId, user, command }, "Running command in sandbox");

    const result = await sandbox.commands.run(command, { user });
    if (result.stdout) {
      logger.info({ stdout: result.stdout }, "Command output");
    }
    if (result.stderr) {
      logger.error({ stderr: result.stderr }, "Command error output");
    }

    if (result.exitCode !== 0) {
      throw new Error(`Command exited with code ${result.exitCode}`);
    }
  }
);
