use crate::errno::Errno;
use dfs_protocol::{
    ObjectRef,
    rpc::{Attr, Empty, Session, StatRequest, dfs_client::DfsClient},
};
use tonic::{Request, metadata::AsciiMetadataValue, transport::Channel};

/// Largest request or response the server accepts, in bytes.
const MAX_MESSAGE_SIZE_BYTES: usize = 4 * 1024 * 1024;
/// Most references one `Stat` request may carry.
const MAX_STAT_REFERENCES: usize = 256;

/// The mount's connection to the dfs server, authenticated with one session key.
#[derive(Clone)]
pub struct Remote {
    client: DfsClient<Channel>,
    authorization: AsciiMetadataValue,
}

impl Remote {
    pub fn new(channel: Channel, session_key: &str) -> Result<Self, Errno> {
        let mut authorization: AsciiMetadataValue = format!("Bearer {session_key}")
            .parse()
            .map_err(|_| Errno::EINVAL)?;
        authorization.set_sensitive(true);
        Ok(Self {
            client: DfsClient::new(channel)
                .max_decoding_message_size(MAX_MESSAGE_SIZE_BYTES)
                .max_encoding_message_size(MAX_MESSAGE_SIZE_BYTES),
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
     * `stat` MUST return exactly one result per reference, in the same order, whatever the number
     * of references. It MUST split them into requests of at most 256 references.
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
                    (None, Some(error)) => Err((&error).into()),
                    _ => Err(Errno::EIO),
                }
            }));
        }
        Ok(results)
    }
}
