use crate::api::DustApiClient;

use super::{print_response, validate_frame_id};

pub async fn run(frame_id: &str, publication_id: &str) -> anyhow::Result<()> {
    validate_frame_id(frame_id)?;
    let client = DustApiClient::from_env()?;
    let response = client.make_live_frame(frame_id, publication_id).await?;
    print_response(&response)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn rejects_an_invalid_frame_id_before_any_http_call() {
        let error = run("bad/path", "pub-1")
            .await
            .expect_err("a non-fil_ Frame ID must be rejected");
        assert_eq!(error.to_string(), "invalid Frame ID: bad/path");
    }
}
