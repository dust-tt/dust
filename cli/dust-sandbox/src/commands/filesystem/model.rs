use std::collections::{HashMap, HashSet};
use std::ffi::{OsStr, OsString};
use std::io;
use std::path::{Component, Path, PathBuf};

use anyhow::{bail, Context};
use serde::{Deserialize, Serialize};

pub const ROOT_INODE: u64 = 1;

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MountKind {
    Conversation,
    Pod,
}

#[derive(Clone, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
pub struct MountIdentity {
    pub kind: MountKind,
    pub id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MountSpec {
    pub name: String,
    pub source: PathBuf,
    pub kind: MountKind,
    pub owner_id: String,
    pub read_only: bool,
    pub legacy_name: Option<String>,
}

impl MountSpec {
    pub fn parse_json(value: &str) -> Result<Self, String> {
        serde_json::from_str(value).map_err(|error| format!("invalid mount JSON: {error}"))
    }
}

#[derive(Clone, Debug)]
pub struct MountTarget {
    pub name: OsString,
    pub source: PathBuf,
    pub identity: MountIdentity,
    pub read_only: bool,
    pub legacy_name: Option<OsString>,
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub enum NodeKey {
    Root,
    Alias { mount_index: usize },
    Backing { mount_index: usize, path: PathBuf },
}

#[derive(Debug)]
pub struct MountTable {
    targets: Vec<MountTarget>,
    root_entries: Vec<(OsString, NodeKey)>,
    root_by_name: HashMap<OsString, NodeKey>,
}

impl MountTable {
    pub fn from_specs(specs: Vec<MountSpec>) -> anyhow::Result<Self> {
        if !(1..=2).contains(&specs.len()) {
            bail!("the Dust filesystem requires one or two mounts");
        }

        let mut names = HashSet::new();
        let mut kinds = HashSet::new();
        let mut identities = HashSet::new();
        let mut sources = HashSet::new();
        let mut targets = Vec::with_capacity(specs.len());

        for spec in specs {
            validate_segment(&spec.name).context("invalid mount name")?;
            if spec.owner_id.is_empty() {
                bail!("mount ownerId must be non-empty");
            }
            if !spec.source.is_absolute() {
                bail!("mount source must be an absolute path");
            }

            let name = OsString::from(spec.name);
            if !names.insert(name.clone()) {
                bail!("mount names must be unique");
            }
            if !kinds.insert(spec.kind) {
                bail!("only one mount of each kind is supported");
            }

            let identity = MountIdentity {
                kind: spec.kind,
                id: spec.owner_id,
            };
            if !identities.insert(identity.clone()) {
                bail!("mount identities must be unique");
            }

            let legacy_name = match spec.legacy_name {
                Some(legacy_name) => {
                    validate_segment(&legacy_name).context("invalid legacy mount name")?;
                    Some(OsString::from(legacy_name))
                }
                None => None,
            };

            let source = std::fs::canonicalize(&spec.source).with_context(|| {
                format!("failed to resolve mount source {}", spec.source.display())
            })?;
            if !sources.insert(source.clone()) {
                bail!("mount sources must be unique");
            }
            targets.push(MountTarget {
                name,
                source,
                identity,
                read_only: spec.read_only,
                legacy_name,
            });
        }

        let mut root_entries = Vec::with_capacity(targets.len() * 2);
        for (mount_index, target) in targets.iter().enumerate() {
            root_entries.push((
                target.name.clone(),
                NodeKey::Backing {
                    mount_index,
                    path: PathBuf::new(),
                },
            ));
        }
        for (mount_index, target) in targets.iter().enumerate() {
            if let Some(legacy_name) = &target.legacy_name {
                if !names.insert(legacy_name.clone()) {
                    bail!("legacy mount names must not shadow another root entry");
                }
                root_entries.push((legacy_name.clone(), NodeKey::Alias { mount_index }));
            }
        }

        let root_by_name = root_entries.iter().cloned().collect();
        Ok(Self {
            targets,
            root_entries,
            root_by_name,
        })
    }

    pub fn target(&self, mount_index: usize) -> io::Result<&MountTarget> {
        self.targets
            .get(mount_index)
            .ok_or_else(|| io::Error::from_raw_os_error(libc::ENOENT))
    }

    pub fn root_entries(&self) -> &[(OsString, NodeKey)] {
        &self.root_entries
    }

    pub fn root_entry(&self, name: &OsStr) -> Option<NodeKey> {
        self.root_by_name.get(name).cloned()
    }
}

#[derive(Debug)]
pub struct NodeTable {
    next_inode: u64,
    by_inode: HashMap<u64, NodeKey>,
    by_key: HashMap<NodeKey, u64>,
}

impl NodeTable {
    pub fn new() -> Self {
        let mut by_inode = HashMap::new();
        let mut by_key = HashMap::new();
        by_inode.insert(ROOT_INODE, NodeKey::Root);
        by_key.insert(NodeKey::Root, ROOT_INODE);
        Self {
            next_inode: ROOT_INODE + 1,
            by_inode,
            by_key,
        }
    }

    pub fn key(&self, inode: u64) -> io::Result<NodeKey> {
        self.by_inode
            .get(&inode)
            .cloned()
            .ok_or_else(|| io::Error::from_raw_os_error(libc::ENOENT))
    }

    pub fn inode_for(&mut self, key: NodeKey) -> u64 {
        if let Some(inode) = self.by_key.get(&key) {
            return *inode;
        }

        let inode = self.next_inode;
        self.next_inode = self.next_inode.saturating_add(1);
        self.by_key.insert(key.clone(), inode);
        self.by_inode.insert(inode, key);
        inode
    }

    pub fn remove_subtree(&mut self, mount_index: usize, path: &Path) {
        let removed: Vec<(u64, NodeKey)> = self
            .by_inode
            .iter()
            .filter_map(|(inode, key)| match key {
                NodeKey::Backing {
                    mount_index: candidate_mount,
                    path: candidate_path,
                } if *candidate_mount == mount_index && is_at_or_below(candidate_path, path) => {
                    Some((*inode, key.clone()))
                }
                _ => None,
            })
            .collect();

        for (inode, key) in removed {
            self.by_inode.remove(&inode);
            self.by_key.remove(&key);
        }
    }

    pub fn move_subtree(
        &mut self,
        source_mount: usize,
        source_path: &Path,
        destination_mount: usize,
        destination_path: &Path,
    ) {
        self.remove_subtree(destination_mount, destination_path);

        let moved: Vec<(u64, NodeKey, NodeKey)> = self
            .by_inode
            .iter()
            .filter_map(|(inode, key)| match key {
                NodeKey::Backing { mount_index, path }
                    if *mount_index == source_mount && is_at_or_below(path, source_path) =>
                {
                    let suffix = path.strip_prefix(source_path).ok()?;
                    Some((
                        *inode,
                        key.clone(),
                        NodeKey::Backing {
                            mount_index: destination_mount,
                            path: destination_path.join(suffix),
                        },
                    ))
                }
                _ => None,
            })
            .collect();

        for (inode, old_key, new_key) in moved {
            self.by_key.remove(&old_key);
            self.by_key.insert(new_key.clone(), inode);
            self.by_inode.insert(inode, new_key);
        }
    }
}

pub fn child_path(parent: &Path, name: &OsStr) -> io::Result<PathBuf> {
    validate_os_segment(name)?;
    Ok(parent.join(name))
}

pub fn path_for_mutation(path: &Path) -> io::Result<String> {
    if path.as_os_str().is_empty() {
        return Err(io::Error::from_raw_os_error(libc::EBUSY));
    }
    if path
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(io::Error::from_raw_os_error(libc::EACCES));
    }
    path.to_str()
        .map(ToOwned::to_owned)
        .ok_or_else(|| io::Error::from_raw_os_error(libc::EINVAL))
}

pub fn is_at_or_below(candidate: &Path, root: &Path) -> bool {
    candidate == root || candidate.starts_with(root)
}

fn validate_segment(value: &str) -> anyhow::Result<()> {
    validate_os_segment(OsStr::new(value)).map_err(anyhow::Error::from)
}

fn validate_os_segment(value: &OsStr) -> io::Result<()> {
    let path = Path::new(value);
    let mut components = path.components();
    let is_single_normal =
        matches!(components.next(), Some(Component::Normal(_))) && components.next().is_none();
    if !is_single_normal || value == OsStr::new(".") || value == OsStr::new("..") {
        return Err(io::Error::from_raw_os_error(libc::EINVAL));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn move_subtree_preserves_inodes_across_mounts() {
        let mut nodes = NodeTable::new();
        let root_inode = nodes.inode_for(NodeKey::Backing {
            mount_index: 0,
            path: PathBuf::from("bundle"),
        });
        let child_inode = nodes.inode_for(NodeKey::Backing {
            mount_index: 0,
            path: PathBuf::from("bundle/frame.tsx"),
        });

        nodes.move_subtree(0, Path::new("bundle"), 1, Path::new("moved-bundle"));

        assert_eq!(
            nodes.key(root_inode).expect("moved root should exist"),
            NodeKey::Backing {
                mount_index: 1,
                path: PathBuf::from("moved-bundle"),
            }
        );
        assert_eq!(
            nodes.key(child_inode).expect("moved child should exist"),
            NodeKey::Backing {
                mount_index: 1,
                path: PathBuf::from("moved-bundle/frame.tsx"),
            }
        );
    }

    #[test]
    fn path_for_mutation_rejects_root_and_non_normal_paths() {
        assert_eq!(
            path_for_mutation(Path::new(""))
                .expect_err("root must fail")
                .raw_os_error(),
            Some(libc::EBUSY)
        );
        assert_eq!(
            path_for_mutation(Path::new("../escape"))
                .expect_err("parent traversal must fail")
                .raw_os_error(),
            Some(libc::EACCES)
        );
    }

    #[test]
    fn mount_table_allows_at_most_one_mount_per_kind() {
        let temporary_directory = tempfile::tempdir().expect("temporary directory should exist");
        let first_source = temporary_directory.path().join("first");
        let second_source = temporary_directory.path().join("second");
        std::fs::create_dir(&first_source).expect("first source should exist");
        std::fs::create_dir(&second_source).expect("second source should exist");

        let result = MountTable::from_specs(vec![
            MountSpec {
                name: "pod-first".to_owned(),
                source: first_source,
                kind: MountKind::Pod,
                owner_id: "first".to_owned(),
                read_only: false,
                legacy_name: None,
            },
            MountSpec {
                name: "pod-second".to_owned(),
                source: second_source,
                kind: MountKind::Pod,
                owner_id: "second".to_owned(),
                read_only: false,
                legacy_name: None,
            },
        ]);

        assert!(result.is_err());
    }
}
