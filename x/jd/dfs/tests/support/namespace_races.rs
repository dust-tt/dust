use anyhow::{Context, bail, ensure};
use dfs_poc::{client::Client, model::*};
use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    time::Instant,
};

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Schedule {
    AThenB,
    BThenA,
    Concurrent,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Case {
    MoveWrite,
    MoveOpenWrite,
    MoveAcrossWrite,
    MoveAcrossOpenWrite,
    MoveFencedWrite,
    DeleteFencedWrite,
    ReplaceFencedWrite,
    MoveRename,
    MoveDelete,
    DeleteWrite,
    DeleteOpenWrite,
    DeleteDelete,
    ReplaceWrite,
    ReplaceOpenWrite,
    WriteWrite,
    WriteTruncate,
    CreateCreate,
    MoveCreateDestination,
    ReplaceDeleteDestination,
    RemoveDirectoryCreate,
    OpposingMoves,
    MoveRecreateSource,
    MoveParentCreate,
    ReplaceMoveDestination,
}

pub const CASES: &[Case] = &[
    Case::MoveWrite,
    Case::MoveOpenWrite,
    Case::MoveAcrossWrite,
    Case::MoveAcrossOpenWrite,
    Case::MoveFencedWrite,
    Case::DeleteFencedWrite,
    Case::ReplaceFencedWrite,
    Case::MoveRename,
    Case::MoveDelete,
    Case::DeleteWrite,
    Case::DeleteOpenWrite,
    Case::DeleteDelete,
    Case::ReplaceWrite,
    Case::ReplaceOpenWrite,
    Case::WriteWrite,
    Case::WriteTruncate,
    Case::CreateCreate,
    Case::MoveCreateDestination,
    Case::ReplaceDeleteDestination,
    Case::RemoveDirectoryCreate,
    Case::OpposingMoves,
    Case::MoveRecreateSource,
    Case::MoveParentCreate,
    Case::ReplaceMoveDestination,
];

#[derive(Debug, Serialize)]
pub struct Attempt {
    pub elapsed_us: u64,
    pub outcome: Option<Outcome>,
    pub error: Option<Error>,
}

impl Attempt {
    fn code(&self) -> i32 {
        self.error.as_ref().map_or(0, |error| error.code)
    }
}

#[derive(Debug, Serialize)]
pub struct Record {
    pub case: Case,
    pub schedule: Schedule,
    pub sample: usize,
    pub directory: Id,
    pub head_before: u64,
    pub head_after: Option<u64>,
    pub a: Attempt,
    pub b: Attempt,
    pub passed: bool,
    pub validation_error: Option<String>,
}

pub fn movement(node: &Node, parent: &str, name: &str, destination: Option<Id>) -> Mutation {
    Mutation::Rename {
        parent: node.parent.clone().unwrap(),
        name: node.name.clone(),
        expected: node.entry_token.clone(),
        new_parent: parent.into(),
        new_name: name.into(),
        destination,
    }
}

pub fn deletion(node: &Node) -> Mutation {
    Mutation::Unlink {
        parent: node.parent.clone().unwrap(),
        name: node.name.clone(),
        expected: node.entry_token.clone(),
        directory: node.kind == Kind::Directory,
    }
}

pub fn writing(node: &Node, data: &[u8], handle: Option<Id>) -> Mutation {
    Mutation::Write {
        node: node.id.clone(),
        base: node.version.clone(),
        offset: 0,
        data: data.into(),
        append: false,
        handle,
    }
}

fn creating(parent: &str, name: &str, kind: Kind) -> Mutation {
    Mutation::Create {
        parent: parent.into(),
        name: name.into(),
        kind,
        mode: 0o700,
    }
}

pub async fn create(client: &Client, parent: &str, name: &str, kind: Kind) -> anyhow::Result<Node> {
    client
        .mutate(creating(parent, name, kind))
        .await?
        .node
        .context("create node absent")
}

pub async fn head(client: &Client) -> anyhow::Result<u64> {
    match client.call(Call::Head).await? {
        Reply::Head { head, .. } => Ok(head),
        _ => bail!("head reply missing"),
    }
}

pub async fn read(client: &Client, node: &str, handle: Option<Id>) -> anyhow::Result<Vec<u8>> {
    match client
        .call(Call::Read {
            node: node.into(),
            version: None,
            offset: 0,
            size: 64,
            handle,
        })
        .await?
    {
        Reply::Data(bytes) => Ok(bytes),
        _ => bail!("read reply missing"),
    }
}

async fn timed(client: &Client, mutation: Mutation) -> Attempt {
    let started = Instant::now();
    let result = client.mutate(mutation).await;
    let elapsed_us = started.elapsed().as_micros() as u64;
    match result {
        Ok(outcome) => Attempt {
            elapsed_us,
            outcome: Some(outcome),
            error: None,
        },
        Err(error) => Attempt {
            elapsed_us,
            outcome: None,
            error: Some(error),
        },
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct Expected {
    parent: Id,
    name: String,
    kind: Kind,
    bytes: Vec<u8>,
    linked: bool,
}

type State = BTreeMap<Id, Expected>;

fn remember(state: &mut State, node: &Node, bytes: &[u8]) {
    state.insert(
        node.id.clone(),
        Expected {
            parent: node.parent.clone().unwrap(),
            name: node.name.clone(),
            kind: node.kind,
            bytes: bytes.into(),
            linked: true,
        },
    );
}

fn apply_expected(state: &mut State, mutation: &Mutation, outcome: &Outcome) -> anyhow::Result<()> {
    match mutation {
        Mutation::Create {
            parent, name, kind, ..
        } => {
            let node = outcome.node.as_ref().context("create missing identity")?;
            ensure!(!state.contains_key(&node.id), "create reused an identity");
            state.insert(
                node.id.clone(),
                Expected {
                    parent: parent.clone(),
                    name: name.clone(),
                    kind: *kind,
                    bytes: vec![],
                    linked: true,
                },
            );
        }
        Mutation::Rename {
            parent,
            name,
            new_parent,
            new_name,
            ..
        } => {
            let source = state
                .iter()
                .find(|(_, n)| n.linked && n.parent == *parent && n.name == *name)
                .map(|(id, _)| id.clone())
                .context("successful move has no source")?;
            for node in state.values_mut() {
                if node.linked && node.parent == *new_parent && node.name == *new_name {
                    node.linked = false;
                }
            }
            let node = state.get_mut(&source).unwrap();
            node.parent = new_parent.clone();
            node.name = new_name.clone();
            node.linked = true;
            ensure!(
                outcome.node.as_ref().map(|n| &n.id) == Some(&source),
                "move changed identity"
            );
        }
        Mutation::Unlink { parent, name, .. } => {
            let node = state
                .values_mut()
                .find(|n| n.linked && n.parent == *parent && n.name == *name)
                .context("successful delete has no source")?;
            node.linked = false;
        }
        Mutation::Write { node, data, .. } => {
            let expected = state.get_mut(node).context("write identity absent")?;
            expected
                .bytes
                .resize(expected.bytes.len().max(data.len()), 0);
            expected.bytes[..data.len()].copy_from_slice(data);
            ensure!(outcome.written as usize == data.len(), "short write");
        }
        Mutation::Truncate { node, size, .. } => {
            state
                .get_mut(node)
                .context("truncate identity absent")?
                .bytes
                .resize(*size as usize, 0);
        }
        _ => bail!("unsupported oracle mutation"),
    }
    Ok(())
}

fn codes(case: Case, a_first: bool) -> (i32, i32) {
    use Case::*;
    match case {
        MoveWrite | MoveOpenWrite | MoveAcrossWrite | MoveAcrossOpenWrite | DeleteOpenWrite
        | ReplaceOpenWrite | MoveParentCreate | MoveFencedWrite | DeleteFencedWrite
        | ReplaceFencedWrite => (0, 0),
        MoveRename | MoveDelete | DeleteDelete => {
            if a_first {
                (0, libc::ENOENT)
            } else {
                (libc::ENOENT, 0)
            }
        }
        DeleteWrite | ReplaceWrite => {
            if a_first {
                (0, libc::ENOENT)
            } else {
                (0, 0)
            }
        }
        WriteWrite | WriteTruncate => {
            if a_first {
                (0, libc::ESTALE)
            } else {
                (libc::ESTALE, 0)
            }
        }
        CreateCreate => {
            if a_first {
                (0, libc::EEXIST)
            } else {
                (libc::EEXIST, 0)
            }
        }
        MoveCreateDestination => {
            if a_first {
                (0, libc::EEXIST)
            } else {
                (libc::ESTALE, 0)
            }
        }
        ReplaceDeleteDestination | ReplaceMoveDestination => {
            if a_first {
                (0, libc::ESTALE)
            } else {
                (libc::ESTALE, 0)
            }
        }
        RemoveDirectoryCreate => {
            if a_first {
                (0, libc::ENOENT)
            } else {
                (libc::ENOTEMPTY, 0)
            }
        }
        OpposingMoves => {
            if a_first {
                (0, libc::EINVAL)
            } else {
                (libc::EINVAL, 0)
            }
        }
        MoveRecreateSource => {
            if a_first {
                (0, 0)
            } else {
                (0, libc::EEXIST)
            }
        }
    }
}

async fn verify(
    observer: &Client,
    directory: &Node,
    state: &State,
    paths: &BTreeSet<(Id, String)>,
    handle: &Option<(Id, Id)>,
) -> anyhow::Result<()> {
    for (parent, name) in paths {
        let expected = state
            .iter()
            .find(|(_, node)| node.linked && node.parent == *parent && node.name == *name);
        let actual = observer
            .call(Call::Lookup {
                parent: parent.clone(),
                name: name.clone(),
            })
            .await;
        match (expected, actual) {
            (Some((id, _)), Ok(Reply::Lookup(node, entry))) => {
                ensure!(
                    node.id == *id && entry.node == *id && node.entry_token == entry.token,
                    "lookup identity/token mismatch for {name}"
                );
            }
            (None, Err(error)) if error.code == libc::ENOENT => {}
            (expected, actual) => {
                bail!("lookup mismatch for {name}: expected={expected:?}, actual={actual:?}")
            }
        }
    }
    let view = observer.view().await?;
    let mut actual = BTreeMap::new();
    for entry in &view.nodes {
        if entry.node.id == directory.id
            || entry
                .visible_parent
                .as_ref()
                .is_some_and(|parent| state.contains_key(parent))
        {
            let node = &entry.node;
            let bytes = if node.kind == Kind::File {
                read(observer, &node.id, None).await?
            } else {
                vec![]
            };
            ensure!(
                node.kind != Kind::File || node.size == bytes.len() as u64,
                "wrong size: {}",
                node.name
            );
            ensure!(!node.unlinked, "unlinked identity present in view");
            actual.insert(
                node.id.clone(),
                Expected {
                    parent: node.parent.clone().context("parent absent")?,
                    name: node.name.clone(),
                    kind: node.kind,
                    bytes,
                    linked: true,
                },
            );
        }
    }
    let expected: State = state
        .iter()
        .filter(|(_, node)| node.linked)
        .map(|(id, n)| (id.clone(), n.clone()))
        .collect();
    ensure!(
        actual == expected,
        "namespace/content mismatch: actual={actual:?}, expected={expected:?}"
    );
    for (id, node) in state {
        if !node.linked {
            let result = observer
                .call(Call::Stat {
                    node: id.clone(),
                    handle: None,
                })
                .await;
            ensure!(
                matches!(result, Err(ref e) if e.code == libc::ENOENT),
                "unlinked identity accessible without handle: {result:?}"
            );
        }
    }
    if let Some((node, handle)) = handle {
        ensure!(
            read(observer, node, Some(handle.clone())).await? == state[node].bytes,
            "open handle changed identity or content"
        );
    }
    Ok(())
}

pub async fn run_case(
    a: &Client,
    b: &Client,
    root: &str,
    case: Case,
    schedule: Schedule,
    sample: usize,
) -> anyhow::Result<Record> {
    ensure!(
        a.session.id != b.session.id,
        "race requires independent sessions"
    );
    let directory = create(a, root, &format!("race-{}", id()), Kind::Directory).await?;
    let mut state = State::new();
    remember(&mut state, &directory, &[]);
    let src_kind = match case {
        Case::RemoveDirectoryCreate | Case::OpposingMoves | Case::MoveParentCreate => {
            Kind::Directory
        }
        _ => Kind::File,
    };
    let mut src = create(a, &directory.id, "src", src_kind).await?;
    let bytes = if src_kind == Kind::File {
        b"seed".as_slice()
    } else {
        &[]
    };
    if src_kind == Kind::File {
        src = a
            .mutate(writing(&src, bytes, None))
            .await?
            .node
            .context("write node absent")?;
    }
    remember(&mut state, &src, bytes);
    let dest = if matches!(
        case,
        Case::ReplaceWrite
            | Case::ReplaceFencedWrite
            | Case::ReplaceOpenWrite
            | Case::ReplaceDeleteDestination
            | Case::ReplaceMoveDestination
            | Case::OpposingMoves
    ) {
        let mut node = create(a, &directory.id, "dest", src_kind).await?;
        let bytes = if src_kind == Kind::File {
            b"dest".as_slice()
        } else {
            &[]
        };
        if src_kind == Kind::File {
            node = a
                .mutate(writing(&node, bytes, None))
                .await?
                .node
                .context("write node absent")?;
        }
        remember(&mut state, &node, bytes);
        Some(node)
    } else {
        None
    };
    let mut handle = None;
    if matches!(
        case,
        Case::MoveOpenWrite
            | Case::MoveAcrossOpenWrite
            | Case::DeleteOpenWrite
            | Case::ReplaceOpenWrite
    ) {
        let node = dest.as_ref().unwrap_or(&src);
        let Reply::Handle(opened, _) = b
            .call(Call::Open {
                node: node.id.clone(),
                write: true,
            })
            .await?
        else {
            bail!("open reply missing")
        };
        handle = Some((node.id.clone(), opened));
    }
    if matches!(
        case,
        Case::MoveFencedWrite | Case::DeleteFencedWrite | Case::ReplaceFencedWrite
    ) {
        let node = dest.as_ref().unwrap_or(&src);
        let Reply::WritebackHandle(opened) = b
            .call(Call::OpenWriteback {
                node: node.id.clone(),
                request: id(),
            })
            .await?
        else {
            bail!("fenced open reply missing")
        };
        handle = Some((node.id.clone(), opened.handle));
    }
    let write_handle = handle.as_ref().map(|(_, handle)| handle.clone());
    let target = if matches!(case, Case::MoveAcrossWrite | Case::MoveAcrossOpenWrite) {
        let node = create(a, &directory.id, "target", Kind::Directory).await?;
        remember(&mut state, &node, &[]);
        node.id
    } else {
        directory.id.clone()
    };
    let movement = movement(
        &src,
        &target,
        "dest",
        dest.as_ref().map(|n| n.entry_token.clone()),
    );
    let (ma, mb) = match case {
        Case::MoveWrite
        | Case::MoveOpenWrite
        | Case::MoveAcrossWrite
        | Case::MoveAcrossOpenWrite
        | Case::MoveFencedWrite => (movement, writing(&src, b"BBBB", write_handle)),
        Case::MoveRename => (movement, self::movement(&src, &directory.id, "other", None)),
        Case::MoveDelete => (movement, deletion(&src)),
        Case::DeleteWrite | Case::DeleteOpenWrite | Case::DeleteFencedWrite => {
            (deletion(&src), writing(&src, b"BBBB", write_handle))
        }
        Case::DeleteDelete => (deletion(&src), deletion(&src)),
        Case::ReplaceWrite | Case::ReplaceOpenWrite | Case::ReplaceFencedWrite => (
            movement,
            writing(dest.as_ref().unwrap(), b"BBBB", write_handle),
        ),
        Case::WriteWrite => (writing(&src, b"AAAA", None), writing(&src, b"BBBB", None)),
        Case::WriteTruncate => (
            writing(&src, b"AAAA", None),
            Mutation::Truncate {
                node: src.id.clone(),
                base: src.version.clone(),
                size: 1,
                handle: None,
            },
        ),
        Case::CreateCreate => (
            creating(&directory.id, "new", Kind::File),
            creating(&directory.id, "new", Kind::File),
        ),
        Case::MoveCreateDestination => (movement, creating(&directory.id, "dest", Kind::File)),
        Case::ReplaceDeleteDestination => (movement, deletion(dest.as_ref().unwrap())),
        Case::RemoveDirectoryCreate => (deletion(&src), creating(&src.id, "child", Kind::File)),
        Case::OpposingMoves => (
            self::movement(&src, &dest.as_ref().unwrap().id, "src", None),
            self::movement(dest.as_ref().unwrap(), &src.id, "dest", None),
        ),
        Case::MoveRecreateSource => (movement, creating(&directory.id, "src", Kind::File)),
        Case::MoveParentCreate => (movement, creating(&src.id, "child", Kind::File)),
        Case::ReplaceMoveDestination => (
            movement,
            self::movement(dest.as_ref().unwrap(), &directory.id, "other", None),
        ),
    };
    let mut paths: BTreeSet<_> = state
        .values()
        .map(|node| (node.parent.clone(), node.name.clone()))
        .collect();
    for mutation in [&ma, &mb] {
        match mutation {
            Mutation::Rename {
                new_parent,
                new_name,
                ..
            } => {
                paths.insert((new_parent.clone(), new_name.clone()));
            }
            Mutation::Create { parent, name, .. } => {
                paths.insert((parent.clone(), name.clone()));
            }
            _ => {}
        }
    }
    let head_before = head(a).await?;
    let (ra, rb) = match schedule {
        Schedule::AThenB => {
            let ra = timed(a, ma.clone()).await;
            (ra, timed(b, mb.clone()).await)
        }
        Schedule::BThenA => {
            let rb = timed(b, mb.clone()).await;
            (timed(a, ma.clone()).await, rb)
        }
        Schedule::Concurrent => {
            let barrier = tokio::sync::Barrier::new(2);
            tokio::join!(
                async {
                    barrier.wait().await;
                    timed(a, ma.clone()).await
                },
                async {
                    barrier.wait().await;
                    timed(b, mb.clone()).await
                }
            )
        }
    };
    let mut record = Record {
        case,
        schedule,
        sample,
        directory: directory.id.clone(),
        head_before,
        head_after: None,
        a: ra,
        b: rb,
        passed: false,
        validation_error: None,
    };
    let validation: anyhow::Result<()> = async {
        let pair = (record.a.code(), record.b.code());
        let allowed = match schedule {
            Schedule::AThenB => pair == codes(case, true),
            Schedule::BThenA => pair == codes(case, false),
            Schedule::Concurrent => pair == codes(case, true) || pair == codes(case, false),
        };
        ensure!(
            allowed,
            "unexpected errors {pair:?}: a={:?}, b={:?}",
            record.a.error,
            record.b.error
        );
        if let (Some(a), Some(b)) = (&record.a.outcome, &record.b.outcome) {
            ensure!(
                pair == codes(case, a.head < b.head),
                "successes violate publication order"
            );
        }
        let mut successful: Vec<_> = [(&ma, &record.a), (&mb, &record.b)]
            .into_iter()
            .filter_map(|(mutation, attempt)| {
                attempt.outcome.as_ref().map(|outcome| (mutation, outcome))
            })
            .collect();
        successful.sort_by_key(|(_, outcome)| outcome.head);
        for (index, (mutation, outcome)) in successful.iter().enumerate() {
            ensure!(
                outcome.head == head_before + index as u64 + 1,
                "publication heads are not contiguous"
            );
            apply_expected(&mut state, mutation, outcome)?;
        }
        let after = head(a).await?;
        record.head_after = Some(after);
        ensure!(
            after == head_before + successful.len() as u64,
            "failed mutation advanced head"
        );
        verify(b, &directory, &state, &paths, &handle).await?;
        Ok(())
    }
    .await;
    if let Some((_, handle)) = handle {
        b.call(Call::Close { handle }).await?;
    }
    match validation {
        Ok(()) => record.passed = true,
        Err(error) => record.validation_error = Some(format!("{error:#}")),
    }
    Ok(record)
}
