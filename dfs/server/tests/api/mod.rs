use std::collections::HashMap;

use anyhow::{Context, Result};
use dfs_api::storage::resources::{
    directory::DirectoryResource, object::ObjectResource, tenant::TenantResource,
};
use dfs_protocol::{
    ObjectId,
    rpc::{
        AllowGrant, DenyGrant, Grant, GrantUpdate, ObjectKind, UpdateGrantsRequest,
        dfs_client::DfsClient, grant,
    },
};
use foundationdb::Transaction;
use tonic::transport::Channel;

use crate::with_authorization;

pub(crate) mod apply;
pub(crate) mod auth;
pub(crate) mod capacity;
pub(crate) mod create_session;
pub(crate) mod create_tenant;
pub(crate) mod grants;
pub(crate) mod list;
pub(crate) mod lookup;
pub(crate) mod read;
pub(crate) mod read_files;
pub(crate) mod session;
pub(crate) mod shared;
pub(crate) mod stat;

fn allow(subject: &str, mode: u32) -> Grant {
    Grant {
        kind: Some(grant::Kind::Allow(AllowGrant {
            subject: subject.to_owned(),
            mode,
        })),
    }
}

fn deny(mode: u32) -> Grant {
    Grant {
        kind: Some(grant::Kind::Deny(DenyGrant { mode })),
    }
}

async fn create_directory_child(
    tx: &Transaction,
    tenant: &TenantResource,
    parent_id: &ObjectId,
    name: &str,
    kind: ObjectKind,
) -> Result<ObjectId> {
    let parent = ObjectResource::fetch(tx, tenant, parent_id)
        .await?
        .context("missing parent")?;
    let child = DirectoryResource::try_from(parent)?
        .create_child(
            tx,
            ObjectId::new_v7(),
            name.to_owned(),
            kind,
            None,
            HashMap::new(),
        )
        .await?;
    Ok(child.object_id)
}

async fn attach(
    client: &mut DfsClient<Channel>,
    tenant_authorization: &str,
    object_id: ObjectId,
    grant: Grant,
) -> Result<()> {
    client
        .update_grants(with_authorization(
            UpdateGrantsRequest {
                object_id,
                changes: vec![GrantUpdate {
                    grant,
                    remove: false,
                }],
            },
            tenant_authorization,
        )?)
        .await?;
    Ok(())
}
