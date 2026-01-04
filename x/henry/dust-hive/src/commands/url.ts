import { requireEnvironment } from "../lib/commands";
import { Ok, type Result } from "../lib/result";

export async function urlCommand(args: string[]): Promise<Result<void>> {
  const envResult = await requireEnvironment(args[0], "url");
  if (!envResult.ok) return envResult;
  const env = envResult.value;
  console.log(`http://localhost:${env.ports.front}`);
  return Ok(undefined);
}
