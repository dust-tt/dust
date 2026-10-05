use super::*;
use sha2::{Digest, Sha256};

fn identity(session: &Session, mutation: &Mutation) -> PublicationId {
    let request = session.request_id();
    let digest = Sha256::digest(bincode::serialize(&(&request, mutation)).unwrap()).into();
    PublicationId {
        tenant: session.tenant.clone(),
        request,
        digest,
    }
}

#[test]
fn receipts_bind_exact_outcomes_and_persistence_without_equating_sequence_domains() {
    let f = Fixture::new();
    let file = f.create(&f.root, "receipt", Kind::File);
    let mutation = write(&file, b"acknowledged");
    let publication = identity(&f.admin, &mutation);
    assert!(
        f.engine
            .resolve_publication(&f.admin.id, publication.clone())
            .unwrap()
            .is_none()
    );
    let outcome = f
        .engine
        .mutate(&f.admin.id, publication.request.clone(), mutation)
        .unwrap();
    let published = f
        .engine
        .resolve_publication(&f.admin.id, publication.clone())
        .unwrap()
        .unwrap();
    assert_eq!(published.outcome.node, outcome.node);
    assert_eq!(published.receipt.tenant_head, outcome.head);
    let before = f.engine.metrics(&f.admin.id).unwrap();
    assert_eq!(before.persisted, 0);
    let mut wrong_head = published.receipt.clone();
    wrong_head.tenant_head += 1;
    assert_eq!(
        f.engine
            .persist_through(&f.admin.id, wrong_head, DurabilityLevel::Local)
            .unwrap_err()
            .code,
        libc::EINVAL
    );
    let mut wrong_digest = publication.clone();
    wrong_digest.digest[0] ^= 1;
    assert_eq!(
        f.engine
            .resolve_publication(&f.admin.id, wrong_digest)
            .unwrap_err()
            .code,
        libc::EINVAL
    );
    let mut wrong_incarnation = publication.clone();
    wrong_incarnation.request.incarnation = id();
    assert_eq!(
        f.engine
            .resolve_publication(&f.admin.id, wrong_incarnation)
            .unwrap_err()
            .code,
        libc::EINVAL
    );
    let mut wrong_tenant = publication.clone();
    wrong_tenant.tenant = "another-tenant".into();
    assert_eq!(
        f.engine
            .resolve_publication(&f.admin.id, wrong_tenant)
            .unwrap_err()
            .code,
        libc::EACCES
    );
    assert!(
        f.engine
            .resolve_publication(&f.bob.id, publication)
            .unwrap()
            .is_none()
    );
    assert_eq!(
        f.engine
            .persist_through(
                &f.admin.id,
                published.receipt.clone(),
                DurabilityLevel::Quorum
            )
            .unwrap_err()
            .code,
        libc::EOPNOTSUPP
    );
    let confirmed = f
        .engine
        .persist_through(
            &f.admin.id,
            published.receipt.clone(),
            DurabilityLevel::Local,
        )
        .unwrap();
    assert_eq!(confirmed.incarnation, f.engine.incarnation);
    assert_eq!(confirmed.engine_prefix, before.published);
    assert_eq!(confirmed.level, DurabilityLevel::Local);
    assert_eq!(f.engine.metrics(&f.admin.id).unwrap().pending_bytes, 0);
    f.engine
        .fail_sync
        .store(true, std::sync::atomic::Ordering::SeqCst);
    assert!(
        f.engine
            .persist_through(&f.admin.id, published.receipt, DurabilityLevel::Local)
            .is_ok()
    );
}

#[test]
fn recovered_receipts_require_the_exact_record_even_after_a_new_prefix_advances() {
    let directory = scratch();
    let (receipt, absent, old_incarnation) = {
        let engine = Engine::open(directory.path(), credentials(), Limits::default()).unwrap();
        let session = engine.login("admin").unwrap();
        let root = engine.view(&session.id).unwrap().nodes[0].node.id.clone();
        let mutation = Mutation::Create {
            parent: root,
            name: "survivor".into(),
            kind: Kind::File,
            mode: 0o600,
        };
        let publication = identity(&session, &mutation);
        let absent = identity(&session, &mutation);
        engine
            .mutate(&session.id, publication.request.clone(), mutation)
            .unwrap();
        let receipt = engine
            .resolve_publication(&session.id, publication)
            .unwrap()
            .unwrap()
            .receipt;
        engine
            .persist_through(&session.id, receipt.clone(), DurabilityLevel::Local)
            .unwrap();
        (receipt, absent, engine.incarnation.clone())
    };
    let engine = Engine::open(directory.path(), credentials(), Limits::default()).unwrap();
    let session = engine.login("admin").unwrap();
    assert_ne!(engine.incarnation, old_incarnation);
    let root = engine.view(&session.id).unwrap().nodes[0].node.id.clone();
    for index in 0..4 {
        engine
            .mutate(
                &session.id,
                session.request_id(),
                Mutation::Create {
                    parent: root.clone(),
                    name: format!("later-{index}"),
                    kind: Kind::File,
                    mode: 0o600,
                },
            )
            .unwrap();
    }
    let confirmation = engine
        .persist_through(&session.id, receipt.clone(), DurabilityLevel::Local)
        .unwrap();
    assert_eq!(confirmation.incarnation, engine.incarnation);
    assert!(confirmation.engine_prefix > receipt.tenant_head);
    assert_eq!(
        engine
            .persist_through(
                &session.id,
                PublicationReceipt {
                    publication: absent,
                    tenant_head: receipt.tenant_head
                },
                DurabilityLevel::Local
            )
            .unwrap_err()
            .code,
        libc::ESTALE
    );
}

#[test]
fn revoked_authority_and_failed_storage_do_not_confirm_receipts() {
    let f = Fixture::new();
    let file = f.create(&f.root, "permission", Kind::File);
    f.grant(&file.id, "alice", WRITE | READ);
    let mutation = write(&file, b"alice");
    let publication = identity(&f.alice, &mutation);
    f.engine
        .mutate(&f.alice.id, publication.request.clone(), mutation)
        .unwrap();
    let receipt = f
        .engine
        .resolve_publication(&f.alice.id, publication.clone())
        .unwrap()
        .unwrap()
        .receipt;
    f.grant(&file.id, "alice", 0);
    assert_eq!(
        f.engine
            .resolve_publication(&f.alice.id, publication)
            .unwrap_err()
            .code,
        libc::EACCES
    );
    assert_eq!(
        f.engine
            .persist_through(&f.alice.id, receipt, DurabilityLevel::Local)
            .unwrap_err()
            .code,
        libc::EACCES
    );
    let mutation = Mutation::Create {
        parent: f.root.clone(),
        name: "storage".into(),
        kind: Kind::File,
        mode: 0o600,
    };
    let publication = identity(&f.admin, &mutation);
    f.engine
        .mutate(&f.admin.id, publication.request.clone(), mutation)
        .unwrap();
    let receipt = f
        .engine
        .resolve_publication(&f.admin.id, publication)
        .unwrap()
        .unwrap()
        .receipt;
    let before = f.engine.metrics(&f.admin.id).unwrap();
    f.engine
        .fail_sync
        .store(true, std::sync::atomic::Ordering::SeqCst);
    assert_eq!(
        f.engine
            .persist_through(&f.admin.id, receipt, DurabilityLevel::Local)
            .unwrap_err()
            .code,
        libc::EIO
    );
    let after = f.engine.metrics(&f.admin.id).unwrap();
    assert_eq!(before.persisted, after.persisted);
    assert_eq!(before.pending_bytes, after.pending_bytes);
    assert!(after.storage_error.is_some());
}

#[test]
fn publication_wire_variants_append_to_the_existing_protocol() {
    let f = Fixture::new();
    let mutation = Mutation::Create {
        parent: f.root.clone(),
        name: "wire".into(),
        kind: Kind::File,
        mode: 0o600,
    };
    let publication = identity(&f.admin, &mutation);
    for (call, tag) in [
        (Call::Barrier, 12_u32),
        (
            Call::RenewIndexSnapshot {
                lease: "lease".into(),
            },
            21,
        ),
        (Call::CheckSession, 22),
        (
            Call::OpenWriteback {
                node: "node".into(),
                request: "request".into(),
            },
            25,
        ),
        (
            Call::RenewWriteback {
                handle: "handle".into(),
            },
            26,
        ),
        (
            Call::ResolvePublication {
                publication: publication.clone(),
            },
            23,
        ),
        (
            Call::PersistThrough {
                receipt: PublicationReceipt {
                    publication,
                    tenant_head: 1,
                },
                level: DurabilityLevel::Local,
            },
            24,
        ),
    ] {
        assert_eq!(&bincode::serialize(&call).unwrap()[..4], &tag.to_le_bytes());
    }
}

#[test]
fn persistence_never_compares_a_tenant_head_to_the_engine_counter() {
    let directory = scratch();
    let mut identities = credentials();
    identities.push(Credential {
        token_hash: token_hash("other"),
        tenant: "other".into(),
        issuer: "test".into(),
        subject: "admin".into(),
        principal: "admin".into(),
        admin: true,
        scope: None,
        expires_ms: u64::MAX,
    });
    let engine = Engine::open(directory.path(), identities, Limits::default()).unwrap();
    let other = engine.login("other").unwrap();
    let other_root = engine.view(&other.id).unwrap().nodes[0].node.id.clone();
    for index in 0..8 {
        engine
            .mutate(
                &other.id,
                other.request_id(),
                Mutation::Create {
                    parent: other_root.clone(),
                    name: format!("other-{index}"),
                    kind: Kind::File,
                    mode: 0o600,
                },
            )
            .unwrap();
    }
    assert_eq!(engine.persist().unwrap(), 8);
    let session = engine.login("admin").unwrap();
    let root = engine.view(&session.id).unwrap().nodes[0].node.id.clone();
    let mutation = Mutation::Create {
        parent: root,
        name: "first".into(),
        kind: Kind::File,
        mode: 0o600,
    };
    let publication = identity(&session, &mutation);
    engine
        .mutate(&session.id, publication.request.clone(), mutation)
        .unwrap();
    let receipt = engine
        .resolve_publication(&session.id, publication)
        .unwrap()
        .unwrap()
        .receipt;
    assert_eq!(receipt.tenant_head, 1);
    let before = engine.metrics(&session.id).unwrap();
    assert_eq!(before.persisted, 8);
    assert!(before.pending_bytes > 0);
    let confirmation = engine
        .persist_through(&session.id, receipt, DurabilityLevel::Local)
        .unwrap();
    assert_eq!(confirmation.engine_prefix, 9);
    assert_eq!(engine.metrics(&session.id).unwrap().pending_bytes, 0);
}
