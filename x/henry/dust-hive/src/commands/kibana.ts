import { withEnvironment } from "../lib/commands";
import { startKibana, writeDockerComposeOverride } from "../lib/docker";
import { logger } from "../lib/logger";
import { openUrl } from "../lib/platform";
import { CommandError, Err, Ok } from "../lib/result";
import { getStateInfo } from "../lib/state";

export const kibanaCommand = withEnvironment("kibana", async (env) => {
  const stateInfo = await getStateInfo(env);
  if (stateInfo.state !== "warm") {
    return Err(
      new CommandError(
        `Environment is ${stateInfo.state}, not warm. Run 'dust-hive warm ${env.name}' first.`
      )
    );
  }

  await writeDockerComposeOverride(env.name, env.ports);
  await startKibana(env);

  const url = `http://localhost:${env.ports.kibana}`;
  logger.info(`Opening ${url}`);
  openUrl(url);

  return Ok(undefined);
});
