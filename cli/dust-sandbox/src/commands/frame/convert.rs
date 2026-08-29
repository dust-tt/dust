use std::path::Path;

use crate::api::DustApiClient;

use super::{print_response, scoped_manifest_path, scoped_path};

pub async fn run(source: &Path, manifest: &Path) -> anyhow::Result<()> {
    let source_path = scoped_path(source)?;
    let manifest_path = scoped_manifest_path(manifest)?;
    let client = DustApiClient::from_env()?;
    let response = client.convert_frame(&source_path, &manifest_path).await?;
    print_response(&response)
}
