use crate::utils;
use anyhow::Result;

/// Initializing a Dust project consists in creating:
///
/// - a placeholder `index.dust` file with the content of `index.dust` in this file's directory.
/// - a `data` directory (versioned data files).
/// - a `blocks` directory (versioned blocks definitions).
/// - a `cache` directory (cached block execution traces).
pub fn init(target: String) -> Result<()> {
  let target = &shellexpand::tilde(&target).into_owned();
  let target = std::path::Path::new(target);

  utils::info(&format!("Initializing Dust project in {}", target.display()));

  if target.exists() {
    if target.is_file() {
      return Err(anyhow::anyhow!("{} is a file", target.display()));
    }
  } else {
    println!("Creating target directory {}", target.display());
    std::fs::create_dir_all(target)?;
  }

  if target.join("index.dust").exists() {
    return Err(anyhow::anyhow!(
      "{} already exists",
      target.join("index.dust").display()
    ));
  }

  let dirs = vec![
    target.join(".data"),
    target.join(".blocks"),
    target.join(".cache"),
  ];
  for dir in dirs.clone() {
    if dir.exists() {
      return Err(anyhow::anyhow!("{} already exists", dir.display()));
    }
  }

  let index_path = std::path::Path::new(file!())
    .parent()
    .unwrap()
    .join("index.dust");
  let index_content = std::fs::read_to_string(&index_path)?;

  utils::action(&format!("Creating {}", target.join("index.dust").display()));
  std::fs::write(target.join("index.dust"), index_content)?;

  for dir in dirs {
    utils::action(&format!("Creating {}", dir.display()));
    std::fs::create_dir(dir)?;
  }

  utils::info(&format!("Initialized Dust project in {}", target.display()));

  Ok(())
}
