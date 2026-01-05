import { withEnvironment } from "../lib/commands";
import { Ok } from "../lib/result";

export const urlCommand = withEnvironment("url", async (env) => {
  console.log(`http://localhost:${env.ports.front}`);
  return Ok(undefined);
});
