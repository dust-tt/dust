use anyhow::{anyhow, Result};

use dust::{
    app::App,
    project::Project,
    stores::{postgres, store},
};

async fn print_specification_hashes(project_id: i64, hash: &str) -> Result<()> {
    // Initialize postgres store using env var
    // Initialize your store here based on your environment
    let store: Box<dyn store::Store + Sync + Send> = match std::env::var("CORE_DATABASE_URI") {
        Ok(db_uri) => {
            let store = postgres::PostgresStore::new(&db_uri).await?;
            Box::new(store)
        }
        Err(_) => Err(anyhow!("CORE_DATABASE_URI is required (postgres)"))?,
    };

    let project = Project::new_from_id(project_id);

    println!("Loading specification {} for project {}", hash, project_id);

    let specification = match store.load_specification(&project, hash).await? {
        None => {
            println!("No specification found for hash {}", hash);
            return Ok(());
        }
        Some((_, s)) => s,
    };

    let app = App::new(&specification).await?;

    println!("\nBlock hashes:");
    let mut hashes: Vec<String> = Vec::new();
    let mut prev_hash: String = "".to_string();
    for (hash, name, block) in &app.blocks {
        let mut hasher = blake3::Hasher::new();
        hasher.update(prev_hash.as_bytes());
        hasher.update(name.as_bytes());
        hasher.update(hash.as_bytes());

        println!("BLOCK HASH FOR BLOCK {} / HASH {}", name, hash);

        prev_hash = format!("{}", hasher.finalize().to_hex());
        hashes.push(prev_hash.clone());
    }

    println!("\nFinal app hash: {}", app.hash());
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    // Get args from env or command line
    let project_id = std::env::args()
        .nth(1)
        .expect("Missing project_id argument")
        .parse::<i64>()?;
    let hash = std::env::args().nth(2).expect("Missing hash argument");

    print_specification_hashes(project_id, &hash).await?;
    Ok(())
}
