use anyhow::{anyhow, Result};

use super::{emit_error, spawn_function};
use crate::api::DustApiClient;

const SANDBOX_TOKEN_ENV: &str = "DUST_SANDBOX_TOKEN";
const RESULT_TRANSPORT_ENV: &str = "DUST_SANDBOX_FUNCTION_RESULT_TRANSPORT";
const STDOUT_RESULT_TRANSPORT: &str = "stdout";

fn should_return_result_via_stdout(have_token: bool, configured_transport: Option<&str>) -> bool {
    !have_token || configured_transport == Some(STDOUT_RESULT_TRANSPORT)
}

/// Execute a function and deliver its response.
///
/// The request envelope is read from stdin and the function runs unprivileged
/// (agent uid) when dsbx is invoked as root. New callers request the response
/// on stdout. The result API remains the default for older front deployments.
pub async fn cmd_function_run(name: &str) -> Result<()> {
    let (code, captured) = spawn_function("run", name, true, true).await?;
    let response = captured.unwrap_or_default();

    let have_token = std::env::var(SANDBOX_TOKEN_ENV)
        .map(|t| !t.is_empty())
        .unwrap_or(false);
    let configured_transport = std::env::var(RESULT_TRANSPORT_ENV).ok();

    if should_return_result_via_stdout(have_token, configured_transport.as_deref()) {
        print!("{response}");
        std::process::exit(code);
    }

    // Sandbox: deliver the response to the Dust result API instead of stdout.
    if response.trim().is_empty() {
        return Err(emit_error(anyhow!(
            "function produced no output to deliver to the result API"
        )));
    }
    // The runner always emits a single JSON line; forward it as structured JSON
    // (fall back to a string if it somehow isn't valid JSON).
    let result: serde_json::Value = serde_json::from_str(response.trim())
        .unwrap_or_else(|_| serde_json::Value::String(response.clone()));

    let client = DustApiClient::from_env()?;
    client
        .post_function_result(name, &result)
        .await
        .map_err(emit_error)?;
    std::process::exit(0);
}

#[cfg(test)]
mod tests {
    use super::should_return_result_via_stdout;

    #[test]
    fn returns_results_on_stdout_for_local_calls() {
        assert!(should_return_result_via_stdout(false, None));
    }

    #[test]
    fn returns_results_on_stdout_when_front_requests_it() {
        assert!(should_return_result_via_stdout(true, Some("stdout")));
    }

    #[test]
    fn preserves_the_callback_for_older_front_deployments() {
        assert!(!should_return_result_via_stdout(true, None));
    }
}
