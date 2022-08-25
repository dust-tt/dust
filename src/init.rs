use crate::utils;
use anyhow::Result;

/// Initializing a Dust project consists in creating:
///
/// - a placeholder `index.dust` file with the content of `index.dust` in this file's directory.
/// - a `data` directory (versioned data files).
/// - a `blocks` directory (versioned blocks definitions).
/// - a `cache` directory (cached block execution traces).
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

    let dirs = vec![
        target.join(".data"),
        target.join(".blocks"),
        target.join(".cache"),
    ];
    for dir in dirs.clone() {
        if dir.exists().await {
            Err(anyhow::anyhow!("{} already exists", dir.display()))?;
        }
    }

    // TODO(spolu): probably won't work once packaged?
    let index_path = async_std::path::Path::new(std::env!("CARGO_MANIFEST_DIR"))
        .join(file!())
        .parent()
        .unwrap()
        .join("index.dust");
    let index_content = async_std::fs::read_to_string(&index_path).await?;

    utils::action(&format!("Creating {}", target.join("index.dust").display()));
    async_std::fs::write(target.join("index.dust"), index_content).await?;

    for dir in dirs {
        utils::action(&format!("Creating {}", dir.display()));
        async_std::fs::create_dir(dir).await?;
    }

    utils::done(&format!("Initialized Dust project in {}", target.display()));

    Ok(())
}
