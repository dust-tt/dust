use anyhow::{Context, Result};
use dfs_api::storage::{
    fdb,
    resources::{object::ObjectResource, tenant::TenantResource},
};
use dfs_mount::{Errno, Fs, Kind, Link, ROOT_INO, Remote};
use dfs_protocol::{
    ObjectId, ObjectRef,
    rpc::{
        AllowGrant, CreateSessionRequest, CreateTenantRequest, Grant, ObjectKind,
        dfs_client::DfsClient, grant,
    },
};
use tokio::net::TcpListener;
use tonic::{Request, transport::Channel};

const MASTER_KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const SUBJECT: &str = "u:mount-test";
/// More than one `Stat` request can carry.
const MANY_REFERENCES: usize = 300;

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
        root_lists_links_and_resolves_anchors(&channel, &tenant).await?;
        access_comes_from_the_session(&channel, &tenant).await?;
        stat_splits_large_batches(&channel, &tenant).await?;
        links_are_validated(&channel, &tenant).await
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

/// A tenant whose root `SUBJECT` can read and write, holding one file.
struct Tenant {
    key: String,
    root_id: ObjectId,
    file_id: ObjectId,
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
        file.size = 123;
        file.create(&tx, &[]).await?;
        tx.commit().await?;

        Ok(Self {
            key: tenant.tenant_key,
            root_id: tenant.root_id,
            file_id: file.object_id,
        })
    }

    async fn session(&self, channel: &Channel, subjects: &[&str]) -> Result<Remote> {
        let session = DfsClient::new(channel.clone())
            .create_session(with_authorization(
                CreateSessionRequest {
                    subjects: subjects.iter().map(|&subject| subject.to_owned()).collect(),
                },
                &format!("Bearer {}", self.key),
            )?)
            .await?
            .into_inner();
        Ok(Remote::new(channel.clone(), &session.session_key)?)
    }

    fn conversation(&self) -> Link {
        Link {
            name: "conversation".to_owned(),
            target: format!("conv-test--{}", self.root_id),
        }
    }
}

async fn root_lists_links_and_resolves_anchors(channel: &Channel, tenant: &Tenant) -> Result<()> {
    let link = tenant.conversation();
    let fs = Fs::new(
        tenant.session(channel, &[SUBJECT]).await?,
        vec![link.clone()],
    )?;

    let root = fs.getattr(ROOT_INO).await?;
    assert_eq!((root.kind, root.permissions), (Kind::Directory, 0o500));

    let entries = fs.readdir(ROOT_INO).await?;
    assert_eq!(entries.len(), 1);
    assert_eq!(
        (entries[0].name.as_str(), entries[0].kind),
        ("conversation", Kind::Symlink)
    );

    let symlink = fs.lookup(ROOT_INO, "conversation").await?;
    assert_eq!(symlink.ino, entries[0].ino);
    assert_eq!(fs.getattr(symlink.ino).await?, symlink);
    assert_eq!(fs.readlink(symlink.ino)?, link.target);
    assert_eq!(fs.readdir(symlink.ino).await, Err(Errno(libc::ENOTDIR)));
    assert_eq!(fs.readlink(ROOT_INO), Err(Errno::EINVAL));

    // The label is ignored; the bare ID and any label resolve to the same inode.
    let directory = fs.lookup(ROOT_INO, &link.target).await?;
    assert_eq!(directory.kind, Kind::Directory);
    assert_ne!(directory.ino, symlink.ino);
    assert_eq!(fs.getattr(directory.ino).await?, directory);
    let bare = fs.lookup(ROOT_INO, &tenant.root_id.to_string()).await?;
    assert_eq!(bare.ino, directory.ino);
    let relabeled = fs
        .lookup(ROOT_INO, &format!("other--{}", tenant.root_id))
        .await?;
    assert_eq!(relabeled.ino, directory.ino);

    let file = fs
        .lookup(ROOT_INO, &format!("report--{}", tenant.file_id))
        .await?;
    assert_eq!((file.kind, file.size), (Kind::File, 123));
    assert_ne!(file.ino, directory.ino);

    // Anchors are reachable but not listed.
    assert_eq!(fs.readdir(ROOT_INO).await?, entries);

    for missing in [
        format!("conv--{}", ObjectId::new_v7()),
        "not-an-anchor".to_owned(),
        String::new(),
    ] {
        assert_eq!(fs.lookup(ROOT_INO, &missing).await, Err(Errno::ENOENT));
    }
    assert_eq!(
        fs.lookup(symlink.ino, "anything").await,
        Err(Errno(libc::ENOTDIR))
    );
    assert_eq!(
        fs.lookup(directory.ino, "report.txt").await,
        Err(Errno::EOPNOTSUPP)
    );
    assert_eq!(fs.readdir(directory.ino).await, Err(Errno::EOPNOTSUPP));

    // The directory was looked up three times: it stays known until all three are forgotten.
    fs.forget(directory.ino, 2);
    assert_eq!(fs.getattr(directory.ino).await?, directory);
    fs.forget(directory.ino, 1);
    assert_eq!(fs.getattr(directory.ino).await, Err(Errno::ENOENT));
    let again = fs.lookup(ROOT_INO, &link.target).await?;
    assert_ne!(again.ino, directory.ino);
    Ok(())
}

async fn access_comes_from_the_session(channel: &Channel, tenant: &Tenant) -> Result<()> {
    let link = tenant.conversation();

    // A session without grants sees the links but none of the objects behind them.
    let fs = Fs::new(tenant.session(channel, &[]).await?, vec![link.clone()])?;
    assert_eq!(fs.readdir(ROOT_INO).await?.len(), 1);
    assert_eq!(fs.lookup(ROOT_INO, &link.target).await, Err(Errno::ENOENT));

    let unknown_key = "fedcba9876543210".repeat(4);
    let fs = Fs::new(
        Remote::new(channel.clone(), &unknown_key)?,
        vec![link.clone()],
    )?;
    assert_eq!(fs.lookup(ROOT_INO, &link.target).await, Err(Errno::EACCES));
    assert!(matches!(
        Remote::new(channel.clone(), "bad\nkey"),
        Err(Errno::EINVAL)
    ));
    Ok(())
}

async fn stat_splits_large_batches(channel: &Channel, tenant: &Tenant) -> Result<()> {
    let remote = tenant.session(channel, &[SUBJECT]).await?;
    let missing = ObjectId::new_v7();
    let references: Vec<ObjectRef> = (0..MANY_REFERENCES)
        .map(|index| match index % 3 {
            0 => tenant.root_id.into(),
            1 => tenant.file_id.into(),
            _ => missing.into(),
        })
        .collect();

    let results = remote.stat(&references).await?;

    assert_eq!(results.len(), MANY_REFERENCES);
    for (index, result) in results.iter().enumerate() {
        match index % 3 {
            0 => assert_eq!(
                result.as_ref().map_err(|errno| *errno)?.kind(),
                ObjectKind::Directory
            ),
            1 => assert_eq!(
                result.as_ref().map_err(|errno| *errno)?.kind(),
                ObjectKind::File
            ),
            _ => assert_eq!(result.as_ref().err(), Some(&Errno::ENOENT)),
        }
    }
    assert!(remote.stat(&[]).await?.is_empty());
    Ok(())
}

async fn links_are_validated(channel: &Channel, tenant: &Tenant) -> Result<()> {
    let link = tenant.conversation();
    for links in [
        vec![Link {
            name: String::new(),
            ..link.clone()
        }],
        vec![Link {
            name: "..".to_owned(),
            ..link.clone()
        }],
        vec![Link {
            name: "a/b".to_owned(),
            ..link.clone()
        }],
        vec![Link {
            target: "conversation".to_owned(),
            ..link.clone()
        }],
        vec![link.clone(), link.clone()],
    ] {
        let remote = tenant.session(channel, &[SUBJECT]).await?;
        assert!(matches!(Fs::new(remote, links), Err(Errno::EINVAL)));
    }
    Ok(())
}
