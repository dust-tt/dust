use serde::{Deserialize, Serialize};

pub const RESULT_PROTOCOL_VERSION: u32 = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq, clap::ValueEnum, Serialize, Deserialize)]
#[value(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ResultDelivery {
    Callback,
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

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TimingsMs {
    pub total: u64,
    pub runner: u64,
    /// Additive: absent on envelopes from older dsbx versions, and front
    /// treats timingsMs as opaque, so this cannot break the wire contract.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runner_kind: Option<RunnerKind>,
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
        Self::stdout_outcome(
            serde_json::json!({
                "ok": false,
                "error": {
                    "code": "invocation_failed",
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
            }),
        );

        let json = serde_json::to_value(&envelope).expect("ResultEnvelope serializes to JSON");
        assert_eq!(
            json,
            serde_json::json!({
                "protocolVersion": 3,
                "delivery": "stdout",
                "outcome": { "ok": true, "output": { "hello": "world" } },
                "timingsMs": { "total": 12, "runner": 8, "runnerKind": "warm" },
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
