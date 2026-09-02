use std::path::Path;

use anyhow::{bail, Context};

use crate::api::DustApiClient;

use super::{print_response, scoped_path};

pub async fn run(target: &str, function_name: &str, input: Option<&str>) -> anyhow::Result<()> {
    let input = parse_input(input)?;
    let client = DustApiClient::from_env()?;
    let response = if target.starts_with("fil_") {
        validate_frame_id(target)?;
        client
            .call_frame_by_id(target, function_name, input.as_ref())
            .await?
    } else {
        let source_path = scoped_path(Path::new(target))?;
        client
            .call_frame_from_source(&source_path, function_name, input.as_ref())
            .await?
    };
    print_response(&response)
}

fn validate_frame_id(frame_id: &str) -> anyhow::Result<()> {
    let Some(encoded) = frame_id.strip_prefix("fil_") else {
        bail!("invalid Frame ID: {frame_id}");
    };
    if encoded.is_empty()
        || !encoded
            .chars()
            .all(|character| character.is_ascii_alphanumeric())
    {
        bail!("invalid Frame ID: {frame_id}");
    }
    Ok(())
}

fn parse_input(input: Option<&str>) -> anyhow::Result<Option<serde_json::Value>> {
    input
        .map(serde_json::from_str)
        .transpose()
        .context("input must be valid JSON")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_optional_json_input() {
        let input = parse_input(Some(r#"{"message":"hello"}"#))
            .expect("valid JSON input")
            .expect("present input");
        assert_eq!(input["message"], "hello");
        assert_eq!(parse_input(None).expect("absent input"), None);
        assert!(parse_input(Some("{")).is_err());
    }

    #[test]
    fn validates_frame_ids() {
        assert!(validate_frame_id("fil_abc123XYZ").is_ok());
        assert!(validate_frame_id("fil_bad/path").is_err());
        assert!(validate_frame_id("fil_").is_err());
    }
}
