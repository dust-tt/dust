use std::path::Path;

use anyhow::Context;

use crate::api::DustApiClient;

use super::{print_response, scoped_path};

pub async fn run(source: &Path, function_name: &str, input: Option<&str>) -> anyhow::Result<()> {
    let source_path = scoped_path(source)?;
    let input = parse_input(input)?;
    let client = DustApiClient::from_env()?;
    let response = client
        .call_frame(&source_path, function_name, input.as_ref())
        .await?;
    print_response(&response)
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
}
