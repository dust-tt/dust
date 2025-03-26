use anyhow::Result;
use clap::Parser;
use dust::databases::{remote_databases::remote_database::get_remote_database, table::Table};
use dust::project::Project;
use dust::utils;
use tokio;

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// The Salesforce connection string
    #[arg(long)]
    connection_string: String,
}

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    let args = Args::parse();

    let db = get_remote_database(&args.connection_string).await?;

    let r = db
        .authorize_and_execute_query(
            &vec![Table::new(
                Project::new_from_id(0),
                "salesforce".to_string(),
                "Account".to_string(),
                utils::now(),
                "Account".to_string(),
                "Account".to_string(),
                "Salesforce Account".to_string(),
                utils::now(),
                "Account".to_string(),
                "application/json".to_string(),
                None,
                vec![],
                None,
                vec![],
                None,
                None,
                None,
                None,
                None,
            )],
            "SELECT Id, Name, AnnualRevenue, JigsawCompanyId, NumberOfEmployees FROM Account",
        )
        .await?;

    Ok(())
}
