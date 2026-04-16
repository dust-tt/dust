mod api;
mod commands;

use clap::{Parser, Subcommand};
use tracing::error;

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
    /// Interact with MCP servers and tools
    Tools {
        /// Server name (omit to list all servers)
        server_name: Option<String>,
        /// Tool name to execute
        tool_name: Option<String>,
        /// Tool arguments as --key value pairs
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
}

#[tokio::main]
async fn main() {
    init_tracing();

    if let Err(error) = run().await {
        error!(error = %error, "dsbx command failed");
        std::process::exit(1);
    }
}

async fn run() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Version => commands::cmd_version(),
        Commands::Tools {
            server_name,
            tool_name,
            args,
        } => {
            let client = api::DustApiClient::from_env()?;
            match (server_name, tool_name) {
                (None, _) => commands::cmd_list_servers(&client).await?,
                (Some(server), None) => commands::cmd_list_tools(&client, &server).await?,
                (Some(server), Some(tool)) => {
                    commands::cmd_exec(&client, &server, &tool, &args).await?
                }
            }
        }
    }

    Ok(())
}

fn init_tracing() {
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

    let subscriber = tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .with_writer(std::io::stderr)
        .json()
        .finish();

    let _ = tracing::subscriber::set_global_default(subscriber);
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
