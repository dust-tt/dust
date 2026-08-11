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
    /// Run the local synthetic DNS resolver for proxied agent traffic
    Resolve(commands::resolve::ResolveArgs),
    /// Report sandbox egress enforcement health as JSON
    Healthcheck(commands::healthcheck::HealthcheckArgs),
    /// List sandbox environment variables and DSEC allowlists
    Env(commands::env::EnvArgs),
    /// Mount the Dust conversation and pod filesystem
    Filesystem(commands::filesystem::FilesystemArgs),
    /// Run or inspect sandbox functions
    Function {
        #[command(subcommand)]
        command: commands::function::FunctionCommand,
    },
    /// Manage pod databases
    Db {
        #[command(subcommand)]
        command: commands::db::DbCommand,
    },
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
        Commands::Resolve(args) => commands::cmd_resolve(args).await?,
        Commands::Healthcheck(args) => commands::cmd_healthcheck(args)?,
        Commands::Env(args) => commands::cmd_env(args)?,
        Commands::Filesystem(args) => commands::cmd_filesystem(args)?,
        Commands::Function { command } => match command {
            commands::function::FunctionCommand::Run {
                name,
                result_delivery,
            } => commands::cmd_function_run(&name, result_delivery).await?,
            commands::function::FunctionCommand::Get { name } => {
                commands::cmd_function_get(&name).await?
            }
            commands::function::FunctionCommand::Build {
                src,
                out_bundle,
                out_schema,
            } => commands::cmd_function_build(&src, &out_bundle, &out_schema).await?,
        },
        Commands::Db { command } => match command {
            commands::db::DbCommand::Reconcile { name, schema_file } => {
                commands::cmd_db_reconcile(&name, &schema_file).await?
            }
            commands::db::DbCommand::Schema { name, out_schema } => {
                commands::cmd_db_schema(&name, &out_schema).await?
            }
            commands::db::DbCommand::List => commands::cmd_db_list()?,
            commands::db::DbCommand::Query { name } => commands::cmd_db_query(&name).await?,
        },
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

    #[test]
    fn function_run_parses() {
        let cli = Cli::try_parse_from(["dsbx", "function", "run", "greet"]).expect("parse");
        match cli.command {
            Commands::Function { command } => match command {
                commands::function::FunctionCommand::Run {
                    name,
                    result_delivery,
                } => {
                    assert_eq!(name, "greet");
                    assert_eq!(
                        result_delivery,
                        commands::function::ResultDelivery::Callback
                    );
                }
                _ => panic!("expected run"),
            },
            _ => panic!("expected function"),
        }
    }

    #[test]
    fn function_run_parses_stdout_result_delivery() {
        let cli = Cli::try_parse_from([
            "dsbx",
            "function",
            "run",
            "--result-delivery",
            "stdout",
            "greet",
        ])
        .expect("parse");
        match cli.command {
            Commands::Function { command } => match command {
                commands::function::FunctionCommand::Run {
                    name,
                    result_delivery,
                } => {
                    assert_eq!(name, "greet");
                    assert_eq!(result_delivery, commands::function::ResultDelivery::Stdout);
                }
                _ => panic!("expected run"),
            },
            _ => panic!("expected function"),
        }
    }

    #[test]
    fn function_get_parses() {
        let cli = Cli::try_parse_from(["dsbx", "function", "get", "greet"]).expect("parse");
        match cli.command {
            Commands::Function { command } => match command {
                commands::function::FunctionCommand::Get { name } => assert_eq!(name, "greet"),
                _ => panic!("expected get"),
            },
            _ => panic!("expected function"),
        }
    }

    #[test]
    fn db_reconcile_parses() {
        let cli = Cli::try_parse_from([
            "dsbx",
            "db",
            "reconcile",
            "chat",
            "/files/pod-x/databases/chat.db.ts",
        ])
        .expect("parse");
        match cli.command {
            Commands::Db { command } => match command {
                commands::db::DbCommand::Reconcile { name, schema_file } => {
                    assert_eq!(name, "chat");
                    assert_eq!(schema_file, "/files/pod-x/databases/chat.db.ts");
                }
                _ => panic!("expected reconcile"),
            },
            _ => panic!("expected db"),
        }
    }

    #[test]
    fn db_schema_parses() {
        let cli = Cli::try_parse_from(["dsbx", "db", "schema", "chat", "/tmp/out/chat.db.ts"])
            .expect("parse");
        match cli.command {
            Commands::Db { command } => match command {
                commands::db::DbCommand::Schema { name, out_schema } => {
                    assert_eq!(name, "chat");
                    assert_eq!(out_schema, "/tmp/out/chat.db.ts");
                }
                _ => panic!("expected schema"),
            },
            _ => panic!("expected db"),
        }
    }

    #[test]
    fn db_list_parses() {
        let cli = Cli::try_parse_from(["dsbx", "db", "list"]).expect("parse");
        match cli.command {
            Commands::Db { command } => match command {
                commands::db::DbCommand::List => {}
                _ => panic!("expected list"),
            },
            _ => panic!("expected db"),
        }
    }

    #[test]
    fn db_query_parses() {
        let cli = Cli::try_parse_from(["dsbx", "db", "query", "chat"]).expect("parse");
        match cli.command {
            Commands::Db { command } => match command {
                commands::db::DbCommand::Query { name } => assert_eq!(name, "chat"),
                _ => panic!("expected query"),
            },
            _ => panic!("expected db"),
        }
    }

    #[test]
    fn db_reconcile_requires_schema_file() {
        assert!(Cli::try_parse_from(["dsbx", "db", "reconcile", "chat"]).is_err());
    }

    #[test]
    fn function_build_parses() {
        let cli = Cli::try_parse_from([
            "dsbx",
            "function",
            "build",
            "/files/pod-x/greet.ts",
            "/tmp/out/greet.ts",
            "/tmp/out/greet.schema.json",
        ])
        .expect("parse");
        match cli.command {
            Commands::Function { command } => match command {
                commands::function::FunctionCommand::Build {
                    src,
                    out_bundle,
                    out_schema,
                } => {
                    assert_eq!(src, "/files/pod-x/greet.ts");
                    assert_eq!(out_bundle, "/tmp/out/greet.ts");
                    assert_eq!(out_schema, "/tmp/out/greet.schema.json");
                }
                _ => panic!("expected build"),
            },
            _ => panic!("expected function"),
        }
    }
}
