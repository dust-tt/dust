use anyhow::{Context, Result};
use dfs_api::storage::{
    fdb,
    resources::{
        keys::{namespace_subspace, tenant_subspace},
        session::SessionResource,
        tenant::TenantResource,
    },
};
use dfs_protocol::{
    ObjectId,
    rpc::{
        self, ApplyRequest, CreateOperation, ErrorCode, MoveOperation, ObjectKind, RemoveOperation,
        UpdateOperation, WriteOperation, dfs_client::DfsClient, operation::Operation,
    },
};

use crate::{error_code, serve, with_authorization};

pub(crate) async fn apply_returns_per_operation_errors_and_rejects_invalid_requests() -> Result<()>
{
    let mut client = DfsClient::new(serve().await?);
    let (tenant, _) = TenantResource::new(ObjectId::new_v7().to_string())?;
    let (session, session_key) = SessionResource::new(&tenant, vec![])?;
    let authorization = format!("Bearer {session_key}");
    let tx = fdb::database()?.create_trx()?;
    tenant.create(&tx).await?;
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
            data: b"content".to_vec(),
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
    for result in batch.results {
        assert!(result.mutation.is_none());
        assert_eq!(
            result.error.context("missing operation error")?.code(),
            ErrorCode::Unsupported
        );
    }

    for (operations, expected) in [
        (vec![], ErrorCode::InvalidInput),
        (vec![rpc::Operation::default()], ErrorCode::InvalidInput),
        (
            vec![rpc::Operation {
                operation: Some(Operation::Write(WriteOperation {
                    object_id: file,
                    // The payload alone fills the request budget, leaving no room for framing.
                    data: vec![0; 1024 * 1024],
                    ..Default::default()
                })),
            }],
            ErrorCode::Capacity,
        ),
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

    let tx = fdb::database()?.create_trx()?;
    SessionResource::revoke(&tx, &tenant, &session.session_id).await?;
    let (begin, end) = tenant_subspace(&tenant.tenant_id).range();
    tx.clear_range(&begin, &end);
    tx.clear(&namespace_subspace().pack(&("tenant-key", tenant.key_hash.as_slice())));
    tx.commit().await?;
    Ok(())
}
