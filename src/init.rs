use crate::{stores::{sqlite::SQLiteStore, store::Store}, utils};
use anyhow::Result;

/// Initializing a Dust project. Consists in creating:
/// - a placeholder `index.dust` file
/// - a sqlite store `store.sqlite` file
pub async fn cmd_init(target: &str) -> Result<()> {
    let target = &shellexpand::tilde(target).into_owned();
    let target = async_std::path::Path::new(target);

    utils::info(&format!(
        "Initializing Dust project in {}",
        target.display()
    ));

    if target.exists().await {
        if target.is_file().await {
            return Err(anyhow::anyhow!("{} is a file", target.display()));
        }
    } else {
        utils::action(&format!("Creating target directory {}", target.display()));
        async_std::fs::create_dir_all(target).await?;
    }

    if target.join("index.dust").exists().await {
        Err(anyhow::anyhow!(
            "{} already exists",
            target.join("index.dust").display()
        ))?;
    }

    let index_path = target.join("index.dust");
    utils::action(&format!("Creating {}", index_path.display()));
    async_std::fs::write(
        &index_path,
        "root ROOT {\
           expected: {foo, bar}\
         }",
    )
    .await?;

    let store_path = target.join("store.sqlite");
    utils::action(&format!("Creating {}", store_path.display()));
    let store = SQLiteStore::new(&store_path)?;
    store.init().await?;

    let project = store.create_project().await?;
    assert!(project.project_id() == 1);


    utils::done(&format!("Initialized Dust project in {}", target.display()));

    Ok(())
}