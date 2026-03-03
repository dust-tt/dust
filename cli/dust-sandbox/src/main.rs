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
    /// List available MCP servers
    ListServers,
    /// List tools on an MCP server
    ListTools {
        /// Name of the MCP server
        server_name: String,
    },
    /// Execute a tool on an MCP server
    Exec {
        /// Name of the MCP server
        server_name: String,
        /// Name of the tool to execute
        tool_name: String,
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
        cmd => {
            let client = api::DustApiClient::from_env()?;
            match cmd {
                Commands::ListServers => commands::cmd_list_servers(&client).await?,
                Commands::ListTools { server_name } => {
                    commands::cmd_list_tools(&client, &server_name).await?
                }
                Commands::Exec {
                    server_name,
                    tool_name,
                    args,
                } => commands::cmd_exec(&client, &server_name, &tool_name, &args).await?,
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
