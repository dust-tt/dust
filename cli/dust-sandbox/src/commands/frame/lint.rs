mod project;
mod runtime_types;
mod source;

use std::io::{self, Write};
use std::path::PathBuf;

use anyhow::{bail, Context};
use clap::Args;

#[derive(Args)]
pub struct LintArgs {
    /// Frame folder, manifest.json, or UI entry file
    #[arg(default_value = ".")]
    pub source: PathBuf,
    /// Viz origin (defaults to DUST_VIZ_URL)
    #[arg(long)]
    pub viz_url: Option<String>,
    /// Directory for cached Viz types (defaults to $XDG_CACHE_HOME/dust/frame-types)
    #[arg(long)]
    pub cache_dir: Option<PathBuf>,
}

/// @cc [owner:flvndvd,label:product] frame-lint-diagnostics
/// Lint MUST check the UI entry and its imported source files with the Viz declarations.
/// Diagnostics MUST identify original source paths, lines and columns. Source files MUST NOT
/// be modified or executed. Type errors, lint errors and unavailable tooling MUST fail the command.
pub async fn run(args: LintArgs) -> anyhow::Result<()> {
    if rustix::process::geteuid().is_root() {
        bail!("run Frame lint as the sandbox user, not root");
    }
    let source = source::FrameSource::resolve(&args.source)?;
    let viz_url = args
        .viz_url
        .or_else(|| std::env::var("DUST_VIZ_URL").ok())
        .context("DUST_VIZ_URL is not set. Pass --viz-url to select a Viz server")?;
    let cache_dir = match args.cache_dir {
        Some(directory) => directory,
        None => default_cache_dir()?,
    };
    let types = runtime_types::fetch(&viz_url, &cache_dir).await?;
    let output = project::check(&source, &types).await?;
    io::stdout().write_all(output.stdout.as_bytes())?;
    io::stderr().write_all(output.stderr.as_bytes())?;
    if !output.success {
        bail!("Frame lint failed");
    }
    println!("Frame lint passed: {}", source.entry.display());
    Ok(())
}

fn default_cache_dir() -> anyhow::Result<PathBuf> {
    let root = std::env::var_os("XDG_CACHE_HOME")
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var_os("HOME").map(|directory| PathBuf::from(directory).join(".cache"))
        })
        .context("HOME and XDG_CACHE_HOME are not set. Pass --cache-dir")?;
    Ok(root.join("dust/frame-types"))
}
