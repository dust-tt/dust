mod api;
mod commands;
mod egress_secrets;

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
    /// Forward sandbox egress traffic to the Dust egress proxy
    Forward(commands::forward::ForwardArgs),
    /// Interact with MCP servers and tools
    Tools {
        /// Emit the tool execution result as JSON (`{ content, isError }`)
        /// instead of plain text. Must be placed before the positional
        /// arguments. Ignored when listing servers or tools.
        #[arg(long)]
        json: bool,
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
        Commands::Forward(args) => commands::cmd_forward(args).await?,
        Commands::Tools {
            json,
            server_name,
            tool_name,
            args,
        } => {
            let client = api::DustApiClient::from_env()?;
            match (server_name, tool_name) {
                (None, _) => commands::cmd_list_servers(&client).await?,
                (Some(server), None) => commands::cmd_list_tools(&client, &server).await?,
                (Some(server), Some(tool)) => {
                    commands::cmd_exec(&client, &server, &tool, &args, json).await?
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

    fn tools_fields(cli: Cli) -> (bool, Option<String>, Option<String>, Vec<String>) {
        match cli.command {
            Commands::Tools {
                json,
                server_name,
                tool_name,
                args,
            } => (json, server_name, tool_name, args),
            _ => panic!("expected Tools subcommand"),
        }
    }

    #[test]
    fn json_flag_parses_before_positionals() {
        let cli = Cli::try_parse_from(["dsbx", "tools", "--json", "srv", "tool", "--foo", "bar"])
            .expect("should parse");
        let (json, server, tool, args) = tools_fields(cli);

        assert!(json, "--json before positionals should set json=true");
        assert_eq!(server.as_deref(), Some("srv"));
        assert_eq!(tool.as_deref(), Some("tool"));
        assert_eq!(args, vec!["--foo".to_string(), "bar".to_string()]);
    }

    #[test]
    fn json_flag_after_positionals_is_swallowed_into_args() {
        let cli = Cli::try_parse_from(["dsbx", "tools", "srv", "tool", "--foo", "bar", "--json"])
            .expect("should parse");
        let (json, _, _, args) = tools_fields(cli);

        assert!(!json, "--json after positionals should NOT toggle the flag");
        assert!(
            args.contains(&"--json".to_string()),
            "--json should land in trailing args instead"
        );
    }

    #[test]
    fn tools_without_json_defaults_to_false() {
        let cli = Cli::try_parse_from(["dsbx", "tools", "srv", "tool"]).expect("should parse");
        let (json, ..) = tools_fields(cli);
        assert!(!json);
    }
}
