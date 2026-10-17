use std::collections::BTreeMap;

use anyhow::{Context, Result, ensure};
use dfs_protocol::{
    ObjectId,
    rpc::{operation::Operation as Op, *},
};
use rand::{RngExt, SeedableRng, rngs::StdRng};

use crate::client::{Client, create, remove};

const BLOCK_BYTES: usize = 64 * 1024;
const MAX_FILE_BYTES: usize = 4 * BLOCK_BYTES;
const MAX_FILES: usize = 8;
const AUDIT_INTERVAL_STEPS: usize = 10;
const BOUNDARIES_BYTES: &[usize] = &[0, 1, BLOCK_BYTES - 1, BLOCK_BYTES, BLOCK_BYTES + 1];

#[derive(Clone, Copy, Debug)]
enum Action {
    Create,
    Write,
    Append,
    Resize,
    Metadata,
    Move,
    Remove,
    Read,
}
const ACTIONS: &[Action] = &[
    Action::Create,
    Action::Write,
    Action::Append,
    Action::Resize,
    Action::Metadata,
    Action::Move,
    Action::Remove,
    Action::Read,
];

struct File {
    id: ObjectId,
    parent: usize,
    name: String,
    bytes: Vec<u8>,
    attr_version: u64,
    content_version: u64,
    mime_type: Option<String>,
    xattrs: BTreeMap<String, Vec<u8>>,
    atime: Option<u64>,
}

impl File {
    fn check_attr(&self, attr: &Attr) -> Result<()> {
        ensure!(
            attr.id == self.id.into() && attr.name == self.name,
            "file identity mismatch"
        );
        ensure!(
            attr.kind() == ObjectKind::File && attr.mode == 0o600,
            "file kind/mode mismatch"
        );
        ensure!(
            attr.size == self.bytes.len() as u64,
            "size mismatch for {}",
            self.id
        );
        ensure!(
            (attr.attr_version, attr.content_version, attr.grants_version)
                == (self.attr_version, self.content_version, 1),
            "version mismatch for {}: got {}/{}/{}, expected {}/{}/1",
            self.id,
            attr.attr_version,
            attr.content_version,
            attr.grants_version,
            self.attr_version,
            self.content_version
        );
        ensure!(
            attr.atime.is_some()
                && self.atime.is_none_or(|atime| attr.atime == Some(atime))
                && attr.mtime.is_some()
                && attr.ctime.is_some(),
            "timestamp mismatch"
        );
        ensure!(attr.store_version > 0, "missing store version");
        Ok(())
    }

    async fn verify(&self, client: &mut Client, parent: ObjectId) -> Result<()> {
        let attr = client.stat(self.id, true).await?;
        self.check_attr(&attr)?;
        let metadata = attr.metadata.context("missing metadata")?;
        ensure!(
            metadata.created > 0
                && metadata.mime_type == self.mime_type
                && metadata.xattrs == self.xattrs,
            "metadata mismatch for {}",
            self.id
        );
        let read = client.read(self.id, 0, MAX_FILE_BYTES as u32).await?;
        ensure!(read.data == self.bytes, "contents mismatch for {}", self.id);
        self.check_attr(&read.object)?;
        let lookup = client
            .lookup(parent.into(), &self.name)
            .await?
            .map_err(|e| anyhow::anyhow!("lookup failed: {e:?}"))?;
        self.check_attr(&lookup)
    }
}

struct Model {
    client: Client,
    dirs: [ObjectId; 2],
    dir_versions: [u64; 2],
    files: Vec<File>,
    rng: StdRng,
}

impl Model {
    async fn step(&mut self, step: usize, action: Action) -> Result<()> {
        if matches!(action, Action::Create) {
            let parent = self.rng.random_range(0..self.dirs.len());
            let file = File {
                id: ObjectId::new_v7(),
                parent,
                name: format!("file-{step}"),
                bytes: vec![],
                attr_version: 1,
                content_version: 1,
                mime_type: None,
                xattrs: BTreeMap::new(),
                atime: None,
            };
            let mutation = self
                .client
                .one(create(
                    file.id,
                    self.dirs[parent],
                    &file.name,
                    ObjectKind::File,
                ))
                .await?;
            file.check_attr(
                mutation
                    .object
                    .as_ref()
                    .context("missing created attributes")?,
            )?;
            self.dir_versions[parent] += 1;
            self.check_parents(&mutation, &[parent])?;
            file.verify(&mut self.client, self.dirs[parent]).await?;
            self.files.push(file);
            return Ok(());
        }

        let index = self.rng.random_range(0..self.files.len());
        let file = &mut self.files[index];
        let parent = file.parent;
        let operation = match action {
            Action::Create => unreachable!(),
            Action::Write | Action::Append => {
                let append = matches!(action, Action::Append);
                let offset = if append {
                    file.bytes.len()
                } else {
                    BOUNDARIES_BYTES[self.rng.random_range(0..BOUNDARIES_BYTES.len())]
                };
                let length = BOUNDARIES_BYTES[self.rng.random_range(0..BOUNDARIES_BYTES.len())]
                    .min(MAX_FILE_BYTES - offset);
                let data: Vec<u8> = (0..length).map(|_| self.rng.random()).collect();
                if !data.is_empty() {
                    file.bytes
                        .resize(file.bytes.len().max(offset + data.len()), 0);
                    file.bytes[offset..offset + data.len()].copy_from_slice(&data);
                }
                file.attr_version += 1;
                file.content_version += 1;
                Op::Write(WriteOperation {
                    object_id: file.id,
                    offset: if append { u64::MAX } else { offset as u64 },
                    data,
                    append,
                })
            }
            Action::Resize => {
                let size = BOUNDARIES_BYTES[self.rng.random_range(0..BOUNDARIES_BYTES.len())];
                file.bytes.resize(size, 0);
                file.attr_version += 1;
                file.content_version += 1;
                Op::Update(UpdateOperation {
                    object_id: file.id,
                    size: Some(size as u64),
                    ..Default::default()
                })
            }
            Action::Metadata => {
                file.mime_type = file
                    .mime_type
                    .is_none()
                    .then(|| "application/octet-stream".into());
                let value = if file.xattrs.remove("user.workload").is_some() {
                    None
                } else {
                    let value = step.to_le_bytes().to_vec();
                    file.xattrs.insert("user.workload".into(), value.clone());
                    Some(value)
                };
                file.atime = Some(step as u64);
                file.attr_version += 1;
                Op::Update(UpdateOperation {
                    object_id: file.id,
                    mime_type: Some(file.mime_type.clone().unwrap_or_default()),
                    xattrs: vec![XattrChange {
                        name: "user.workload".into(),
                        value,
                    }],
                    atime: file.atime,
                    ..Default::default()
                })
            }
            Action::Move => {
                file.parent = self.rng.random_range(0..self.dirs.len());
                file.name = format!("moved-{step}");
                file.attr_version += 1;
                self.dir_versions[parent] += 1;
                if parent != file.parent {
                    self.dir_versions[file.parent] += 1;
                }
                Op::Move(MoveOperation {
                    object_id: file.id,
                    parent_id: self.dirs[parent],
                    name: file.name.clone(),
                    target_id: Some(self.dirs[file.parent]),
                })
            }
            Action::Remove => remove(file.id, self.dirs[parent], ObjectKind::File),
            Action::Read => {
                let offset = self.rng.random_range(0..=file.bytes.len() + 1);
                let length = BOUNDARIES_BYTES[self.rng.random_range(0..BOUNDARIES_BYTES.len())];
                let read = self
                    .client
                    .read(file.id, offset as u64, length as u32)
                    .await?;
                let start = offset.min(file.bytes.len());
                let end = (start + length).min(file.bytes.len());
                ensure!(read.data == file.bytes[start..end], "range read mismatch");
                return file.check_attr(&read.object);
            }
        };
        let mutation = self.client.one(operation).await?;
        if matches!(action, Action::Remove) {
            let file = self.files.remove(index);
            self.dir_versions[parent] += 1;
            ensure!(mutation.object.is_none(), "Remove returned an object");
            self.check_parents(&mutation, &[parent])?;
            ensure!(
                self.client
                    .lookup(self.dirs[parent].into(), &file.name)
                    .await?
                    == Err(ErrorCode::NotFound),
                "removed name still resolves"
            );
            self.client.stat_error(file.id, ErrorCode::NotFound).await?;
        } else {
            let file = &self.files[index];
            file.check_attr(
                mutation
                    .object
                    .as_ref()
                    .context("missing mutation attributes")?,
            )?;
            if matches!(action, Action::Move) {
                let parents = if parent == file.parent {
                    vec![parent]
                } else {
                    vec![parent, file.parent]
                };
                self.check_parents(&mutation, &parents)?;
            } else {
                ensure!(mutation.related.is_empty(), "unexpected related attributes");
            }
            file.verify(&mut self.client, self.dirs[file.parent])
                .await?;
        }
        Ok(())
    }

    fn check_parents(&self, mutation: &Mutation, parents: &[usize]) -> Result<()> {
        ensure!(
            mutation.related.len() == parents.len(),
            "related parent count mismatch"
        );
        for &parent in parents {
            let attr = mutation
                .related
                .iter()
                .find(|attr| attr.id == self.dirs[parent].into())
                .context("missing parent attributes")?;
            ensure!(
                attr.attr_version == self.dir_versions[parent]
                    && attr.content_version == self.dir_versions[parent],
                "parent version mismatch"
            );
        }
        Ok(())
    }

    async fn audit(&mut self) -> Result<()> {
        for (parent, &directory) in self.dirs.iter().enumerate() {
            let entries = self.client.list(directory.into()).await?;
            let mut expected: Vec<_> = self.files.iter().filter(|f| f.parent == parent).collect();
            expected.sort_by(|a, b| a.name.cmp(&b.name));
            ensure!(
                entries.len() == expected.len(),
                "directory entry count mismatch"
            );
            for (entry, file) in entries.iter().zip(expected) {
                ensure!(entry.name == file.name, "directory name/order mismatch");
                file.check_attr(entry.object.as_ref().context("missing entry attributes")?)?;
            }
            let attr = self.client.stat(directory, false).await?;
            ensure!(
                attr.attr_version == self.dir_versions[parent]
                    && attr.content_version == self.dir_versions[parent],
                "directory version mismatch"
            );
        }
        if !self.files.is_empty() {
            // Include a duplicate and a missing ID to check positional, per-file results.
            let mut ids: Vec<_> = self.files.iter().map(|f| f.id).collect();
            ids.push(self.files[0].id);
            ids.push(ObjectId::new_v7());
            let request = self.client.request(ReadFilesRequest {
                object_ids: ids.clone(),
            });
            let results = self
                .client
                .api
                .read_files(request)
                .await?
                .into_inner()
                .results;
            ensure!(results.len() == ids.len(), "ReadFiles count mismatch");
            for (result, id) in results.iter().zip(ids) {
                ensure!(result.object_id == id, "ReadFiles order mismatch");
                // The model holds at most MAX_FILES (eight) files, so linear lookup stays bounded.
                if let Some(file) = self.files.iter().find(|f| f.id == id) {
                    ensure!(
                        result.error.is_none() && result.data.as_ref() == Some(&file.bytes),
                        "ReadFiles contents mismatch"
                    );
                    file.check_attr(
                        result
                            .object
                            .as_ref()
                            .context("missing ReadFiles attributes")?,
                    )?;
                } else {
                    ensure!(
                        result.object.is_none()
                            && result.data.is_none()
                            && result.error.as_ref().map(|e| e.code()) == Some(ErrorCode::NotFound),
                        "ReadFiles missing result mismatch"
                    );
                }
            }
        }
        Ok(())
    }
}

pub async fn run(
    mut client: Client,
    root: ObjectId,
    seed: u64,
    steps: usize,
    worker: usize,
) -> Result<()> {
    let dirs = [ObjectId::new_v7(), ObjectId::new_v7()];
    for (index, &id) in dirs.iter().enumerate() {
        client
            .one(create(
                id,
                root,
                &format!("worker-{worker}-{index}"),
                ObjectKind::Directory,
            ))
            .await?;
    }
    let mut model = Model {
        client,
        dirs,
        dir_versions: [1, 1],
        files: vec![],
        rng: StdRng::seed_from_u64(seed),
    };
    for step in 0..steps {
        let action = if model.files.is_empty() {
            Action::Create
        } else {
            let action = ACTIONS[model.rng.random_range(0..ACTIONS.len())];
            if matches!(action, Action::Create) && model.files.len() == MAX_FILES {
                Action::Remove
            } else {
                action
            }
        };
        model.step(step, action).await.with_context(|| {
            format!("worker={worker}, seed={seed}, step={step}, action={action:?}")
        })?;
        if step % AUDIT_INTERVAL_STEPS == 0 || step + 1 == steps {
            model
                .audit()
                .await
                .with_context(|| format!("audit: worker={worker}, seed={seed}, step={step}"))?;
        }
    }
    for file in &model.files {
        model
            .client
            .one(remove(file.id, dirs[file.parent], ObjectKind::File))
            .await?;
    }
    for id in dirs {
        model
            .client
            .one(remove(id, root, ObjectKind::Directory))
            .await?;
    }
    tracing::info!(worker, seed, steps, "model checks passed");
    Ok(())
}
