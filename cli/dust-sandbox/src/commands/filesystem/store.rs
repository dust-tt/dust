use std::fs::{self, File, OpenOptions};
use std::io;
#[cfg(test)]
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use serde::Serialize;

pub const ROOT_ID: u64 = 1;
pub const CONVERSATION_ID: u64 = 2;
pub const POD_ID: u64 = 3;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    File,
    Directory,
}

impl NodeKind {
    fn from_database(value: i64) -> rusqlite::Result<Self> {
        match value {
            1 => Ok(Self::File),
            2 => Ok(Self::Directory),
            _ => Err(rusqlite::Error::IntegralValueOutOfRange(2, value)),
        }
    }

    fn database_value(self) -> i64 {
        match self {
            Self::File => 1,
            Self::Directory => 2,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub id: u64,
    pub parent_id: Option<u64>,
    pub name: String,
    pub kind: NodeKind,
    pub file_resource_id: Option<String>,
    pub mode: u16,
    pub size: u64,
    pub created_at_ms: i64,
    pub modified_at_ms: i64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathInfo {
    pub path: String,
    pub node: Node,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub sequence: u64,
    pub operation: String,
    pub node_id: u64,
    pub file_resource_id: Option<String>,
    pub old_path: Option<String>,
    pub new_path: Option<String>,
    pub created_at_ms: i64,
}

/// SQLite owns names and stable file numbers. The content folder owns bytes.
/// Keeping these jobs separate is the point of this prototype: a rename only
/// updates a row and never has to copy a file's bytes.
pub struct FileStore {
    connection: Connection,
    content_dir: PathBuf,
}

impl FileStore {
    pub fn open(state_dir: &Path) -> io::Result<Self> {
        fs::create_dir_all(state_dir)?;
        let content_dir = state_dir.join("content");
        fs::create_dir_all(&content_dir)?;

        let connection = Connection::open(state_dir.join("files.sqlite3")).map_err(sqlite_error)?;
        connection
            .busy_timeout(Duration::from_secs(5))
            .map_err(sqlite_error)?;
        connection
            .execute_batch(
                r#"
                PRAGMA foreign_keys = ON;
                PRAGMA journal_mode = WAL;

                CREATE TABLE IF NOT EXISTS nodes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    parent_id INTEGER REFERENCES nodes(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    kind INTEGER NOT NULL,
                    file_resource_id TEXT,
                    mode INTEGER NOT NULL,
                    size INTEGER NOT NULL DEFAULT 0,
                    created_at_ms INTEGER NOT NULL,
                    modified_at_ms INTEGER NOT NULL,
                    UNIQUE(parent_id, name)
                );

                CREATE UNIQUE INDEX IF NOT EXISTS nodes_file_resource_id
                    ON nodes(file_resource_id)
                    WHERE file_resource_id IS NOT NULL;

                CREATE TABLE IF NOT EXISTS changes (
                    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                    operation TEXT NOT NULL,
                    node_id INTEGER NOT NULL,
                    file_resource_id TEXT,
                    old_path TEXT,
                    new_path TEXT,
                    created_at_ms INTEGER NOT NULL
                );
                "#,
            )
            .map_err(sqlite_error)?;

        let now_ms = now_ms()?;
        connection
            .execute(
                "INSERT OR IGNORE INTO nodes
                 (id, parent_id, name, kind, mode, size, created_at_ms, modified_at_ms)
                 VALUES (?1, NULL, '', ?2, ?3, 0, ?4, ?4)",
                params![
                    ROOT_ID,
                    NodeKind::Directory.database_value(),
                    0o755_u16,
                    now_ms
                ],
            )
            .map_err(sqlite_error)?;
        connection
            .execute(
                "INSERT OR IGNORE INTO nodes
                 (id, parent_id, name, kind, mode, size, created_at_ms, modified_at_ms)
                 VALUES (?1, ?2, 'conversation', ?3, ?4, 0, ?5, ?5)",
                params![
                    CONVERSATION_ID,
                    ROOT_ID,
                    NodeKind::Directory.database_value(),
                    0o755_u16,
                    now_ms
                ],
            )
            .map_err(sqlite_error)?;
        connection
            .execute(
                "INSERT OR IGNORE INTO nodes
                 (id, parent_id, name, kind, mode, size, created_at_ms, modified_at_ms)
                 VALUES (?1, ?2, 'pod', ?3, ?4, 0, ?5, ?5)",
                params![
                    POD_ID,
                    ROOT_ID,
                    NodeKind::Directory.database_value(),
                    0o755_u16,
                    now_ms
                ],
            )
            .map_err(sqlite_error)?;

        Ok(Self {
            connection,
            content_dir,
        })
    }

    pub fn node(&self, node_id: u64) -> io::Result<Node> {
        node_from_connection(&self.connection, node_id)
    }

    pub fn lookup(&self, parent_id: u64, name: &str) -> io::Result<Node> {
        validate_name(name)?;
        let parent = self.node(parent_id)?;
        if parent.kind != NodeKind::Directory {
            return Err(errno(libc::ENOTDIR));
        }
        child_from_connection(&self.connection, parent_id, name)?.ok_or_else(|| errno(libc::ENOENT))
    }

    pub fn children(&self, parent_id: u64) -> io::Result<Vec<Node>> {
        let parent = self.node(parent_id)?;
        if parent.kind != NodeKind::Directory {
            return Err(errno(libc::ENOTDIR));
        }
        let mut statement = self
            .connection
            .prepare(
                "SELECT id, parent_id, name, kind, file_resource_id, mode, size,
                        created_at_ms, modified_at_ms
                 FROM nodes WHERE parent_id = ?1 ORDER BY name",
            )
            .map_err(sqlite_error)?;
        let rows = statement
            .query_map(params![parent_id], node_from_row)
            .map_err(sqlite_error)?;
        let mut children = Vec::new();
        for row in rows {
            children.push(row.map_err(sqlite_error)?);
        }
        Ok(children)
    }

    pub fn resolve_path(&self, path: &Path) -> io::Result<Node> {
        let mut node = self.node(ROOT_ID)?;
        for component in path.components() {
            let name = match component {
                Component::Normal(name) => name.to_str().ok_or_else(|| errno(libc::EINVAL))?,
                _ => return Err(errno(libc::EINVAL)),
            };
            node = self.lookup(node.id, name)?;
        }
        Ok(node)
    }

    pub fn path_for_node(&self, node_id: u64) -> io::Result<String> {
        path_for_node_with_connection(&self.connection, node_id)
    }

    pub fn path_info(&self, path: &Path) -> io::Result<PathInfo> {
        let node = self.resolve_path(path)?;
        Ok(PathInfo {
            path: self.path_for_node(node.id)?,
            node,
        })
    }

    pub fn create_file(&mut self, parent_id: u64, name: &str, mode: u16) -> io::Result<Node> {
        self.create_node(parent_id, name, NodeKind::File, mode)
    }

    pub fn create_directory(&mut self, parent_id: u64, name: &str, mode: u16) -> io::Result<Node> {
        self.create_node(parent_id, name, NodeKind::Directory, mode)
    }

    fn create_node(
        &mut self,
        parent_id: u64,
        name: &str,
        kind: NodeKind,
        mode: u16,
    ) -> io::Result<Node> {
        validate_name(name)?;
        let parent = self.node(parent_id)?;
        if parent.kind != NodeKind::Directory {
            return Err(errno(libc::ENOTDIR));
        }
        if child_from_connection(&self.connection, parent_id, name)?.is_some() {
            return Err(errno(libc::EEXIST));
        }

        let now_ms = now_ms()?;
        let new_path = join_path(&self.path_for_node(parent_id)?, name);
        let transaction = self.connection.transaction().map_err(sqlite_error)?;
        transaction
            .execute(
                "INSERT INTO nodes
                 (parent_id, name, kind, mode, size, created_at_ms, modified_at_ms)
                 VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)",
                params![parent_id, name, kind.database_value(), mode, now_ms],
            )
            .map_err(sqlite_error)?;
        let node_id =
            u64::try_from(transaction.last_insert_rowid()).map_err(|_| errno(libc::EOVERFLOW))?;
        let content_path = self.content_dir.join(node_id.to_string());

        if kind == NodeKind::File {
            OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&content_path)?;
        }
        insert_change(
            &transaction,
            "created",
            node_id,
            None,
            None,
            Some(&new_path),
        )?;
        if let Err(error) = transaction.commit().map_err(sqlite_error) {
            if kind == NodeKind::File {
                let _ = fs::remove_file(content_path);
            }
            return Err(error);
        }
        self.node(node_id)
    }

    pub fn attach_file_resource(
        &mut self,
        path: &Path,
        file_resource_id: &str,
    ) -> io::Result<PathInfo> {
        if file_resource_id.is_empty() {
            return Err(errno(libc::EINVAL));
        }
        let node = self.resolve_path(path)?;
        if node.kind != NodeKind::File {
            return Err(errno(libc::EISDIR));
        }
        if node.file_resource_id.as_deref() == Some(file_resource_id) {
            return self.path_info(path);
        }
        let current_path = self.path_for_node(node.id)?;
        let transaction = self.connection.transaction().map_err(sqlite_error)?;
        transaction
            .execute(
                "UPDATE nodes SET file_resource_id = ?1 WHERE id = ?2",
                params![file_resource_id, node.id],
            )
            .map_err(|error| {
                if error.sqlite_error_code() == Some(rusqlite::ErrorCode::ConstraintViolation) {
                    errno(libc::EEXIST)
                } else {
                    sqlite_error(error)
                }
            })?;
        insert_change(
            &transaction,
            "attached",
            node.id,
            Some(file_resource_id),
            Some(&current_path),
            Some(&current_path),
        )?;
        transaction.commit().map_err(sqlite_error)?;
        self.path_info(path)
    }

    pub fn remove_file(&mut self, parent_id: u64, name: &str) -> io::Result<()> {
        let node = self.lookup(parent_id, name)?;
        if node.kind != NodeKind::File {
            return Err(errno(libc::EISDIR));
        }
        let old_path = self.path_for_node(node.id)?;
        fs::remove_file(self.content_path(node.id))?;
        let transaction = self.connection.transaction().map_err(sqlite_error)?;
        transaction
            .execute("DELETE FROM nodes WHERE id = ?1", params![node.id])
            .map_err(sqlite_error)?;
        insert_change(
            &transaction,
            "deleted",
            node.id,
            node.file_resource_id.as_deref(),
            Some(&old_path),
            None,
        )?;
        transaction.commit().map_err(sqlite_error)
    }

    pub fn remove_directory(&mut self, parent_id: u64, name: &str) -> io::Result<()> {
        let node = self.lookup(parent_id, name)?;
        if node.kind != NodeKind::Directory {
            return Err(errno(libc::ENOTDIR));
        }
        if node.id == CONVERSATION_ID || node.id == POD_ID {
            return Err(errno(libc::EBUSY));
        }
        if !self.children(node.id)?.is_empty() {
            return Err(errno(libc::ENOTEMPTY));
        }
        let old_path = self.path_for_node(node.id)?;
        let transaction = self.connection.transaction().map_err(sqlite_error)?;
        transaction
            .execute("DELETE FROM nodes WHERE id = ?1", params![node.id])
            .map_err(sqlite_error)?;
        insert_change(
            &transaction,
            "deleted",
            node.id,
            None,
            Some(&old_path),
            None,
        )?;
        transaction.commit().map_err(sqlite_error)
    }

    pub fn rename(
        &mut self,
        parent_id: u64,
        name: &str,
        new_parent_id: u64,
        new_name: &str,
    ) -> io::Result<u64> {
        validate_name(new_name)?;
        let source = self.lookup(parent_id, name)?;
        let new_parent = self.node(new_parent_id)?;
        if new_parent.kind != NodeKind::Directory {
            return Err(errno(libc::ENOTDIR));
        }
        if source.id == CONVERSATION_ID || source.id == POD_ID || new_parent_id == ROOT_ID {
            return Err(errno(libc::EBUSY));
        }
        if parent_id == new_parent_id && name == new_name {
            return Ok(source.id);
        }
        if source.kind == NodeKind::Directory && self.is_at_or_below(new_parent_id, source.id)? {
            return Err(errno(libc::EINVAL));
        }

        let destination = child_from_connection(&self.connection, new_parent_id, new_name)?;
        let old_path = self.path_for_node(source.id)?;
        let new_parent_path = self.path_for_node(new_parent_id)?;
        let new_path = join_path(&new_parent_path, new_name);

        if let Some(destination) = &destination {
            if source.kind != destination.kind {
                return Err(if source.kind == NodeKind::Directory {
                    errno(libc::ENOTDIR)
                } else {
                    errno(libc::EISDIR)
                });
            }
            if destination.kind == NodeKind::Directory && !self.children(destination.id)?.is_empty()
            {
                return Err(errno(libc::ENOTEMPTY));
            }
            if source.file_resource_id.is_some() && destination.file_resource_id.is_some() {
                return Err(errno(libc::EBUSY));
            }

            // Editors save by renaming an ordinary temporary file over the
            // shared file. Linux makes the temporary inode the destination
            // inode, so move the FileResource ID onto that inode as well.
            if source.kind == NodeKind::File
                && source.file_resource_id.is_none()
                && destination.file_resource_id.is_some()
            {
                fs::remove_file(self.content_path(destination.id))?;
                let now_ms = now_ms()?;
                let transaction = self.connection.transaction().map_err(sqlite_error)?;
                transaction
                    .execute("DELETE FROM nodes WHERE id = ?1", params![destination.id])
                    .map_err(sqlite_error)?;
                transaction
                    .execute(
                        "UPDATE nodes
                         SET parent_id = ?1, name = ?2, file_resource_id = ?3,
                             modified_at_ms = ?4
                         WHERE id = ?5",
                        params![
                            new_parent_id,
                            new_name,
                            destination.file_resource_id,
                            now_ms,
                            source.id
                        ],
                    )
                    .map_err(sqlite_error)?;
                insert_change(
                    &transaction,
                    "content_replaced",
                    source.id,
                    destination.file_resource_id.as_deref(),
                    Some(&old_path),
                    Some(&new_path),
                )?;
                transaction.commit().map_err(sqlite_error)?;
                return Ok(source.id);
            }
        }

        if let Some(destination) = &destination {
            if destination.kind == NodeKind::File {
                fs::remove_file(self.content_path(destination.id))?;
            }
        }

        let transaction = self.connection.transaction().map_err(sqlite_error)?;
        if let Some(destination) = &destination {
            let destination_path = path_for_node_with_connection(&transaction, destination.id)?;
            transaction
                .execute("DELETE FROM nodes WHERE id = ?1", params![destination.id])
                .map_err(sqlite_error)?;
            insert_change(
                &transaction,
                "deleted",
                destination.id,
                destination.file_resource_id.as_deref(),
                Some(&destination_path),
                None,
            )?;
        }
        transaction
            .execute(
                "UPDATE nodes SET parent_id = ?1, name = ?2, modified_at_ms = ?3 WHERE id = ?4",
                params![new_parent_id, new_name, now_ms()?, source.id],
            )
            .map_err(sqlite_error)?;
        insert_change(
            &transaction,
            "moved",
            source.id,
            source.file_resource_id.as_deref(),
            Some(&old_path),
            Some(&new_path),
        )?;
        transaction.commit().map_err(sqlite_error)?;
        Ok(source.id)
    }

    pub fn open_content(&self, node_id: u64, flags: i32) -> io::Result<File> {
        let node = self.node(node_id)?;
        if node.kind != NodeKind::File {
            return Err(errno(libc::EISDIR));
        }
        let access_mode = flags & libc::O_ACCMODE;
        let mut options = OpenOptions::new();
        options.read(access_mode == libc::O_RDONLY || access_mode == libc::O_RDWR);
        options.write(access_mode == libc::O_WRONLY || access_mode == libc::O_RDWR);
        options.append(flags & libc::O_APPEND != 0);
        options.open(self.content_path(node_id))
    }

    pub fn set_size(&mut self, node_id: u64, size: u64) -> io::Result<Node> {
        let node = self.node(node_id)?;
        if node.kind != NodeKind::File {
            return Err(errno(libc::EISDIR));
        }
        OpenOptions::new()
            .write(true)
            .open(self.content_path(node_id))?
            .set_len(size)?;
        self.record_size(node_id, size)?;
        self.node(node_id)
    }

    pub fn set_mode(&mut self, node_id: u64, mode: u16) -> io::Result<Node> {
        self.node(node_id)?;
        self.connection
            .execute(
                "UPDATE nodes SET mode = ?1, modified_at_ms = ?2 WHERE id = ?3",
                params![mode, now_ms()?, node_id],
            )
            .map_err(sqlite_error)?;
        self.node(node_id)
    }

    pub fn record_size(&mut self, node_id: u64, size: u64) -> io::Result<()> {
        let changed = self
            .connection
            .execute(
                "UPDATE nodes SET size = ?1, modified_at_ms = ?2 WHERE id = ?3",
                params![size, now_ms()?, node_id],
            )
            .map_err(sqlite_error)?;
        if changed == 0 {
            // An open file can still be written after unlink. Its bytes remain
            // available through that open handle, but there is no path to update.
            return Ok(());
        }
        Ok(())
    }

    #[cfg(test)]
    fn write_all(&mut self, node_id: u64, bytes: &[u8]) -> io::Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .truncate(true)
            .open(self.content_path(node_id))?;
        file.write_all(bytes)?;
        file.sync_all()?;
        self.record_size(
            node_id,
            u64::try_from(bytes.len()).map_err(|_| errno(libc::EOVERFLOW))?,
        )
    }

    #[cfg(test)]
    fn read_all(&self, node_id: u64) -> io::Result<Vec<u8>> {
        let mut file = File::open(self.content_path(node_id))?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)?;
        Ok(bytes)
    }

    pub fn changes(&self) -> io::Result<Vec<Change>> {
        let mut statement = self
            .connection
            .prepare(
                "SELECT sequence, operation, node_id, file_resource_id, old_path,
                        new_path, created_at_ms
                 FROM changes ORDER BY sequence",
            )
            .map_err(sqlite_error)?;
        let rows = statement
            .query_map([], |row| {
                Ok(Change {
                    sequence: row.get(0)?,
                    operation: row.get(1)?,
                    node_id: row.get(2)?,
                    file_resource_id: row.get(3)?,
                    old_path: row.get(4)?,
                    new_path: row.get(5)?,
                    created_at_ms: row.get(6)?,
                })
            })
            .map_err(sqlite_error)?;
        let mut changes = Vec::new();
        for row in rows {
            changes.push(row.map_err(sqlite_error)?);
        }
        Ok(changes)
    }

    fn content_path(&self, node_id: u64) -> PathBuf {
        self.content_dir.join(node_id.to_string())
    }

    fn is_at_or_below(&self, mut node_id: u64, ancestor_id: u64) -> io::Result<bool> {
        loop {
            if node_id == ancestor_id {
                return Ok(true);
            }
            let node = self.node(node_id)?;
            match node.parent_id {
                Some(parent_id) => node_id = parent_id,
                None => return Ok(false),
            }
        }
    }
}

fn node_from_connection(connection: &Connection, node_id: u64) -> io::Result<Node> {
    connection
        .query_row(
            "SELECT id, parent_id, name, kind, file_resource_id, mode, size,
                    created_at_ms, modified_at_ms
             FROM nodes WHERE id = ?1",
            params![node_id],
            node_from_row,
        )
        .optional()
        .map_err(sqlite_error)?
        .ok_or_else(|| errno(libc::ENOENT))
}

fn child_from_connection(
    connection: &Connection,
    parent_id: u64,
    name: &str,
) -> io::Result<Option<Node>> {
    connection
        .query_row(
            "SELECT id, parent_id, name, kind, file_resource_id, mode, size,
                    created_at_ms, modified_at_ms
             FROM nodes WHERE parent_id = ?1 AND name = ?2",
            params![parent_id, name],
            node_from_row,
        )
        .optional()
        .map_err(sqlite_error)
}

fn node_from_row(row: &Row<'_>) -> rusqlite::Result<Node> {
    NodeKind::from_database(row.get(3)?).and_then(|kind| {
        Ok(Node {
            id: row.get(0)?,
            parent_id: row.get(1)?,
            name: row.get(2)?,
            kind,
            file_resource_id: row.get(4)?,
            mode: row.get(5)?,
            size: row.get(6)?,
            created_at_ms: row.get(7)?,
            modified_at_ms: row.get(8)?,
        })
    })
}

fn path_for_node_with_connection(connection: &Connection, node_id: u64) -> io::Result<String> {
    let mut current_id = node_id;
    let mut names = Vec::new();
    loop {
        let node = node_from_connection(connection, current_id)?;
        match node.parent_id {
            Some(parent_id) => {
                names.push(node.name);
                current_id = parent_id;
            }
            None => break,
        }
    }
    names.reverse();
    Ok(names.join("/"))
}

fn insert_change(
    transaction: &Transaction<'_>,
    operation: &str,
    node_id: u64,
    file_resource_id: Option<&str>,
    old_path: Option<&str>,
    new_path: Option<&str>,
) -> io::Result<()> {
    transaction
        .execute(
            "INSERT INTO changes
             (operation, node_id, file_resource_id, old_path, new_path, created_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                operation,
                node_id,
                file_resource_id,
                old_path,
                new_path,
                now_ms()?
            ],
        )
        .map_err(sqlite_error)?;
    Ok(())
}

fn validate_name(name: &str) -> io::Result<()> {
    if name.is_empty() || name == "." || name == ".." || name.contains('/') {
        return Err(errno(libc::EINVAL));
    }
    Ok(())
}

fn join_path(parent: &str, name: &str) -> String {
    if parent.is_empty() {
        name.to_owned()
    } else {
        format!("{parent}/{name}")
    }
}

fn now_ms() -> io::Result<i64> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(io::Error::other)?;
    i64::try_from(duration.as_millis()).map_err(|_| errno(libc::EOVERFLOW))
}

fn sqlite_error(error: rusqlite::Error) -> io::Error {
    io::Error::other(error)
}

fn errno(code: i32) -> io::Error {
    io::Error::from_raw_os_error(code)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn store() -> (TempDir, FileStore) {
        let directory = TempDir::new().expect("temporary state directory should be created");
        let store = FileStore::open(directory.path()).expect("store should open");
        (directory, store)
    }

    #[test]
    fn create_write_read_and_restart() {
        let (directory, mut store) = store();
        let file = store
            .create_file(CONVERSATION_ID, "note.txt", 0o644)
            .expect("file should be created");
        store
            .write_all(file.id, b"hello")
            .expect("file should be written");
        assert_eq!(
            store.read_all(file.id).expect("file should be read"),
            b"hello"
        );
        store
            .write_all(file.id, b"written again")
            .expect("existing file should be overwritten");
        assert_eq!(
            store
                .resolve_path(Path::new("conversation/note.txt"))
                .expect("overwritten file should keep its path")
                .id,
            file.id
        );
        drop(store);

        let reopened = FileStore::open(directory.path()).expect("store should reopen");
        let file_after_restart = reopened
            .resolve_path(Path::new("conversation/note.txt"))
            .expect("path should survive restart");
        assert_eq!(file_after_restart.id, file.id);
        assert_eq!(
            reopened
                .read_all(file.id)
                .expect("bytes should survive restart"),
            b"written again"
        );
    }

    #[test]
    fn rename_and_cross_root_move_keep_identity() {
        let (_directory, mut store) = store();
        let file = store
            .create_file(CONVERSATION_ID, "note.txt", 0o644)
            .expect("file should be created");
        store
            .attach_file_resource(Path::new("conversation/note.txt"), "fil_123")
            .expect("file resource should attach");

        let renamed_id = store
            .rename(CONVERSATION_ID, "note.txt", CONVERSATION_ID, "renamed.txt")
            .expect("rename should work");
        let moved_id = store
            .rename(CONVERSATION_ID, "renamed.txt", POD_ID, "renamed.txt")
            .expect("cross-root move should work");

        assert_eq!(renamed_id, file.id);
        assert_eq!(moved_id, file.id);
        let moved = store
            .resolve_path(Path::new("pod/renamed.txt"))
            .expect("destination should exist");
        assert_eq!(moved.file_resource_id.as_deref(), Some("fil_123"));
        assert_eq!(
            store
                .resolve_path(Path::new("conversation/renamed.txt"))
                .expect_err("source should be gone")
                .raw_os_error(),
            Some(libc::ENOENT)
        );
    }

    #[test]
    fn delete_keeps_the_identity_in_the_change_log() {
        let (_directory, mut store) = store();
        let file = store
            .create_file(POD_ID, "frame.tsx", 0o644)
            .expect("file should be created");
        store
            .attach_file_resource(Path::new("pod/frame.tsx"), "fil_frame")
            .expect("file resource should attach");
        store
            .remove_file(POD_ID, "frame.tsx")
            .expect("file should be deleted");

        let deleted = store
            .changes()
            .expect("changes should load")
            .into_iter()
            .find(|change| change.operation == "deleted")
            .expect("delete change should exist");
        assert_eq!(deleted.node_id, file.id);
        assert_eq!(deleted.file_resource_id.as_deref(), Some("fil_frame"));
        assert_eq!(deleted.old_path.as_deref(), Some("pod/frame.tsx"));
    }

    #[test]
    fn editor_save_moves_the_file_resource_to_the_new_inode() {
        let (_directory, mut store) = store();
        let shared = store
            .create_file(CONVERSATION_ID, "frame.tsx", 0o644)
            .expect("shared file should be created");
        store
            .write_all(shared.id, b"old")
            .expect("shared file should be written");
        store
            .attach_file_resource(Path::new("conversation/frame.tsx"), "fil_frame")
            .expect("file resource should attach");
        let temporary = store
            .create_file(CONVERSATION_ID, ".frame.tsx.tmp", 0o644)
            .expect("temporary file should be created");
        store
            .write_all(temporary.id, b"new")
            .expect("temporary file should be written");

        let result_id = store
            .rename(
                CONVERSATION_ID,
                ".frame.tsx.tmp",
                CONVERSATION_ID,
                "frame.tsx",
            )
            .expect("editor save should work");

        assert_eq!(result_id, temporary.id);
        let saved = store
            .resolve_path(Path::new("conversation/frame.tsx"))
            .expect("shared path should exist");
        assert_eq!(saved.id, temporary.id);
        assert_eq!(saved.file_resource_id.as_deref(), Some("fil_frame"));
        assert_eq!(
            store.read_all(saved.id).expect("saved bytes should load"),
            b"new"
        );
    }

    #[test]
    fn moving_a_directory_keeps_all_child_ids() {
        let (_directory, mut store) = store();
        let directory = store
            .create_directory(CONVERSATION_ID, "project", 0o755)
            .expect("directory should be created");
        let file = store
            .create_file(directory.id, "frame.tsx", 0o644)
            .expect("child should be created");

        store
            .rename(CONVERSATION_ID, "project", POD_ID, "project")
            .expect("directory should move");

        let moved_directory = store
            .resolve_path(Path::new("pod/project"))
            .expect("moved directory should exist");
        let moved_file = store
            .resolve_path(Path::new("pod/project/frame.tsx"))
            .expect("moved child should exist");
        assert_eq!(moved_directory.id, directory.id);
        assert_eq!(moved_file.id, file.id);
    }

    #[test]
    fn replacing_one_shared_file_with_another_is_rejected() {
        let (_directory, mut store) = store();
        store
            .create_file(CONVERSATION_ID, "one.tsx", 0o644)
            .expect("first file should be created");
        store
            .create_file(CONVERSATION_ID, "two.tsx", 0o644)
            .expect("second file should be created");
        store
            .attach_file_resource(Path::new("conversation/one.tsx"), "fil_one")
            .expect("first resource should attach");
        store
            .attach_file_resource(Path::new("conversation/two.tsx"), "fil_two")
            .expect("second resource should attach");

        let error = store
            .rename(CONVERSATION_ID, "one.tsx", CONVERSATION_ID, "two.tsx")
            .expect_err("ambiguous replacement should fail");
        assert_eq!(error.raw_os_error(), Some(libc::EBUSY));
    }
}
