mod api;
mod auth;
mod commands;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "dsbx", version, about = "Dust sandbox CLI")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Print version information
    Version,
    /// Show sandbox login status
    Status,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Version => commands::cmd_version(),
        Commands::Status => commands::cmd_status()?,
        cmd => {
            /// let client = api::DustApiClient::from_env()?;
            /// TODO(adrien): register other commands with the client here
            match cmd {
                Commands::Version | Commands::Status => unreachable!(),
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::CommandFactory;

    #[test]
    fn verify_cli() {
        Cli::command().debug_assert();
    }
}
