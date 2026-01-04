import { requireEnvironment } from "../lib/commands";
import { Ok, type Result } from "../lib/result";

export async function urlCommand(nameArg: string | undefined): Promise<Result<void>> {
  const envResult = await requireEnvironment(nameArg, "url");
  if (!envResult.ok) return envResult;
  const env = envResult.value;
  console.log(`http://localhost:${env.ports.front}`);
  return Ok(undefined);
}
