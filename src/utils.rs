use anyhow::Result;
use colored::Colorize;
use std::path::PathBuf;

#[derive(Debug)]
pub struct ParseError(&'static str);

impl ParseError {
  pub fn with_message(message: &'static str) -> Self {
    Self(message)
  }

  pub fn new() -> Self {
    Self::with_message("parse failed.")
  }
}

impl std::fmt::Display for ParseError {
  fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
    write!(f, "{}", self.0)
  }
}

impl std::error::Error for ParseError {
  fn description(&self) -> &str {
    self.0
  }
}
pub fn init_check() -> Result<PathBuf> {
  let current_dir = match std::env::var("DUST_DIR") {
    Ok(dust_dir) => PathBuf::from(shellexpand::tilde(&dust_dir).into_owned()),
    Err(_) => std::env::current_dir()?,
  };

  let index_path = current_dir.join("index.dust");
  if !index_path.exists() {
    Err(anyhow::anyhow!(
      "Not a Dust directory (index.dust not found in {})",
      current_dir.display()
    ))?
  }

  Ok(current_dir)
}

pub fn info(msg: &str) {
  println!("{} {}", "[I]".yellow(), msg);
}

pub fn action(msg: &str) {
  println!("{} {}", "[A]".green(), msg);
}

pub fn error(msg: &str) {
  println!("{} {}", "[E]".red(), msg);
}
