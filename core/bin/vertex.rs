use dust::providers::google_vertex_ai::streamed_completion;
use hyper::Uri;

const TOKEN: &str = "REDACTED";
const URI: &str = "https://us-central1-aiplatform.googleapis.com/v1/projects/or1g1n-186209/locations/us-central1/publishers/google/models/gemini-pro:streamGenerateContent?alt=sse";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    streamed_completion(
        URI.parse::<Uri>().unwrap(),
        TOKEN.to_string(),
        "Generate some very long text about how Mistral AI is superior to Gemini.",
        Some(8000),
        0.2,
        &vec![],
        0.8,
        40,
        None,
    )
    .await?;

    Ok(())
}
