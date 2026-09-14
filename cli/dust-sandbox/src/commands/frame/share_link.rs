use std::path::Path;

use crate::api::DustApiClient;

use super::{print_response, scoped_path};

pub async fn run(directory: &Path) -> anyhow::Result<()> {
    let source_directory_path = scoped_path(directory)?;
    let client = DustApiClient::from_env()?;
    let response = client.get_frame_share_link(&source_directory_path).await?;
    print_response(&response)
}
