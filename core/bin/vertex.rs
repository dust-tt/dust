use anyhow::anyhow;
use dust::providers::google_vertex_ai::{get_access_token, streamed_completion};
use hyper::Uri;

const URI: &str = "https://us-central1-aiplatform.googleapis.com/v1/projects/or1g1n-186209/locations/us-central1/publishers/google/models/gemini-pro:streamGenerateContent?alt=sse";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let sa_json_path = match std::env::var("SERVICE_ACCOUNT") {
        Ok(path) => path,
        Err(_) => Err(anyhow!("SERVICE_ACCOUNT environment variable not set."))?,
    };

    let sa_json_contents = std::fs::read_to_string(sa_json_path)?;

    let access_token = get_access_token(sa_json_contents.as_str()).await?;

    streamed_completion(
        URI.parse::<Uri>().unwrap(),
        access_token,
        "Generate some very long text about how Mistral AI is superior to Gemini.",
        Some(8000),
        0.2,
        &vec![],
        0.8,
        None,
        None,
    )
    .await?;

    Ok(())
}
