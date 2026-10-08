use clap::Parser;
use dfs_poc::{client::Client, model::*};
use serde::{Deserialize, Serialize};
use std::{
    fs::OpenOptions,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    time::Instant,
};

#[derive(Parser)]
struct Args {
    #[arg(long)]
    endpoint: String,
    #[arg(long)]
    token_file: PathBuf,
    #[arg(long)]
    ca: PathBuf,
    #[arg(long)]
    log: PathBuf,
    #[arg(long)]
    verify: bool,
    #[arg(long, default_value_t = 100_000)]
    samples: usize,
}
#[derive(Serialize, Deserialize)]
struct Record {
    time_ms: u64,
    request: RequestId,
    mutation: Mutation,
    outcome: Option<Outcome>,
}
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    let started = Instant::now();
    let token = std::fs::read_to_string(args.token_file)?;
    let client =
        Client::connect(&args.endpoint, token.trim(), Some(std::fs::read(args.ca)?)).await?;
    if args.verify {
        let records: Vec<Record> = BufReader::new(std::fs::File::open(&args.log)?)
            .lines()
            .map(|line| Ok(serde_json::from_str(&line?)?))
            .collect::<anyhow::Result<_>>()?;
        let Reply::Metrics(metrics) = client.call(Call::Metrics).await? else {
            anyhow::bail!("metrics")
        };
        let Reply::Head {
            head: recovered_head,
            ..
        } = client.call(Call::Head).await?
        else {
            anyhow::bail!("head")
        };
        let acknowledged: Vec<_> = records.iter().filter(|r| r.outcome.is_some()).collect();
        let mut retained = 0;
        let mut unknown = 0;
        let mut expected = None;
        for record in records.iter().filter(|r| r.outcome.is_none()) {
            let result = client
                .call(Call::Mutate {
                    request: record.request.clone(),
                    mutation: record.mutation.clone(),
                })
                .await;
            match result {
                Ok(Reply::Outcome(outcome)) => {
                    anyhow::ensure!(
                        outcome.head <= recovered_head,
                        "replay advanced recovered state"
                    );
                    if let Some(expected) = acknowledged
                        .iter()
                        .find(|r| r.request.id == record.request.id)
                    {
                        anyhow::ensure!(
                            serde_json::to_value(&expected.outcome)?
                                == serde_json::to_value(Some(&outcome))?,
                            "retry outcome differs"
                        );
                    }
                    anyhow::ensure!(unknown == 0, "recovery is not a contiguous prefix");
                    if let Mutation::Write { node, data, .. } = &record.mutation {
                        expected = Some((node.clone(), data.clone()));
                    }
                    retained += 1;
                }
                Err(error) if error.code == libc::ESTALE => unknown += 1,
                other => anyhow::bail!("invalid retry resolution: {other:?}"),
            }
        }
        if let Some((node, data)) = expected {
            let Reply::Data(actual) = client
                .call(Call::Read {
                    node,
                    version: None,
                    offset: 0,
                    size: MAX_IO_BYTES as u32,
                    handle: None,
                })
                .await?
            else {
                anyhow::bail!("read")
            };
            anyhow::ensure!(actual == data, "recovered bytes differ from prefix");
        }
        let lost: Vec<_> = acknowledged
            .iter()
            .filter(|r| r.outcome.as_ref().unwrap().head > recovered_head)
            .collect();
        let lost_bytes: usize = lost
            .iter()
            .map(|r| match &r.mutation {
                Mutation::Write { data, .. } => data.len(),
                _ => 0,
            })
            .sum();
        let output = serde_json::json!({"recovered_head":recovered_head,"recovered_shard_head":metrics.published,"acknowledged":acknowledged.len(),"last_ack_head":acknowledged.last().and_then(|r|r.outcome.as_ref()).map(|o|o.head),"lost_acknowledged":lost.len(),"lost_payload_bytes":lost_bytes,"lost_ack_span_ms":lost.first().zip(lost.last()).map(|(a,b)|b.time_ms-a.time_ms),"retained_retries":retained,"unknown_retries":unknown,"verification_ms":started.elapsed().as_millis(),"incarnation":client.session.incarnation});
        println!("{}", serde_json::to_string_pretty(&output)?);
        return Ok(());
    }
    let root = client
        .view()
        .await?
        .nodes
        .into_iter()
        .find(|n| n.visible_name == "files" && n.visible_parent.is_none())
        .unwrap()
        .node
        .id;
    let mut node = client
        .mutate(Mutation::Create {
            parent: root,
            name: format!("power-{}", id()),
            kind: Kind::File,
            mode: 0o600,
        })
        .await?
        .node
        .unwrap();
    let mut log = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(args.log)?;
    for index in 0..args.samples {
        let mutation = Mutation::Write {
            node: node.id.clone(),
            base: node.version.clone(),
            offset: 0,
            data: format!("{index:064}").into_bytes(),
            append: false,
            handle: None,
        };
        let request = client.session.request_id();
        serde_json::to_writer(
            &mut log,
            &Record {
                time_ms: now_ms(),
                request: request.clone(),
                mutation: mutation.clone(),
                outcome: None,
            },
        )?;
        writeln!(log)?;
        log.flush()?;
        match client
            .call(Call::Mutate {
                request: request.clone(),
                mutation: mutation.clone(),
            })
            .await
        {
            Ok(Reply::Outcome(outcome)) => {
                node = outcome.node.clone().unwrap();
                serde_json::to_writer(
                    &mut log,
                    &Record {
                        time_ms: now_ms(),
                        request,
                        mutation,
                        outcome: Some(outcome),
                    },
                )?;
                writeln!(log)?;
                log.flush()?;
            }
            result => {
                eprintln!("stopped at {index}: {result:?}");
                break;
            }
        }
    }
    log.sync_all()?;
    Ok(())
}
