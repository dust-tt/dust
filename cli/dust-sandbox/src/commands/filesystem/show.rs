use std::io::{self, Write};
use std::path::PathBuf;

use anyhow::Context;
use clap::Args;

use super::store::FileStore;

#[derive(Args, Debug)]
pub struct ShowArgs {
    #[arg(long)]
    state_dir: PathBuf,
    /// Path below the mount, for example conversation/frame.tsx
    path: PathBuf,
}

pub fn run(args: ShowArgs) -> anyhow::Result<()> {
    let store = FileStore::open(&args.state_dir).context("failed to open filesystem state")?;
    let info = store
        .path_info(&args.path)
        .with_context(|| format!("failed to find {}", args.path.display()))?;
    let stdout = io::stdout();
    let mut output = stdout.lock();
    serde_json::to_writer_pretty(&mut output, &info)?;
    writeln!(output)?;
    Ok(())
}
