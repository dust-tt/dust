use std::path::Path;

use crate::api::DustApiClient;

use super::{print_response, scoped_path};

pub async fn run(source: &Path) -> anyhow::Result<()> {
    let source_path = scoped_path(source)?;
    let client = DustApiClient::from_env()?;
    let response = client.publish_frame(&source_path).await?;
    print_response(&response)
}
