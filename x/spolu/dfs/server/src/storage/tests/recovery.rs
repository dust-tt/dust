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

pub(super) async fn exercise_recovery(backend: &str, location: &str, prefix: &str) -> Result<()> {
    let mut writer = command(backend, location, prefix, "write")?.spawn()?;
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
    let reader = command(backend, location, prefix, "read")?
        .env("DFS_RECOVERY_OBJECT", object_id.to_string())
        .spawn()?;
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
    let storage = Storage::open(store, &prefix).await?;
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
            let mut stdout = std::io::stdout();
            stdout.write_all(format!("DFS_ACK:{}\n", file.id).as_bytes())?;
            stdout.flush()?;
            std::future::pending::<()>().await;
        }
        "read" => {
            let id = std::env::var("DFS_RECOVERY_OBJECT")?.parse()?;
            verify_fixture(&scoped, id).await?;
            storage.close().await?;
        }
        _ => bail!("unknown recovery mode"),
    }
    Ok(())
}
