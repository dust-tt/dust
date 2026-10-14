use crate::errno::Errno;
use dfs_protocol::{
    ObjectRef,
    rpc::{Attr, Empty, Session, StatRequest, dfs_client::DfsClient},
};
use tonic::{Request, metadata::AsciiMetadataValue, transport::Channel};

/// Most references one `Stat` request may carry. Keep in sync with `STAT_MAX_OBJECTS` in
/// `dfs/server/src/api.rs`, which rejects larger requests.
const MAX_STAT_REFERENCES: usize = 256;

/// The mount's connection to the dfs server, authenticated with one session key. The caller builds
/// the channel, TLS included.
#[derive(Clone)]
pub struct Remote {
    client: DfsClient<Channel>,
    authorization: AsciiMetadataValue,
}

impl Remote {
    /// Fails with `EINVAL` if the key cannot be sent as a header.
    pub fn new(channel: Channel, session_key: &str) -> Result<Self, Errno> {
        let mut authorization: AsciiMetadataValue = format!("Bearer {session_key}")
            .parse()
            .map_err(|_| Errno::EINVAL)?;
        authorization.set_sensitive(true);
        Ok(Self {
            client: DfsClient::new(channel),
            authorization,
        })
    }

    fn request<T>(&self, message: T) -> Request<T> {
        let mut request = Request::new(message);
        request
            .metadata_mut()
            .insert("authorization", self.authorization.clone());
        request
    }

    pub async fn current_session(&self) -> Result<Session, Errno> {
        let response = self
            .client
            .clone()
            .current_session(self.request(Empty {}))
            .await?;
        Ok(response.into_inner())
    }

    /// Extends the session. Sessions expire one hour after their last refresh.
    pub async fn refresh_session(&self) -> Result<Session, Errno> {
        let response = self
            .client
            .clone()
            .refresh_session(self.request(Empty {}))
            .await?;
        Ok(response.into_inner())
    }

    /**
     * @cc [owner:fontanierh,label:api] stat-batch
     * On success, `stat` MUST return exactly one result per reference, in the same order, however
     * many references it gets.
     */
    pub async fn stat(&self, references: &[ObjectRef]) -> Result<Vec<Result<Attr, Errno>>, Errno> {
        let mut results = Vec::with_capacity(references.len());
        for chunk in references.chunks(MAX_STAT_REFERENCES) {
            let response = self
                .client
                .clone()
                .stat(self.request(StatRequest {
                    object_ids: chunk.to_vec(),
                    include_metadata: None,
                }))
                .await?
                .into_inner();
            if response.results.len() != chunk.len() {
                return Err(Errno::EIO);
            }
            results.extend(response.results.into_iter().map(|result| {
                match (result.object, result.error) {
                    (Some(attr), None) => Ok(attr),
                    (None, Some(error)) => Err(error.code().into()),
                    _ => Err(Errno::EIO),
                }
            }));
        }
        Ok(results)
    }
}
