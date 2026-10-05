use anyhow::{Context, ensure};
use clap::Parser;
use dfs_poc::{client::Client, model::*};
use serde::Serialize;
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Instant,
};

#[derive(Parser, Serialize)]
struct Args {
    #[arg(long, default_value = "http://127.0.0.1:7443")]
    endpoint: String,
    #[arg(long)]
    token_file: PathBuf,
    #[arg(long)]
    probe_token_file: PathBuf,
    #[arg(long, default_value_t = 3)]
    rounds: usize,
    #[arg(long, default_value_t = 30)]
    repetitions: usize,
    #[arg(long, value_delimiter = ',', default_value = "0,100,1000,10000")]
    sizes: Vec<usize>,
    #[arg(long, default_value_t = 0)]
    destination_depth_offset: usize,
    #[arg(long)]
    output: PathBuf,
}

#[derive(Serialize)]
struct Sample {
    case: String,
    condition: String,
    role: String,
    round: usize,
    first: bool,
    request_id: Id,
    start_us: u64,
    latency_us: u64,
    errno: Option<i32>,
}

#[derive(Serialize)]
struct Window {
    case: String,
    round: usize,
    start_us: u64,
    end_us: u64,
}

#[derive(Serialize)]
struct Report {
    args: Args,
    samples: Vec<Sample>,
    windows: Vec<Window>,
    checks: Vec<String>,
    complete: bool,
    final_view: Option<View>,
}

struct Case {
    label: String,
    node: Node,
    left: Id,
    right: Id,
}

impl Report {
    fn save(&self) -> anyhow::Result<()> {
        std::fs::write(&self.args.output, serde_json::to_vec_pretty(self)?)?;
        Ok(())
    }
}

async fn create(client: &Client, parent: &str, name: &str, kind: Kind) -> anyhow::Result<Node> {
    client
        .mutate(Mutation::Create {
            parent: parent.into(),
            name: name.into(),
            kind,
            mode: 0o755,
        })
        .await?
        .node
        .context("missing created node")
}

fn movement(node: &Node, parent: &str, name: &str, destination: Option<Id>) -> Mutation {
    Mutation::Rename {
        parent: node.parent.clone().unwrap(),
        name: node.name.clone(),
        expected: node.entry_token.clone(),
        new_parent: parent.into(),
        new_name: name.into(),
        destination,
    }
}

async fn measured(
    client: &Client,
    mutation: Mutation,
    origin: Instant,
    labels: (&str, &str, &str, usize, bool),
) -> (Sample, Result<Outcome>) {
    let request = client.session.request_id();
    let request_id = request.id.clone();
    let start = Instant::now();
    let result = match client.call(Call::Mutate { request, mutation }).await {
        Ok(Reply::Outcome(outcome)) => Ok(outcome),
        Ok(_) => Err(err(libc::EIO, "unexpected mutation reply")),
        Err(error) => Err(error),
    };
    let sample = Sample {
        case: labels.0.into(),
        condition: labels.1.into(),
        role: labels.2.into(),
        round: labels.3,
        first: labels.4,
        request_id,
        start_us: start.duration_since(origin).as_micros() as u64,
        latency_us: start.elapsed().as_micros() as u64,
        errno: result.as_ref().err().map(|error| error.code),
    };
    (sample, result)
}

async fn verify_node(client: &Client, node: &Node) -> anyhow::Result<()> {
    let Reply::Lookup(actual, entry) = client
        .call(Call::Lookup {
            parent: node.parent.clone().unwrap(),
            name: node.name.clone(),
        })
        .await?
    else {
        anyhow::bail!("unexpected lookup reply")
    };
    ensure!(
        actual.id == node.id
            && actual.parent == node.parent
            && actual.name == node.name
            && actual.version == node.version
            && entry.node == node.id
            && entry.token == node.entry_token,
        "renamed node mismatch"
    );
    Ok(())
}

async fn writer(
    client: Client,
    mut node: Node,
    origin: Instant,
    label: String,
    round: usize,
    stop: Arc<AtomicBool>,
    ready: tokio::sync::oneshot::Sender<()>,
) -> anyhow::Result<(Node, Vec<Sample>)> {
    let mut samples = Vec::new();
    let mut ready = Some(ready);
    while !stop.load(Ordering::SeqCst) || samples.is_empty() {
        let (sample, outcome) = measured(
            &client,
            Mutation::Write {
                node: node.id.clone(),
                base: node.version.clone(),
                offset: 0,
                data: vec![42; 4096],
                append: false,
                handle: None,
            },
            origin,
            (&label, "with_writer", "unrelated_write", round, false),
        )
        .await;
        node = outcome?.node.context("missing written node")?;
        samples.push(sample);
        if let Some(ready) = ready.take() {
            let _ = ready.send(());
        }
    }
    Ok((node, samples))
}

async fn run_case(
    client: &Client,
    probe: &Client,
    probe_node: &mut Node,
    case: &mut Case,
    cross: bool,
    run: (usize, Instant),
    report: &mut Report,
) -> anyhow::Result<()> {
    let (round, origin) = run;
    let label = format!(
        "{}-{}",
        case.label,
        if cross { "cross-parent" } else { "same-parent" }
    );
    for busy in [false, true] {
        let condition = if busy { "with_writer" } else { "solo" };
        let stop = Arc::new(AtomicBool::new(false));
        let task = if busy {
            let (ready_tx, ready_rx) = tokio::sync::oneshot::channel();
            let task = tokio::spawn(writer(
                probe.clone(),
                probe_node.clone(),
                origin,
                label.clone(),
                round,
                stop.clone(),
                ready_tx,
            ));
            ready_rx.await?;
            Some(task)
        } else {
            None
        };
        let start_us = origin.elapsed().as_micros() as u64;
        let mut error = None;
        for index in 0..report.args.repetitions {
            let parent = if cross && case.node.parent.as_ref() == Some(&case.left) {
                &case.right
            } else if cross {
                &case.left
            } else {
                case.node.parent.as_ref().unwrap()
            };
            let name = if case.node.name == "node-a" {
                "node-b"
            } else {
                "node-a"
            };
            let old_parent = case.node.parent.clone().unwrap();
            let old_name = case.node.name.clone();
            let (sample, result) = measured(
                client,
                movement(&case.node, parent, name, None),
                origin,
                (&label, condition, "rename", round, index == 0),
            )
            .await;
            report.samples.push(sample);
            match result {
                Ok(outcome) => {
                    case.node = outcome.node.context("missing renamed node")?;
                    verify_node(client, &case.node).await?;
                    ensure!(
                        client
                            .call(Call::Lookup {
                                parent: old_parent,
                                name: old_name
                            })
                            .await
                            .is_err_and(|error| error.code == libc::ENOENT),
                        "old rename entry remains"
                    );
                }
                Err(failure) => {
                    error = Some(failure);
                    break;
                }
            }
        }
        let end_us = origin.elapsed().as_micros() as u64;
        stop.store(true, Ordering::SeqCst);
        if let Some(task) = task {
            let (node, samples) = task.await??;
            *probe_node = node;
            ensure!(
                samples.iter().any(|sample| sample.start_us < end_us
                    && sample.start_us + sample.latency_us > start_us),
                "no overlapping writer sample"
            );
            report.samples.extend(samples);
            report.windows.push(Window {
                case: label.clone(),
                round,
                start_us,
                end_us,
            });
        }
        report.save()?;
        if let Some(error) = error {
            return Err(error.into());
        }
        println!("round {round}: {label} {condition} passed");
    }
    Ok(())
}

async fn rejected(
    client: &Client,
    mutation: Mutation,
    expected: i32,
    label: &str,
    round: usize,
    origin: Instant,
    report: &mut Report,
) -> anyhow::Result<()> {
    let before = serde_json::to_value(client.call(Call::Head).await?)?;
    for index in 0..report.args.repetitions {
        let (sample, outcome) = measured(
            client,
            mutation.clone(),
            origin,
            (label, "solo", "rejected_rename", round, index == 0),
        )
        .await;
        report.samples.push(sample);
        ensure!(
            outcome.is_err_and(|error| error.code == expected),
            "unexpected rejection for {label}"
        );
    }
    ensure!(
        serde_json::to_value(client.call(Call::Head).await?)? == before,
        "rejected move published changes"
    );
    report.checks.push(format!(
        "round {round}: {label} rejected without publication"
    ));
    report.save()?;
    Ok(())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    ensure!(
        (1..=10).contains(&args.rounds)
            && (2..=1000).contains(&args.repetitions)
            && args.sizes.iter().sum::<usize>() <= 50_000,
        "invalid benchmark bounds"
    );
    ensure!(args.destination_depth_offset <= 16, "destination too deep");
    let token = std::fs::read_to_string(&args.token_file)?;
    let probe_token = std::fs::read_to_string(&args.probe_token_file)?;
    let client = Client::connect(&args.endpoint, token.trim(), None).await?;
    let probe = Client::connect(&args.endpoint, probe_token.trim(), None).await?;
    ensure!(
        client.session.tenant != probe.session.tenant,
        "probe must use a different tenant"
    );
    let root = client
        .view()
        .await?
        .nodes
        .into_iter()
        .find(|node| node.visible_parent.is_none() && node.visible_name == "files")
        .context("root absent")?
        .node
        .id;
    let probe_root = probe
        .view()
        .await?
        .nodes
        .into_iter()
        .find(|node| node.visible_parent.is_none() && node.visible_name == "files")
        .context("probe root absent")?
        .node
        .id;
    let scope = create(
        &client,
        &root,
        &format!("rename-bench-{}", id()),
        Kind::Directory,
    )
    .await?;
    let mut probe_node = create(
        &probe,
        &probe_root,
        &format!("rename-probe-{}", id()),
        Kind::File,
    )
    .await?;
    let mut report = Report {
        args,
        samples: Vec::new(),
        windows: Vec::new(),
        checks: Vec::new(),
        complete: false,
        final_view: None,
    };
    let mut cases = Vec::new();
    for size in std::iter::once(None).chain(report.args.sizes.iter().copied().map(Some)) {
        let label = size
            .map(|size| format!("directory-{size}-files"))
            .unwrap_or_else(|| "file".into());
        let directory = create(&client, &scope.id, &label, Kind::Directory).await?;
        let left = create(&client, &directory.id, "left", Kind::Directory).await?;
        let mut right = create(&client, &directory.id, "right", Kind::Directory).await?;
        for depth in 0..report.args.destination_depth_offset {
            right = create(
                &client,
                &right.id,
                &format!("deeper-{depth}"),
                Kind::Directory,
            )
            .await?;
        }
        let node = create(
            &client,
            &left.id,
            "node",
            if size.is_some() {
                Kind::Directory
            } else {
                Kind::File
            },
        )
        .await?;
        for index in 0..size.unwrap_or(0) {
            create(&client, &node.id, &format!("file-{index:05}"), Kind::File).await?;
        }
        cases.push(Case {
            label,
            node,
            left: left.id,
            right: right.id,
        });
    }
    let cycle = create(&client, &scope.id, "cycle", Kind::Directory).await?;
    let mut ancestors = vec![cycle.clone()];
    for depth in 1..=100 {
        ancestors.push(
            create(
                &client,
                &ancestors.last().unwrap().id,
                &format!("d-{depth}"),
                Kind::Directory,
            )
            .await?,
        );
    }
    let deep_file = create(&client, &ancestors[100].id, "deep-file", Kind::File).await?;
    cases.push(Case {
        label: "file-depth-100".into(),
        node: deep_file,
        left: ancestors[100].id.clone(),
        right: scope.id.clone(),
    });
    let occupied = create(&client, &scope.id, "occupied", Kind::Directory).await?;
    create(&client, &occupied.id, "child", Kind::File).await?;
    let empty = create(&client, &scope.id, "empty", Kind::Directory).await?;
    let file = create(&client, &scope.id, "replacement-file", Kind::File).await?;
    println!("fixtures populated");
    let origin = Instant::now();
    for round in 1..=report.args.rounds {
        for index in 0..500 {
            let (sample, result) = measured(
                &probe,
                Mutation::Write {
                    node: probe_node.id.clone(),
                    base: probe_node.version.clone(),
                    offset: 0,
                    data: vec![42; 4096],
                    append: false,
                    handle: None,
                },
                origin,
                (
                    "writer-baseline",
                    "solo",
                    "unrelated_write",
                    round,
                    index == 0,
                ),
            )
            .await;
            report.samples.push(sample);
            probe_node = result?.node.context("missing probe node")?;
        }
        let mut order: Vec<_> = (0..cases.len()).collect();
        if round % 2 == 0 {
            order.reverse();
        }
        for index in order {
            for cross in [false, true] {
                run_case(
                    &client,
                    &probe,
                    &mut probe_node,
                    &mut cases[index],
                    cross,
                    (round, origin),
                    &mut report,
                )
                .await?;
            }
        }
        for depth in [0, 1, 10, 100] {
            rejected(
                &client,
                movement(&cycle, &ancestors[depth].id, "illegal", None),
                libc::EINVAL,
                &format!("cycle-depth-{depth}"),
                round,
                origin,
                &mut report,
            )
            .await?;
        }
        for (node, destination, expected, label) in [
            (
                &empty,
                &occupied,
                libc::ENOTEMPTY,
                "replace-nonempty-directory",
            ),
            (&file, &empty, libc::EISDIR, "replace-directory-with-file"),
            (&empty, &file, libc::ENOTDIR, "replace-file-with-directory"),
        ] {
            rejected(
                &client,
                movement(
                    node,
                    &scope.id,
                    &destination.name,
                    Some(destination.entry_token.clone()),
                ),
                expected,
                label,
                round,
                origin,
                &mut report,
            )
            .await?;
        }
    }
    for case in &cases {
        verify_node(&client, &case.node).await?;
    }
    for node in &ancestors {
        verify_node(&client, node).await?;
    }
    let view = client.view().await?;
    for case in &cases {
        if let Some(size) = case
            .label
            .strip_prefix("directory-")
            .and_then(|s| s.strip_suffix("-files"))
        {
            ensure!(
                view.nodes
                    .iter()
                    .filter(|node| node.node.parent.as_ref() == Some(&case.node.id))
                    .count()
                    == size.parse::<usize>()?,
                "moved subtree lost children"
            );
        }
    }
    ensure!(
        probe
            .call(Call::Read {
                node: probe_node.id.clone(),
                version: None,
                offset: 0,
                size: 4096,
                handle: None
            })
            .await
            .is_ok_and(|reply| matches!(reply, Reply::Data(bytes) if bytes == vec![42; 4096])),
        "probe content changed"
    );
    report.checks.push(
        "final moved subtree counts, ancestry, identities, and probe content verified".into(),
    );
    report.final_view = Some(view);
    report.complete = true;
    report.save()?;
    println!("rename benchmark passed");
    Ok(())
}
