use anyhow::{bail, Context};

use crate::api::{parse_content_block, ContentBlock, DustApiClient};

const MAX_FILE_ARG_SIZE_BYTES: u64 = 100 * 1024 * 1024;

pub async fn cmd_exec(
    client: &DustApiClient,
    server_name: &str,
    tool_name: &str,
    raw_args: &[String],
    json: bool,
) -> anyhow::Result<()> {
    let views = client.list_tools(Some(server_name), false).await?;

    let view = match views.first() {
        Some(v) => v,
        None => bail!("server '{server_name}' not found"),
    };

    // Validate the tool exists on this server.
    let tool = match view.server.tools.iter().find(|t| t.name == tool_name) {
        Some(t) => t,
        None => {
            let available: Vec<&str> = view.server.tools.iter().map(|t| t.name.as_str()).collect();
            bail!(
                "tool '{tool_name}' not found on server '{server_name}'. Available tools: {}",
                available.join(", ")
            );
        }
    };

    let arguments = parse_args(raw_args, tool.input_schema.as_ref())?;

    let resp = client.call_tool(&view.s_id, tool_name, arguments).await?;

    if json {
        println!("{}", serde_json::to_string_pretty(&resp.result)?);
    } else {
        // All content blocks (text and sentinel markers) go to stdout so a
        // caller capturing stdout sees the full tool output. stderr is
        // reserved for ambient diagnostics.
        for value in &resp.result.content {
            match parse_content_block(value) {
                ContentBlock::Text { text } => {
                    println!("{text}");
                }
                ContentBlock::Image { mime_type, .. } => {
                    println!("[image: {mime_type}]");
                }
                ContentBlock::Audio { mime_type, .. } => {
                    println!("[audio: {mime_type}]");
                }
                ContentBlock::Resource { resource } => {
                    if let Some(text) = &resource.text {
                        println!("{text}");
                    } else if resource.blob.is_some() {
                        println!("[binary resource: {}]", resource.uri);
                    } else {
                        println!("[resource: {}]", resource.uri);
                    }
                }
                ContentBlock::ResourceLink { uri, name } => {
                    if let Some(name) = name {
                        println!("[resource link: {name} - {uri}]");
                    } else {
                        println!("[resource link: {uri}]");
                    }
                }
                ContentBlock::Unknown => {}
            }
        }
    }

    if resp.result.is_error {
        std::process::exit(1);
    }

    Ok(())
}

/// Parse `--key value` pairs into a JSON object.
/// Uses the tool's JSON Schema (`schema`) to coerce each value to the declared
/// type when available; falls back to heuristic detection otherwise.
///
/// A value prefixed with `__file__:` reads the file at that path (UTF-8, capped
/// at 100 MB), letting agents pass values larger than the OS argv limit
/// (ARG_MAX). JSON object/array contents are parsed; other content is a string.
fn parse_args(
    raw: &[String],
    schema: Option<&serde_json::Value>,
) -> anyhow::Result<Option<serde_json::Value>> {
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

        let ty = property_type(schema, &key);
        map.insert(key, coerce_value_or_read_file(val, ty)?);
        i += 1;
    }

    Ok(Some(serde_json::Value::Object(map)))
}

/// Returns the declared JSON Schema `type` string for `key` in a tool's
/// `input_schema`, or `None` when the schema is absent or the key is not found.
fn property_type<'a>(schema: Option<&'a serde_json::Value>, key: &str) -> Option<&'a str> {
    schema?.get("properties")?.get(key)?.get("type")?.as_str()
}

fn coerce_value_or_read_file(s: &str, ty: Option<&str>) -> anyhow::Result<serde_json::Value> {
    if let Some(path) = s.strip_prefix("__file__:") {
        let contents = read_file_arg(path)?;
        // JSON object/array contents are parsed (like inline values); anything
        // else is a string. Malformed JSON-shaped content errors rather than
        // silently degrading, since the file isn't visible on the command line.
        // Exception: when the schema declares "string", never attempt JSON parsing.
        let trimmed = contents.trim();
        if ty != Some("string") && looks_like_json_object_or_array(trimmed) {
            return serde_json::from_str::<serde_json::Value>(trimmed)
                .with_context(|| format!("__file__:{path} looks like JSON but failed to parse"));
        }
        return Ok(serde_json::Value::String(contents));
    }
    Ok(coerce_value(s, ty))
}

fn read_file_arg(path: &str) -> anyhow::Result<String> {
    if path.is_empty() {
        bail!("__file__: prefix requires a path");
    }
    let metadata =
        std::fs::metadata(path).with_context(|| format!("failed to stat __file__:{path}"))?;
    if metadata.len() > MAX_FILE_ARG_SIZE_BYTES {
        bail!(
            "__file__:{path} is {} bytes; exceeds the {MAX_FILE_ARG_SIZE_BYTES}-byte limit",
            metadata.len()
        );
    }
    std::fs::read_to_string(path)
        .with_context(|| format!("failed to read __file__:{path} (must be UTF-8)"))
}

fn coerce_value(s: &str, ty: Option<&str>) -> serde_json::Value {
    match ty {
        Some("string") => serde_json::Value::String(s.to_string()),
        Some("boolean") => {
            if s == "true" {
                serde_json::Value::Bool(true)
            } else if s == "false" {
                serde_json::Value::Bool(false)
            } else {
                serde_json::Value::String(s.to_string())
            }
        }
        Some("integer") => s
            .parse::<i64>()
            .map(|n| serde_json::Value::Number(n.into()))
            .unwrap_or_else(|_| serde_json::Value::String(s.to_string())),
        Some("number") => {
            if let Ok(n) = s.parse::<f64>() {
                if let Some(num) = serde_json::Number::from_f64(n) {
                    return serde_json::Value::Number(num);
                }
            }
            serde_json::Value::String(s.to_string())
        }
        Some("object") | Some("array") => {
            let trimmed = s.trim();
            serde_json::from_str::<serde_json::Value>(trimmed)
                .unwrap_or_else(|_| serde_json::Value::String(s.to_string()))
        }
        // No schema hint: heuristic detection (booleans → numbers → JSON → string).
        _ => {
            if s == "true" {
                return serde_json::Value::Bool(true);
            }
            if s == "false" {
                return serde_json::Value::Bool(false);
            }
            if let Ok(n) = s.parse::<i64>() {
                return serde_json::Value::Number(n.into());
            }
            if let Ok(n) = s.parse::<f64>() {
                if let Some(num) = serde_json::Number::from_f64(n) {
                    return serde_json::Value::Number(num);
                }
            }
            let trimmed = s.trim();
            if looks_like_json_object_or_array(trimmed) {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    return v;
                }
            }
            serde_json::Value::String(s.to_string())
        }
    }
}

/// Shape check only (delimited by `{}`/`[]`); the content may still be invalid
/// JSON. Expects an already-trimmed string.
fn looks_like_json_object_or_array(trimmed: &str) -> bool {
    (trimmed.starts_with('{') && trimmed.ends_with('}'))
        || (trimmed.starts_with('[') && trimmed.ends_with(']'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_empty_args() {
        let result = parse_args(&[], None)
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
        let result = parse_args(&args, None)
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["name"], "hello");
        assert_eq!(result["city"], "paris");
    }

    #[test]
    fn parse_number_args() {
        let args = vec!["--count".to_string(), "42".to_string()];
        let result = parse_args(&args, None)
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["count"], 42);
    }

    #[test]
    fn parse_bool_args() {
        let args = vec!["--verbose".to_string(), "true".to_string()];
        let result = parse_args(&args, None)
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["verbose"], true);
    }

    #[test]
    fn parse_flag_without_value() {
        let args = vec!["--dry-run".to_string()];
        let result = parse_args(&args, None)
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["dry-run"], true);
    }

    #[test]
    fn parse_json_value() {
        let args = vec!["--filter".to_string(), r#"{"status":"active"}"#.to_string()];
        let result = parse_args(&args, None)
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["filter"]["status"], "active");
    }

    #[test]
    fn parse_inline_malformed_json_falls_back_to_string() {
        let args = vec!["--filter".to_string(), "[not valid json]".to_string()];
        let result = parse_args(&args, None)
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["filter"], "[not valid json]");
        assert!(result["filter"].is_string());
    }

    #[test]
    fn parse_float_args() {
        let args = vec!["--ratio".to_string(), "3.125".to_string()];
        let result = parse_args(&args, None)
            .expect("should parse")
            .expect("should have value");
        let ratio = result["ratio"].as_f64().expect("should be f64");
        assert!((ratio - 3.125).abs() < f64::EPSILON);
    }

    #[test]
    fn parse_consecutive_flags() {
        let args = vec![
            "--verbose".to_string(),
            "--debug".to_string(),
            "--name".to_string(),
            "foo".to_string(),
        ];
        let result = parse_args(&args, None)
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["verbose"], true);
        assert_eq!(result["debug"], true);
        assert_eq!(result["name"], "foo");
    }

    #[test]
    fn parse_missing_dashes_errors() {
        let args = vec!["name".to_string(), "hello".to_string()];
        assert!(parse_args(&args, None).is_err());
    }

    fn write_tempfile(contents: &[u8]) -> tempfile::NamedTempFile {
        use std::io::Write;
        let mut file = tempfile::NamedTempFile::new().expect("create tempfile");
        file.write_all(contents).expect("write tempfile");
        file
    }

    #[test]
    fn parse_file_prefix_reads_contents() {
        let file = write_tempfile(b"hello world");
        let args = vec![
            "--query".to_string(),
            format!("__file__:{}", file.path().to_string_lossy()),
        ];
        let result = parse_args(&args, None)
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["query"], "hello world");
    }

    #[test]
    fn parse_file_prefix_skips_coercion() {
        let file = write_tempfile(b"42");
        let args = vec![
            "--count".to_string(),
            format!("__file__:{}", file.path().to_string_lossy()),
        ];
        let result = parse_args(&args, None)
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["count"], "42");
        assert!(result["count"].is_string());
    }

    #[test]
    fn parse_file_prefix_parses_json_array() {
        let file = write_tempfile(br#"[{"path":"README.md","content":"hello"}]"#);
        let args = vec![
            "--files".to_string(),
            format!("__file__:{}", file.path().to_string_lossy()),
        ];
        let result = parse_args(&args, None)
            .expect("should parse")
            .expect("should have value");
        assert!(result["files"].is_array());
        assert_eq!(result["files"][0]["path"], "README.md");
        assert_eq!(result["files"][0]["content"], "hello");
    }

    #[test]
    fn parse_file_prefix_parses_json_object() {
        let file = write_tempfile(br#"{"status":"active"}"#);
        let args = vec![
            "--filter".to_string(),
            format!("__file__:{}", file.path().to_string_lossy()),
        ];
        let result = parse_args(&args, None)
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["filter"]["status"], "active");
    }

    #[test]
    fn parse_file_prefix_parses_json_array_with_trailing_newline() {
        let file = write_tempfile(b"[1, 2, 3]\n");
        let args = vec![
            "--values".to_string(),
            format!("__file__:{}", file.path().to_string_lossy()),
        ];
        let result = parse_args(&args, None)
            .expect("should parse")
            .expect("should have value");
        assert!(result["values"].is_array());
        assert_eq!(result["values"][2], 3);
    }

    #[test]
    fn parse_file_prefix_malformed_json_array_errors() {
        let file = write_tempfile(b"[not valid json]");
        let args = vec![
            "--files".to_string(),
            format!("__file__:{}", file.path().to_string_lossy()),
        ];
        assert!(parse_args(&args, None).is_err());
    }

    #[test]
    fn parse_file_prefix_non_json_shaped_content_is_string() {
        let file = write_tempfile(b"just some free-form text");
        let args = vec![
            "--query".to_string(),
            format!("__file__:{}", file.path().to_string_lossy()),
        ];
        let result = parse_args(&args, None)
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["query"], "just some free-form text");
        assert!(result["query"].is_string());
    }

    #[test]
    fn parse_file_prefix_empty_path_errors() {
        let args = vec!["--query".to_string(), "__file__:".to_string()];
        assert!(parse_args(&args, None).is_err());
    }

    #[test]
    fn parse_file_prefix_nonexistent_path_errors() {
        let args = vec![
            "--query".to_string(),
            "__file__:/nonexistent/dsbx-test-12345".to_string(),
        ];
        assert!(parse_args(&args, None).is_err());
    }

    #[test]
    fn parse_value_without_file_prefix_treated_as_literal_string() {
        // A value that doesn't start with `__file__:` is coerced normally;
        // no filesystem touch.
        let args = vec!["--query".to_string(), "hello world".to_string()];
        let result = parse_args(&args, None)
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["query"], "hello world");
    }

    // --- coerce_value unit tests (heuristic / no type hint) ---

    #[test]
    fn coerce_value_true() {
        assert_eq!(coerce_value("true", None), serde_json::Value::Bool(true));
    }

    #[test]
    fn coerce_value_false() {
        assert_eq!(coerce_value("false", None), serde_json::Value::Bool(false));
    }

    #[test]
    fn coerce_value_integer() {
        assert_eq!(
            coerce_value("42", None),
            serde_json::Value::Number(42.into())
        );
    }

    #[test]
    fn coerce_value_negative_integer() {
        assert_eq!(
            coerce_value("-7", None),
            serde_json::Value::Number((-7_i64).into())
        );
    }

    #[test]
    fn coerce_value_zero() {
        assert_eq!(coerce_value("0", None), serde_json::Value::Number(0.into()));
    }

    #[test]
    fn coerce_value_float() {
        let v = coerce_value("1.5", None);
        assert!((v.as_f64().unwrap() - 1.5).abs() < f64::EPSILON);
    }

    #[test]
    fn coerce_value_nan_falls_back_to_string() {
        // Rust parses "NaN" as f64::NAN, but serde_json rejects NaN/Infinity,
        // so the value must fall through to a plain string.
        let v = coerce_value("NaN", None);
        assert!(v.is_string());
        assert_eq!(v.as_str().unwrap(), "NaN");
    }

    #[test]
    fn coerce_value_infinity_falls_back_to_string() {
        let v = coerce_value("inf", None);
        assert!(v.is_string());
        assert_eq!(v.as_str().unwrap(), "inf");
    }

    #[test]
    fn coerce_value_json_object() {
        let v = coerce_value(r#"{"key":"val"}"#, None);
        assert!(v.is_object());
        assert_eq!(v["key"], "val");
    }

    #[test]
    fn coerce_value_json_array() {
        let v = coerce_value("[1,2,3]", None);
        assert!(v.is_array());
        assert_eq!(v[2], 3);
    }

    #[test]
    fn coerce_value_json_with_surrounding_whitespace() {
        // coerce_value trims before the shape check, so padded JSON should parse.
        let v = coerce_value(r#"  {"x": 1}  "#, None);
        assert!(v.is_object());
        assert_eq!(v["x"], 1);
    }

    #[test]
    fn coerce_value_malformed_json_object_falls_back_to_string() {
        let v = coerce_value("{bad json}", None);
        assert!(v.is_string());
        assert_eq!(v.as_str().unwrap(), "{bad json}");
    }

    #[test]
    fn coerce_value_malformed_json_array_falls_back_to_string() {
        let v = coerce_value("[not valid json]", None);
        assert!(v.is_string());
        assert_eq!(v.as_str().unwrap(), "[not valid json]");
    }

    #[test]
    fn coerce_value_plain_string() {
        let v = coerce_value("hello world", None);
        assert!(v.is_string());
        assert_eq!(v.as_str().unwrap(), "hello world");
    }

    #[test]
    fn coerce_value_empty_string() {
        let v = coerce_value("", None);
        assert!(v.is_string());
        assert_eq!(v.as_str().unwrap(), "");
    }

    #[test]
    fn coerce_value_true_false_case_sensitive() {
        // Only lowercase "true"/"false" become booleans; other casings are strings.
        assert!(coerce_value("True", None).is_string());
        assert!(coerce_value("FALSE", None).is_string());
    }

    // --- coerce_value with schema type hints ---

    #[test]
    fn coerce_value_string_type_preserves_leading_zeros() {
        // "020" without a type hint becomes 20 (heuristic integer parse).
        // With type "string" the raw value must be returned unchanged.
        assert_eq!(
            coerce_value("020", None),
            serde_json::Value::Number(20.into())
        );
        assert_eq!(
            coerce_value("020", Some("string")),
            serde_json::Value::String("020".into())
        );
    }

    #[test]
    fn coerce_value_string_type_keeps_true_as_string() {
        let v = coerce_value("true", Some("string"));
        assert!(v.is_string());
        assert_eq!(v.as_str().unwrap(), "true");
    }

    #[test]
    fn coerce_value_string_type_keeps_json_as_string() {
        let v = coerce_value(r#"{"a":1}"#, Some("string"));
        assert!(v.is_string());
    }

    #[test]
    fn coerce_value_integer_type_parses_number() {
        assert_eq!(
            coerce_value("42", Some("integer")),
            serde_json::Value::Number(42.into())
        );
    }

    #[test]
    fn coerce_value_integer_type_falls_back_for_non_integer() {
        let v = coerce_value("abc", Some("integer"));
        assert!(v.is_string());
        assert_eq!(v.as_str().unwrap(), "abc");
    }

    #[test]
    fn coerce_value_number_type_parses_float() {
        let v = coerce_value("3.456789", Some("number"));
        assert!((v.as_f64().unwrap() - 3.456789).abs() < f64::EPSILON);
    }

    #[test]
    fn coerce_value_boolean_type_parses_true_false() {
        assert_eq!(
            coerce_value("true", Some("boolean")),
            serde_json::Value::Bool(true)
        );
        assert_eq!(
            coerce_value("false", Some("boolean")),
            serde_json::Value::Bool(false)
        );
    }

    #[test]
    fn coerce_value_boolean_type_falls_back_for_other() {
        let v = coerce_value("yes", Some("boolean"));
        assert!(v.is_string());
    }

    // --- schema propagation through parse_args ---

    fn make_schema(props: &[(&str, &str)]) -> serde_json::Value {
        let mut properties = serde_json::Map::new();
        for (name, ty) in props {
            properties.insert(name.to_string(), serde_json::json!({ "type": ty }));
        }
        serde_json::json!({ "properties": properties })
    }

    #[test]
    fn parse_args_schema_preserves_string_with_leading_zeros() {
        let schema = make_schema(&[("zip", "string")]);
        let args = vec!["--zip".to_string(), "020".to_string()];
        let result = parse_args(&args, Some(&schema))
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["zip"], "020");
        assert!(result["zip"].is_string());
    }

    #[test]
    fn parse_args_schema_string_keeps_true_literal() {
        let schema = make_schema(&[("flag", "string")]);
        let args = vec!["--flag".to_string(), "true".to_string()];
        let result = parse_args(&args, Some(&schema))
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["flag"], "true");
        assert!(result["flag"].is_string());
    }

    #[test]
    fn parse_args_no_schema_still_coerces_heuristically() {
        let args = vec!["--count".to_string(), "42".to_string()];
        let result = parse_args(&args, None)
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["count"], 42);
    }

    #[test]
    fn parse_args_schema_unknown_key_falls_back_to_heuristic() {
        // A key not present in the schema still gets heuristic coercion.
        let schema = make_schema(&[("name", "string")]);
        let args = vec!["--count".to_string(), "42".to_string()];
        let result = parse_args(&args, Some(&schema))
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["count"], 42);
    }

    #[test]
    fn parse_file_prefix_string_type_skips_json_parse() {
        // When schema says "string", a JSON-shaped file must NOT be parsed.
        let file = write_tempfile(br#"{"status":"active"}"#);
        let schema = make_schema(&[("data", "string")]);
        let args = vec![
            "--data".to_string(),
            format!("__file__:{}", file.path().to_string_lossy()),
        ];
        let result = parse_args(&args, Some(&schema))
            .expect("should parse")
            .expect("should have value");
        assert!(result["data"].is_string());
        assert_eq!(result["data"].as_str().unwrap(), r#"{"status":"active"}"#);
    }
}
