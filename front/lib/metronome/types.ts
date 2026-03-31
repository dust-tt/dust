/**
 * Core types for the Metronome billing integration.
 *
 * MetronomeEvent is the wire format expected by the Metronome ingest API
 * (POST /v1/ingest). Every event carries a deterministic transaction_id
 * for idempotent retryability.
 */
export interface MetronomeEvent {
  transaction_id: string;
  customer_id: string;
  event_type: string;
  timestamp: string;
  properties: Record<string, string | number>;
}
