use anyhow::Result;
use clap::{Parser, Subcommand};
use dust::{data, init, providers::provider, utils};

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
        #[clap(default_value = ".")]
        path: String,
    },
    /// Manage versioned JSONL data files
    Data {
        #[clap(subcommand)]
        command: DataCommands,
    },
    /// Manage model provicers
    Provider {
        #[clap(subcommand)]
        command: ProviderCommands,
    },
}

#[derive(Subcommand)]
enum DataCommands {
    /// Registers or udpates a new data JSONL version under the provided id. The JSONL data will be
    /// checked and stored in the Dust directory under `.data/<id>/<hash>`.
    Register {
        /// Data id to register or update
        #[clap()]
        id: String,
        /// Path to the JSONL data file
        #[clap()]
        path: String,
    },
}

#[derive(Subcommand)]
enum ProviderCommands {
    /// Provides instructions to setup a new provider.
    Setup {
        /// Provider id
        #[clap()]
        provider_id: provider::ProviderID,
    },
    /// Tests whether a provider is properly setup.
    Test {
        /// Provider id
        #[clap()]
        provider_id: provider::ProviderID,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    let err = match &cli.command {
        Commands::Init { path } => init::init(path.clone()),
        Commands::Data { command } => match command {
            DataCommands::Register { id, path } => data::register(id.clone(), path.clone()),
        },
        Commands::Provider { command } => match command {
            ProviderCommands::Setup { provider_id } => provider::provider(*provider_id).setup(),
            ProviderCommands::Test { provider_id } => {
                let rt = tokio::runtime::Builder::new_multi_thread()
                    .enable_all()
                    .thread_name("dust-provider-test")
                    .worker_threads(1)
                    .build()?;

                rt.block_on(provider::provider(*provider_id).test())
            }
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

//use js_sandbox::{AnyError, Script};
//use serde::Serialize;
//use std::fs;

// extern crate pest;
// #[macro_use]
// extern crate pest_derive;
//
// use pest::Parser;
//
// #[derive(Parser)]
// #[grammar = "dust.pest"]
// pub struct DustParser;

// #[derive(Serialize, PartialEq)]
// struct Person {
//     name: String,
//     age: u8,
// }

// fn main2() -> Result<()> {
// let successful_parse = DustParser::parse(Rule::field, "-273.15");
// println!("{:?}", successful_parse);

// let unsuccessful_parse = DustParser::parse(Rule::field, "this is not a number");
// println!("{:?}", unsuccessful_parse);

// let unparsed_file = fs::read_to_string("../example.dust")?;
// let parsed = DustParser::parse(Rule::dust, &unparsed_file)?
//     .next()
//     .unwrap();

// for record in parsed.into_inner() {
//     println!("{:?}", record);
// }

// let mut field_sum: f64 = 0.0;
// let mut record_count: u64 = 0;

// for record in file.into_inner() {
//     match record.as_rule() {
//         Rule::record => {
//             record_count += 1;

//             for field in record.into_inner() {
//                 field_sum += field.as_str().parse::<f64>().unwrap();
//             }
//         }
//         Rule::EOI => (),
//         _ => unreachable!(),
//     }
// }

// println!("Sum of fields: {}", field_sum);
// println!("Number of records: {}", record_count);

// let src = r#"
//     let foo = (env) => {
//         let s = env.get('ROOT')['subject'];
//         let d = env.get('ROOT')['difficulty'];
//         return env.get('MATHD').filter((r) => (r['subject'] === s && r['difficulty'] === d));
//     };
//
//	function toString(person) {
//         let s = "FOOaaabbbbbc";
//         let m = s.match(/ab+c/);
//         [1,2,3].filter((x) => x > 1);
//         // const req = new Request("https://example.com", {
//         //     method: "DELETE",
//         // });
//		return m[0];
//	};"#;

// let mut script = Script::from_string(src).expect("Initialization succeeds");

// let person = Person {
//     name: "Roger".to_string(),
//     age: 42,
// };
// let result: String = script.call("toString", &person)?;

// println!("{:?}", result);

// Ok(())
// }
