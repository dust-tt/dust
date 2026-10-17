use anyhow::{Context, Result};
use dfs_api::storage::{
    fdb,
    resources::{
        keys::{namespace_subspace, tenant_subspace},
        object::ObjectResource,
        session::SessionResource,
        tenant::TenantResource,
    },
};
use dfs_protocol::{
    ObjectId,
    rpc::{
        self, AllowGrant, ApplyRequest, CreateOperation, ErrorCode, Grant, MoveOperation,
        ObjectKind, RemoveOperation, UpdateOperation, WriteOperation, dfs_client::DfsClient, grant,
        operation::Operation,
    },
};

use crate::{error_code, serve, with_authorization};

pub(crate) async fn apply_returns_per_operation_errors_and_rejects_invalid_requests() -> Result<()>
{
    let mut client = DfsClient::new(serve().await?);
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let (session, session_key) = SessionResource::new(&tenant, vec!["writer".to_owned()])?;
    let authorization = format!("Bearer {session_key}");
    let tx = fdb::database()?.create_trx()?;
    tenant.create(&tx).await?;
    ObjectResource::new_root(&tenant)?
        .create(
            &tx,
            &[Grant {
                kind: Some(grant::Kind::Allow(AllowGrant {
                    subject: "writer".to_owned(),
                    mode: 0o6,
                })),
            }],
        )
        .await?;
    session.create(&tx).await?;
    tx.commit().await?;

    let file = ObjectId::new_v7();
    let unrelated = ObjectId::new_v7();
    let operations = vec![
        Operation::Create(CreateOperation {
            parent_id: tenant.root_id,
            object_id: file,
            name: "file".to_owned(),
            kind: ObjectKind::File.into(),
            ..Default::default()
        }),
        Operation::Update(UpdateOperation {
            object_id: unrelated,
            ..Default::default()
        }),
        Operation::Write(WriteOperation {
            object_id: file,
            // Apply uses the shared 4 MiB request limit, with no separate 1 MiB limit.
            data: vec![0; 2 * 1024 * 1024],
            ..Default::default()
        }),
        Operation::Move(MoveOperation {
            object_id: file,
            parent_id: tenant.root_id,
            name: "renamed".to_owned(),
            ..Default::default()
        }),
        Operation::Remove(RemoveOperation {
            object_id: file,
            parent_id: tenant.root_id,
            kind: ObjectKind::File.into(),
        }),
        Operation::Update(UpdateOperation {
            object_id: unrelated,
            ..Default::default()
        }),
    ];
    let count = operations.len();
    let batch = client
        .apply(with_authorization(
            ApplyRequest {
                operations: operations
                    .into_iter()
                    .map(|operation| rpc::Operation {
                        operation: Some(operation),
                    })
                    .collect(),
            },
            &authorization,
        )?)
        .await?
        .into_inner();
    assert_eq!(batch.results.len(), count);
    for (index, result) in batch.results.into_iter().enumerate() {
        if index == 0 {
            assert!(result.error.is_none());
            let mutation = result.mutation.context("missing mutation")?;
            let attr = mutation.object.context("missing created file")?;
            assert_eq!(attr.id, file.into());
            assert_eq!(attr.mode, 0o600);
            let tx = fdb::database()?.create_trx()?;
            tx.set_read_version(attr.store_version);
            let object = ObjectResource::fetch(&tx, &tenant, &file)
                .await?
                .context("missing committed file")?;
            assert_eq!(object.name, "file");
        } else {
            assert!(result.mutation.is_none());
            assert_eq!(
                result.error.context("missing operation error")?.code(),
                ErrorCode::Unsupported
            );
        }
    }

    for (operations, expected) in [
        (vec![], ErrorCode::InvalidInput),
        (vec![rpc::Operation::default()], ErrorCode::InvalidInput),
    ] {
        let error = client
            .apply(with_authorization(
                ApplyRequest { operations },
                &authorization,
            )?)
            .await
            .err()
            .context("expected invalid Apply request to fail")?;
        assert_eq!(error_code(&error)?, expected);
    }

    let error = client
        .apply(with_authorization(
            ApplyRequest {
                operations: vec![rpc::Operation {
                    operation: Some(Operation::Write(WriteOperation {
                        object_id: file,
                        // The data alone fills the RPC budget; protobuf overhead exceeds it.
                        data: vec![0; 4 * 1024 * 1024],
                        ..Default::default()
                    })),
                }],
            },
            &authorization,
        )?)
        .await
        .err()
        .context("expected oversized Apply request to fail")?;
    assert_eq!(error.code(), tonic::Code::OutOfRange);

    let tx = fdb::database()?.create_trx()?;
    SessionResource::revoke(&tx, &tenant, &session.session_id).await?;
    let (begin, end) = tenant_subspace(&tenant.tenant_id).range();
    tx.clear_range(&begin, &end);
    tx.clear(&namespace_subspace().pack(&("tenant-key", tenant.key_hash.as_slice())));
    tx.commit().await?;
    Ok(())
}
