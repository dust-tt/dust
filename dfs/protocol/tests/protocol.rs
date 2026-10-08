use anyhow::{Context, Result};
use dfs_protocol::{ObjectId, ObjectRef, error, rpc};
use prost::Message;
use serde_json::json;

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
        assert_eq!(
            serde_json::from_value::<ObjectRef>(serde_json::to_value(reference)?)?,
            reference
        );
    }
    assert_eq!(serde_json::to_value(id)?, json!(ID));
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
        assert!(serde_json::from_value::<ObjectId>(json!(text)).is_err());
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
    assert!(serde_json::to_value(ObjectId::default()).is_err());
    assert!(serde_json::to_value(ObjectRef::Invalid).is_err());
    Ok(())
}

#[test]
fn metadata_patches_preserve_absence_epoch_and_empty_bytes() -> Result<()> {
    let patch: rpc::UpdateOperation = serde_json::from_value(json!({
        "object_id": ID,
        "atime": 0,
        "mode": 0,
        "size": 0,
        "xattrs": [
            {"name": "user.removed"},
            {"name": "user.empty", "value": []}
        ]
    }))?;
    assert_eq!(patch.atime, Some(0));
    assert_eq!(patch.mtime, None);
    assert_eq!(patch.mode, Some(0));
    assert_eq!(patch.size, Some(0));
    assert_eq!(patch.xattrs[0].value, None);
    assert_eq!(patch.xattrs[1].value, Some(vec![]));
    assert_eq!(
        rpc::UpdateOperation::decode(patch.encode_to_vec().as_slice())?,
        patch
    );
    assert_eq!(
        serde_json::from_value::<rpc::UpdateOperation>(serde_json::to_value(&patch)?)?,
        patch
    );
    Ok(())
}

#[test]
fn versions_remain_numeric_and_optional_preconditions_preserve_presence() -> Result<()> {
    for version in [None, Some(0), Some(1), Some(u64::MAX)] {
        let request = rpc::ReadRequest {
            object_id: ID.parse()?,
            offset: 0,
            length: 1,
            content_version: version,
        };
        assert_eq!(
            rpc::ReadRequest::decode(request.encode_to_vec().as_slice())?,
            request
        );
        let json = serde_json::to_value(&request)?;
        assert_eq!(json["content_version"].as_u64(), version);
        assert_eq!(serde_json::from_value::<rpc::ReadRequest>(json)?, request);
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
fn attributes_carry_visible_parents_views_and_optional_metadata() -> Result<()> {
    let mut object = rpc::Attr {
        id: ObjectRef::Root,
        parent: ObjectRef::Root,
        directory: true,
        size: 0,
        mode: 0o700,
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
        full_path: "/".into(),
        mime_type: "inode/directory".into(),
        xattrs: Default::default(),
    });
    assert_eq!(
        rpc::Attr::decode(object.encode_to_vec().as_slice())?,
        object
    );
    assert_eq!(
        serde_json::from_value::<rpc::Attr>(serde_json::to_value(&object)?)?,
        object
    );
    Ok(())
}

#[test]
fn apply_preserves_operation_order_and_per_operation_outcomes() -> Result<()> {
    let request: rpc::ApplyRequest = serde_json::from_value(json!({
        "operations": [
            {"operation": {"Create": {
                "parent_id": ID, "object_id": ID, "name": "file", "mode": 384
            }}},
            {"operation": {"Write": {"object_id": ID, "data": [0, 255]}}},
            {"operation": {"Remove": {"object_id": ID, "directory": false}}}
        ]
    }))?;
    assert_eq!(request.operations.len(), 3);
    assert_eq!(
        rpc::ApplyRequest::decode(request.encode_to_vec().as_slice())?,
        request
    );
    let response: rpc::ApplyResponse = serde_json::from_value(json!({
        "results": [
            {"error": {"code": rpc::ErrorCode::AlreadyExists as i32}},
            {"mutation": {"view": {"store_version": 123, "auth_version": 120}}},
            {"mutation": {"view": {"store_version": 123, "auth_version": 120}}}
        ]
    }))?;
    assert_eq!(response.results.len(), 3);
    assert_eq!(
        rpc::ApplyResponse::decode(response.encode_to_vec().as_slice())?,
        response
    );
    assert_eq!(
        serde_json::from_value::<rpc::ApplyResponse>(serde_json::to_value(&response)?)?,
        response
    );
    Ok(())
}

#[test]
fn search_defaults_and_numeric_enums_match_the_api() -> Result<()> {
    let request: rpc::SearchRequest = serde_json::from_value(json!({
        "query": "",
        "fields": [0, 1],
        "scope": {"directory_id": ID},
        "filter": {"modified_after": 0, "xattrs": [{"name": "user.tag", "value": []}]}
    }))?;
    assert_eq!(request.limit(), 20);
    let scope = request.scope.as_ref().context("missing scope")?;
    assert!(scope.recursive());
    assert_eq!(request.fields, vec![0, 1]);
    assert_eq!(
        rpc::SearchRequest::decode(request.encode_to_vec().as_slice())?,
        request
    );
    let json = serde_json::to_value(&request)?;
    assert_eq!(json["fields"], json!([0, 1]));
    assert_eq!(json["filter"]["modified_after"], json!(0));
    assert_eq!(serde_json::from_value::<rpc::SearchRequest>(json)?, request);
    Ok(())
}

#[test]
fn allow_and_subjectless_deny_grants_round_trip_through_grant_operations() -> Result<()> {
    let allow = rpc::Grant {
        kind: Some(rpc::grant::Kind::Allow(rpc::AllowGrant {
            subject: "g:engineering".into(),
            mode: 0o7,
        })),
    };
    let deny = rpc::Grant {
        kind: Some(rpc::grant::Kind::Deny(rpc::DenyGrant { mode: 0o2 })),
    };
    assert_eq!(
        serde_json::to_value(&allow)?,
        json!({"kind": {"Allow": {"subject": "g:engineering", "mode": 7}}})
    );
    assert_eq!(
        serde_json::to_value(&deny)?,
        json!({"kind": {"Deny": {"mode": 2}}})
    );
    for grant in [&allow, &deny] {
        assert_eq!(
            rpc::Grant::decode(grant.encode_to_vec().as_slice())?,
            *grant
        );
        assert_eq!(
            serde_json::from_value::<rpc::Grant>(serde_json::to_value(grant)?)?,
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
    let json = serde_json::to_value(&update)?;
    assert_eq!(json["changes"][0]["remove"], json!(false));
    assert_eq!(json["changes"][1]["remove"], json!(true));
    assert!(json["changes"][0].get("attached").is_none());
    assert!(json["changes"][1].get("attached").is_none());
    assert_eq!(
        serde_json::from_value::<rpc::UpdateGrantsRequest>(json)?,
        update
    );
    Ok(())
}

#[test]
fn sessions_carry_subjects_instead_of_grant_rules() -> Result<()> {
    let request: rpc::CreateSessionRequest = serde_json::from_value(json!({
        "subjects": ["u:spolu@dust.tt", "g:engineering"]
    }))?;
    assert_eq!(
        serde_json::to_value(&request)?,
        json!({"subjects": ["u:spolu@dust.tt", "g:engineering"]})
    );
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
        root_id: ID.parse()?,
    };
    assert_eq!(
        rpc::Session::decode(session.encode_to_vec().as_slice())?,
        session
    );
    let json = serde_json::to_value(&session)?;
    assert_eq!(json["tenant_id"], json!("tenant"));
    assert_eq!(
        json["subjects"],
        json!(["u:spolu@dust.tt", "g:engineering"])
    );
    assert!(json.get("grants").is_none());
    assert_eq!(serde_json::from_value::<rpc::Session>(json)?, session);
    Ok(())
}

#[test]
fn grpc_status_details_preserve_protocol_errors() -> Result<()> {
    for code in [
        rpc::ErrorCode::InvalidInput,
        rpc::ErrorCode::Unauthenticated,
        rpc::ErrorCode::Capacity,
        rpc::ErrorCode::StaleView,
    ] {
        let status = error::status(code);
        assert_eq!(rpc::ErrorDetails::decode(status.details())?.code(), code);
    }
    assert_eq!(
        error::status(rpc::ErrorCode::StaleView).code(),
        tonic::Code::Aborted
    );
    Ok(())
}
