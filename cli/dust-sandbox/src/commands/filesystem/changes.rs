use std::io::{self, Write};
use std::path::PathBuf;

use anyhow::Context;
use clap::Args;

use super::store::FileStore;

#[derive(Args, Debug)]
pub struct ChangesArgs {
    #[arg(long)]
    state_dir: PathBuf,
}

pub fn run(args: ChangesArgs) -> anyhow::Result<()> {
    let store = FileStore::open(&args.state_dir).context("failed to open filesystem state")?;
    let changes = store
        .changes()
        .context("failed to load filesystem changes")?;
    let stdout = io::stdout();
    let mut output = stdout.lock();
    serde_json::to_writer_pretty(&mut output, &changes)?;
    writeln!(output)?;
    Ok(())
}
