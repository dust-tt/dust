use serde::{Deserialize, Serialize};

pub const RESULT_PROTOCOL_VERSION: u32 = 3;

/// How a function result reaches Dust. Stdout is the only mode: the worker that
/// started the command reads a protocol v3 envelope off the exec's own stdout.
/// Kept as an enum because it is also the envelope's `delivery` wire field.
#[derive(Debug, Clone, Copy, PartialEq, Eq, clap::ValueEnum, Serialize, Deserialize)]
#[value(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ResultDelivery {
    Stdout,
}

// Mirrors ResultEnvelopeV3Schema in front/lib/api/sandbox_functions/result_envelope.ts.
#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ResultEnvelope {
    pub protocol_version: u32,
    pub delivery: ResultDelivery,
    pub outcome: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timings_ms: Option<TimingsMs>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum RunnerKind {
    /// Served by a resident warm server over its unix socket.
    Warm,
    /// Fresh runner process spawn, today's default behavior.
    Cold,
}

/// Whether a warm worker served the invocation from a bundle it had already
/// imported, or paid the import on this request. Observability for the
/// pool's affinity routing: a high `fresh` share means functions keep
/// landing on workers that do not hold their bundle.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ImportKind {
    Cached,
    Fresh,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TimingsMs {
    pub total: u64,
    pub runner: u64,
    /// Additive: absent on envelopes from older dsbx versions, and front
    /// treats timingsMs as opaque, so this cannot break the wire contract.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runner_kind: Option<RunnerKind>,
    /// Additive, warm runs only: see [`ImportKind`].
    #[serde(skip_serializing_if = "Option::is_none")]
    pub import_kind: Option<ImportKind>,
}

impl ResultEnvelope {
    pub fn stdout_outcome(outcome: serde_json::Value, timings_ms: Option<TimingsMs>) -> Self {
        Self {
            protocol_version: RESULT_PROTOCOL_VERSION,
            delivery: ResultDelivery::Stdout,
            outcome,
            timings_ms,
        }
    }

    pub fn stdout_invocation_failed(message: impl Into<String>) -> Self {
        Self::stdout_error("invocation_failed", message)
    }

    pub fn stdout_error(code: &str, message: impl Into<String>) -> Self {
        Self::stdout_outcome(
            serde_json::json!({
                "ok": false,
                "error": {
                    "code": code,
                    "message": message.into(),
                }
            }),
            None,
        )
    }

    pub fn write_to_stdout(&self) {
        println!(
            "{}",
            serde_json::to_string(self).expect("ResultEnvelope serializes")
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_the_pinned_v3_shape() {
        let envelope = ResultEnvelope::stdout_outcome(
            serde_json::json!({ "ok": true, "output": { "hello": "world" } }),
            Some(TimingsMs {
                total: 12,
                runner: 8,
                runner_kind: Some(RunnerKind::Warm),
                import_kind: Some(ImportKind::Cached),
            }),
        );

        let json = serde_json::to_value(&envelope).expect("ResultEnvelope serializes to JSON");
        assert_eq!(
            json,
            serde_json::json!({
                "protocolVersion": 3,
                "delivery": "stdout",
                "outcome": { "ok": true, "output": { "hello": "world" } },
                "timingsMs": { "total": 12, "runner": 8, "runnerKind": "warm", "importKind": "cached" },
            })
        );
    }

    #[test]
    fn serializes_invocation_failed_without_timings() {
        let envelope = ResultEnvelope::stdout_invocation_failed("boom");
        let json = serde_json::to_value(&envelope).expect("ResultEnvelope serializes to JSON");
        assert_eq!(
            json,
            serde_json::json!({
                "protocolVersion": 3,
                "delivery": "stdout",
                "outcome": {
                    "ok": false,
                    "error": {
                        "code": "invocation_failed",
                        "message": "boom",
                    }
                },
            })
        );
    }
}
