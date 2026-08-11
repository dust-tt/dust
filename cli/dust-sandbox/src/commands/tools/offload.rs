// Resolution of offloaded tool output content blocks.
//
// Tool outputs above front's offload threshold are not delivered inline: the
// full content is archived as a pod file and the inline text is replaced by a
// snippet ending with a human-facing "[Full content archived at <path>]"
// sentence. That truncation exists to protect a model's context window, so it
// stays in the default (model-facing) rendering — but `--json` is a machine
// contract with no model on the other end, and emitting a cut-off body there
// hands consumers invalid data (JSON tool output no longer parses).
//
// Offloaded blocks carry a machine-readable descriptor under the
// "tt.dust/offload" key of their `_meta` (front owns the write side in
// `front/lib/actions/mcp_execution.ts`; the descriptor shape is append-only).
// This module is the read side: blocks without a descriptor pass through
// untouched, blocks with one get the archived file read back from the gcsfuse
// mount and substituted into their text. Never parse the snippet text or the
// archive sentence: the descriptor is the contract.
//
// The TypeScript counterpart is `resolveToolTextContent` in
// `cli/dust-sandbox/pod/tool_output.ts`; both must keep the same semantics.

use std::fmt;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Key of the offload descriptor in a content block's `_meta`. Owned by front
/// (`TOOL_OUTPUT_OFFLOAD_META_KEY` in
/// `front/lib/actions/action_output_limits.ts`); this is the CLI-side copy of
/// the wire contract.
const TOOL_OUTPUT_OFFLOAD_META_KEY: &str = "tt.dust/offload";

/// Absolute in-sandbox directory the scoped file mounts live under: a
/// descriptor's `fullContentPath` (e.g. "pod-{pId}/.tool_outputs/{slug}/{file}")
/// resolves to `/files/pod-{pId}/...`.
const MOUNT_ROOT_DIR: &str = "/files";

const DEFAULT_MAX_ATTEMPTS: u32 = 5;
const DEFAULT_RETRY_DELAY_MS: u64 = 1_000;

/// Failure to resolve an offloaded tool output under `--json`. Kept typed so
/// `tools --json` can emit it in the stdout error envelope and exit with a
/// distinct code: degrading to the truncated snippet instead would silently
/// hand the consumer the invalid payload this resolution exists to remove.
#[derive(Debug)]
pub struct OffloadResolutionError {
    message: String,
}

impl OffloadResolutionError {
    /// Stable classification for the `--json` stdout envelope; append-only,
    /// like the API error codes.
    pub const CODE: &'static str = "tool_output_unavailable";

    /// Distinct process exit code, continuing the allocation documented on
    /// `ApiErrorCode::exit_code`.
    pub const EXIT_CODE: i32 = 15;

    pub(crate) fn new(message: String) -> Self {
        Self { message }
    }

    /// The `{"error":{code,message,retryable}}` stdout envelope, mirroring
    /// `DustApiError::to_envelope_json`. No `status`: nothing HTTP failed.
    pub fn to_envelope_json(&self) -> serde_json::Value {
        serde_json::json!({
            "error": {
                "code": Self::CODE,
                "message": self.message,
                // The archive is written through GCS and read back through the
                // gcsfuse mount, whose metadata cache can lag: a later call can
                // succeed even though this one exhausted its bounded retry.
                "retryable": true,
            }
        })
    }
}

impl fmt::Display for OffloadResolutionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for OffloadResolutionError {}

/// Knobs of the archive read. Production code uses `Default`; tests point the
/// mount elsewhere and shorten the retry.
pub struct ResolveOptions {
    pub mount_root_dir: PathBuf,
    pub max_attempts: u32,
    pub retry_delay_ms: u64,
}

impl Default for ResolveOptions {
    fn default() -> Self {
        Self {
            mount_root_dir: PathBuf::from(MOUNT_ROOT_DIR),
            max_attempts: DEFAULT_MAX_ATTEMPTS,
            retry_delay_ms: DEFAULT_RETRY_DELAY_MS,
        }
    }
}

/// Returns the content array with every offloaded block's snippet replaced by
/// the archived full content. Blocks without a descriptor are returned as-is.
pub async fn resolve_offloaded_content(
    content: &[serde_json::Value],
    options: &ResolveOptions,
) -> Result<Vec<serde_json::Value>, OffloadResolutionError> {
    // Sequential: a tool result holds a handful of blocks, and at most a few
    // of them are offloaded.
    let mut resolved = Vec::with_capacity(content.len());
    for block in content {
        resolved.push(resolve_block(block, options).await?);
    }
    Ok(resolved)
}

async fn resolve_block(
    block: &serde_json::Value,
    options: &ResolveOptions,
) -> Result<serde_json::Value, OffloadResolutionError> {
    let descriptor = match block
        .get("_meta")
        .and_then(|meta| meta.get(TOOL_OUTPUT_OFFLOAD_META_KEY))
    {
        Some(descriptor) => descriptor,
        None => return Ok(block.clone()),
    };

    let path = archive_path(descriptor, &options.mount_root_dir)?;
    let full_content = read_archived_content(&path, options).await?;

    Ok(with_full_text(block, full_content))
}

/// Absolute path of the archived content. `fullContentPath` is a scoped path
/// ("pod-{pId}/...") resolved under the mount root; an already-absolute value
/// is used as-is.
fn archive_path(
    descriptor: &serde_json::Value,
    mount_root_dir: &Path,
) -> Result<PathBuf, OffloadResolutionError> {
    // Only `fullContentPath` is load-bearing here; the descriptor's other
    // fields (totalBytes, contentType) are informational and travel through to
    // the consumer untouched.
    let full_content_path = descriptor
        .get("fullContentPath")
        .and_then(|value| value.as_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            OffloadResolutionError::new(format!(
                "tool output block carries an invalid offload descriptor under \
                 \"{TOOL_OUTPUT_OFFLOAD_META_KEY}\" (no fullContentPath); this is a platform \
                 contract violation, report it rather than working around it"
            ))
        })?;

    if full_content_path.starts_with('/') {
        return Ok(PathBuf::from(full_content_path));
    }
    Ok(mount_root_dir.join(full_content_path))
}

async fn read_archived_content(
    path: &Path,
    options: &ResolveOptions,
) -> Result<String, OffloadResolutionError> {
    // The archived file is written through the GCS API while this reads it
    // through the gcsfuse mount, whose metadata cache can lag behind the
    // write: retry a bounded number of times instead of failing on the first
    // missing read.
    let mut last_error: Option<std::io::Error> = None;
    for attempt in 1..=options.max_attempts {
        match tokio::fs::read_to_string(path).await {
            Ok(content) => return Ok(content),
            Err(err) => last_error = Some(err),
        }
        if attempt < options.max_attempts {
            tokio::time::sleep(Duration::from_millis(options.retry_delay_ms)).await;
        }
    }

    let reason = match last_error {
        Some(err) => err.to_string(),
        None => "no read attempt was made".to_string(),
    };
    Err(OffloadResolutionError::new(format!(
        "could not read the offloaded tool output at {} after {} attempts (the file mount can \
         lag behind writes): {reason}",
        path.display(),
        options.max_attempts
    )))
}

/// Substitutes the resolved content into the block's text field. Front emits
/// offloaded blocks as embedded resources (both the text and the resource
/// branch of `processToolResults`), so `resource.text` is the live shape;
/// top-level `text` is handled too so a future front branch that offloads a
/// plain text block resolves the same way.
fn with_full_text(block: &serde_json::Value, full_content: String) -> serde_json::Value {
    let mut resolved = block.clone();
    let text = serde_json::Value::String(full_content);

    if let Some(resource) = resolved
        .get_mut("resource")
        .and_then(|resource| resource.as_object_mut())
    {
        resource.insert("text".to_string(), text);
        return resolved;
    }

    if let Some(object) = resolved.as_object_mut() {
        object.insert("text".to_string(), text);
    }
    resolved
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_options(mount_root_dir: &Path) -> ResolveOptions {
        ResolveOptions {
            mount_root_dir: mount_root_dir.to_path_buf(),
            // Keep the retry shape (more than one attempt) without the wall
            // clock cost.
            max_attempts: 3,
            retry_delay_ms: 0,
        }
    }

    fn write_archive(mount_root_dir: &Path, scoped_path: &str, content: &str) {
        let path = mount_root_dir.join(scoped_path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("create archive dir");
        }
        std::fs::write(&path, content).expect("write archive");
    }

    fn offload_meta(scoped_path: &str, total_bytes: usize) -> serde_json::Value {
        serde_json::json!({
            TOOL_OUTPUT_OFFLOAD_META_KEY: {
                "fullContentPath": scoped_path,
                "totalBytes": total_bytes,
                "contentType": "application/json",
            }
        })
    }

    /// A resource block as front emits it for an offloaded output: the snippet
    /// plus the archive sentence in `resource.text`, descriptor in `_meta`.
    fn offloaded_resource_block(scoped_path: &str, snippet: &str) -> serde_json::Value {
        serde_json::json!({
            "type": "resource",
            "resource": {
                "uri": scoped_path,
                "mimeType": "text/plain",
                "text": format!("{snippet}... (truncated)\n[Full content archived at {scoped_path}]"),
            },
            "_meta": offload_meta(scoped_path, snippet.len()),
        })
    }

    #[tokio::test]
    async fn resolves_resource_block_to_full_content() {
        let mount = tempfile::tempdir().expect("tempdir");
        let scoped_path = "pod-vlt_1/.tool_outputs/my-fn/1_search.json";
        let full_content = r#"{"results":[{"id":1},{"id":2}]}"#;
        write_archive(mount.path(), scoped_path, full_content);

        let block = offloaded_resource_block(scoped_path, "{\"results\":[{\"id\":1");
        let resolved = resolve_offloaded_content(&[block], &test_options(mount.path()))
            .await
            .expect("should resolve");

        assert_eq!(resolved[0]["resource"]["text"], full_content);
        // The descriptor and the rest of the block travel through untouched.
        assert_eq!(
            resolved[0]["_meta"][TOOL_OUTPUT_OFFLOAD_META_KEY]["fullContentPath"],
            scoped_path
        );
        assert_eq!(resolved[0]["resource"]["uri"], scoped_path);
    }

    #[tokio::test]
    async fn resolves_text_block_to_full_content() {
        let mount = tempfile::tempdir().expect("tempdir");
        let scoped_path = "pod-vlt_1/.tool_outputs/my-fn/2_fetch.json";
        let full_content = "line one\nline two\n";
        write_archive(mount.path(), scoped_path, full_content);

        let block = serde_json::json!({
            "type": "text",
            "text": format!("line on... (truncated)\n[Full content archived at {scoped_path}]"),
            "_meta": offload_meta(scoped_path, full_content.len()),
        });
        let resolved = resolve_offloaded_content(&[block], &test_options(mount.path()))
            .await
            .expect("should resolve");

        assert_eq!(resolved[0]["text"], full_content);
    }

    #[tokio::test]
    async fn resolved_json_output_parses_and_carries_no_truncation_marker() {
        // The regression this exists for: a payload past front's 20KB text
        // offload threshold arrives as a snippet that does not parse as JSON.
        let mount = tempfile::tempdir().expect("tempdir");
        let scoped_path = "pod-vlt_1/.tool_outputs/my-fn/3_big.json";
        let rows: Vec<serde_json::Value> = (0..400)
            .map(|i| serde_json::json!({ "id": i, "body": "x".repeat(64) }))
            .collect();
        let full_content =
            serde_json::to_string(&serde_json::json!({ "rows": rows })).expect("should serialize");
        assert!(full_content.len() > 20 * 1024);
        write_archive(mount.path(), scoped_path, &full_content);

        // Front's snippet: the head of the payload, cut mid-JSON.
        let snippet = &full_content[..8_000];
        let block = offloaded_resource_block(scoped_path, snippet);
        let resolved = resolve_offloaded_content(&[block], &test_options(mount.path()))
            .await
            .expect("should resolve");

        let text = resolved[0]["resource"]["text"]
            .as_str()
            .expect("resolved text");
        assert!(!text.contains("(truncated)"));
        assert!(!text.contains("[Full content archived at"));
        let parsed: serde_json::Value = serde_json::from_str(text).expect("should parse as JSON");
        assert_eq!(parsed["rows"].as_array().expect("rows").len(), 400);
    }

    #[tokio::test]
    async fn passes_blocks_without_descriptor_through_untouched() {
        let mount = tempfile::tempdir().expect("tempdir");
        let blocks = vec![
            serde_json::json!({ "type": "text", "text": "small inline output" }),
            serde_json::json!({
                "type": "resource",
                "resource": { "uri": "file://x", "text": "inline resource body" },
                "_meta": { "tt.dust/other": { "k": 1 } },
            }),
            serde_json::json!({ "type": "future_block", "payload": { "k": 1 } }),
        ];

        let resolved = resolve_offloaded_content(&blocks, &test_options(mount.path()))
            .await
            .expect("should resolve");

        assert_eq!(resolved, blocks);
    }

    #[tokio::test]
    async fn resolves_only_the_offloaded_block_of_a_mixed_result() {
        let mount = tempfile::tempdir().expect("tempdir");
        let scoped_path = "pod-vlt_1/.tool_outputs/my-fn/4_mixed.json";
        write_archive(mount.path(), scoped_path, "archived body");

        let blocks = vec![
            serde_json::json!({ "type": "text", "text": "inline" }),
            offloaded_resource_block(scoped_path, "archived"),
        ];
        let resolved = resolve_offloaded_content(&blocks, &test_options(mount.path()))
            .await
            .expect("should resolve");

        assert_eq!(resolved[0]["text"], "inline");
        assert_eq!(resolved[1]["resource"]["text"], "archived body");
    }

    #[tokio::test]
    async fn missing_archive_errors_instead_of_emitting_the_snippet() {
        let mount = tempfile::tempdir().expect("tempdir");
        let scoped_path = "pod-vlt_1/.tool_outputs/my-fn/5_missing.json";
        let block = offloaded_resource_block(scoped_path, "head of the payload");

        let err = resolve_offloaded_content(&[block], &test_options(mount.path()))
            .await
            .expect_err("should fail");

        let message = err.to_string();
        assert!(message.contains(scoped_path), "message: {message}");
        assert!(message.contains("3 attempts"), "message: {message}");

        let envelope = err.to_envelope_json();
        assert_eq!(envelope["error"]["code"], "tool_output_unavailable");
        assert_eq!(envelope["error"]["retryable"], true);
        assert!(envelope["error"].get("status").is_none());
    }

    #[tokio::test]
    async fn archive_visible_on_a_later_attempt_resolves() {
        // Mirrors gcsfuse metadata-cache staleness: the file shows up after the
        // first read fails.
        let mount = tempfile::tempdir().expect("tempdir");
        let scoped_path = "pod-vlt_1/.tool_outputs/my-fn/6_late.json";
        let mount_path = mount.path().to_path_buf();
        let late_writer = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(30)).await;
            write_archive(&mount_path, scoped_path, "late body");
        });

        let options = ResolveOptions {
            mount_root_dir: mount.path().to_path_buf(),
            max_attempts: 10,
            retry_delay_ms: 10,
        };
        let block = offloaded_resource_block(scoped_path, "late");
        let resolved = resolve_offloaded_content(&[block], &options)
            .await
            .expect("should resolve");

        late_writer.await.expect("writer should finish");
        assert_eq!(resolved[0]["resource"]["text"], "late body");
    }

    #[tokio::test]
    async fn malformed_descriptor_errors() {
        let mount = tempfile::tempdir().expect("tempdir");
        let block = serde_json::json!({
            "type": "resource",
            "resource": { "uri": "x", "text": "snippet" },
            "_meta": { TOOL_OUTPUT_OFFLOAD_META_KEY: { "totalBytes": 1 } },
        });

        let err = resolve_offloaded_content(&[block], &test_options(mount.path()))
            .await
            .expect_err("should fail");
        assert!(
            err.to_string().contains("invalid offload descriptor"),
            "message: {err}"
        );
    }

    #[test]
    fn archive_path_resolves_scoped_path_under_the_mount() {
        let descriptor = serde_json::json!({
            "fullContentPath": "pod-vlt_1/.tool_outputs/my-fn/7.json",
        });
        let path = archive_path(&descriptor, Path::new("/files")).expect("should resolve");
        assert_eq!(
            path,
            PathBuf::from("/files/pod-vlt_1/.tool_outputs/my-fn/7.json")
        );
    }

    #[test]
    fn archive_path_keeps_absolute_paths() {
        let descriptor = serde_json::json!({ "fullContentPath": "/files/pod-vlt_1/x.json" });
        let path = archive_path(&descriptor, Path::new("/files")).expect("should resolve");
        assert_eq!(path, PathBuf::from("/files/pod-vlt_1/x.json"));
    }

    #[test]
    fn archive_path_rejects_empty_path() {
        let descriptor = serde_json::json!({ "fullContentPath": "" });
        assert!(archive_path(&descriptor, Path::new("/files")).is_err());
    }
}
