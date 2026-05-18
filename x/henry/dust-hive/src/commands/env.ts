import { getConfigVar, listConfigVars, setConfigVar, unsetConfigVar } from "../lib/config-env";
import { logger } from "../lib/logger";
import { CONFIG_ENV_PATH } from "../lib/paths";
import { CommandError, Err, Ok, type Result } from "../lib/result";

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export async function envListCommand(): Promise<Result<void>> {
  const vars = await listConfigVars();

  if (vars.length === 0) {
    logger.dim(`No vars set in ${CONFIG_ENV_PATH}`);
    return Ok(undefined);
  }

  const maxKeyLen = Math.max(...vars.map((v) => v.key.length));
  for (const { key, value } of vars) {
    console.log(`  ${key.padEnd(maxKeyLen + 2)}${value}`);
  }

  return Ok(undefined);
}

export async function envGetCommand(key: string): Promise<Result<void>> {
  const value = await getConfigVar(key);
  if (value === null) {
    return Err(new CommandError(`'${key}' not found in config.env`));
  }
  console.log(value);
  return Ok(undefined);
}

export async function envSetCommand(key: string, value: string): Promise<Result<void>> {
  if (!KEY_PATTERN.test(key)) {
    return Err(new CommandError(`Invalid key '${key}': must match [A-Za-z_][A-Za-z0-9_]*`));
  }
  await setConfigVar(key, value);
  logger.success(`${key}=${value}`);
  return Ok(undefined);
}

export async function envUnsetCommand(key: string): Promise<Result<void>> {
  const removed = await unsetConfigVar(key);
  if (!removed) {
    return Err(new CommandError(`'${key}' not found in config.env`));
  }
  logger.success(`Removed ${key}`);
  return Ok(undefined);
}
