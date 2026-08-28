use std::path::Path;

use crate::api::DustApiClient;

use super::{print_response, scoped_path, FrameShareScope};

pub async fn run(
    directory: &Path,
    scope: FrameShareScope,
    emails: &[String],
) -> anyhow::Result<()> {
    let source_directory_path = scoped_path(directory)?;
    let client = DustApiClient::from_env()?;
    let response = client
        .share_frame(&source_directory_path, scope.as_api_value(), emails)
        .await?;
    print_response(&response)
}
