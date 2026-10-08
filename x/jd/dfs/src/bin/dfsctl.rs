use clap::{Parser, Subcommand};
use dfs_poc::{client::Client, engine::token_hash, model::*};
use std::path::PathBuf;
#[derive(Parser)]
struct Args {
    #[arg(long, default_value = "http://127.0.0.1:7443")]
    endpoint: String,
    #[arg(long)]
    token_file: Option<PathBuf>,
    #[arg(long)]
    ca: Option<PathBuf>,
    #[arg(long, default_value_t = 100_000)]
    max_nodes: usize,
    #[command(subcommand)]
    command: Command,
}
#[derive(Subcommand)]
enum Command {
    Provision {
        #[arg(long)]
        directory: PathBuf,
        #[arg(long, default_value_t = 1)]
        tenants: usize,
    },
    View,
    Metrics,
    Mutate {
        #[arg(long)]
        json: PathBuf,
    },
    Call {
        #[arg(long)]
        json: PathBuf,
    },
    Import {
        #[arg(long)]
        source: PathBuf,
        #[arg(long)]
        parent: Option<String>,
        #[arg(long)]
        name: String,
    },
}
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    anyhow::ensure!(args.max_nodes > 0, "max-nodes must be positive");
    if let Command::Provision { directory, tenants } = args.command {
        anyhow::ensure!(tenants > 0 && tenants <= 64, "tenant count must be 1..64");
        std::fs::create_dir_all(&directory)?;
        let mut credentials = Vec::new();
        for index in 0..tenants {
            let tenant = id();
            for name in ["admin", "alice", "bob"] {
                let token = format!("{}{}", id(), id());
                let filename = if index == 0 {
                    format!("{name}.token")
                } else {
                    format!("{name}-{index}.token")
                };
                let path = directory.join(filename);
                use std::io::Write;
                use std::os::unix::fs::OpenOptionsExt;
                let mut file = std::fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .mode(0o600)
                    .open(path)?;
                file.write_all(token.as_bytes())?;
                credentials.push(Credential {
                    token_hash: token_hash(&token),
                    tenant: tenant.clone(),
                    issuer: "poc-provisioner".into(),
                    subject: name.into(),
                    principal: id(),
                    admin: name == "admin",
                    scope: None,
                    expires_ms: now_ms() + 7 * 86400 * 1000,
                });
            }
        }
        std::fs::write(
            directory.join("credentials.json"),
            serde_json::to_vec_pretty(&credentials)?,
        )?;
        return Ok(());
    }
    let token = std::fs::read_to_string(
        args.token_file
            .ok_or_else(|| anyhow::anyhow!("--token-file required"))?,
    )?;
    let ca = args.ca.map(std::fs::read).transpose()?;
    let client = Client::connect(&args.endpoint, token.trim(), ca).await?;
    let value = match args.command {
        Command::View => serde_json::to_value(client.view_with_limit(args.max_nodes).await?)?,
        Command::Metrics => serde_json::to_value(client.call(Call::Metrics).await?)?,
        Command::Mutate { json } => serde_json::to_value(
            client
                .mutate(serde_json::from_slice(&std::fs::read(json)?)?)
                .await?,
        )?,
        Command::Call { json } => serde_json::to_value(
            client
                .call(serde_json::from_slice(&std::fs::read(json)?)?)
                .await?,
        )?,
        Command::Import {
            source,
            parent,
            name,
        } => {
            let parent = match parent {
                Some(parent) => parent,
                None => {
                    client
                        .view_with_limit(args.max_nodes)
                        .await?
                        .nodes
                        .into_iter()
                        .find(|node| node.visible_name == "files" && node.visible_parent.is_none())
                        .ok_or_else(|| anyhow::anyhow!("no normal root"))?
                        .node
                        .id
                }
            };
            let started = std::time::Instant::now();
            let mut stack = vec![(source, parent, name)];
            let mut files = 0u64;
            let mut total_bytes = 0u64;
            while let Some((path, parent, name)) = stack.pop() {
                let metadata = std::fs::symlink_metadata(&path)?;
                anyhow::ensure!(
                    !metadata.file_type().is_symlink(),
                    "symlink import unsupported"
                );
                use std::os::unix::fs::PermissionsExt;
                let mut node = client
                    .mutate(Mutation::Create {
                        parent,
                        name,
                        kind: if metadata.is_dir() {
                            Kind::Directory
                        } else {
                            Kind::File
                        },
                        mode: metadata.permissions().mode(),
                    })
                    .await?
                    .node
                    .ok_or_else(|| anyhow::anyhow!("create missing node"))?;
                if metadata.is_dir() {
                    for entry in std::fs::read_dir(path)? {
                        let entry = entry?;
                        stack.push((
                            entry.path(),
                            node.id.clone(),
                            entry
                                .file_name()
                                .into_string()
                                .map_err(|_| anyhow::anyhow!("non-UTF8 filename"))?,
                        ));
                    }
                } else {
                    use std::io::Read;
                    let mut file = std::fs::File::open(path)?;
                    let mut offset = 0;
                    loop {
                        let mut bytes = vec![0; MAX_IO_BYTES];
                        let count = file.read(&mut bytes)?;
                        if count == 0 {
                            break;
                        }
                        bytes.truncate(count);
                        node = client
                            .mutate(Mutation::Write {
                                node: node.id,
                                base: node.version,
                                offset,
                                data: bytes,
                                append: false,
                                handle: None,
                            })
                            .await?
                            .node
                            .ok_or_else(|| anyhow::anyhow!("write missing node"))?;
                        offset += count as u64;
                        total_bytes += count as u64;
                    }
                    files += 1;
                }
            }
            serde_json::json!({"files":files,"bytes":total_bytes,"elapsed_ms":started.elapsed().as_millis()})
        }
        Command::Provision { .. } => unreachable!(),
    };
    println!("{}", serde_json::to_string_pretty(&value)?);
    client.call(Call::Logout).await?;
    Ok(())
}
