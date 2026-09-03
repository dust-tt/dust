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
    /// Create, register, and publish Frames
    Frame {
        #[command(subcommand)]
        command: commands::frame::FrameCommand,
    },
    /// Mount the Dust filesystem
    Filesystem {
        #[command(subcommand)]
        command: commands::FilesystemCommand,
    },
    /// Interact with MCP servers and tools
    Tools {
        /// Emit the tool execution result as JSON (`{ content, isError }`)
        /// instead of plain text; failures emit
        /// `{ error: { code, message, retryable, status? } }` on stdout and
        /// exit non-zero. Must be placed before the positional arguments.
        /// Ignored when listing servers or tools.
        #[arg(long)]
        json: bool,
        /// Tool arguments as a single JSON object (`-` reads it from stdin),
        /// bypassing per-key parsing and coercion entirely. Must be placed
        /// before the positional arguments and cannot be combined with
        /// --key value pairs.
        #[arg(long)]
        args_json: Option<String>,
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
        // `{:#}` prints the whole context chain, not just the outermost
        // message (typed API errors carry the useful part as the cause).
        let error_chain = format!("{error:#}");
        error!(error = %error_chain, "dsbx command failed");
        std::process::exit(exit_code_for(&error));
    }
}

/// Typed failures exit with their stable per-code exit codes; everything else
/// keeps the generic 1 (2 is reserved by clap for usage errors).
fn exit_code_for(error: &anyhow::Error) -> i32 {
    if let Some(api_error) = error.downcast_ref::<api::DustApiError>() {
        return api_error.code.exit_code();
    }
    if error
        .downcast_ref::<commands::OffloadResolutionError>()
        .is_some()
    {
        return commands::OffloadResolutionError::EXIT_CODE;
    }
    1
}

async fn run() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Version => commands::cmd_version(),
        Commands::Forward(args) => commands::cmd_forward(args).await?,
        Commands::Resolve(args) => commands::cmd_resolve(args).await?,
        Commands::Healthcheck(args) => commands::cmd_healthcheck(args)?,
        Commands::Env(args) => commands::cmd_env(args)?,
        Commands::Function { command } => match command {
            commands::function::FunctionCommand::Run {
                name,
                result_delivery: _,
            } => commands::cmd_function_run(&name).await?,
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
        Commands::Frame { command } => match command {
            commands::frame::FrameCommand::Call {
                target,
                function_name,
                input,
            } => commands::cmd_frame_call(&target, &function_name, input.as_deref()).await?,
            commands::frame::FrameCommand::Create {
                directory,
                name,
                description,
            } => commands::cmd_frame_create(&directory, name.as_deref(), &description).await?,
            commands::frame::FrameCommand::Register { manifest } => {
                commands::cmd_frame_register(&manifest).await?
            }
            commands::frame::FrameCommand::Move {
                source,
                destination,
            } => commands::cmd_frame_move(&source, &destination).await?,
            commands::frame::FrameCommand::ShareLink { directory } => {
                commands::cmd_frame_share_link(&directory).await?
            }
            commands::frame::FrameCommand::Validate { manifest } => {
                commands::cmd_frame_validate(&manifest).await?
            }
            commands::frame::FrameCommand::Publish { source } => {
                commands::cmd_frame_publish(&source).await?
            }
        },
        Commands::Filesystem { command } => commands::run_filesystem(command)?,
        Commands::Tools {
            json,
            args_json,
            server_name,
            tool_name,
            args,
        } => {
            let client = api::DustApiClient::from_env()?;
            match (server_name, tool_name) {
                (None, _) => commands::cmd_list_servers(&client).await?,
                (Some(server), None) => commands::cmd_list_tools(&client, &server).await?,
                (Some(server), Some(tool)) => {
                    commands::cmd_exec(&client, &server, &tool, &args, args_json.as_deref(), json)
                        .await?
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

    #[test]
    fn exit_code_classifies_typed_errors() {
        let api_error = anyhow::Error::new(api::DustApiError::from_http_response(429, "slow down"))
            .context("POST /sandbox/actions/call");
        assert_eq!(exit_code_for(&api_error), 13);

        let offload_error = anyhow::Error::new(commands::OffloadResolutionError::new(
            "could not read the offloaded tool output at /files/pod-x/y.json".to_string(),
        ))
        .context("tools exec");
        assert_eq!(exit_code_for(&offload_error), 15);

        assert_eq!(exit_code_for(&anyhow::anyhow!("boom")), 1);
    }

    #[test]
    fn parses_frame_call() {
        for target in [
            "fil_abc123XYZ",
            "/files/conversation-conv_123/Status/manifest.json",
        ] {
            let cli = Cli::try_parse_from([
                "dsbx",
                "frame",
                "call",
                target,
                "get-status",
                "--input",
                r#"{"scope":"current"}"#,
            ])
            .expect("should parse");

            match cli.command {
                Commands::Frame {
                    command:
                        commands::frame::FrameCommand::Call {
                            target: parsed_target,
                            function_name,
                            input,
                        },
                } => {
                    assert_eq!(parsed_target, target);
                    assert_eq!(function_name, "get-status");
                    assert_eq!(input.as_deref(), Some(r#"{"scope":"current"}"#));
                }
                _ => panic!("expected Frame call subcommand"),
            }
        }
    }

    struct ToolsFields {
        json: bool,
        args_json: Option<String>,
        server_name: Option<String>,
        tool_name: Option<String>,
        args: Vec<String>,
    }

    fn tools_fields(cli: Cli) -> ToolsFields {
        match cli.command {
            Commands::Tools {
                json,
                args_json,
                server_name,
                tool_name,
                args,
            } => ToolsFields {
                json,
                args_json,
                server_name,
                tool_name,
                args,
            },
            _ => panic!("expected Tools subcommand"),
        }
    }

    #[test]
    fn json_flag_parses_before_positionals() {
        let cli = Cli::try_parse_from(["dsbx", "tools", "--json", "srv", "tool", "--foo", "bar"])
            .expect("should parse");
        let fields = tools_fields(cli);

        assert!(
            fields.json,
            "--json before positionals should set json=true"
        );
        assert_eq!(fields.server_name.as_deref(), Some("srv"));
        assert_eq!(fields.tool_name.as_deref(), Some("tool"));
        assert_eq!(fields.args, vec!["--foo".to_string(), "bar".to_string()]);
    }

    #[test]
    fn json_flag_after_positionals_is_swallowed_into_args() {
        let cli = Cli::try_parse_from(["dsbx", "tools", "srv", "tool", "--foo", "bar", "--json"])
            .expect("should parse");
        let fields = tools_fields(cli);

        assert!(
            !fields.json,
            "--json after positionals should NOT toggle the flag"
        );
        assert!(
            fields.args.contains(&"--json".to_string()),
            "--json should land in trailing args instead"
        );
    }

    #[test]
    fn tools_without_json_defaults_to_false() {
        let cli = Cli::try_parse_from(["dsbx", "tools", "srv", "tool"]).expect("should parse");
        let fields = tools_fields(cli);
        assert!(!fields.json);
        assert!(fields.args_json.is_none());
    }

    #[test]
    fn args_json_parses_before_positionals() {
        let cli = Cli::try_parse_from([
            "dsbx",
            "tools",
            "--json",
            "--args-json",
            r#"{"query": "hello"}"#,
            "srv",
            "tool",
        ])
        .expect("should parse");
        let fields = tools_fields(cli);

        assert!(fields.json);
        assert_eq!(fields.args_json.as_deref(), Some(r#"{"query": "hello"}"#));
        assert_eq!(fields.server_name.as_deref(), Some("srv"));
        assert_eq!(fields.tool_name.as_deref(), Some("tool"));
        assert!(fields.args.is_empty());
    }

    #[test]
    fn args_json_accepts_stdin_sentinel() {
        let cli = Cli::try_parse_from(["dsbx", "tools", "--args-json", "-", "srv", "tool"])
            .expect("should parse");
        let fields = tools_fields(cli);
        assert_eq!(fields.args_json.as_deref(), Some("-"));
    }

    #[test]
    fn args_json_after_trailing_args_is_swallowed_into_args() {
        // Once the trailing var-arg capture has started (first --key token),
        // --args-json is data, not the flag; same behavior as --json.
        let cli = Cli::try_parse_from([
            "dsbx",
            "tools",
            "srv",
            "tool",
            "--foo",
            "bar",
            "--args-json",
            "{}",
        ])
        .expect("should parse");
        let fields = tools_fields(cli);

        assert!(
            fields.args_json.is_none(),
            "--args-json after trailing args should NOT set the flag"
        );
        assert!(fields.args.contains(&"--args-json".to_string()));
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
                    assert_eq!(result_delivery, commands::function::ResultDelivery::Stdout);
                }
                _ => panic!("expected run"),
            },
            _ => panic!("expected function"),
        }
    }

    // front still sends the flag. Parsing it must keep working until front stops.
    #[test]
    fn function_run_still_accepts_the_result_delivery_flag() {
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
                commands::function::FunctionCommand::Run { name, .. } => {
                    assert_eq!(name, "greet");
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

    #[test]
    fn frame_publish_parses() {
        let cli = Cli::try_parse_from([
            "dsbx",
            "frame",
            "publish",
            "/files/pod-vlt_123/Status/manifest.json",
        ])
        .expect("parse");
        match cli.command {
            Commands::Frame {
                command: commands::frame::FrameCommand::Publish { source },
            } => {
                assert_eq!(
                    source,
                    std::path::PathBuf::from("/files/pod-vlt_123/Status/manifest.json")
                );
            }
            Commands::Frame { .. } => panic!("expected publish"),
            _ => panic!("expected frame"),
        }
    }

    #[test]
    fn frame_validate_parses() {
        let cli = Cli::try_parse_from([
            "dsbx",
            "frame",
            "validate",
            "/files/pod-vlt_123/Status/manifest.json",
        ])
        .expect("parse");
        match cli.command {
            Commands::Frame {
                command: commands::frame::FrameCommand::Validate { manifest },
            } => {
                assert_eq!(
                    manifest,
                    std::path::PathBuf::from("/files/pod-vlt_123/Status/manifest.json")
                );
            }
            Commands::Frame { .. } => panic!("expected validate"),
            _ => panic!("expected frame"),
        }
    }

    #[test]
    fn frame_move_parses() {
        let cli = Cli::try_parse_from([
            "dsbx",
            "frame",
            "move",
            "/files/conversation-conv_123/Status",
            "/files/pod-vlt_123/Status",
        ])
        .expect("parse");
        match cli.command {
            Commands::Frame {
                command:
                    commands::frame::FrameCommand::Move {
                        source,
                        destination,
                    },
            } => {
                assert_eq!(
                    source,
                    std::path::PathBuf::from("/files/conversation-conv_123/Status")
                );
                assert_eq!(
                    destination,
                    std::path::PathBuf::from("/files/pod-vlt_123/Status")
                );
            }
            Commands::Frame { .. } => panic!("expected move"),
            _ => panic!("expected frame"),
        }
    }

    #[test]
    fn frame_share_link_is_read_only() {
        let cli = Cli::try_parse_from([
            "dsbx",
            "frame",
            "share-link",
            "/files/conversation-conv_123/Status",
        ])
        .expect("parse");
        match cli.command {
            Commands::Frame {
                command: commands::frame::FrameCommand::ShareLink { directory },
            } => {
                assert_eq!(
                    directory,
                    std::path::PathBuf::from("/files/conversation-conv_123/Status")
                );
            }
            Commands::Frame { .. } => panic!("expected share-link"),
            _ => panic!("expected frame"),
        }

        assert!(Cli::try_parse_from([
            "dsbx",
            "frame",
            "share-link",
            "/files/conversation-conv_123/Status",
            "--scope",
            "public",
        ])
        .is_err());
        assert!(Cli::try_parse_from([
            "dsbx",
            "frame",
            "share-link",
            "/files/conversation-conv_123/Status",
            "--email",
            "alice@example.com",
        ])
        .is_err());
        assert!(Cli::try_parse_from([
            "dsbx",
            "frame",
            "share",
            "/files/conversation-conv_123/Status",
        ])
        .is_err());
    }
}
