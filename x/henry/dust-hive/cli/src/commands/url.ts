import { withEnvironment } from "../lib/commands";
import { ControlPlaneClient } from "../lib/control-plane-client";
import { CommandError, Err, Ok, type Result } from "../lib/result";

interface UrlOptions {
  remote?: boolean;
}

const localUrl = withEnvironment("url", async (env) => {
  console.log(`http://localhost:${env.ports.front}`);
  return Ok(undefined);
});

async function remoteUrl(name: string): Promise<Result<void>> {
  const clientResult = await ControlPlaneClient.create();
  if (!clientResult.ok) {
    return clientResult;
  }
  const beeResult = await clientResult.value.resolveBee(name);
  if (!beeResult.ok) {
    return beeResult;
  }
  const { previewUrl } = beeResult.value;
  if (!previewUrl) {
    return Err(new CommandError(`Bee '${name}' has no preview URL yet (still provisioning?)`));
  }
  console.log(previewUrl);
  return Ok(undefined);
}

export function urlCommand(
  name: string | undefined,
  options: UrlOptions = {}
): Promise<Result<void>> {
  if (options.remote) {
    if (!name) {
      return Promise.resolve(
        Err(new CommandError("--remote requires a bee name: dust-hive url --remote <bee>"))
      );
    }
    return remoteUrl(name);
  }
  return localUrl(name);
}
