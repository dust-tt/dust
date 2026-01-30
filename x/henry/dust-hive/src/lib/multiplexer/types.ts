import type { ServiceName } from "../services";

/**
 * Multiplexer type - which terminal multiplexer to use
 */
export type MultiplexerType = "zellij" | "tmux";

/**
 * Configuration for a single tab/window in a multiplexer session
 */
export interface TabConfig {
  /** Display name for the tab */
  name: string;
  /** Working directory for the tab */
  cwd?: string;
  /** Command to run in the tab */
  command: string;
  /** Arguments for the command */
  args?: string[];
  /** If true, don't start the command until the tab is focused (lazy loading) */
  startSuspended?: boolean;
  /** If true, this tab should have initial focus */
  focus?: boolean;
}

/**
 * Configuration for generating a session layout
 */
export interface LayoutConfig {
  /** Environment name (used for session naming) */
  envName: string;
  /** Path to the git worktree */
  worktreePath: string;
  /** Path to the env.sh file to source */
  envShPath: string;
  /** Use compact layout (status bar at bottom instead of top) */
  compact?: boolean | undefined;
  /** Use unified logs tab instead of per-service tabs */
  unifiedLogs?: boolean | undefined;
  /** Optional command to run on warm (creates a dedicated "warm" tab) */
  warmCommand?: string | undefined;
  /** Optional initial command to run in the main shell before dropping to interactive shell */
  initialCommand?: string | undefined;
}

/**
 * Configuration for the main session layout (for managed services)
 */
export interface MainLayoutConfig {
  /** Path to the main repository root */
  repoRoot: string;
  /** Use compact layout */
  compact?: boolean | undefined;
}

/**
 * Options for opening/attaching to a session
 */
export interface OpenSessionOptions {
  /** Don't attach to the session after creating it */
  noAttach?: boolean;
}

/**
 * Result of checking if the multiplexer is installed
 */
export interface InstallCheckResult {
  /** Whether the multiplexer is installed and working */
  ok: boolean;
  /** Version string if installed */
  version?: string;
  /** Error message if not ok */
  error?: string;
}

/**
 * Abstract interface for terminal multiplexer operations.
 * Implementations exist for zellij and tmux.
 */
export interface MultiplexerAdapter {
  /** The type of multiplexer this adapter handles */
  readonly type: MultiplexerType;

  // ============================================================
  // Session Lifecycle
  // ============================================================

  /**
   * List all dust-hive sessions (sessions with "dust-hive-" prefix)
   */
  listSessions(): Promise<string[]>;

  /**
   * Check if a session with the given name exists
   */
  sessionExists(sessionName: string): Promise<boolean>;

  /**
   * Create a new session in the background (does not attach)
   * @param sessionName - Name for the session
   * @param layoutPath - Path to the layout file
   */
  createSessionInBackground(sessionName: string, layoutPath: string): Promise<void>;

  /**
   * Create a new session and attach to it
   * @param sessionName - Name for the session
   * @param layoutPath - Path to the layout file
   */
  createAndAttachSession(sessionName: string, layoutPath: string): Promise<void>;

  /**
   * Attach to an existing session
   * @param sessionName - Name of the session to attach to
   */
  attachSession(sessionName: string): Promise<void>;

  /**
   * Kill a session (stop it)
   * @param sessionName - Name of the session to kill
   */
  killSession(sessionName: string): Promise<void>;

  /**
   * Delete a session (remove from session list)
   * @param sessionName - Name of the session to delete
   */
  deleteSession(sessionName: string): Promise<void>;

  // ============================================================
  // Nested Session Handling
  // ============================================================

  /**
   * Check if we're currently running inside this multiplexer
   */
  isInsideMultiplexer(): boolean;

  /**
   * Get the name of the current session (if inside the multiplexer)
   */
  getCurrentSessionName(): string | null;

  /**
   * Switch to a different session from within the multiplexer.
   * This avoids nesting multiplexer sessions.
   * @param sessionName - Name of the session to switch to
   */
  switchToSession(sessionName: string): Promise<void>;

  // ============================================================
  // Layout Generation
  // ============================================================

  /**
   * Generate a layout file for an environment session
   * @param config - Layout configuration
   * @returns The generated layout content as a string
   */
  generateLayout(config: LayoutConfig): string;

  /**
   * Generate a layout file for the main session
   * @param config - Main layout configuration
   * @returns The generated layout content as a string
   */
  generateMainLayout(config: MainLayoutConfig): string;

  /**
   * Get the path where layouts should be stored for this multiplexer
   */
  getLayoutDirectory(): string;

  /**
   * Get the full path for a layout file
   * @param filename - Name of the layout file (without directory)
   */
  getLayoutPath(filename: string): string;

  /**
   * Write a layout to disk
   * @param content - Layout content
   * @param path - Path to write to
   */
  writeLayout(content: string, path: string): Promise<void>;

  // ============================================================
  // Prerequisites
  // ============================================================

  /**
   * Check if the multiplexer is installed
   */
  checkInstalled(): Promise<InstallCheckResult>;

  /**
   * Get installation instructions for this multiplexer
   */
  getInstallInstructions(): string;
}

/**
 * Standard session name prefix for all dust-hive sessions
 */
export const SESSION_PREFIX = "dust-hive-";

/**
 * Get the session name for an environment
 */
export function getSessionName(envName: string): string {
  return `${SESSION_PREFIX}${envName}`;
}

/**
 * Main session name constant
 */
export const MAIN_SESSION_NAME = "dust-hive-main";

/**
 * Tab display names (shorter names for better display in tab bar)
 */
export const TAB_NAMES: Record<ServiceName, string> = {
  sparkle: "sparkle",
  sdk: "sdk",
  front: "front",
  core: "core",
  oauth: "oauth",
  connectors: "connectors",
  "front-workers": "workers",
  "front-spa-poke": "spa-poke",
  "front-spa-app": "spa-app",
};
