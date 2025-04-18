use anyhow::Result;
use clap::Parser;
use dust::http::replay;
use std::path::PathBuf;

#[derive(Debug, Parser)]
#[command(name = "analyze_requests")]
#[command(about = "Analyze requests for private IPs", long_about = None)]
struct Cli {
    /// Input file containing request logs.
    #[arg(short, long)]
    input_file: PathBuf,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Cli::parse();
    replay::analyze_requests_file(&args.input_file).await?;
    Ok(())
}
