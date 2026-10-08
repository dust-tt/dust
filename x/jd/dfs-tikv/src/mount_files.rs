use crate::freshness::Freshness;
use crate::{client::Client, model::*};
use std::time::Instant;

#[derive(Clone)]
pub struct FileHandle {
    pub(crate) session: Id,
    pub(crate) remote: Id,
    pub(crate) node: Node,
    pub(crate) freshness: Option<Freshness>,
    pub(crate) readable: bool,
    pub(crate) writable: bool,
    pub(crate) append: bool,
}

impl FileHandle {
    pub(crate) fn cached(
        client: &Client,
        node: Node,
        flags: i32,
        freshness: Freshness,
    ) -> Result<Self> {
        let access = flags & libc::O_ACCMODE;
        if access != libc::O_RDONLY && access != libc::O_WRONLY && access != libc::O_RDWR {
            return Err(err(libc::EINVAL, "file access mode"));
        }
        Ok(Self {
            session: client.session.id.clone(),
            remote: format!("view:{}", node.id),
            node,
            freshness: Some(freshness),
            readable: access != libc::O_WRONLY,
            writable: access != libc::O_RDONLY,
            append: flags & libc::O_APPEND != 0,
        })
    }

    pub fn node(&self) -> &Node {
        &self.node
    }

    pub fn freshness(&self) -> Result<Freshness> {
        self.freshness
            .ok_or_else(|| err(libc::ESTALE, "file metadata requires validation"))
    }

    pub(crate) fn owned(&self, client: &Client) -> Result<()> {
        if self.session != client.session.id {
            return Err(err(libc::EACCES, "foreign file handle"));
        }
        Ok(())
    }

    async fn read_authority(&self, client: &Client) -> Result<()> {
        let Reply::Data(bytes) = client
            .call(Call::Read {
                node: self.node.id.clone(),
                version: Some(self.node.version.clone()),
                offset: 0,
                size: 0,
                handle: Some(self.remote.clone()),
            })
            .await?
        else {
            return Err(err(libc::EIO, "file read authority reply"));
        };
        if !bytes.is_empty() {
            return Err(err(libc::EIO, "nonempty authority reply"));
        }
        Ok(())
    }

    pub(crate) async fn refresh(&mut self, client: &Client) -> Result<()> {
        self.owned(client)?;
        for _ in 0..3 {
            let started = Instant::now();
            if self
                .freshness
                .is_some_and(|freshness| !freshness.requires_refresh_at(started))
            {
                return Ok(());
            }
            self.freshness = None;
            let Reply::Node(node) = client
                .call(Call::Stat {
                    node: self.node.id.clone(),
                    handle: Some(self.remote.clone()),
                })
                .await?
            else {
                return Err(err(libc::EIO, "file stat reply"));
            };
            if node.id != self.node.id || node.kind != Kind::File {
                return Err(err(libc::EIO, "file identity changed"));
            }
            self.node = node;
            if self.readable {
                self.read_authority(client).await?;
            }
            let freshness = Freshness::from_validation_started_at(started);
            if !freshness.requires_refresh_at(Instant::now()) {
                self.freshness = Some(freshness);
                return Ok(());
            }
        }
        Err(err(libc::ETIMEDOUT, "file metadata validation expired"))
    }

    pub(crate) async fn close(self, client: &Client) -> Result<()> {
        self.owned(client)
    }
}
