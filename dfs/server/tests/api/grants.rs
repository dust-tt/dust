use anyhow::{Context, Result};
use dfs_api::{
    auth::hash_key,
    storage::{
        fdb,
        resources::keys::{namespace_subspace, tenant_subspace},
    },
};
use dfs_protocol::{
    ObjectId,
    rpc::{
        AllowGrant, CreateTenantRequest, DenyGrant, ErrorCode, Grant, GrantUpdate,
        ListGrantsRequest, UpdateGrantsRequest, dfs_client::DfsClient, grant,
    },
};

use crate::{MASTER_KEY, error_code, serve, with_authorization};

pub(crate) async fn grants_are_scoped_paginated_and_atomic() -> Result<()> {
    let mut client = DfsClient::new(serve().await?);
    let master = format!("Bearer {MASTER_KEY}");
    let allow = Grant {
        kind: Some(grant::Kind::Allow(AllowGrant {
            subject: "u:test".to_owned(),
            mode: 4,
        })),
    };
    let deny = Grant {
        kind: Some(grant::Kind::Deny(DenyGrant { mode: 2 })),
    };
    // Root creation deduplicates before applying the 512-grant limit.
    let mut root_grants = vec![allow.clone(); 513];
    root_grants.push(deny.clone());
    let tenant = client
        .create_tenant(with_authorization(
            CreateTenantRequest {
                tenant_id: ObjectId::new_v7().to_string(),
                root_grants,
            },
            &master,
        )?)
        .await?
        .into_inner();
    let authorization = format!("Bearer {}", tenant.tenant_key);
    let request = ListGrantsRequest {
        object_id: tenant.root_id,
        after: None,
        limit: 1,
    };
    let page = client
        .list_grants(with_authorization(request.clone(), &authorization)?)
        .await?
        .into_inner();
    assert_eq!(page.grants, vec![allow.clone()]);
    let cursor = page.next_after.context("missing grant cursor")?;
    let page = client
        .list_grants(with_authorization(
            ListGrantsRequest {
                after: Some(cursor),
                ..request.clone()
            },
            &authorization,
        )?)
        .await?
        .into_inner();
    assert_eq!(page.grants, vec![deny.clone()]);
    assert_eq!(page.next_after, None);

    let added = Grant {
        kind: Some(grant::Kind::Allow(AllowGrant {
            subject: "u:test".to_owned(),
            mode: 6,
        })),
    };
    client
        .update_grants(with_authorization(
            UpdateGrantsRequest {
                object_id: tenant.root_id,
                changes: vec![
                    GrantUpdate {
                        grant: allow.clone(),
                        remove: true,
                    },
                    GrantUpdate {
                        grant: added.clone(),
                        remove: false,
                    },
                ],
            },
            &authorization,
        )?)
        .await?;

    for changes in [
        vec![
            GrantUpdate {
                grant: added.clone(),
                remove: true,
            },
            GrantUpdate {
                grant: Grant::default(),
                remove: false,
            },
        ],
        vec![
            GrantUpdate {
                grant: added.clone(),
                remove: true,
            },
            GrantUpdate {
                grant: added.clone(),
                remove: false,
            },
        ],
    ] {
        let error = client
            .update_grants(with_authorization(
                UpdateGrantsRequest {
                    object_id: tenant.root_id,
                    changes,
                },
                &authorization,
            )?)
            .await
            .err()
            .context("invalid updates must fail")?;
        assert_eq!(error_code(&error)?, ErrorCode::InvalidInput);
    }
    let page = client
        .list_grants(with_authorization(
            ListGrantsRequest {
                limit: 512,
                ..request.clone()
            },
            &authorization,
        )?)
        .await?
        .into_inner();
    assert_eq!(page.grants, vec![added, deny]);
    assert_eq!(page.next_after, None);
    for (after, limit) in [(None, 0), (None, 513), (Some("invalid".to_owned()), 1)] {
        let error = client
            .list_grants(with_authorization(
                ListGrantsRequest {
                    after,
                    limit,
                    ..request.clone()
                },
                &authorization,
            )?)
            .await
            .err()
            .context("invalid listing must fail")?;
        assert_eq!(error_code(&error)?, ErrorCode::InvalidInput);
    }

    let other = client
        .create_tenant(with_authorization(
            CreateTenantRequest {
                tenant_id: ObjectId::new_v7().to_string(),
                root_grants: vec![],
            },
            &master,
        )?)
        .await?
        .into_inner();
    for (authorization, expected) in [
        (&master, ErrorCode::Unauthenticated),
        (&format!("Bearer {}", other.tenant_key), ErrorCode::NotFound),
    ] {
        let error = client
            .list_grants(with_authorization(request.clone(), authorization)?)
            .await
            .err()
            .context("wrong credential must fail")?;
        assert_eq!(error_code(&error)?, expected);
        let error = client
            .update_grants(with_authorization(
                UpdateGrantsRequest {
                    object_id: tenant.root_id,
                    changes: vec![GrantUpdate {
                        grant: allow.clone(),
                        remove: false,
                    }],
                },
                authorization,
            )?)
            .await
            .err()
            .context("wrong credential must fail")?;
        assert_eq!(error_code(&error)?, expected);
    }
    let tx = fdb::database()?.create_trx()?;
    for tenant in [tenant, other] {
        let (begin, end) = tenant_subspace(&tenant.tenant_id).range();
        tx.clear_range(&begin, &end);
        tx.clear(
            &namespace_subspace().pack(&("tenant-key", hash_key(&tenant.tenant_key).as_slice())),
        );
    }
    tx.commit().await?;
    Ok(())
}
