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
    client: &reqwest::Client,
    config: &Arc<PollerConfig>,
    tokens: &TokenStore,
    token: &str,
    last_event_id: Option<String>,
) -> Result<Option<String>, ConnectError> {
    let mut request = client
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

    let mut resume_point = last_event_id;
    let mut buffer = String::new();
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| ConnectError::Transport(error.into()))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(newline) = buffer.find('\n') {
            let line: String = buffer.drain(..=newline).collect();
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
                }
                PollerEvent::Job { invocation_id } => {
                    if !event.event_id.is_empty() {
                        resume_point = Some(event.event_id.clone());
                    }
                    // Not awaited: a slow job must not stop the channel from delivering the next
                    // doorbell, and each one settles itself.
                    let client = client.clone();
                    let config = Arc::clone(config);
                    let token = token.to_string();
                    tokio::spawn(async move {
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
}
