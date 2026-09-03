use std::path::Path;

use crate::api::DustApiClient;

use super::{print_response, scoped_new_path, scoped_path};

pub async fn run(source: &Path, destination: &Path) -> anyhow::Result<()> {
    let source_directory_path = scoped_path(source)?;
    let destination_directory_path = scoped_new_path(destination)?;
    let client = DustApiClient::from_env()?;
    let response = client
        .move_frame(&source_directory_path, &destination_directory_path)
        .await?;
    print_response(&response)
}
