use anyhow::{bail, Context};

use crate::api::{parse_content_block, CallToolResult, ContentBlock, DustApiClient, DustApiError};
use crate::commands::tools::offload::{
    resolve_offloaded_content, OffloadResolutionError, ResolveOptions,
};

const MAX_FILE_ARG_SIZE_BYTES: u64 = 100 * 1024 * 1024;

pub async fn cmd_exec(
    client: &DustApiClient,
    server_name: &str,
    tool_name: &str,
    raw_args: &[String],
    args_json: Option<&str>,
    json: bool,
) -> anyhow::Result<()> {
    match run_exec(client, server_name, tool_name, raw_args, args_json, json).await {
        Ok(()) => Ok(()),
        Err(err) => {
            // Under --json, stdout is the machine contract: emit the typed
            // error envelope there (mirroring `function run`'s emit_error) so
            // consumers never have to regex stderr prose. The error still
            // propagates for the stderr diagnostic + non-zero exit.
            if json {
                println!("{}", error_envelope_json(&err));
            }
            Err(err)
        }
    }
}

/// The `{"error":{code,message,retryable,status?}}` stdout envelope for a
/// failed `tools --json` execution. API failures and offloaded-output
/// resolution failures carry their typed classification; anything else is
/// `unknown` and not retryable.
fn error_envelope_json(err: &anyhow::Error) -> serde_json::Value {
    if let Some(api_error) = err.downcast_ref::<DustApiError>() {
        return api_error.to_envelope_json();
    }
    if let Some(offload_error) = err.downcast_ref::<OffloadResolutionError>() {
        return offload_error.to_envelope_json();
    }
    serde_json::json!({
        "error": {
            "code": "unknown",
            "message": format!("{err:#}"),
            "retryable": false,
        }
    })
}

async fn run_exec(
    client: &DustApiClient,
    server_name: &str,
    tool_name: &str,
    raw_args: &[String],
    args_json: Option<&str>,
    json: bool,
) -> anyhow::Result<()> {
    // Reject conflicting arg styles before any network round-trip.
    if args_json.is_some() && !raw_args.is_empty() {
        bail!("--args-json cannot be combined with --key value arguments");
    }

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

    let arguments = match args_json {
        Some(spec) => Some(parse_args_json(&read_args_json_spec(spec)?)?),
        None => parse_args(raw_args, tool.input_schema.as_ref())?,
    };

    let resp = client.call_tool(&view.s_id, tool_name, arguments).await?;

    let is_error = resp.result.is_error;

    if json {
        // `--json` is a machine contract: content blocks whose full text was
        // offloaded by front get their archived content read back and
        // substituted, so the emitted JSON is complete rather than a snippet.
        let content = resolve_offloaded_content(&resp.result.content, &ResolveOptions::default())
            .await
            .map_err(anyhow::Error::new)?;
        let result = CallToolResult {
            content,
            ..resp.result
        };
        println!("{}", serde_json::to_string_pretty(&result)?);
    } else {
        // Model-facing rendering: offloaded blocks keep their snippet and the
        // "[Full content archived at ...]" sentence, which is how the model
        // learns where to read the rest.
        print!("{}", format_content_plain(&resp.result.content));
    }

    if is_error {
        std::process::exit(1);
    }

    Ok(())
}

/// Plain-text rendering of a tool result. All content blocks (text and
/// sentinel markers) go to stdout so a caller capturing stdout sees the full
/// tool output. stderr is reserved for ambient diagnostics.
fn format_content_plain(content: &[serde_json::Value]) -> String {
    let mut out = String::new();
    for value in content {
        match parse_content_block(value) {
            ContentBlock::Text { text } => {
                out.push_str(&format!("{text}\n"));
            }
            ContentBlock::Image { mime_type, .. } => {
                out.push_str(&format!("[image: {mime_type}]\n"));
            }
            ContentBlock::Audio { mime_type, .. } => {
                out.push_str(&format!("[audio: {mime_type}]\n"));
            }
            ContentBlock::Resource { resource } => {
                if let Some(text) = &resource.text {
                    out.push_str(&format!("{text}\n"));
                } else if resource.blob.is_some() {
                    out.push_str(&format!("[binary resource: {}]\n", resource.uri));
                } else {
                    out.push_str(&format!("[resource: {}]\n", resource.uri));
                }
            }
            ContentBlock::ResourceLink { uri, name } => {
                if let Some(name) = name {
                    out.push_str(&format!("[resource link: {name} - {uri}]\n"));
                } else {
                    out.push_str(&format!("[resource link: {uri}]\n"));
                }
            }
            ContentBlock::Unknown => {}
        }
    }
    out
}

/// Resolve the `--args-json` value: `-` reads the whole payload from stdin
/// (for values larger than ARG_MAX), anything else is the literal JSON.
fn read_args_json_spec(spec: &str) -> anyhow::Result<String> {
    if spec == "-" {
        return std::io::read_to_string(std::io::stdin())
            .context("failed to read --args-json payload from stdin");
    }
    Ok(spec.to_string())
}

/// Parse an `--args-json` payload: a single JSON object passed to the tool
/// verbatim, bypassing per-key parsing and schema/heuristic coercion.
fn parse_args_json(payload: &str) -> anyhow::Result<serde_json::Value> {
    let value = serde_json::from_str::<serde_json::Value>(payload.trim())
        .context("--args-json is not valid JSON")?;
    if !value.is_object() {
        bail!("--args-json must be a JSON object of tool arguments");
    }
    Ok(value)
}

/// Parse `--key value` pairs into a JSON object.
/// Uses the tool's JSON Schema (`schema`) to coerce each value to the declared
/// type when available; falls back to heuristic detection otherwise.
///
/// A value prefixed with `__file__:` reads the file at that path (UTF-8, capped
/// at 100 MB), letting agents pass values larger than the OS argv limit
/// (ARG_MAX). Contents coerce to schema-declared scalar types, JSON
/// object/array contents are parsed, and other content is a string.
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

/// Returns the declared JSON Schema type for `key` in a tool's
/// `input_schema`, or `None` when the schema is absent, the key is not found,
/// or the declaration does not reduce to a single type.
fn property_type<'a>(schema: Option<&'a serde_json::Value>, key: &str) -> Option<&'a str> {
    let property = schema?.get("properties")?.get(key)?;
    declared_type(property)
}

/// Reduce a property schema to a single declared type when unambiguous:
/// - `"type": "number"` stays as-is;
/// - `"type": ["number", "null"]` reduces to `number` (nullable fields are
///   common in generated schemas);
/// - `anyOf: [{type: "number"}, {type: "null"}]` reduces to `number`.
///
/// Anything else (two non-null types, an `anyOf` entry without a `type` such
/// as a `$ref`) yields `None`, i.e. heuristic coercion.
fn declared_type(property: &serde_json::Value) -> Option<&str> {
    if let Some(ty) = property.get("type") {
        if let Some(s) = ty.as_str() {
            return Some(s);
        }
        if let Some(types) = ty.as_array() {
            return single_non_null_type(types.iter().map(|v| v.as_str()));
        }
        return None;
    }
    if let Some(any_of) = property.get("anyOf").and_then(|v| v.as_array()) {
        return single_non_null_type(
            any_of
                .iter()
                .map(|entry| entry.get("type").and_then(|t| t.as_str())),
        );
    }
    None
}

/// `Some(type)` when the entries hold exactly one non-`"null"` type string;
/// an entry without a type string makes the union ambiguous.
fn single_non_null_type<'a>(entries: impl Iterator<Item = Option<&'a str>>) -> Option<&'a str> {
    let mut found: Option<&str> = None;
    for entry in entries {
        let ty = entry?;
        if ty == "null" {
            continue;
        }
        if found.is_some() {
            return None;
        }
        found = Some(ty);
    }
    found
}

fn coerce_value_or_read_file(s: &str, ty: Option<&str>) -> anyhow::Result<serde_json::Value> {
    if let Some(path) = s.strip_prefix("__file__:") {
        let contents = read_file_arg(path)?;
        let trimmed = contents.trim();
        match ty {
            // Scalar schema types coerce like inline values (trimmed: files
            // routinely carry a trailing newline). Without this, a file-passed
            // "42" against an integer schema is guaranteed to fail server-side
            // validation. A schema-declared "string" never coerces.
            Some("boolean") | Some("integer") | Some("number") => Ok(coerce_value(trimmed, ty)),
            // JSON object/array contents are parsed (like inline values);
            // anything else is a string. Malformed JSON-shaped content errors
            // rather than silently degrading, since the file isn't visible on
            // the command line. Exception: when the schema declares "string",
            // never attempt JSON parsing.
            _ => {
                if ty != Some("string") && looks_like_json_object_or_array(trimmed) {
                    return serde_json::from_str::<serde_json::Value>(trimmed).with_context(|| {
                        format!("__file__:{path} looks like JSON but failed to parse")
                    });
                }
                Ok(serde_json::Value::String(contents))
            }
        }
    } else {
        Ok(coerce_value(s, ty))
    }
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
    fn parse_file_prefix_without_schema_stays_string() {
        // No schema evidence: file contents are never coerced heuristically.
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
    fn parse_file_prefix_coerces_scalar_with_schema() {
        let file = write_tempfile(b"42");
        let schema = make_schema(&[("count", "integer")]);
        let args = vec![
            "--count".to_string(),
            format!("__file__:{}", file.path().to_string_lossy()),
        ];
        let result = parse_args(&args, Some(&schema))
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["count"], 42);
    }

    #[test]
    fn parse_file_prefix_coerces_scalar_with_trailing_newline() {
        let file = write_tempfile(b"true\n");
        let schema = make_schema(&[("enabled", "boolean")]);
        let args = vec![
            "--enabled".to_string(),
            format!("__file__:{}", file.path().to_string_lossy()),
        ];
        let result = parse_args(&args, Some(&schema))
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["enabled"], true);
    }

    #[test]
    fn parse_file_prefix_coerces_number_with_schema() {
        let file = write_tempfile(b"3.5");
        let schema = make_schema(&[("ratio", "number")]);
        let args = vec![
            "--ratio".to_string(),
            format!("__file__:{}", file.path().to_string_lossy()),
        ];
        let result = parse_args(&args, Some(&schema))
            .expect("should parse")
            .expect("should have value");
        let ratio = result["ratio"].as_f64().expect("should be f64");
        assert!((ratio - 3.5).abs() < f64::EPSILON);
    }

    #[test]
    fn parse_file_prefix_scalar_schema_non_scalar_content_falls_back_to_string() {
        // Unparseable content against a scalar schema falls back to the
        // (trimmed) string; server-side validation reports the mismatch.
        let file = write_tempfile(b"not a number\n");
        let schema = make_schema(&[("count", "integer")]);
        let args = vec![
            "--count".to_string(),
            format!("__file__:{}", file.path().to_string_lossy()),
        ];
        let result = parse_args(&args, Some(&schema))
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["count"], "not a number");
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

    // --- error envelope for --json consumers ---

    #[test]
    fn error_envelope_carries_typed_api_error() {
        let err = anyhow::Error::new(DustApiError::from_http_response(
            403,
            r#"{"error":{"type":"fast_function_called_tools","message":"no tools for fast functions"}}"#,
        ))
        .context("POST https://dust.tt/api/v1/w/x/sandbox/actions/call");

        let envelope = error_envelope_json(&err);
        assert_eq!(envelope["error"]["code"], "fast_function_called_tools");
        assert_eq!(envelope["error"]["message"], "no tools for fast functions");
        assert_eq!(envelope["error"]["retryable"], false);
        assert_eq!(envelope["error"]["status"], 403);
    }

    #[test]
    fn error_envelope_carries_typed_offload_resolution_error() {
        let err = anyhow::Error::new(OffloadResolutionError::new(
            "could not read the offloaded tool output at /files/pod-x/.tool_outputs/f/1.json"
                .to_string(),
        ))
        .context("tools exec");

        let envelope = error_envelope_json(&err);
        assert_eq!(envelope["error"]["code"], "tool_output_unavailable");
        assert!(envelope["error"]["message"]
            .as_str()
            .expect("message")
            .contains("/files/pod-x/.tool_outputs/f/1.json"));
        assert_eq!(envelope["error"]["retryable"], true);
    }

    // --- plain-text (model-facing) rendering ---

    #[test]
    fn plain_rendering_keeps_the_offloaded_snippet_and_archive_sentence() {
        // The default mode is model-facing: the snippet plus the archive
        // sentence is how the model learns where to read the rest, so no
        // resolution happens here.
        let scoped_path = "pod-vlt_1/.tool_outputs/my-fn/1_search.json";
        let snippet =
            format!("head of payload... (truncated)\n[Full content archived at {scoped_path}]");
        let content = vec![serde_json::json!({
            "type": "resource",
            "resource": { "uri": scoped_path, "mimeType": "text/plain", "text": snippet },
            "_meta": {
                "tt.dust/offload": {
                    "fullContentPath": scoped_path,
                    "totalBytes": 121_700,
                    "contentType": "application/json",
                }
            },
        })];

        let rendered = format_content_plain(&content);
        assert_eq!(
            rendered,
            format!("head of payload... (truncated)\n[Full content archived at {scoped_path}]\n")
        );
    }

    #[test]
    fn plain_rendering_covers_every_block_shape() {
        let content = vec![
            serde_json::json!({ "type": "text", "text": "hello" }),
            serde_json::json!({ "type": "image", "data": "AA", "mimeType": "image/png" }),
            serde_json::json!({ "type": "resource", "resource": { "uri": "u", "blob": "AA" } }),
            serde_json::json!({ "type": "resource_link", "uri": "u", "name": "n" }),
            serde_json::json!({ "type": "future_block" }),
        ];

        assert_eq!(
            format_content_plain(&content),
            "hello\n[image: image/png]\n[binary resource: u]\n[resource link: n - u]\n"
        );
    }

    #[test]
    fn error_envelope_falls_back_to_unknown_with_chain() {
        let err = anyhow::anyhow!("root cause").context("outer context");
        let envelope = error_envelope_json(&err);
        assert_eq!(envelope["error"]["code"], "unknown");
        assert_eq!(envelope["error"]["retryable"], false);
        let message = envelope["error"]["message"].as_str().expect("message");
        assert!(message.contains("outer context"));
        assert!(message.contains("root cause"));
        assert!(envelope["error"].get("status").is_none());
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

    // --- union-type schema reduction ---

    #[test]
    fn property_type_reduces_nullable_type_array() {
        let schema = serde_json::json!({
            "properties": { "count": { "type": ["integer", "null"] } }
        });
        assert_eq!(property_type(Some(&schema), "count"), Some("integer"));
    }

    #[test]
    fn property_type_ambiguous_type_array_yields_none() {
        let schema = serde_json::json!({
            "properties": { "value": { "type": ["string", "integer"] } }
        });
        assert_eq!(property_type(Some(&schema), "value"), None);
    }

    #[test]
    fn property_type_reduces_nullable_any_of() {
        let schema = serde_json::json!({
            "properties": {
                "limit": { "anyOf": [{ "type": "number" }, { "type": "null" }] }
            }
        });
        assert_eq!(property_type(Some(&schema), "limit"), Some("number"));
    }

    #[test]
    fn property_type_ambiguous_any_of_yields_none() {
        let schema = serde_json::json!({
            "properties": {
                "value": { "anyOf": [{ "type": "string" }, { "type": "number" }] }
            }
        });
        assert_eq!(property_type(Some(&schema), "value"), None);
    }

    #[test]
    fn property_type_any_of_with_ref_entry_yields_none() {
        // An entry without a literal type ($ref, nested schema) makes the
        // union ambiguous; do not pretend to know the type.
        let schema = serde_json::json!({
            "properties": {
                "value": { "anyOf": [{ "type": "number" }, { "$ref": "#/defs/X" }] }
            }
        });
        assert_eq!(property_type(Some(&schema), "value"), None);
    }

    #[test]
    fn parse_args_nullable_type_array_coerces_scalar() {
        let schema = serde_json::json!({
            "properties": { "count": { "type": ["integer", "null"] } }
        });
        let args = vec!["--count".to_string(), "42".to_string()];
        let result = parse_args(&args, Some(&schema))
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["count"], 42);
    }

    #[test]
    fn parse_args_nullable_string_never_coerces() {
        // ["string", "null"] reduces to "string": leading zeros survive.
        let schema = serde_json::json!({
            "properties": { "zip": { "type": ["string", "null"] } }
        });
        let args = vec!["--zip".to_string(), "020".to_string()];
        let result = parse_args(&args, Some(&schema))
            .expect("should parse")
            .expect("should have value");
        assert_eq!(result["zip"], "020");
        assert!(result["zip"].is_string());
    }

    #[test]
    fn parse_args_nullable_any_of_string_never_coerces_file_contents() {
        let file = write_tempfile(br#"{"status":"active"}"#);
        let schema = serde_json::json!({
            "properties": {
                "data": { "anyOf": [{ "type": "string" }, { "type": "null" }] }
            }
        });
        let args = vec![
            "--data".to_string(),
            format!("__file__:{}", file.path().to_string_lossy()),
        ];
        let result = parse_args(&args, Some(&schema))
            .expect("should parse")
            .expect("should have value");
        assert!(result["data"].is_string());
    }

    // --- --args-json ---

    #[test]
    fn parse_args_json_accepts_object() {
        let value = parse_args_json(r#"{"query": "hello", "count": 42, "nested": {"a": [1]}}"#)
            .expect("should parse");
        assert_eq!(value["query"], "hello");
        assert_eq!(value["count"], 42);
        assert_eq!(value["nested"]["a"][0], 1);
    }

    #[test]
    fn parse_args_json_preserves_string_typed_numbers() {
        // The whole point: no coercion, values travel verbatim.
        let value = parse_args_json(r#"{"zip": "020", "flag": "true"}"#).expect("should parse");
        assert_eq!(value["zip"], "020");
        assert_eq!(value["flag"], "true");
        assert!(value["zip"].is_string());
        assert!(value["flag"].is_string());
    }

    #[test]
    fn parse_args_json_tolerates_surrounding_whitespace() {
        let value = parse_args_json("  {\"a\": 1}\n").expect("should parse");
        assert_eq!(value["a"], 1);
    }

    #[test]
    fn parse_args_json_rejects_non_object() {
        assert!(parse_args_json("[1, 2]").is_err());
        assert!(parse_args_json("\"hello\"").is_err());
        assert!(parse_args_json("42").is_err());
    }

    #[test]
    fn parse_args_json_rejects_malformed_json() {
        let err = parse_args_json("{not json}").unwrap_err();
        assert!(format!("{err:#}").contains("--args-json is not valid JSON"));
    }

    #[test]
    fn read_args_json_spec_returns_literal() {
        let payload = read_args_json_spec(r#"{"a": 1}"#).expect("should read");
        assert_eq!(payload, r#"{"a": 1}"#);
    }
}
