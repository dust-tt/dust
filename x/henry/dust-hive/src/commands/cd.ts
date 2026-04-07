import { requireEnvironment } from "../lib/commands";
import { getWorktreeDir } from "../lib/paths";
import { Ok, type Result } from "../lib/result";

export async function cdCommand(nameArg: string | undefined): Promise<Result<void>> {
  const envResult = await requireEnvironment(nameArg, "cd");
  if (!envResult.ok) return envResult;

  const env = envResult.value;
  const worktreePath = getWorktreeDir(env.name, env.metadata.repoRoot);

  // When called via the `dh cd` shell wrapper, DUST_HIVE_CD_FILE is set.
  // Write the path to that file so the wrapper can cd without capturing stdout
  // (which would swallow the interactive selection prompt).
  const cdFile = process.env["DUST_HIVE_CD_FILE"];
  if (cdFile) {
    await Bun.write(cdFile, worktreePath);
  } else {
    process.stdout.write(`${worktreePath}\n`);
  }

  return Ok(undefined);
}
