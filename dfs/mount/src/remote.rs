use crate::errno::Errno;
use dfs_protocol::{
    ObjectRef,
    rpc::{Attr, Session},
};
use tonic::transport::Channel;

/// The mount's connection to the dfs server, authenticated with one session key. The caller builds
/// the channel, TLS included.
#[derive(Clone)]
pub struct Remote {}

impl Remote {
    /// Fails with `EINVAL` if the key cannot be sent as a header.
    pub fn new(_channel: Channel, _session_key: &str) -> Result<Self, Errno> {
        todo!()
    }

    pub async fn current_session(&self) -> Result<Session, Errno> {
        todo!()
    }

    /// Extends the session. Sessions expire one hour after their last refresh.
    pub async fn refresh_session(&self) -> Result<Session, Errno> {
        todo!()
    }

    /**
     * @cc [owner:fontanierh,label:api] stat-batch
     * `stat` MUST return exactly one result per reference, in the same order, however many
     * references it gets. It MUST split them into requests the server accepts (256 references at
     * most).
     */
    pub async fn stat(&self, _references: &[ObjectRef]) -> Result<Vec<Result<Attr, Errno>>, Errno> {
        todo!()
    }
}
