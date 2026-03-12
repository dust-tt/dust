use anyhow::bail;

use crate::api::DustApiClient;

pub async fn cmd_exec(
    client: &DustApiClient,
    server_name: &str,
    tool_name: &str,
    raw_args: &[String],
) -> anyhow::Result<()> {
    let views = client.list_tools(Some(server_name), false).await?;

    let view = match views.first() {
        Some(v) => v,
        None => bail!("server '{server_name}' not found"),
    };

    // Validate the tool exists on this server.
    let tool = view.server.tools.iter().find(|t| t.name == tool_name);

    if tool.is_none() {
        let available: Vec<&str> = view.server.tools.iter().map(|t| t.name.as_str()).collect();
        bail!(
            "tool '{tool_name}' not found on server '{server_name}'. Available tools: {}",
            available.join(", ")
        );
    }

    let arguments = parse_args(raw_args)?;

    let resp = client
        .call_tool(&view.space_id, &view.s_id, tool_name, arguments)
        .await?;

    for block in &resp.result.content {
        if let Some(text) = &block.text {
            println!("{text}");
        }
    }

    if resp.result.is_error {
        std::process::exit(1);
    }

    Ok(())
}

/// Parse `--key value` pairs into a JSON object.
/// Auto-detects numbers, booleans, JSON objects/arrays, and falls back to string.
fn parse_args(raw: &[String]) -> anyhow::Result<Option<serde_json::Value>> {
    if raw.is_empty() {
        return Ok(Some(serde_json::Value::Object(serde_json::Map::new())));
    }

    let mut map = serde_json::Map::new();
    let mut i = 0;

    while i < raw.len() {
        let arg = &raw[i];
        if !arg.starts_with("--") {
            bail!("expected --key, got '{arg}'");
        }
        let key = arg.trim_start_matches('-').to_string();
        if key.is_empty() {
            bail!("empty key in '{arg}'");
        }

        i += 1;
        if i >= raw.len() {
            // Flag without value, treat as true.
            map.insert(key, serde_json::Value::Bool(true));
            continue;
        }

        let val = &raw[i];
        // If next token looks like another flag, treat current as boolean true.
        if val.starts_with("--") {
            map.insert(key, serde_json::Value::Bool(true));
            continue;
        }

        map.insert(key, coerce_value(val));
        i += 1;
    }

    Ok(Some(serde_json::Value::Object(map)))
}

fn coerce_value(s: &str) -> serde_json::Value {
    // Booleans
    if s == "true" {
        return serde_json::Value::Bool(true);
    }
    if s == "false" {
        return serde_json::Value::Bool(false);
    }
    // Numbers (integer or float)
    if let Ok(n) = s.parse::<i64>() {
        return serde_json::Value::Number(n.into());
    }
    if let Ok(n) = s.parse::<f64>() {
        if let Some(num) = serde_json::Number::from_f64(n) {
            return serde_json::Value::Number(num);
        }
    }
    // JSON object or array
    if (s.starts_with('{') && s.ends_with('}')) || (s.starts_with('[') && s.ends_with(']')) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(s) {
            return v;
        }
    }
    // Fallback: string
    serde_json::Value::String(s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_empty_args() {
        let result = parse_args(&[])
            .expect("should parse empty")
            .expect("should have value");
        assert_eq!(result, serde_json::Value::Object(serde_json::Map::new()));
    }

    #[test]
    fn parse_string_args() {
        let args = vec![
            "--name".to_string(),
            "hello".to_string(),
            "--city".to_string(),
            "paris".to_string(),
        ];
        let result = parse_args(&args)
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["name"], "hello");
        assert_eq!(result["city"], "paris");
    }

    #[test]
    fn parse_number_args() {
        let args = vec!["--count".to_string(), "42".to_string()];
        let result = parse_args(&args)
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["count"], 42);
    }

    #[test]
    fn parse_bool_args() {
        let args = vec!["--verbose".to_string(), "true".to_string()];
        let result = parse_args(&args)
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["verbose"], true);
    }

    #[test]
    fn parse_flag_without_value() {
        let args = vec!["--dry-run".to_string()];
        let result = parse_args(&args)
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["dry-run"], true);
    }

    #[test]
    fn parse_json_value() {
        let args = vec!["--filter".to_string(), r#"{"status":"active"}"#.to_string()];
        let result = parse_args(&args)
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["filter"]["status"], "active");
    }

    #[test]
    fn parse_float_args() {
        let args = vec!["--ratio".to_string(), "3.14".to_string()];
        let result = parse_args(&args)
            .expect("should parse")
            .expect("should have value");
        let ratio = result["ratio"].as_f64().expect("should be f64");
        assert!((ratio - 3.14).abs() < f64::EPSILON);
    }

    #[test]
    fn parse_consecutive_flags() {
        let args = vec![
            "--verbose".to_string(),
            "--debug".to_string(),
            "--name".to_string(),
            "foo".to_string(),
        ];
        let result = parse_args(&args)
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["verbose"], true);
        assert_eq!(result["debug"], true);
        assert_eq!(result["name"], "foo");
    }

    #[test]
    fn parse_missing_dashes_errors() {
        let args = vec!["name".to_string(), "hello".to_string()];
        assert!(parse_args(&args).is_err());
    }
}
