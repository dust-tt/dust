use anyhow::Result;
use clap::{Parser, Subcommand};
use dust::{
    app,
    blocks::block::BlockType,
    dataset,
    datasources::{
        datasource::{self, DataSourceConfig},
        splitter::SplitterID,
    },
    init,
    providers::provider,
    run, utils,
};

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
    /// Manage DataSources
    DataSource {
        #[clap(subcommand)]
        command: DataSourceCommands,
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

#[derive(Subcommand)]
enum DataSourceCommands {
    /// Registers a new DataSource
    Register {
        /// DataSource id to register
        #[clap(value_parser, required = true)]
        data_source_id: String,

        /// Provider id
        #[clap(value_parser, required = true)]
        provider_id: provider::ProviderID,

        /// Model id
        #[clap(value_parser, required = true)]
        model_id: String,

        /// Maximum chunk size when embedding
        #[clap(value_parser, required = true)]
        max_chunk_size: usize,
    },
    /// Upserts a document
    Upsert {
        /// DataSource id to upsert to
        #[clap(value_parser, required = true)]
        data_source_id: String,

        /// Document id to upsert
        #[clap(value_parser, required = true)]
        document_id: String,

        /// Document path (text)
        #[clap(value_parser, required = true)]
        text_path: String,

        /// Document tags
        #[clap(value_parser, required = false)]
        tags: Vec<String>,
    },
    /// Searches a DataSource
    Search {
        /// DataSource id to search from
        #[clap(value_parser, required = true)]
        data_source_id: String,

        /// Query
        #[clap(value_parser, required = true)]
        query: String,

        /// Number of results to return
        #[clap(value_parser, required = true)]
        top_k: usize,
    },
    /// List documents
    List {
        /// DataSource id to list from
        #[clap(value_parser, required = true)]
        data_source_id: String,
    },
    /// Deletes a document
    Delete {
        /// DataSource id to delete from
        #[clap(value_parser, required = true)]
        data_source_id: String,

        /// Document id to delete
        #[clap(value_parser, required = true)]
        document_id: String,
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
        Commands::DataSource { command } => match command {
            DataSourceCommands::Register {
                data_source_id,
                provider_id,
                model_id,
                max_chunk_size,
            } => rt.block_on(datasource::cmd_register(
                data_source_id,
                &DataSourceConfig {
                    provider_id: *provider_id,
                    model_id: model_id.to_string(),
                    extras: None,
                    splitter_id: SplitterID::BaseV0,
                    max_chunk_size: *max_chunk_size,
                    use_cache: false,
                },
            )),
            DataSourceCommands::Upsert {
                data_source_id,
                document_id,
                tags,
                text_path,
            } => rt.block_on(datasource::cmd_upsert(
                data_source_id,
                document_id,
                None,
                tags,
                text_path,
            )),
            DataSourceCommands::Search {
                data_source_id,
                query,
                top_k,
            } => rt.block_on(datasource::cmd_search(data_source_id, query, *top_k)),
            DataSourceCommands::List { data_source_id } => {
                rt.block_on(datasource::cmd_list(data_source_id))
            }
            DataSourceCommands::Delete {
                data_source_id,
                document_id,
            } => rt.block_on(datasource::cmd_delete(data_source_id, document_id)),
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
