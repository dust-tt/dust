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
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Version => commands::cmd_version(),
        Commands::Status => commands::cmd_status()?,
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

#[cfg(test)]
mod tests {
    use super::*;
    use clap::CommandFactory;

    #[test]
    fn verify_cli() {
        Cli::command().debug_assert();
    }
}
