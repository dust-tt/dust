export type PokeLangfuseObservation = {
  costDetails: Record<string, number>;
  endTime: string | null;
  id: string;
  input?: unknown;
  latencySeconds: number | null;
  level: string;
  metadata?: unknown;
  model: string | null;
  name: string | null;
  output?: unknown;
  startTime: string;
  statusMessage: string | null;
  timeToFirstTokenSeconds: number | null;
  type: string;
  usageDetails: Record<string, number>;
};

export type PokeLangfuseTrace = {
  id: string;
  input?: unknown;
  latencySeconds: number | null;
  metadata?: unknown;
  name: string | null;
  observations: PokeLangfuseObservation[];
  output?: unknown;
  tags: string[];
  timestamp: string;
  totalCostUsd: number | null;
};

export type GetPokeLLMTraceResponseBody<TTrace = unknown> = {
  langfuseError: string | null;
  langfuseTrace: PokeLangfuseTrace | null;
  trace: TTrace | null;
};
