import { setLastActiveEnv } from "../lib/activity";
import { getEnvironment } from "../lib/environment";
import { logger } from "../lib/logger";
import {
  type LayoutConfig,
  MAIN_SESSION_NAME,
  type MainLayoutConfig,
  getConfiguredMultiplexer,
  getSessionName,
} from "../lib/multiplexer";
import { getEnvFilePath, getWorktreeDir } from "../lib/paths";
import { selectEnvironmentWithFzf } from "../lib/prompt";
import { CommandError, Err, Ok, type Result, envNotFoundError } from "../lib/result";

interface OpenOptions {
  warmCommand?: string | undefined;
  noAttach?: boolean | undefined;
  initialCommand?: string | undefined;
  compact?: boolean | undefined;
  unifiedLogs?: boolean | undefined;
}

/**
 * Open command - uses fzf for environment selection.
 * fzf properly handles terminal state, which is important when spawning
 * terminal multiplexers like tmux or zellij.
 */
export async function openCommand(
  nameArg: string | undefined,
  options: OpenOptions = {}
): Promise<Result<void>> {
  // Get environment name - use fzf for selection to avoid clack terminal issues
  const envResult = await resolveEnvironment(nameArg);
  if (!envResult.ok) return envResult;
  const env = envResult.value;

  const multiplexer = await getConfiguredMultiplexer();
  const worktreePath = getWorktreeDir(env.name);
  const envShPath = getEnvFilePath(env.name);
  const sessionName = getSessionName(env.name);

  const layoutConfig: LayoutConfig = {
    envName: env.name,
    worktreePath,
    envShPath,
    warmCommand: options.warmCommand,
    initialCommand: options.initialCommand,
    compact: options.compact,
    unifiedLogs: options.unifiedLogs,
  };

  // Handle being inside multiplexer (use switch instead of attach)
  if (multiplexer.isInsideMultiplexer() && !options.noAttach) {
    return handleInsideMultiplexer(multiplexer, sessionName, layoutConfig);
  }

  // Handle being outside multiplexer
  return handleOutsideMultiplexer(multiplexer, sessionName, layoutConfig, env.name, options);
}

async function resolveEnvironment(
  nameArg: string | undefined
): Promise<Result<{ name: string }, CommandError>> {
  let envName = nameArg;
  if (!envName) {
    const selected = await selectEnvironmentWithFzf("Select environment to open");
    if (!selected) {
      return Err(new CommandError("No environment selected"));
    }
    envName = selected;
  }

  const env = await getEnvironment(envName);
  if (!env) {
    return Err(envNotFoundError(envName));
  }

  await setLastActiveEnv(env.name);
  return Ok(env);
}

async function handleInsideMultiplexer(
  multiplexer: Awaited<ReturnType<typeof getConfiguredMultiplexer>>,
  sessionName: string,
  layoutConfig: LayoutConfig
): Promise<Result<void>> {
  const currentSession = multiplexer.getCurrentSessionName();
  if (currentSession === sessionName) {
    logger.info(`Already in session '${sessionName}'`);
    return Ok(undefined);
  }

  const sessionExists = await multiplexer.sessionExists(sessionName);
  if (!sessionExists) {
    const layoutContent = multiplexer.generateLayout(layoutConfig);
    const layoutPath = multiplexer.getLayoutPath("layout.kdl");
    await multiplexer.writeLayout(layoutContent, layoutPath);
    await multiplexer.createSessionInBackground(sessionName, layoutPath);
  }

  await multiplexer.switchToSession(sessionName);
  return Ok(undefined);
}

async function handleOutsideMultiplexer(
  multiplexer: Awaited<ReturnType<typeof getConfiguredMultiplexer>>,
  sessionName: string,
  layoutConfig: LayoutConfig,
  envName: string,
  options: OpenOptions
): Promise<Result<void>> {
  const sessionExists = await multiplexer.sessionExists(sessionName);

  if (sessionExists) {
    if (options.noAttach) {
      logger.info(`Session '${sessionName}' already exists.`);
      logger.info(`Use 'dust-hive open ${envName}' to attach.`);
      return Ok(undefined);
    }
    await multiplexer.attachSession(sessionName);
    return Ok(undefined);
  }

  // Create new session
  const layoutContent = multiplexer.generateLayout(layoutConfig);
  const layoutPath = multiplexer.getLayoutPath("layout.kdl");
  await multiplexer.writeLayout(layoutContent, layoutPath);

  if (options.noAttach) {
    await multiplexer.createSessionInBackground(sessionName, layoutPath);
    logger.info(`Use 'dust-hive open ${envName}' to attach.`);
    return Ok(undefined);
  }

  await multiplexer.createAndAttachSession(sessionName, layoutPath);
  return Ok(undefined);
}

interface MainSessionOptions {
  attach?: boolean;
  compact?: boolean | undefined;
}

// Open the main session (for managed services mode)
export async function openMainSession(
  repoRoot: string,
  options: MainSessionOptions = {}
): Promise<void> {
  const multiplexer = await getConfiguredMultiplexer();
  const sessionName = MAIN_SESSION_NAME;

  const inMultiplexer = multiplexer.isInsideMultiplexer();
  const currentSession = multiplexer.getCurrentSessionName();

  // Check if session exists
  const sessionExists = await multiplexer.sessionExists(sessionName);

  if (inMultiplexer && options.attach) {
    if (currentSession === sessionName) {
      logger.info(`Already in session '${sessionName}'`);
      return;
    }

    if (!sessionExists) {
      const layoutConfig: MainLayoutConfig = { repoRoot, compact: options.compact };
      const layoutContent = multiplexer.generateMainLayout(layoutConfig);
      const layoutPath = multiplexer.getLayoutPath("main-layout.kdl");
      await multiplexer.writeLayout(layoutContent, layoutPath);
      await multiplexer.createSessionInBackground(sessionName, layoutPath);
    }

    // Switch to session
    await multiplexer.switchToSession(sessionName);
    return;
  }

  if (sessionExists) {
    if (!options.attach) {
      logger.info(`Main session '${sessionName}' already exists.`);
      return;
    }

    await multiplexer.attachSession(sessionName);
  } else {
    const layoutConfig: MainLayoutConfig = { repoRoot, compact: options.compact };
    const layoutContent = multiplexer.generateMainLayout(layoutConfig);
    const layoutPath = multiplexer.getLayoutPath("main-layout.kdl");
    await multiplexer.writeLayout(layoutContent, layoutPath);

    if (!options.attach) {
      await multiplexer.createSessionInBackground(sessionName, layoutPath);
      logger.info(`Main session '${sessionName}' created.`);
      return;
    }

    await multiplexer.createAndAttachSession(sessionName, layoutPath);
  }
}
