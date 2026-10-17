use std::path::Path;

use crate::api::{DustApiClient, FramePublishMode};

use super::{print_response, scoped_path};

pub async fn run(source: &Path, replaces: Option<&Path>, draft: bool) -> anyhow::Result<()> {
    let source_path = scoped_path(source)?;
    let replaces_path = replaces.map(scoped_path).transpose()?;
    let client = DustApiClient::from_env()?;
    let response = client
        .publish_frame(
            &source_path,
            replaces_path.as_deref(),
            draft.then_some(FramePublishMode::Draft),
        )
        .await?;
    print_response(&response)
}
