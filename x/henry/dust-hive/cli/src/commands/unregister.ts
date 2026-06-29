import { requireEnvironment } from "../lib/commands";
import type { Result } from "../lib/result";
import { loadSettings } from "../lib/settings";
import { destroySingleEnvironment } from "./destroy";

export async function unregisterCommand(
  nameArg: string | undefined,
  options?: { force?: boolean }
): Promise<Result<void>> {
  const envResult = await requireEnvironment(nameArg, "unregister");
  if (!envResult.ok) return envResult;

  const settings = await loadSettings();
  return destroySingleEnvironment(
    envResult.value,
    {
      force: Boolean(options?.force),
      keepBranch: true,
      keepWorktree: true,
    },
    settings
  );
}
