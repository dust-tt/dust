use std::fs;
use std::io::{self, Write};
use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

const SUPPORTED_MANIFEST_VERSION: u32 = 1;

#[derive(clap::Args, Debug, Clone)]
pub struct EnvArgs {
    /// Path to the manifest file written by front.
    #[arg(long, default_value = "/run/dust/sandbox-env-manifest.json")]
    manifest_file: PathBuf,
    /// Output format.
    #[arg(long, value_enum, default_value_t = OutputFormat::Text)]
    format: OutputFormat,
}

#[derive(clap::ValueEnum, Clone, Copy, Debug)]
enum OutputFormat {
    Text,
    Json,
}

#[derive(Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct SandboxEnvManifest {
    version: u32,
    system: Vec<SystemVar>,
    config: Vec<ConfigVar>,
    https_secrets: Vec<HttpsSecret>,
}

#[derive(Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemVar {
    name: String,
    description: String,
}

#[derive(Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigVar {
    name: String,
}

#[derive(Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct HttpsSecret {
    name: String,
    allowed_domains: Vec<String>,
}

pub fn cmd_env(args: EnvArgs) -> Result<()> {
    let contents = fs::read_to_string(&args.manifest_file)
        .with_context(|| format!("failed to read {}", args.manifest_file.display()))?;
    let manifest: SandboxEnvManifest = serde_json::from_str(&contents)
        .with_context(|| format!("failed to parse {}", args.manifest_file.display()))?;

    if manifest.version != SUPPORTED_MANIFEST_VERSION {
        // Surface the drift on stderr rather than failing closed: front
        // controls both producer and consumer, so a version mismatch most
        // likely means the base image is older than the front that wrote the
        // file. Keep parsing/rendering the known fields and let the operator
        // see the warning in the binary's stderr stream.
        eprintln!(
            "warning: manifest version {} not supported by this dsbx (expected {}); known fields will be rendered",
            manifest.version, SUPPORTED_MANIFEST_VERSION,
        );
    }

    match args.format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&manifest)?);
        }
        OutputFormat::Text => {
            let stdout = io::stdout();
            let mut handle = stdout.lock();
            render_text(&mut handle, &manifest)?;
        }
    }

    Ok(())
}

fn render_text<W: Write>(writer: &mut W, manifest: &SandboxEnvManifest) -> Result<()> {
    writeln!(writer, "SYSTEM")?;
    render_system_section(writer, &manifest.system)?;
    writeln!(writer)?;

    writeln!(writer, "CONFIG  (DST_*; values visible via printenv)")?;
    render_config_section(writer, &manifest.config)?;
    writeln!(writer)?;

    writeln!(
        writer,
        "HTTPS SECRETS  (DSEC_*; value is injected only on the listed domains)"
    )?;
    render_https_secrets_section(writer, &manifest.https_secrets)?;

    Ok(())
}

fn render_system_section<W: Write>(writer: &mut W, vars: &[SystemVar]) -> Result<()> {
    if vars.is_empty() {
        writeln!(writer, "  (none)")?;
        return Ok(());
    }

    let mut name_width = 0;
    for var in vars {
        name_width = name_width.max(var.name.len());
    }
    for var in vars {
        writeln!(
            writer,
            "  {:width$}  {}",
            var.name,
            var.description,
            width = name_width
        )?;
    }

    Ok(())
}

fn render_config_section<W: Write>(writer: &mut W, vars: &[ConfigVar]) -> Result<()> {
    if vars.is_empty() {
        writeln!(writer, "  (none)")?;
        return Ok(());
    }

    for var in vars {
        writeln!(writer, "  {}", var.name)?;
    }

    Ok(())
}

fn render_https_secrets_section<W: Write>(writer: &mut W, secrets: &[HttpsSecret]) -> Result<()> {
    if secrets.is_empty() {
        writeln!(writer, "  (none)")?;
        return Ok(());
    }

    let mut name_width = 0;
    for secret in secrets {
        name_width = name_width.max(secret.name.len());
    }
    for secret in secrets {
        writeln!(
            writer,
            "  {:width$}  domains={}",
            secret.name,
            secret.allowed_domains.join(", "),
            width = name_width
        )?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest_fixture() -> SandboxEnvManifest {
        SandboxEnvManifest {
            version: 1,
            system: vec![
                SystemVar {
                    name: "CONVERSATION_ID".to_string(),
                    description: "current conversation sId".to_string(),
                },
                SystemVar {
                    name: "WORKSPACE_ID".to_string(),
                    description: "current workspace sId".to_string(),
                },
            ],
            config: vec![
                ConfigVar {
                    name: "DST_DEFAULT_BRANCH".to_string(),
                },
                ConfigVar {
                    name: "DST_GITHUB_USER".to_string(),
                },
            ],
            https_secrets: vec![
                HttpsSecret {
                    name: "DSEC_OPENAI_API_KEY".to_string(),
                    allowed_domains: vec![
                        "api.openai.com".to_string(),
                        "*.openai.azure.com".to_string(),
                    ],
                },
                HttpsSecret {
                    name: "DSEC_SLACK_TOKEN".to_string(),
                    allowed_domains: vec!["slack.com".to_string(), "*.slack-edge.com".to_string()],
                },
            ],
        }
    }

    fn render_text_to_string(manifest: &SandboxEnvManifest) -> Result<String> {
        let mut output = Vec::new();
        render_text(&mut output, manifest)?;
        Ok(String::from_utf8(output)?)
    }

    #[test]
    fn parse_minimal_manifest() -> Result<()> {
        // Manifests may still carry a legacy `placeholder` field on each
        // secret; serde drops it as an unknown field rather than failing the
        // parse.
        let manifest: SandboxEnvManifest = serde_json::from_str(
            r#"{
  "version": 1,
  "system": [
    { "name": "CONVERSATION_ID", "description": "current conversation sId" }
  ],
  "config": [
    { "name": "DST_GITHUB_USER" }
  ],
  "httpsSecrets": [
    {
      "name": "DSEC_OPENAI_API_KEY",
      "placeholder": "__DSEC_0123456789abcdef0123456789abcdef__",
      "allowedDomains": ["api.openai.com"]
    }
  ]
}"#,
        )?;

        assert_eq!(manifest.version, 1);
        assert_eq!(manifest.system[0].name, "CONVERSATION_ID");
        assert_eq!(manifest.config[0].name, "DST_GITHUB_USER");
        assert_eq!(manifest.https_secrets[0].name, "DSEC_OPENAI_API_KEY");
        assert_eq!(
            manifest.https_secrets[0].allowed_domains,
            vec!["api.openai.com".to_string()]
        );

        let serialized = serde_json::to_string(&manifest)?;
        assert!(serialized.contains("\"httpsSecrets\""));
        assert!(serialized.contains("\"allowedDomains\""));
        assert!(!serialized.contains("placeholder"));

        Ok(())
    }

    #[test]
    fn render_text_with_sections() -> Result<()> {
        let output = render_text_to_string(&manifest_fixture())?;

        assert!(output.contains("SYSTEM\n"));
        assert!(output.contains("  CONVERSATION_ID  current conversation sId\n"));
        assert!(output.contains("CONFIG  (DST_*; values visible via printenv)\n"));
        assert!(output.contains("  DST_DEFAULT_BRANCH\n"));
        assert!(output.contains("HTTPS SECRETS  (DSEC_*;"));
        assert!(
            output.contains("  DSEC_OPENAI_API_KEY  domains=api.openai.com, *.openai.azure.com\n")
        );
        assert!(!output.contains("placeholder"));

        Ok(())
    }

    #[test]
    fn render_text_with_empty_sections() -> Result<()> {
        let manifest = SandboxEnvManifest {
            version: 1,
            system: vec![],
            config: vec![],
            https_secrets: vec![],
        };
        let output = render_text_to_string(&manifest)?;

        assert_eq!(
            output,
            "SYSTEM\n  (none)\n\nCONFIG  (DST_*; values visible via printenv)\n  (none)\n\nHTTPS SECRETS  (DSEC_*; value is injected only on the listed domains)\n  (none)\n"
        );

        Ok(())
    }

    #[test]
    fn parse_accepts_unknown_version() -> Result<()> {
        // Forward-compat: a manifest emitted by a newer front must still
        // deserialize via the known fields so a stale dsbx in a not-yet-rebuilt
        // image keeps rendering instead of failing closed.
        let manifest: SandboxEnvManifest = serde_json::from_str(
            r#"{
  "version": 2,
  "system": [],
  "config": [],
  "httpsSecrets": []
}"#,
        )?;

        assert_eq!(manifest.version, 2);

        Ok(())
    }
}
