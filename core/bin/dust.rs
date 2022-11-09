use anyhow::Result;
use clap::{Parser, Subcommand};
use dust::{app, blocks::block::BlockType, dataset, init, providers::provider, run, utils};

#[derive(Parser)]
#[clap(author, version, about, long_about = None)]
struct Cli {
    #[clap(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Initialize a new Dust project
    Init {
        /// Path to the directory to init
        #[clap(value_parser, default_value = ".")]
        path: String,
    },
    /// Manage versioned JSONL dataset files
    Dataset {
        #[clap(subcommand)]
        command: DatasetCommands,
    },
    /// Manage model providers
    Provider {
        #[clap(subcommand)]
        command: ProviderCommands,
    },
    /// Run the app on a dataset
    App {
        #[clap(subcommand)]
        command: AppCommands,
    },
    /// Manage and introspect previous runs
    Run {
        #[clap(subcommand)]
        command: RunCommands,
    },
}

#[derive(Subcommand)]
enum DatasetCommands {
    /// Registers or udpates a new dataset JSONL version under the provided id. The JSONL data will
    /// be checked and stored in the Dust project store.
    Register {
        /// Dataset id to register or update
        #[clap(value_parser, required = true)]
        dataset_id: String,
        /// Path to the JSONL dataset file
        #[clap(value_parser, required = true)]
        jsonl_path: String,
    },
}

#[derive(Subcommand)]
enum ProviderCommands {
    /// Provides instructions to setup a new provider.
    Setup {
        /// Provider id
        #[clap(value_parser, required = true)]
        provider_id: provider::ProviderID,
    },
    /// Tests whether a provider is properly setup.
    Test {
        /// Provider id
        #[clap(value_parser, required = true)]
        provider_id: provider::ProviderID,
    },
}

#[derive(Subcommand)]
enum AppCommands {
    /// Runs an app on registered data using the specified model
    Run {
        /// Dataset id to run the app on
        #[clap(value_parser, required = true)]
        dataset_id: String,

        /// Run config path (JSON)
        #[clap(value_parser, required = true)]
        config_path: String,
    },
}

#[derive(Subcommand)]
enum RunCommands {
    /// List all previous runs
    List {},
    /// Inspect data from a previous run
    Inspect {
        /// Run id to inspect
        #[clap(value_parser, required = true)]
        run_id: String,

        /// Block type to inspect
        #[clap(value_parser, required = true)]
        block_type: BlockType,

        /// Block name to inspect
        #[clap(value_parser, required = true)]
        block_name: String,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .thread_name("dust")
        .worker_threads(32)
        .build()?;

    let err = match &cli.command {
        Commands::Init { path } => rt.block_on(init::cmd_init(path)),
        Commands::Dataset { command } => match command {
            DatasetCommands::Register {
                dataset_id,
                jsonl_path,
            } => rt.block_on(dataset::cmd_register(dataset_id, jsonl_path)),
        },
        Commands::Provider { command } => match command {
            ProviderCommands::Setup { provider_id } => {
                rt.block_on(provider::cmd_setup(*provider_id))
            }
            ProviderCommands::Test { provider_id } => rt.block_on(provider::cmd_test(*provider_id)),
        },
        Commands::App { command } => match command {
            AppCommands::Run {
                dataset_id,
                config_path,
            } => rt.block_on(app::cmd_run(dataset_id, config_path)),
        },
        Commands::Run { command } => match command {
            RunCommands::List {} => rt.block_on(run::cmd_list()),
            RunCommands::Inspect {
                run_id,
                block_type,
                block_name,
            } => rt.block_on(run::cmd_inspect(run_id, *block_type, block_name)),
        },
    };

    match err {
        Err(e) => {
            utils::error(&format!("{}", e));
        }
        _ => (),
    }

    Ok(())
}
