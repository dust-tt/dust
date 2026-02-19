/**
 * Multiplexer abstraction module
 *
 * This module provides a unified interface for terminal multiplexers (zellij, tmux).
 * Currently only zellij is implemented; tmux support can be added later.
 */

import { loadSettings } from "../settings";
import { TmuxAdapter } from "./tmux";
import type { MultiplexerAdapter, MultiplexerType } from "./types";
import { ZellijAdapter } from "./zellij";

// Re-export types for convenience
export type { MultiplexerAdapter, MultiplexerType, LayoutConfig, MainLayoutConfig } from "./types";
export { getSessionName, MAIN_SESSION_NAME, SESSION_PREFIX, TAB_NAMES } from "./types";

/**
 * Registry of available multiplexer adapters
 */
const adapters: Record<MultiplexerType, () => MultiplexerAdapter> = {
  zellij: () => new ZellijAdapter(),
  tmux: () => new TmuxAdapter(),
};

/**
 * Default multiplexer type (for backward compatibility)
 */
const DEFAULT_MULTIPLEXER: MultiplexerType = "zellij";

/**
 * Cached adapter instance (lazily initialized)
 */
let cachedAdapter: MultiplexerAdapter | null = null;
let cachedAdapterType: MultiplexerType | null = null;

/**
 * Get a multiplexer adapter for the specified type.
 * Use this when you need a specific multiplexer regardless of settings.
 */
export function getMultiplexerAdapter(type: MultiplexerType): MultiplexerAdapter {
  const factory = adapters[type];
  if (!factory) {
    throw new Error(
      `Unknown multiplexer type: ${type}. Available types: ${Object.keys(adapters).join(", ")}`
    );
  }
  return factory();
}

/**
 * Get the configured multiplexer adapter.
 * Reads from settings.json, defaults to zellij for backward compatibility.
 * The adapter is cached for the lifetime of the process.
 */
export async function getConfiguredMultiplexer(): Promise<MultiplexerAdapter> {
  const settings = await loadSettings();
  const type = settings.multiplexer ?? DEFAULT_MULTIPLEXER;

  // Return cached adapter if it matches the configured type
  if (cachedAdapter && cachedAdapterType === type) {
    return cachedAdapter;
  }

  // Create and cache new adapter
  cachedAdapter = getMultiplexerAdapter(type);
  cachedAdapterType = type;
  return cachedAdapter;
}

/**
 * Get the configured multiplexer adapter synchronously.
 * Uses cached adapter if available, otherwise returns default (zellij).
 * Prefer getConfiguredMultiplexer() when possible.
 */
export function getMultiplexerSync(): MultiplexerAdapter {
  if (cachedAdapter) {
    return cachedAdapter;
  }
  // Fall back to default - this will be updated on first async call
  return getMultiplexerAdapter(DEFAULT_MULTIPLEXER);
}

/**
 * Clear the cached adapter (useful for testing)
 */
export function clearMultiplexerCache(): void {
  cachedAdapter = null;
  cachedAdapterType = null;
}

/**
 * Check if a multiplexer type is supported
 */
export function isMultiplexerSupported(type: string): type is MultiplexerType {
  return type in adapters;
}

/**
 * Get list of supported multiplexer types
 */
export function getSupportedMultiplexers(): MultiplexerType[] {
  return Object.keys(adapters) as MultiplexerType[];
}
