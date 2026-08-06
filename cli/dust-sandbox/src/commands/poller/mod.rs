mod config;
mod job;
mod stream;

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Context;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use tracing::{info, warn};

pub use config::{PollerConfig, TokenStore};
pub use job::{ClaimResponse, PollerJob};

use config::{DEFAULT_CONFIG_PATH, DEFAULT_INSTALLED_TOKEN_PATH, DEFAULT_STATE_PATH};

/// How long to wait before reconnecting after a failed connect. Front holds a connect open for a
/// minute and closes it cleanly, so a failure here means something is wrong rather than routine.
const RECONNECT_BACKOFF: Duration = Duration::from_secs(2);
const RECONNECT_BACKOFF_CAP: Duration = Duration::from_secs(30);

/// Give up and let the service manager restart us. A token that no longer authenticates is not
/// something reconnecting fixes: only a fresh install does.
const MAX_CONSECUTIVE_AUTH_FAILURES: u32 = 3;

const HTTP_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(clap::Args)]
pub struct PollerArgs {
    /// Where root installed the poller's settings.
    #[arg(long, default_value = DEFAULT_CONFIG_PATH)]
    config: PathBuf,
    /// Where root installed the poller's initial credential.
    #[arg(long, default_value = DEFAULT_INSTALLED_TOKEN_PATH)]
    token: PathBuf,
    /// Where the poller keeps the credential it was last handed.
    #[arg(long, default_value = DEFAULT_STATE_PATH)]
    state: PathBuf,
}

/// Receive Pod function work for this sandbox and run it locally.
///
/// Runs for the life of the sandbox. Front holds each connect open for about a minute and then
/// ends it, so the steady state is a reconnect loop rather than one long-lived stream, and every
/// reconnect is what hands the poller its next credential.
pub async fn cmd_poller(args: PollerArgs) -> anyhow::Result<()> {
    let config = Arc::new(PollerConfig::load(&args.config)?);
    let tokens = TokenStore::new(args.state, args.token);

    let client = reqwest::Client::builder()
        .timeout(HTTP_REQUEST_TIMEOUT)
        .build()
        .context("failed to build the poller HTTP client")?;

    let mut last_event_id: Option<String> = None;
    let mut consecutive_auth_failures = 0;
    let mut backoff = RECONNECT_BACKOFF;

    loop {
        let token = tokens.load()?;
        match stream::run_connect(&client, &config, &tokens, &token, last_event_id.clone()).await {
            Ok(resume_point) => {
                consecutive_auth_failures = 0;
                backoff = RECONNECT_BACKOFF;
                if resume_point.is_some() {
                    last_event_id = resume_point;
                }
            }
            Err(stream::ConnectError::Unauthorized) => {
                consecutive_auth_failures += 1;
                warn!(
                    consecutive_auth_failures,
                    "Pod function work channel refused the poller's credential"
                );
                if consecutive_auth_failures >= MAX_CONSECUTIVE_AUTH_FAILURES {
                    anyhow::bail!(
                        "the poller's credential was refused {MAX_CONSECUTIVE_AUTH_FAILURES} times"
                    );
                }
                tokio::time::sleep(backoff).await;
                backoff = (backoff * 2).min(RECONNECT_BACKOFF_CAP);
            }
            Err(stream::ConnectError::Transport(error)) => {
                info!(error = %error, "Pod function work channel dropped, reconnecting");
                tokio::time::sleep(backoff).await;
                backoff = (backoff * 2).min(RECONNECT_BACKOFF_CAP);
            }
        }
    }
}

/// Claim an invocation and run it if this pod won.
///
/// The claim is what hands over the job: nothing about the work travels on the channel, so a
/// doorbell for an invocation another runner already took simply comes back empty.
pub async fn handle_doorbell(
    client: &reqwest::Client,
    config: &PollerConfig,
    token: &str,
    invocation_id: &str,
) {
    let claim = match claim(client, config, token, invocation_id).await {
        Ok(claim) => claim,
        Err(error) => {
            warn!(
                invocation_id,
                error = %error,
                "Failed to claim a Pod function invocation"
            );
            return;
        }
    };

    let Some(job) = claim.job.filter(|_| claim.granted) else {
        return;
    };

    let envelope = job::run_job(&job).await;
    if let Err(error) = post_result(client, config, &job, envelope).await {
        // Nothing left to do: the invocation settles when the caller gives up waiting.
        warn!(
            invocation_id = %job.invocation_id,
            error = %error,
            "Failed to report a Pod function result"
        );
    }
}

async fn claim(
    client: &reqwest::Client,
    config: &PollerConfig,
    token: &str,
    invocation_id: &str,
) -> anyhow::Result<ClaimResponse> {
    let response = client
        .post(config.claim_url())
        .headers(bearer_headers(token)?)
        .json(&serde_json::json!({ "invocationId": invocation_id }))
        .send()
        .await
        .context("failed to claim the invocation")?;

    let status = response.status();
    if !status.is_success() {
        anyhow::bail!("claim returned {status}");
    }

    response
        .json::<ClaimResponse>()
        .await
        .context("invalid claim response")
}

async fn post_result(
    client: &reqwest::Client,
    config: &PollerConfig,
    job: &PollerJob,
    envelope: serde_json::Value,
) -> anyhow::Result<()> {
    // Authenticated with the job's own credential rather than the poller's: it is scoped to this
    // one invocation, so a poller cannot settle work it was not handed.
    let response = client
        .post(config.result_url())
        .headers(bearer_headers(&job.exec_token)?)
        .json(&serde_json::json!({ "function": job.slug, "result": envelope }))
        .send()
        .await
        .context("failed to post the result")?;

    let status = response.status();
    if !status.is_success() {
        anyhow::bail!("result callback returned {status}");
    }

    Ok(())
}

fn bearer_headers(token: &str) -> anyhow::Result<HeaderMap> {
    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {token}")).context("invalid token for header")?,
    );
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    Ok(headers)
}
