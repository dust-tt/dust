import { withEnvironment } from "../lib/commands";
import { logger } from "../lib/logger";
import {
  type LayoutConfig,
  MAIN_SESSION_NAME,
  type MainLayoutConfig,
  getConfiguredMultiplexer,
  getSessionName,
} from "../lib/multiplexer";
import { getEnvFilePath, getWorktreeDir } from "../lib/paths";
import { Ok } from "../lib/result";

interface OpenOptions {
  warmCommand?: string | undefined;
  noAttach?: boolean | undefined;
  initialCommand?: string | undefined;
  compact?: boolean | undefined;
  unifiedLogs?: boolean | undefined;
}

export const openCommand = withEnvironment("open", async (env, options: OpenOptions = {}) => {
  const multiplexer = await getConfiguredMultiplexer();
  const worktreePath = getWorktreeDir(env.name);
  const envShPath = getEnvFilePath(env.name);
  const sessionName = getSessionName(env.name);

  // Detect if running inside the multiplexer to avoid nesting
  const inMultiplexer = multiplexer.isInsideMultiplexer();
  const currentSession = multiplexer.getCurrentSessionName();

  // If inside multiplexer and trying to attach, use session switching instead
  if (inMultiplexer && !options.noAttach) {
    // If already in the target session, nothing to do
    if (currentSession === sessionName) {
      logger.info(`Already in session '${sessionName}'`);
      return Ok(undefined);
    }

    // Ensure session exists (create in background if needed)
    const sessionExists = await multiplexer.sessionExists(sessionName);
    if (!sessionExists) {
      const layoutConfig: LayoutConfig = {
        envName: env.name,
        worktreePath,
        envShPath,
        warmCommand: options.warmCommand,
        initialCommand: options.initialCommand,
        compact: options.compact,
        unifiedLogs: options.unifiedLogs,
      };
      const layoutContent = multiplexer.generateLayout(layoutConfig);
      const layoutPath = multiplexer.getLayoutPath("layout.kdl");
      await multiplexer.writeLayout(layoutContent, layoutPath);
      await multiplexer.createSessionInBackground(sessionName, layoutPath);
    }

    // Switch to target session
    await multiplexer.switchToSession(sessionName);
    return Ok(undefined);
  }

  // Check if session already exists
  const sessionExists = await multiplexer.sessionExists(sessionName);

  if (sessionExists) {
    if (options.noAttach) {
      logger.info(`Session '${sessionName}' already exists.`);
      logger.info(`Use 'dust-hive open ${env.name}' to attach.`);
      return Ok(undefined);
    }

    // Attach to existing session
    await multiplexer.attachSession(sessionName);
  } else {
    // Create new session with layout
    const layoutConfig: LayoutConfig = {
      envName: env.name,
      worktreePath,
      envShPath,
      warmCommand: options.warmCommand,
      initialCommand: options.initialCommand,
      compact: options.compact,
      unifiedLogs: options.unifiedLogs,
    };
    const layoutContent = multiplexer.generateLayout(layoutConfig);
    const layoutPath = multiplexer.getLayoutPath("layout.kdl");
    await multiplexer.writeLayout(layoutContent, layoutPath);

    if (options.noAttach) {
      await multiplexer.createSessionInBackground(sessionName, layoutPath);
      logger.info(`Use 'dust-hive open ${env.name}' to attach.`);
      return Ok(undefined);
    }

    await multiplexer.createAndAttachSession(sessionName, layoutPath);
  }

  return Ok(undefined);
});

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
