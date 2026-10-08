use clap::Parser;
use dfs_tikv::{
    client::Client,
    model::*,
    rpc::{decode, encode},
    wire::dfs_client::DfsClient,
};
use serde_json::json;
use std::{
    collections::BTreeMap,
    io::Write,
    path::PathBuf,
    time::{Duration, Instant},
};
use tonic::transport::{Certificate, ClientTlsConfig, Endpoint};

#[derive(Parser)]
struct Args {
    #[arg(long)]
    endpoint: String,
    #[arg(long, value_delimiter = ',')]
    gateways: Vec<String>,
    #[arg(long)]
    token_file: PathBuf,
    #[arg(long)]
    ca: PathBuf,
    #[arg(long)]
    output: PathBuf,
    #[arg(long, default_value_t = 300)]
    iterations: usize,
    #[arg(long, default_value_t = 200)]
    interval_ms: u64,
}

async fn route(client: &Client) -> anyhow::Result<(String, String)> {
    let response = client
        .rpc
        .clone()
        .call(encode(&Envelope {
            session: client.session.id.clone(),
            call: Call::Head,
        })?)
        .await?;
    let gateway = response
        .metadata()
        .get("x-dfs-router")
        .ok_or_else(|| anyhow::anyhow!("router identity absent"))?
        .to_str()?
        .to_owned();
    let frontend = response
        .metadata()
        .get("x-dfs-route")
        .ok_or_else(|| anyhow::anyhow!("route absent"))?
        .to_str()?
        .to_owned();
    let reply: Result<Reply> = decode(response.into_inner())?;
    anyhow::ensure!(matches!(reply?, Reply::Head { .. }), "head response");
    Ok((gateway, frontend))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    anyhow::ensure!(
        args.iterations > 0 && args.iterations <= 100_000 && args.gateways.len() <= 16,
        "probe bounds"
    );
    let token = std::fs::read_to_string(args.token_file)?;
    let ca = std::fs::read(args.ca)?;
    let client = Client::connect(&args.endpoint, token.trim(), Some(ca.clone())).await?;
    let mut gateways = BTreeMap::new();
    for endpoint in &args.gateways {
        let transport = Endpoint::from_shared(endpoint.clone())?
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(5))
            .tls_config(ClientTlsConfig::new().ca_certificate(Certificate::from_pem(&ca)))?;
        let direct = Client {
            rpc: DfsClient::new(transport.connect().await?),
            session: client.session.clone(),
            counters: client.counters.clone(),
        };
        gateways.insert(endpoint, route(&direct).await?.0);
    }
    let root = client
        .view()
        .await?
        .nodes
        .into_iter()
        .find(|n| n.visible_name == "files" && n.visible_parent.is_none())
        .ok_or_else(|| anyhow::anyhow!("root absent"))?
        .node
        .id;
    let mut node = client
        .mutate(Mutation::Create {
            parent: root,
            name: format!("ha-probe-{}", id()),
            kind: Kind::File,
            mode: 0o644,
        })
        .await?
        .node
        .ok_or_else(|| anyhow::anyhow!("created node absent"))?;
    let Reply::Handle(handle, _) = client
        .call(Call::Open {
            node: node.id.clone(),
            write: true,
        })
        .await?
    else {
        anyhow::bail!("open response")
    };
    let mut log = std::fs::File::create(&args.output)?;
    let (gateway, frontend) = route(&client).await?;
    let ready = json!({"event":"ready","time_ms":now_ms(),"endpoint":args.endpoint,"gateways":gateways,"gateway":gateway,"frontend":frontend,"node":node.id});
    writeln!(log, "{ready}")?;
    log.flush()?;
    let mut expected = Vec::new();
    let mut total_retries = 0;
    let mut worst_ms = 0;
    for sequence in 0..args.iterations {
        let data = format!("{sequence:08}\n").into_bytes();
        let mutation = Mutation::Write {
            node: node.id.clone(),
            base: node.version.clone(),
            offset: 0,
            data: data.clone(),
            append: true,
            handle: Some(handle.clone()),
        };
        let publication = client.prepare_publication(&mutation)?;
        let start = Instant::now();
        let mut retries = 0;
        let published = loop {
            match client.publish(publication.clone(), mutation.clone()).await {
                Ok(value) => break value,
                Err(error)
                    if matches!(error.code, libc::ETIMEDOUT | libc::EAGAIN | libc::EIO)
                        && start.elapsed() < Duration::from_secs(60) =>
                {
                    retries += 1;
                    writeln!(
                        log,
                        "{}",
                        json!({"event":"retry","time_ms":now_ms(),"sequence":sequence,"code":error.code})
                    )?;
                    log.flush()?;
                    tokio::time::sleep(Duration::from_millis(200)).await;
                }
                Err(error) => return Err(error.into()),
            }
        };
        node = published
            .outcome
            .node
            .ok_or_else(|| anyhow::anyhow!("published node absent"))?;
        expected.extend(data);
        let confirmation = client
            .call(Call::PersistThrough {
                receipt: published.receipt.clone(),
                level: DurabilityLevel::Quorum,
            })
            .await?;
        anyhow::ensure!(
            matches!(
                confirmation,
                Reply::Persisted(PersistenceConfirmation {
                    level: DurabilityLevel::Quorum,
                    ..
                })
            ),
            "quorum receipt confirmation"
        );
        let Reply::Data(bytes) = client
            .call(Call::Read {
                node: node.id.clone(),
                version: None,
                offset: 0,
                size: MAX_IO_BYTES as u32,
                handle: Some(handle.clone()),
            })
            .await?
        else {
            anyhow::bail!("read response")
        };
        anyhow::ensure!(bytes == expected, "append lost or duplicated at {sequence}");
        let (gateway, frontend) = route(&client).await?;
        let ms = start.elapsed().as_millis();
        worst_ms = worst_ms.max(ms);
        total_retries += retries;
        writeln!(
            log,
            "{}",
            json!({"event":"published","time_ms":now_ms(),"sequence":sequence,"head":published.receipt.tenant_head,"gateway":gateway,"frontend":frontend,"elapsed_ms":ms,"retries":retries,"bytes":expected.len()})
        )?;
        log.flush()?;
        tokio::time::sleep(Duration::from_millis(args.interval_ms)).await;
    }
    client.call(Call::Close { handle }).await?;
    writeln!(
        log,
        "{}",
        json!({"event":"complete","passed":true,"iterations":args.iterations,"total_retries":total_retries,"worst_operation_ms":worst_ms,"bytes":expected.len(),"unchanged_endpoint":true,"unchanged_session":true,"shared_handle":true,"quorum_confirmed":true})
    )?;
    log.flush()?;
    Ok(())
}
