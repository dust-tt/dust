use std::io::{self, Write};
use std::path::PathBuf;

use anyhow::Context;
use clap::Args;

use super::store::FileStore;

#[derive(Args, Debug)]
pub struct AttachArgs {
    #[arg(long)]
    state_dir: PathBuf,
    /// Path below the mount, for example conversation/frame.tsx
    path: PathBuf,
    #[arg(long)]
    file_resource_id: String,
}

pub fn run(args: AttachArgs) -> anyhow::Result<()> {
    let mut store = FileStore::open(&args.state_dir).context("failed to open filesystem state")?;
    let info = store
        .attach_file_resource(&args.path, &args.file_resource_id)
        .with_context(|| format!("failed to attach {}", args.path.display()))?;
    let stdout = io::stdout();
    let mut output = stdout.lock();
    serde_json::to_writer_pretty(&mut output, &info)?;
    writeln!(output)?;
    Ok(())
}
