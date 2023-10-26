use anyhow::Result;
use async_std::path::PathBuf;
use std::io::Write;
use uuid::Uuid;

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

pub async fn init_check() -> Result<PathBuf> {
    let current_dir = tokio::task::spawn_blocking(|| match std::env::var("DUST_DIR") {
        Ok(dust_dir) => PathBuf::from(shellexpand::tilde(&dust_dir).into_owned()),
        Err(_) => PathBuf::from(std::env::current_dir().unwrap()),
    })
    .await?;

    let index_path = current_dir.join("index.dust");
    if !index_path.exists().await {
        Err(anyhow::anyhow!(
            "Not a Dust directory (index.dust not found in {})",
            current_dir.display()
        ))?
    }

    let store_path = current_dir.join("store.sqlite");
    if !store_path.exists().await {
        Err(anyhow::anyhow!(
            "Not a Dust directory (store.sqlite not found in {})",
            current_dir.display()
        ))?
    }

    Ok(current_dir)
}

pub fn new_id() -> String {
    let s = Uuid::new_v4();
    let mut hasher = blake3::Hasher::new();
    hasher.update(s.as_bytes());
    format!("{}", hasher.finalize().to_hex())
}

pub fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

// TODO(spolu): maybe make async eventually
pub fn info(msg: &str) {
    println!("{} {}", "[i]", msg);
}

pub fn action(msg: &str) {
    println!("{} {}", "[·]", msg);
}

pub fn error(msg: &str) {
    println!("{} {}", "[!]", msg);
}

pub fn done(msg: &str) {
    println!("{} {}", "[✓]", msg);
}

pub fn confirm(msg: &str) -> Result<bool> {
    print!("{} {} Confirm ([y]/n) ? ", "[?]", msg);
    std::io::stdout().flush()?;

    let mut input = String::new();
    std::io::stdin().read_line(&mut input)?;

    if input.trim().len() > 0 && input.trim() != "y" {
        Ok(false)
    } else {
        Ok(true)
    }
}
