use std::{
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

use anyhow::{Context, Result, ensure};
use dfs_protocol::{
    ObjectId, ObjectRef,
    rpc::{operation::Operation as Op, *},
};
use prost::Message;
use tonic::{
    Request, Status,
    metadata::{Ascii, MetadataValue},
    transport::{Channel, Endpoint},
};

const RPC_TIMEOUT_SECONDS: u64 = 15;
const LIST_PAGE_ENTRIES: u32 = 3;

#[derive(Clone)]
pub struct Client {
    pub api: dfs_client::DfsClient<Channel>,
    bearer: MetadataValue<Ascii>,
    pub calls: Arc<AtomicU64>,
}

impl Client {
    pub async fn connect(endpoint: &str, key: &str) -> Result<Self> {
        let channel = Endpoint::from_shared(endpoint.to_owned())?
            .connect_timeout(Duration::from_secs(RPC_TIMEOUT_SECONDS))
            .timeout(Duration::from_secs(RPC_TIMEOUT_SECONDS))
            .connect()
            .await?;
        Ok(Self {
            api: dfs_client::DfsClient::new(channel),
            bearer: format!("Bearer {key}").parse()?,
            calls: Arc::new(AtomicU64::new(0)),
        })
    }

    pub fn with_key(&self, key: &str) -> Result<Self> {
        Ok(Self {
            api: self.api.clone(),
            bearer: format!("Bearer {key}").parse()?,
            calls: Arc::clone(&self.calls),
        })
    }

    pub fn request<T>(&self, body: T) -> Request<T> {
        self.calls.fetch_add(1, Ordering::Relaxed);
        let mut request = Request::new(body);
        request
            .metadata_mut()
            .insert("authorization", self.bearer.clone());
        request
    }

    pub async fn session(&mut self, subjects: Vec<String>) -> Result<(Self, Session)> {
        let request = self.request(CreateSessionRequest { subjects });
        let session = self.api.create_session(request).await?.into_inner();
        Ok((self.with_key(&session.session_key)?, session))
    }

    pub async fn apply(&mut self, operations: Vec<Op>) -> Result<Vec<Result<Mutation, ErrorCode>>> {
        let count = operations.len();
        let request = self.request(ApplyRequest {
            operations: operations
                .into_iter()
                .map(|operation| Operation {
                    operation: Some(operation),
                })
                .collect(),
        });
        let response = self.api.apply(request).await?.into_inner();
        ensure!(
            response.results.len() == count,
            "Apply result count mismatch"
        );
        let mut version = None;
        response
            .results
            .into_iter()
            .map(|result| match (result.mutation, result.error) {
                (Some(mutation), None) => {
                    for attr in mutation.object.iter().chain(&mutation.related) {
                        ensure!(attr.store_version > 0, "missing mutation commit version");
                        ensure!(
                            version.is_none_or(|v| v == attr.store_version),
                            "mixed commit versions in Apply"
                        );
                        version = Some(attr.store_version);
                    }
                    Ok(Ok(mutation))
                }
                (None, Some(error)) => Ok(Err(error.code())),
                _ => anyhow::bail!("invalid Apply result shape"),
            })
            .collect()
    }

    pub async fn one(&mut self, operation: Op) -> Result<Mutation> {
        self.apply(vec![operation])
            .await?
            .pop()
            .context("missing mutation")?
            .map_err(|error| anyhow::anyhow!("unexpected Apply error: {error:?}"))
    }

    pub async fn stat(&mut self, id: ObjectId, metadata: bool) -> Result<Attr> {
        let request = self.request(StatRequest {
            object_ids: vec![id.into()],
            include_metadata: Some(metadata),
        });
        let mut results = self.api.stat(request).await?.into_inner().results;
        ensure!(results.len() == 1, "Stat result count mismatch");
        let result = results.pop().context("missing Stat result")?;
        ensure!(result.error.is_none(), "Stat failed: {:?}", result.error);
        result.object.context("missing Stat attributes")
    }

    pub async fn stat_error(&mut self, id: ObjectId, expected: ErrorCode) -> Result<()> {
        let request = self.request(StatRequest {
            object_ids: vec![id.into()],
            include_metadata: None,
        });
        let mut results = self.api.stat(request).await?.into_inner().results;
        ensure!(results.len() == 1, "Stat result count mismatch");
        let result = results.pop().context("missing Stat result")?;
        ensure!(
            result.object.is_none() && result.error.as_ref().map(|e| e.code()) == Some(expected),
            "unexpected Stat error: {:?}",
            result.error
        );
        Ok(())
    }

    pub async fn read(&mut self, id: ObjectId, offset: u64, length: u32) -> Result<ReadData> {
        let request = self.request(ReadRequest {
            object_id: id,
            offset,
            length,
        });
        Ok(self.api.read(request).await?.into_inner())
    }

    pub async fn lookup(
        &mut self,
        parent: ObjectRef,
        name: &str,
    ) -> Result<Result<Attr, ErrorCode>> {
        let request = self.request(LookupRequest {
            targets: vec![LookupTarget {
                parent_id: parent,
                name: name.to_owned(),
            }],
            include_metadata: Some(true),
        });
        let mut results = self.api.lookup(request).await?.into_inner().results;
        ensure!(results.len() == 1, "Lookup result count mismatch");
        let result = results.pop().context("missing Lookup result")?;
        match (result.object, result.error) {
            (Some(attr), None) => Ok(Ok(attr)),
            (None, Some(error)) => Ok(Err(error.code())),
            _ => anyhow::bail!("invalid Lookup result shape"),
        }
    }

    pub async fn list(&mut self, parent: ObjectRef) -> Result<Vec<Entry>> {
        let mut entries = Vec::new();
        let mut after = None;
        let mut cursors = std::collections::HashSet::new();
        loop {
            let request = self.request(ListRequest {
                directory_id: parent,
                after,
                limit: LIST_PAGE_ENTRIES,
            });
            let page = self.api.list(request).await?.into_inner();
            ensure!(
                page.entries.len() <= LIST_PAGE_ENTRIES as usize,
                "List exceeded its limit"
            );
            let mut version = None;
            for entry in &page.entries {
                let attr = entry.object.as_ref().context("missing listed attributes")?;
                ensure!(
                    attr.metadata.is_none(),
                    "List returned unrequested metadata"
                );
                ensure!(
                    version.is_none_or(|v| v == attr.store_version),
                    "mixed snapshots in List page"
                );
                version = Some(attr.store_version);
            }
            entries.extend(page.entries);
            let Some(next) = page.next_after else {
                break;
            };
            ensure!(cursors.insert(next.clone()), "List cursor repeated");
            after = Some(next);
        }
        Ok(entries)
    }
}

pub fn create(id: ObjectId, parent: ObjectId, name: &str, kind: ObjectKind) -> Op {
    Op::Create(CreateOperation {
        object_id: id,
        parent_id: parent,
        name: name.to_owned(),
        kind: kind.into(),
        mime_type: None,
        xattrs: Default::default(),
    })
}

pub fn allow(subject: &str, mode: u32) -> Grant {
    Grant {
        kind: Some(grant::Kind::Allow(AllowGrant {
            subject: subject.to_owned(),
            mode,
        })),
    }
}

pub fn remove(id: ObjectId, parent: ObjectId, kind: ObjectKind) -> Op {
    Op::Remove(RemoveOperation {
        object_id: id,
        parent_id: parent,
        kind: kind.into(),
    })
}

pub fn expect_status<T>(
    result: Result<tonic::Response<T>, Status>,
    expected: ErrorCode,
) -> Result<()> {
    let error = result.err().context("expected an RPC error")?;
    let details = ErrorDetails::decode(error.details())?;
    ensure!(
        details.code() == expected,
        "expected {expected:?}, got {:?}",
        details.code()
    );
    Ok(())
}
