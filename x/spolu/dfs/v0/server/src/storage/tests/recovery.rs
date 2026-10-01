use std::{io::Write, process::Stdio};

use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::Command,
};

use super::*;

#[tokio::test]
async fn acknowledged_batch_survives_process_kill() -> Result<()> {
    let directory = tempfile::tempdir()?;
    exercise_recovery(
        "local",
        directory.path().to_str().context("non-UTF-8 temp path")?,
        "recovery",
    )
    .await
}

#[tokio::test]
async fn cached_process_kill_discards_pending_state_and_keeps_the_durable_prefix() -> Result<()> {
    let directory = tempfile::tempdir()?;
    let location = directory.path().to_str().context("non-UTF-8 temp path")?;
    for mode in ["pending", "durable"] {
        exercise_with_mode("local", location, &format!("cached-{mode}"), Some(mode)).await?;
    }
    Ok(())
}

pub(super) async fn exercise_recovery(backend: &str, location: &str, prefix: &str) -> Result<()> {
    exercise_with_mode(backend, location, prefix, None).await
}

async fn exercise_with_mode(
    backend: &str,
    location: &str,
    prefix: &str,
    cached: Option<&str>,
) -> Result<()> {
    let mut writer_command = command(backend, location, prefix, "write")?;
    if let Some(mode) = cached {
        writer_command.env("DFS_RECOVERY_CACHED", mode);
    }
    let mut writer = writer_command.spawn()?;
    let stdout = writer.stdout.take().context("missing worker stdout")?;
    let mut lines = BufReader::new(stdout).lines();
    let object_id = tokio::time::timeout(Duration::from_secs(60), async {
        while let Some(line) = lines.next_line().await? {
            if let Some((_, id)) = line.split_once("DFS_ACK:") {
                return id.parse::<ObjectId>().map_err(anyhow::Error::from);
            }
        }
        bail!("writer exited before acknowledging its batch")
    })
    .await??;
    writer.kill().await?;
    let mut reader_command = command(backend, location, prefix, "read")?;
    reader_command.env("DFS_RECOVERY_OBJECT", object_id.to_string());
    if let Some(mode) = cached {
        reader_command.env("DFS_RECOVERY_CACHED", mode);
    }
    let reader = reader_command.spawn()?;
    let output = tokio::time::timeout(Duration::from_secs(60), reader.wait_with_output()).await??;
    ensure!(
        output.status.success(),
        "recovery reader failed: {}",
        String::from_utf8_lossy(&output.stdout)
    );
    Ok(())
}

fn command(backend: &str, location: &str, prefix: &str, mode: &str) -> Result<Command> {
    let mut command = Command::new(std::env::current_exe()?);
    command
        .args([
            "storage::tests::recovery::worker",
            "--ignored",
            "--exact",
            "--nocapture",
        ])
        .env("DFS_RECOVERY_BACKEND", backend)
        .env("DFS_RECOVERY_LOCATION", location)
        .env("DFS_RECOVERY_PREFIX", prefix)
        .env("DFS_RECOVERY_MODE", mode)
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .kill_on_drop(true);
    Ok(command)
}

/// Runs only in a child process; the writer is killed without closing SlateDB.
#[tokio::test]
#[ignore = "internal recovery subprocess"]
async fn worker() -> Result<()> {
    let location = std::env::var("DFS_RECOVERY_LOCATION")?;
    let prefix = std::env::var("DFS_RECOVERY_PREFIX")?.parse()?;
    let store: Arc<dyn ObjectStore> = match std::env::var("DFS_RECOVERY_BACKEND")?.as_str() {
        "local" => Arc::new(LocalFileSystem::new_with_prefix(location)?),
        "gcs" => gcs_store(&location)?,
        _ => bail!("unknown recovery backend"),
    };
    let mut storage = Storage::open(store, &prefix).await?;
    let cached = std::env::var("DFS_RECOVERY_CACHED").ok();
    if cached.is_some() && std::env::var("DFS_RECOVERY_MODE")? == "write" {
        storage.enable_cache(CacheConfig {
            write_mode: WriteMode::Cached,
            persist_interval_ms: 0,
            ..Default::default()
        })?;
        storage.pause_persistence(cached.as_deref() == Some("pending"));
    }
    let workspace = WorkspaceId::new("recovery-workspace")?;
    let scoped = storage.workspace(&workspace)?;
    match std::env::var("DFS_RECOVERY_MODE")?.as_str() {
        "write" => {
            let (_, file, batch) = fixture(&workspace)?;
            ensure!(
                scoped
                    .commit(upload_fixture(&scoped, &file, batch).await?)
                    .await?
                    == 1
            );
            if cached.as_deref() == Some("durable") {
                storage.drain_persistence().await?;
            }
            let mut stdout = std::io::stdout();
            stdout.write_all(format!("DFS_ACK:{}\n", file.id).as_bytes())?;
            stdout.flush()?;
            std::future::pending::<()>().await;
        }
        "read" => {
            let id = std::env::var("DFS_RECOVERY_OBJECT")?.parse()?;
            if cached.as_deref() == Some("pending") {
                let view = scoped.read_view().await?;
                ensure!(view.object(id).await?.is_none());
                ensure!(view.changes(0, 100).await?.is_empty());
            } else {
                verify_fixture(&scoped, id).await?;
            }
            storage.close().await?;
        }
        _ => bail!("unknown recovery mode"),
    }
    Ok(())
}
