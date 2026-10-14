//! Integration tests for the mount library against a real dfs server.
//!
//! The harness starts the dfs server in this process (`dfs_api::serve` on a local port) and talks to
//! it over gRPC, as the mount does in production. The server stores its data in the FoundationDB
//! cluster named by `FDB_CLUSTER_FILE`, so these tests need a running FoundationDB and its client
//! library (`libfdb_c`), as in CI.
//!
//! Each run creates a fresh tenant with random IDs, so runs never see each other's data. Objects are
//! written directly to FoundationDB until the server can create them over gRPC.
//!
//! All checks run under the single `mount` test below; to add one, write an `async fn` and call it
//! from there.

use anyhow::{Context, Result};
use dfs_api::storage::{
    fdb,
    resources::{object::ObjectResource, tenant::TenantResource},
};
use dfs_mount::{Errno, Remote};
use dfs_protocol::{
    ObjectId, ObjectRef, STAT_MAX_REFERENCES,
    rpc::{
        AllowGrant, CreateSessionRequest, CreateTenantRequest, DenyGrant, Grant, ObjectKind,
        dfs_client::DfsClient, grant,
    },
};
use tokio::net::TcpListener;
use tonic::{Request, transport::Channel};

const MASTER_KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const SUBJECT: &str = "u:mount-test";
/// More than one `Stat` request can carry.
const MANY_REFERENCES: usize = STAT_MAX_REFERENCES + 4;

/// The FDB network boots once per process and cannot restart once stopped, so every mount check
/// runs under this one test, which holds the guard and drops it before the binary exits.
#[test]
fn mount() -> Result<()> {
    // SAFETY: the only `boot` in this test binary; `_network` is dropped when this test returns.
    #[allow(unsafe_code)]
    let _network = unsafe { foundationdb::boot() };
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;

    runtime.block_on(async {
        let channel = serve().await?;
        let tenant = Tenant::create(&channel).await?;
        stat_returns_one_ordered_result_per_reference(&channel, &tenant).await?;
        stat_fails_with_an_unknown_session_key(&channel, &tenant).await
    })
}

async fn serve() -> Result<Channel> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let address = listener.local_addr()?;
    tokio::spawn(dfs_api::serve(listener, MASTER_KEY, std::future::pending()));
    Ok(Channel::from_shared(format!("http://{address}"))?
        .connect()
        .await?)
}

fn with_authorization<T>(message: T, authorization: &str) -> Result<Request<T>> {
    let mut request = Request::new(message);
    request
        .metadata_mut()
        .insert("authorization", authorization.parse()?);
    Ok(request)
}

/// A tenant whose root `SUBJECT` can read and write, holding a file `SUBJECT` can read and one it
/// cannot.
struct Tenant {
    key: String,
    root_id: ObjectId,
    file_id: ObjectId,
    unreadable_id: ObjectId,
}

impl Tenant {
    async fn create(channel: &Channel) -> Result<Self> {
        let tenant = DfsClient::new(channel.clone())
            .create_tenant(with_authorization(
                CreateTenantRequest {
                    tenant_id: ObjectId::new_v7().to_string(),
                    root_grants: vec![Grant {
                        kind: Some(grant::Kind::Allow(AllowGrant {
                            subject: SUBJECT.to_owned(),
                            mode: 0o6,
                        })),
                    }],
                },
                &format!("Bearer {MASTER_KEY}"),
            )?)
            .await?
            .into_inner();

        // File creation RPCs are not implemented yet.
        let tx = fdb::database()?.create_trx()?;
        let resource = TenantResource::fetch(&tx, &tenant.tenant_id)
            .await?
            .context("missing tenant")?;
        let mut file = ObjectResource::new_root(&resource)?;
        file.object_id = ObjectId::new_v7();
        file.parent_id = Some(tenant.root_id);
        file.name = "report.txt".to_owned();
        file.kind = ObjectKind::File;
        file.create(&tx, &[]).await?;
        let mut unreadable = ObjectResource::new_root(&resource)?;
        unreadable.object_id = ObjectId::new_v7();
        unreadable.parent_id = Some(tenant.root_id);
        unreadable.name = "secret.txt".to_owned();
        unreadable.kind = ObjectKind::File;
        let deny_read = Grant {
            kind: Some(grant::Kind::Deny(DenyGrant { mode: 0o4 })),
        };
        unreadable
            .create(&tx, std::slice::from_ref(&deny_read))
            .await?;
        tx.commit().await?;

        Ok(Self {
            key: tenant.tenant_key,
            root_id: tenant.root_id,
            file_id: file.object_id,
            unreadable_id: unreadable.object_id,
        })
    }

    async fn remote(&self, channel: &Channel) -> Result<Remote> {
        let session = DfsClient::new(channel.clone())
            .create_session(with_authorization(
                CreateSessionRequest {
                    subjects: vec![SUBJECT.to_owned()],
                },
                &format!("Bearer {}", self.key),
            )?)
            .await?
            .into_inner();
        Ok(Remote::new(channel.clone(), &session.session_key)?)
    }
}

async fn stat_returns_one_ordered_result_per_reference(
    channel: &Channel,
    tenant: &Tenant,
) -> Result<()> {
    let remote = tenant.remote(channel).await?;
    let missing = ObjectId::new_v7();
    let references: Vec<ObjectRef> = (0..MANY_REFERENCES)
        .map(|index| match index % 4 {
            0 => tenant.root_id.into(),
            1 => tenant.file_id.into(),
            2 => missing.into(),
            _ => tenant.unreadable_id.into(),
        })
        .collect();

    let results = remote.stat(&references).await?;

    assert_eq!(results.len(), MANY_REFERENCES);
    for (index, result) in results.iter().enumerate() {
        let kind = result
            .as_ref()
            .map(|attr| attr.kind())
            .map_err(|errno| *errno);
        match index % 4 {
            0 => assert_eq!(kind, Ok(ObjectKind::Directory), "reference {index}"),
            1 => assert_eq!(kind, Ok(ObjectKind::File), "reference {index}"),
            // An object the session cannot read looks missing.
            _ => assert_eq!(kind, Err(Errno::ENOENT), "reference {index}"),
        }
    }
    assert!(remote.stat(&[]).await?.is_empty());
    Ok(())
}

async fn stat_fails_with_an_unknown_session_key(channel: &Channel, tenant: &Tenant) -> Result<()> {
    let remote = Remote::new(channel.clone(), &"fedcba9876543210".repeat(4))?;
    let result = remote.stat(&[tenant.root_id.into()]).await;
    assert!(matches!(result, Err(Errno::EACCES)));
    Ok(())
}
