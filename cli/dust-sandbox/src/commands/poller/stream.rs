use std::sync::Arc;

use anyhow::Context;
use futures_util::StreamExt;
use serde::Deserialize;
use tracing::warn;

use super::config::{PollerConfig, TokenStore};
use super::handle_doorbell;

/// What front sends down the work channel.
///
/// A job event is a doorbell and nothing more: the work itself comes back from the claim, so the
/// channel never carries an invocation's credential or its caller's input.
#[derive(Debug, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all_fields = "camelCase")]
pub enum PollerEvent {
    #[serde(rename = "sandbox_function_poller_job")]
    Job { invocation_id: String },
    #[serde(rename = "sandbox_function_poller_token")]
    Token { token: String },
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct PollerStreamEvent {
    #[serde(rename = "eventId")]
    pub event_id: String,
    pub data: PollerEvent,
}

pub enum ConnectError {
    Unauthorized,
    Transport(anyhow::Error),
}

/// How many jobs this pod runs at once. The sandbox is a small VM and every run forks a runner
/// plus a bun process, so this is what keeps a burst of doorbells from taking the pod down.
const MAX_CONCURRENT_RUNS: usize = 4;

/// A frame this large means the stream is not carrying frames. Bounded so a channel that never
/// sends a newline cannot grow the buffer for the life of the pod.
const MAX_BUFFERED_FRAME_BYTES: usize = 1024 * 1024;

/// Read one `data:` frame from the channel.
///
/// Returns `None` for the frames the channel uses for flow control rather than content: the open
/// comment, and the sentinel front writes when a truncated history means the poller should
/// reconnect to drain the rest.
pub fn parse_sse_payload(line: &str) -> Option<anyhow::Result<PollerStreamEvent>> {
    let payload = line.strip_prefix("data:")?.trim();
    if payload.is_empty() || payload == "done" {
        return None;
    }

    Some(serde_json::from_str(payload).context("invalid poller stream event"))
}

/// Hold one connect open, acting on what arrives, and return where to resume.
pub async fn run_connect(
    // Two clients: the channel one has no total deadline so a connect can last its full minute,
    // the job one keeps the short deadline that a claim or a result callback should have.
    channel_client: &reqwest::Client,
    job_client: &reqwest::Client,
    config: &Arc<PollerConfig>,
    tokens: &TokenStore,
    token: &str,
    last_event_id: Option<String>,
) -> Result<Option<String>, ConnectError> {
    let mut request = channel_client
        .get(config.work_channel_url())
        .header("authorization", format!("Bearer {token}"))
        .header("accept", "text/event-stream");
    if let Some(ref resume_point) = last_event_id {
        request = request.query(&[("lastEventId", resume_point)]);
    }

    let response = request
        .send()
        .await
        .map_err(|error| ConnectError::Transport(error.into()))?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED
        || response.status() == reqwest::StatusCode::FORBIDDEN
    {
        return Err(ConnectError::Unauthorized);
    }
    if !response.status().is_success() {
        return Err(ConnectError::Transport(anyhow::anyhow!(
            "work channel returned {}",
            response.status()
        )));
    }

    let run_permits = Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT_RUNS));
    let mut resume_point = last_event_id;
    // The credential the claim endpoint will accept. Connecting is what revokes the one this
    // connect was opened with, so every claim has to use what front hands down on the stream, not
    // what got us here.
    let mut current_token = token.to_string();
    // Bytes, not a string: chunks arrive on arbitrary boundaries, and decoding each one on its own
    // would turn a multi-byte character split across two chunks into replacement characters, which
    // is a corrupted frame that only shows up as an unreadable event.
    let mut buffer: Vec<u8> = Vec::new();
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| ConnectError::Transport(error.into()))?;
        buffer.extend_from_slice(&chunk);
        if buffer.len() > MAX_BUFFERED_FRAME_BYTES {
            return Err(ConnectError::Transport(anyhow::anyhow!(
                "work channel sent {} bytes without a frame boundary",
                buffer.len()
            )));
        }

        while let Some(newline) = buffer.iter().position(|byte| *byte == b'\n') {
            let line_bytes: Vec<u8> = buffer.drain(..=newline).collect();
            let Ok(line) = String::from_utf8(line_bytes) else {
                warn!("Skipping a Pod function channel frame that was not valid UTF-8");
                continue;
            };
            let Some(parsed) = parse_sse_payload(&line) else {
                continue;
            };
            let event = match parsed {
                Ok(event) => event,
                Err(error) => {
                    // A frame this poller cannot read must not end the connect: a newer front may
                    // be sending something this build predates.
                    warn!(error = %error, "Skipping an unreadable Pod function channel event");
                    continue;
                }
            };

            match event.data {
                PollerEvent::Token { token: rotated } => {
                    // Persisted before anything else is done with this connect: connecting is what
                    // revoked the token used to connect, so losing this one locks the poller out
                    // until the next wake.
                    if let Err(error) = tokens.store(&rotated) {
                        return Err(ConnectError::Transport(error));
                    }
                    current_token = rotated;
                }
                PollerEvent::Job { invocation_id } => {
                    // Only a doorbell moves the resume point. The token event carries the id this
                    // connect started from, and treating it as progress would rewind the poller.
                    if !event.event_id.is_empty() {
                        resume_point = Some(event.event_id.clone());
                    }
                    // Not awaited: a slow job must not stop the channel from delivering the next
                    // doorbell, and each one settles itself.
                    let client = job_client.clone();
                    let config = Arc::clone(config);
                    let token = current_token.clone();
                    let permits = Arc::clone(&run_permits);
                    tokio::spawn(async move {
                        // Bounded because the pod is a small VM and each run forks a runner and a
                        // bun process. The exec path was implicitly capped by the exec API; without
                        // this the channel replaces that with nothing. A doorbell that waits here
                        // long enough loses its claim to front, which is the fallback working.
                        let Ok(_permit) = permits.acquire().await else {
                            return;
                        };
                        handle_doorbell(&client, &config, &token, &invocation_id).await;
                    });
                }
            }
        }
    }

    Ok(resume_point)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_job_doorbell() {
        let event = parse_sse_payload(
            r#"data: {"eventId":"5-0","data":{"type":"sandbox_function_poller_job","created":1,"invocationId":"sfi_1"}}"#,
        )
        .expect("frame")
        .expect("event");

        assert_eq!(event.event_id, "5-0");
        assert_eq!(
            event.data,
            PollerEvent::Job {
                invocation_id: "sfi_1".to_string()
            }
        );
    }

    #[test]
    fn reads_a_rotated_token() {
        let event = parse_sse_payload(
            r#"data: {"eventId":"","data":{"type":"sandbox_function_poller_token","created":1,"token":"sbt-next"}}"#,
        )
        .expect("frame")
        .expect("event");

        assert_eq!(
            event.data,
            PollerEvent::Token {
                token: "sbt-next".to_string()
            }
        );
    }

    #[test]
    fn ignores_the_frames_that_carry_no_event() {
        assert!(parse_sse_payload(": connected\n").is_none());
        assert!(parse_sse_payload("data: done\n").is_none());
        assert!(parse_sse_payload("\n").is_none());
    }

    #[test]
    fn reports_an_unreadable_frame_without_discarding_the_connect() {
        assert!(parse_sse_payload("data: {not json}\n")
            .expect("frame")
            .is_err());
    }

    #[test]
    fn reads_a_frame_split_across_chunk_boundaries() {
        // Chunks arrive on byte boundaries, so a frame is only readable once its newline has
        // arrived. Decoding a partial chunk on its own would corrupt any multi-byte character it
        // was cut through, and the frame would be dropped as unreadable.
        let frame = r#"data: {"eventId":"5-0","data":{"type":"sandbox_function_poller_job","created":1,"invocationId":"caf\u00e9"}}"#;
        let bytes = format!("{frame}\n").into_bytes();
        let mut buffer: Vec<u8> = Vec::new();

        let mut events = Vec::new();
        for chunk in bytes.chunks(7) {
            buffer.extend_from_slice(chunk);
            while let Some(newline) = buffer.iter().position(|byte| *byte == b'\n') {
                let line_bytes: Vec<u8> = buffer.drain(..=newline).collect();
                let line = String::from_utf8(line_bytes).expect("utf8");
                if let Some(parsed) = parse_sse_payload(&line) {
                    events.push(parsed.expect("event"));
                }
            }
        }

        assert_eq!(events.len(), 1);
        assert_eq!(
            events[0].data,
            PollerEvent::Job {
                invocation_id: "caf\u{e9}".to_string()
            }
        );
    }
}
