use anyhow::{Context, Result};
use dfs_protocol::{ObjectId, ObjectRef, error, rpc};
use prost::Message;

const ID: &str = "017f22e279b07cc398c4dc0c0c07398f";

#[test]
fn identities_round_trip_with_distinct_real_and_virtual_wire_types() -> Result<()> {
    let generated = ObjectId::new_v7();
    generated.validate()?;
    assert_eq!(
        ObjectId::decode(generated.encode_to_vec().as_slice())?,
        generated
    );
    let id: ObjectId = ID.parse()?;
    let mut id_wire = vec![10, 16];
    id_wire.extend_from_slice(id.as_bytes());
    assert_eq!(id.encode_to_vec(), id_wire);
    assert_eq!(ObjectId::decode(id_wire.as_slice())?, id);

    let mut reference_wire = vec![10, 18];
    reference_wire.extend_from_slice(&id_wire);
    assert_eq!(ObjectRef::Object(id).encode_to_vec(), reference_wire);
    for reference in [ObjectRef::Object(id), ObjectRef::Root, ObjectRef::Shared] {
        assert_eq!(
            ObjectRef::decode(reference.encode_to_vec().as_slice())?,
            reference
        );
        assert_eq!(reference.to_string().parse::<ObjectRef>()?, reference);
    }
    assert_eq!(id.to_string(), ID);
    assert_eq!(format!("dfs://{ID}").parse::<ObjectId>()?, id);
    assert_eq!(format!("dfs://old%20name--{ID}").parse::<ObjectId>()?, id);
    Ok(())
}

#[test]
fn invalid_identities_cannot_become_real_objects_or_virtual_projections() -> Result<()> {
    for text in [
        "root",
        "shared",
        "",
        "00000000000000000000000000000000",
        "550e8400e29b41d4a716446655440000",
    ] {
        assert!(text.parse::<ObjectId>().is_err());
    }
    assert!(ID.to_uppercase().parse::<ObjectId>().is_err());
    assert!(format!("dfs://bad%zz--{ID}").parse::<ObjectId>().is_err());
    let id: ObjectId = ID.parse()?;
    assert!(ObjectId::try_from(&id.as_bytes()[..15]).is_err());
    for (index, byte) in [(6, 0x40), (8, 0)] {
        let mut bytes = *id.as_bytes();
        bytes[index] = byte;
        assert!(ObjectId::from_bytes(bytes).is_err());
        let mut wire = vec![10, 16];
        wire.extend_from_slice(&bytes);
        assert!(ObjectId::decode(wire.as_slice()).is_err());
    }
    for wire in [vec![10, 15], vec![10, 16, 1], vec![8, 1]] {
        assert!(ObjectId::decode(wire.as_slice()).is_err());
    }
    for wire in [vec![16, 0], vec![24, 0], vec![10, 0]] {
        assert!(ObjectRef::decode(wire.as_slice()).is_err());
    }
    assert!(ObjectId::default().validate().is_err());
    assert!(ObjectId::decode(&[][..])?.validate().is_err());
    assert!(ObjectRef::decode(&[][..])?.validate().is_err());
    assert!(ObjectRef::Root.real().is_err());
    assert!(ObjectRef::Invalid.validate().is_err());
    Ok(())
}

#[test]
fn metadata_patches_preserve_absence_epoch_and_empty_bytes() -> Result<()> {
    let patch = rpc::UpdateOperation {
        object_id: ID.parse()?,
        atime: Some(0),
        size: Some(0),
        xattrs: vec![
            rpc::XattrChange {
                name: "user.removed".into(),
                value: None,
            },
            rpc::XattrChange {
                name: "user.empty".into(),
                value: Some(vec![]),
            },
        ],
        ..Default::default()
    };
    let decoded = rpc::UpdateOperation::decode(patch.encode_to_vec().as_slice())?;
    assert_eq!(decoded.atime, Some(0));
    assert_eq!(decoded.mtime, None);
    assert_eq!(decoded.size, Some(0));
    assert_eq!(decoded.xattrs[0].value, None);
    assert_eq!(decoded.xattrs[1].value, Some(vec![]));
    assert_eq!(decoded, patch);
    Ok(())
}

#[test]
fn version_checks_preserve_presence_and_full_u64_range() -> Result<()> {
    for version in [None, Some(0), Some(1), Some(u64::MAX)] {
        let check = rpc::VersionCheck {
            object_id: ObjectRef::Object(ID.parse()?),
            attr_version: Some(42),
            content_version: version,
        };
        assert_eq!(
            rpc::VersionCheck::decode(check.encode_to_vec().as_slice())?,
            check
        );
    }
    let check = rpc::VersionCheck {
        object_id: ObjectRef::Root,
        attr_version: Some(42),
        content_version: None,
    };
    assert_eq!(
        rpc::VersionCheck::decode(check.encode_to_vec().as_slice())?,
        check
    );
    Ok(())
}

#[test]
fn attributes_carry_names_views_and_optional_metadata() -> Result<()> {
    let mut object = rpc::Attr {
        id: ObjectRef::Object(ID.parse()?),
        name: "reports".into(),
        kind: rpc::ObjectKind::Directory.into(),
        size: 0,
        mode: 0o500,
        atime: Some(0),
        mtime: None,
        ctime: None,
        attr_version: 2,
        content_version: 1,
        view: rpc::ReadView {
            store_version: 123,
            auth_version: 120,
        },
        metadata: None,
    };
    assert_eq!(
        rpc::Attr::decode(object.encode_to_vec().as_slice())?,
        object
    );
    object.metadata = Some(rpc::ExtendedMetadata {
        created: 0,
        mime_type: "inode/directory".into(),
        xattrs: Default::default(),
    });
    assert_eq!(
        rpc::Attr::decode(object.encode_to_vec().as_slice())?,
        object
    );
    Ok(())
}

#[test]
fn lookup_batches_preserve_targets_and_errors_without_object_ids() -> Result<()> {
    let request = rpc::LookupRequest {
        targets: vec![
            rpc::LookupTarget {
                parent_id: ObjectRef::Root,
                name: "shared".into(),
            },
            rpc::LookupTarget {
                parent_id: ObjectRef::Object(ID.parse()?),
                name: "missing".into(),
            },
        ],
        include_metadata: None,
    };
    assert_eq!(
        rpc::LookupRequest::decode(request.encode_to_vec().as_slice())?,
        request
    );
    let response = rpc::AttrBatch {
        results: vec![
            rpc::AttrResult {
                object: Some(rpc::Attr {
                    id: ObjectRef::Shared,
                    name: "shared".into(),
                    kind: rpc::ObjectKind::Directory.into(),
                    mode: 0o500,
                    attr_version: 1,
                    content_version: 1,
                    view: rpc::ReadView {
                        store_version: 123,
                        auth_version: 120,
                    },
                    ..Default::default()
                }),
                error: None,
            },
            rpc::AttrResult {
                object: None,
                error: Some(rpc::ErrorDetails {
                    code: rpc::ErrorCode::NotFound as i32,
                }),
            },
        ],
    };
    assert_eq!(
        rpc::AttrBatch::decode(response.encode_to_vec().as_slice())?,
        response
    );
    Ok(())
}

#[test]
fn apply_preserves_operation_order_and_per_operation_outcomes() -> Result<()> {
    let parent_id = ObjectId::new_v7();
    let object_id = ID.parse()?;
    let request = rpc::ApplyRequest {
        operations: vec![
            rpc::Operation {
                operation: Some(rpc::operation::Operation::Create(rpc::CreateOperation {
                    parent_id,
                    object_id,
                    name: "file".into(),
                    ..Default::default()
                })),
            },
            rpc::Operation {
                operation: Some(rpc::operation::Operation::Write(rpc::WriteOperation {
                    object_id,
                    data: vec![0, 255],
                    offset: 0,
                    append: false,
                })),
            },
            rpc::Operation {
                operation: Some(rpc::operation::Operation::Remove(rpc::RemoveOperation {
                    object_id,
                    kind: rpc::ObjectKind::File.into(),
                })),
            },
        ],
    };
    assert_eq!(request.operations.len(), 3);
    assert_eq!(
        rpc::ApplyRequest::decode(request.encode_to_vec().as_slice())?,
        request
    );
    let response = rpc::OperationBatch {
        results: vec![
            rpc::OperationResult {
                mutation: None,
                error: Some(rpc::ErrorDetails {
                    code: rpc::ErrorCode::AlreadyExists as i32,
                }),
            },
            rpc::OperationResult {
                mutation: Some(rpc::Mutation::default()),
                error: None,
            },
            rpc::OperationResult {
                mutation: Some(rpc::Mutation {
                    object: None,
                    related: vec![rpc::Attr {
                        id: ObjectRef::Object(parent_id),
                        name: "project".into(),
                        kind: rpc::ObjectKind::Directory.into(),
                        mode: 0o700,
                        attr_version: 2,
                        content_version: 2,
                        view: rpc::ReadView {
                            store_version: 123,
                            auth_version: 120,
                        },
                        ..Default::default()
                    }],
                }),
                error: None,
            },
        ],
    };
    assert_eq!(response.results.len(), 3);
    let removal = response.results[2]
        .mutation
        .as_ref()
        .context("missing removal mutation")?;
    assert_eq!(removal.object, None);
    assert_eq!(removal.related.len(), 1);
    assert_eq!(removal.related[0].id, ObjectRef::Object(parent_id));
    assert_eq!(removal.related[0].view.store_version, 123);
    assert_eq!(removal.related[0].view.auth_version, 120);
    assert_eq!(
        rpc::OperationBatch::decode(response.encode_to_vec().as_slice())?,
        response
    );
    Ok(())
}

#[test]
fn search_preserves_defaults_filters_and_optional_hit_metadata() -> Result<()> {
    let request = rpc::SearchRequest {
        fields: vec![
            rpc::SearchField::Name as i32,
            rpc::SearchField::Content as i32,
        ],
        scope: Some(rpc::SearchScope {
            directory_id: ID.parse()?,
            recursive: None,
        }),
        filter: Some(rpc::SearchFilter {
            modified_after: Some(0),
            xattrs: vec![rpc::SearchXattr {
                name: "user.tag".into(),
                value: Some(vec![]),
            }],
            ..Default::default()
        }),
        ..Default::default()
    };
    let decoded = rpc::SearchRequest::decode(request.encode_to_vec().as_slice())?;
    assert_eq!(decoded.limit(), 20);
    let scope = decoded.scope.as_ref().context("missing scope")?;
    assert!(scope.recursive());
    assert_eq!(decoded.fields, vec![0, 1]);
    let filter = decoded.filter.as_ref().context("missing filter")?;
    assert_eq!(filter.modified_after, Some(0));
    assert_eq!(filter.xattrs[0].value, Some(vec![]));
    assert_eq!(decoded, request);
    for metadata in [
        None,
        Some(rpc::ExtendedMetadata {
            created: 0,
            mime_type: "text/plain".into(),
            xattrs: Default::default(),
        }),
    ] {
        let response = rpc::SearchResults {
            hits: vec![rpc::SearchHit {
                object: rpc::SearchAttr {
                    id: ID.parse()?,
                    name: "report.txt".into(),
                    kind: rpc::ObjectKind::File.into(),
                    size: 42,
                    atime: None,
                    mtime: Some(0),
                    ctime: Some(123),
                    metadata,
                },
                excerpt: Some("Matching content.".into()),
            }],
            partial: false,
        };
        assert_eq!(
            rpc::SearchResults::decode(response.encode_to_vec().as_slice())?,
            response
        );
    }
    Ok(())
}

#[test]
fn allow_and_subjectless_deny_grants_round_trip_through_grant_operations() -> Result<()> {
    let allow = rpc::Grant {
        kind: Some(rpc::grant::Kind::Allow(rpc::AllowGrant {
            subject: "g:engineering".into(),
            mode: 0o6,
        })),
    };
    let deny = rpc::Grant {
        kind: Some(rpc::grant::Kind::Deny(rpc::DenyGrant { mode: 0o2 })),
    };
    for grant in [&allow, &deny] {
        assert_eq!(
            rpc::Grant::decode(grant.encode_to_vec().as_slice())?,
            *grant
        );
    }
    let tenant = rpc::CreateTenantRequest {
        tenant_id: "tenant".into(),
        root_grants: vec![allow.clone(), deny.clone()],
    };
    assert_eq!(
        rpc::CreateTenantRequest::decode(tenant.encode_to_vec().as_slice())?,
        tenant
    );
    let page = rpc::GrantPage {
        grants: vec![allow.clone(), deny.clone()],
        next_after: Some("opaque-cursor".into()),
    };
    assert_eq!(
        rpc::GrantPage::decode(page.encode_to_vec().as_slice())?,
        page
    );
    let update = rpc::UpdateGrantsRequest {
        object_id: ID.parse()?,
        changes: vec![
            rpc::GrantUpdate {
                grant: allow,
                remove: false,
            },
            rpc::GrantUpdate {
                grant: deny,
                remove: true,
            },
        ],
    };
    assert_eq!(
        rpc::UpdateGrantsRequest::decode(update.encode_to_vec().as_slice())?,
        update
    );
    Ok(())
}

#[test]
fn sessions_carry_subjects_instead_of_grant_rules() -> Result<()> {
    let request = rpc::CreateSessionRequest {
        subjects: vec!["u:spolu@dust.tt".into(), "g:engineering".into()],
    };
    assert_eq!(
        rpc::CreateSessionRequest::decode(request.encode_to_vec().as_slice())?,
        request
    );
    let session = rpc::Session {
        id: "session".into(),
        tenant_id: "tenant".into(),
        subjects: request.subjects,
        session_key: String::new(),
        expires_at: 1_800_000_000_000,
    };
    assert_eq!(
        rpc::Session::decode(session.encode_to_vec().as_slice())?,
        session
    );
    let revoke = rpc::RevokeSessionRequest {
        session_id: session.id,
    };
    assert_eq!(
        rpc::RevokeSessionRequest::decode(revoke.encode_to_vec().as_slice())?,
        revoke
    );
    Ok(())
}

#[test]
fn grpc_status_details_preserve_protocol_errors() -> Result<()> {
    for (code, grpc_code) in [
        (rpc::ErrorCode::InvalidInput, tonic::Code::InvalidArgument),
        (
            rpc::ErrorCode::Unauthenticated,
            tonic::Code::Unauthenticated,
        ),
        (rpc::ErrorCode::Capacity, tonic::Code::ResourceExhausted),
    ] {
        let status = error::status(code);
        assert_eq!(rpc::ErrorDetails::decode(status.details())?.code(), code);
        assert_eq!(status.code(), grpc_code);
    }
    Ok(())
}
