/**
 * Server-side phase breakdown for `POST .../sandbox/actions/call` on the
 * sandbox-function path. Additive diagnostics: clients ignore unknown fields.
 */
export type SandboxFunctionMcpActionRunTimingsMs = {
  auth: number;
  fetchAction: number;
  fetchInvocation: number;
  resolvePod: number;
  /** `runToolWithStreaming` wall time (connect + call + result processing). */
  streaming: number;
  /** MCP connect, when recorded inside the streaming phase. */
  mcpConnect?: number;
  /** MCP `callTool` (includes tool handler), when recorded. */
  mcpCall?: number;
  /** Content-block processing before action-output persist. */
  processBlocks?: number;
  /** Action output persist (`createOutputItems` GCS write for sandbox tools). */
  persistOutput?: number;
  pauseEvents?: number;
  markSucceeded?: number;
  total: number;
};

export type SandboxFunctionMcpActionServerTimingsMs = {
  fetchView: number;
  resolveTool: number;
  fetchFunction: number;
  fetchInvocation: number;
  stakeStatus: number;
  createAction: number;
  /** Temporal tool-workflow launch. */
  runOrLaunch: number;
  /** Present when the Temporal activity recorded phase timings. */
  run?: SandboxFunctionMcpActionRunTimingsMs;
  total: number;
};

export function roundMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

/**
 * Optional bag so MCP / result-processing phases can stamp timings without
 * threading them through ToolContext / CallToolResult.
 */
type McpPhaseTimingsBag = {
  connect?: number;
  call?: number;
  /** `processToolResults` excluding the final action-output persist. */
  processBlocks?: number;
  /** Sandbox action `createOutputItems` (GCS write) or agent output rows. */
  persistOutput?: number;
  pauseEvents?: number;
  markSucceeded?: number;
};

let activeMcpPhaseTimings: McpPhaseTimingsBag | null = null;

export async function withMcpPhaseTimings<T>(
  fn: () => Promise<T>
): Promise<{ result: T; mcp: McpPhaseTimingsBag }> {
  const bag: McpPhaseTimingsBag = {};
  const previous = activeMcpPhaseTimings;
  activeMcpPhaseTimings = bag;
  try {
    const result = await fn();
    return { result, mcp: bag };
  } finally {
    activeMcpPhaseTimings = previous;
  }
}

export function recordMcpConnectMs(ms: number): void {
  if (activeMcpPhaseTimings) {
    activeMcpPhaseTimings.connect = ms;
  }
}

export function recordMcpCallMs(ms: number): void {
  if (activeMcpPhaseTimings) {
    activeMcpPhaseTimings.call = ms;
  }
}

export function recordMcpProcessBlocksMs(ms: number): void {
  if (activeMcpPhaseTimings) {
    activeMcpPhaseTimings.processBlocks = ms;
  }
}

export function recordMcpPersistOutputMs(ms: number): void {
  if (activeMcpPhaseTimings) {
    activeMcpPhaseTimings.persistOutput = ms;
  }
}

export function recordMcpPauseEventsMs(ms: number): void {
  if (activeMcpPhaseTimings) {
    activeMcpPhaseTimings.pauseEvents = ms;
  }
}

export function recordMcpMarkSucceededMs(ms: number): void {
  if (activeMcpPhaseTimings) {
    activeMcpPhaseTimings.markSucceeded = ms;
  }
}
