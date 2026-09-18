use std::fs;
use std::path::PathBuf;
use std::process::Stdio;

use anyhow::{ensure, Context};
use clap::Args;
use tokio::process::Command;

#[derive(Args)]
pub struct LintArgs {
    /// Frame folder using the standard UI, functions/ and databases/ layout
    #[arg(default_value = ".")]
    pub source: PathBuf,
    /// Viz origin (defaults to DUST_VIZ_URL)
    #[arg(long)]
    pub viz_url: Option<String>,
    /// Directory for cached Viz types (defaults to $XDG_CACHE_HOME/dust/frame-types)
    #[arg(long)]
    pub cache_dir: Option<PathBuf>,
}

pub async fn run(args: LintArgs) -> anyhow::Result<()> {
    ensure!(
        !rustix::process::geteuid().is_root(),
        "run Frame lint as the sandbox user, not root"
    );
    let scripts = tempfile::tempdir()?;
    for (name, contents) in [
        ("lint.sh", include_str!("../../../frame-lint/lint.sh")),
        (
            "tsconfig.json",
            include_str!("../../../frame-lint/tsconfig.json"),
        ),
        (
            "oxlintrc.json",
            include_str!("../../../frame-lint/oxlintrc.json"),
        ),
    ] {
        fs::write(scripts.path().join(name), contents)?;
    }
    let mut command = Command::new("bash");
    command.arg(scripts.path().join("lint.sh")).arg(args.source);
    if let Some(url) = args.viz_url {
        command.env("DUST_VIZ_URL", url);
    }
    if let Some(directory) = args.cache_dir {
        command.env("DUST_FRAME_TYPES_CACHE", directory);
    }
    let status = command
        .stdin(Stdio::null())
        .kill_on_drop(true)
        .status()
        .await
        .context("failed to run the Frame lint script")?;
    ensure!(status.success(), "Frame lint failed");
    Ok(())
}
