use super::*;
use prost::Message;

fn file(id: ObjectRef, revision: Revision) -> ValidationCheck {
    ValidationCheck {
        check: Some(validation_check::Check::File(FileCheck {
            object_id: id,
            revision,
        })),
    }
}
fn directory(id: ObjectRef, listing_token: Vec<u8>) -> ValidationCheck {
    ValidationCheck {
        check: Some(validation_check::Check::Directory(DirectoryCheck {
            object_id: id,
            listing_token,
        })),
    }
}
async fn grant(f: &Fixture, id: ObjectRef, attached: bool) -> Result<()> {
    f.api
        .update_grants(request(
            &f.tenant.tenant_key,
            UpdateGrantsRequest {
                tenant_id: f.tenant.tenant_id.clone(),
                object_id: id,
                changes: vec![GrantChange {
                    grant: "reader".into(),
                    attached,
                }],
            },
        )?)
        .await?;
    Ok(())
}

pub(super) async fn contracts() -> Result<()> {
    let f = Fixture::new().await?;
    let folder = f.create(&f.tenant.root_id, "batch", true).await?;
    let object = f.create(&folder.id, "file", false).await?;
    let hidden = f.create(&f.tenant.root_id, "hidden", false).await?;
    grant(&f, folder.id, true).await?;
    let reader = Fixture::session(&f.api, &f.tenant, &["reader"]).await?;
    let page_request = ListRequest {
        directory_id: folder.id,
        after: None,
        limit: dfs_protocol::MAX_LIST,
    };
    let page = f
        .api
        .list(request(&reader.session_key, page_request.clone())?)
        .await?
        .into_inner();
    let missing = ObjectRef::new_v4();
    let checks = vec![
        file(object.id, object.revision),
        directory(folder.id, page.listing_token.clone()),
        file(object.id, Revision::new()),
        file(hidden.id, hidden.revision),
        file(missing, Revision::new()),
        directory(ObjectRef::Shared, vec![0; 24]),
    ];
    let validated = f
        .api
        .validate(request(&reader.session_key, ValidateRequest { checks })?)
        .await?
        .into_inner();
    assert_eq!(
        validated
            .results
            .iter()
            .map(|r| r.outcome)
            .collect::<Vec<_>>(),
        [
            ValidationOutcome::Unchanged,
            ValidationOutcome::Unchanged,
            ValidationOutcome::Changed,
            ValidationOutcome::Denied,
            ValidationOutcome::Missing,
            ValidationOutcome::Error,
        ]
        .map(i32::from)
    );
    assert_eq!(
        validated.view.authorization_view,
        page.view.authorization_view
    );
    let stats = f
        .api
        .stat(request(
            &reader.session_key,
            StatRequest {
                object_ids: vec![object.id, hidden.id, missing, object.id],
            },
        )?)
        .await?
        .into_inner();
    assert_eq!(stats.results.len(), 4);
    assert!(stats.results[0].object.is_some() && stats.results[3].object.is_some());
    assert!(stats.results[1].error.is_some() && stats.results[2].error.is_some());
    assert!(stats.view.read_version >= page.view.read_version);
    let before = f
        .api
        .stat_one(request(
            &f.owner.session_key,
            ObjectRequest {
                object_id: folder.id,
            },
        )?)
        .await?
        .into_inner();
    let mutation = f
        .api
        .update(request(
            &f.owner.session_key,
            UpdateRequest {
                object_id: object.id,
                mode: Some(0o600),
                mime_type: Some("text/plain".into()),
                xattrs: vec![XattrChange {
                    name: "user.large".into(),
                    value: Some(vec![7; 30_000]),
                }],
                ..Default::default()
            },
        )?)
        .await?
        .into_inner();
    assert!(mutation.commit_version > 0);
    let after = f
        .api
        .stat_one(request(
            &f.owner.session_key,
            ObjectRequest {
                object_id: folder.id,
            },
        )?)
        .await?
        .into_inner();
    assert_eq!(before.revision, after.revision);
    let next = f
        .api
        .list(request(&reader.session_key, page_request)?)
        .await?
        .into_inner();
    assert_ne!(next.listing_token, page.listing_token);
    assert_eq!(
        next.view.authorization_view, page.view.authorization_view,
        "attribute edits do not change the authority epoch"
    );
    assert!(
        next.encoded_len() < 1024,
        "xattrs must not enter listing payloads"
    );
    let metadata = f
        .api
        .get_metadata(request(
            &reader.session_key,
            ObjectRequest {
                object_id: object.id,
            },
        )?)
        .await?
        .into_inner();
    assert_eq!(metadata.xattrs["user.large"], vec![7; 30_000]);
    assert_eq!(
        metadata.object.revision,
        next.entries[0].object.as_ref().context("attr")?.revision
    );
    assert!(metadata.view.read_version >= mutation.commit_version);
    grant(&f, folder.id, false).await?;
    let revoked = f
        .api
        .validate(request(
            &reader.session_key,
            ValidateRequest {
                checks: vec![file(object.id, metadata.object.revision)],
            },
        )?)
        .await?
        .into_inner();
    assert_eq!(revoked.results[0].outcome, ValidationOutcome::Denied as i32);
    let (peer, peer_session) = f.peer().await?;
    let restarted = peer
        .validate(request(
            &peer_session.session_key,
            ValidateRequest {
                checks: vec![directory(folder.id, next.listing_token)],
            },
        )?)
        .await?
        .into_inner();
    assert_eq!(
        restarted.results[0].outcome,
        ValidationOutcome::Changed as i32
    );
    for n in [0, dfs_protocol::MAX_STAT + 1] {
        assert_eq!(
            code(
                &f.api
                    .stat(request(
                        &f.owner.session_key,
                        StatRequest {
                            object_ids: vec![object.id; n]
                        }
                    )?)
                    .await
                    .err()
                    .context("limit")?
            ),
            ErrorCode::InvalidInput
        );
        assert_eq!(
            code(
                &f.api
                    .validate(request(
                        &f.owner.session_key,
                        ValidateRequest {
                            checks: vec![file(object.id, object.revision); n]
                        }
                    )?)
                    .await
                    .err()
                    .context("limit")?
            ),
            ErrorCode::InvalidInput
        );
        assert_eq!(
            code(
                &f.api
                    .read_files(request(
                        &f.owner.session_key,
                        ReadFilesRequest {
                            object_ids: vec![object.id; n]
                        }
                    )?)
                    .await
                    .err()
                    .context("limit")?
            ),
            ErrorCode::InvalidInput
        );
    }
    whole_file_budget(&f, folder.id, missing).await?;
    large_attribute_listing(&f, folder.id).await?;
    Ok(())
}
async fn whole_file_budget(f: &Fixture, parent: ObjectRef, missing: ObjectRef) -> Result<()> {
    let mut ids = Vec::new();
    for i in 0..4 {
        let object = f.create(&parent, &format!("sparse-{i}"), false).await?;
        f.api
            .update(request(
                &f.owner.session_key,
                UpdateRequest {
                    object_id: object.id,
                    size: Some(dfs_protocol::MAX_IO as u64),
                    ..Default::default()
                },
            )?)
            .await?;
        ids.push(object.id);
    }
    ids.extend([missing, parent]);
    let response = f
        .api
        .read_files(request(
            &f.owner.session_key,
            ReadFilesRequest {
                object_ids: ids.clone(),
            },
        )?)
        .await?
        .into_inner();
    assert_eq!(response.omitted_ids, [ids[3]]);
    assert_eq!(response.results.len(), 5);
    for (id, result) in ids.iter().zip(&response.results[..3]) {
        assert_eq!(result.object_id, *id);
        let object = result.object.as_ref().context("whole-file attr")?;
        let data = result.data.as_ref().context("whole-file bytes")?;
        assert_eq!(object.read_version, response.view.read_version);
        assert_eq!(object.size as usize, data.len());
        assert!(data.iter().all(|&v| v == 0));
    }
    assert_eq!(
        response.results[3].error.as_ref().context("missing")?.code,
        ErrorCode::NotFound as i32
    );
    assert_eq!(
        response.results[4]
            .error
            .as_ref()
            .context("directory")?
            .code,
        ErrorCode::IsDirectory as i32
    );
    assert!(response.encoded_len() <= dfs_protocol::MAX_REPLY);
    Ok(())
}
async fn large_attribute_listing(f: &Fixture, parent: ObjectRef) -> Result<()> {
    for chunk in 0..8 {
        let groups = (0..16)
            .map(|n| MutationGroup {
                id: n,
                edits: vec![edit(edit::Operation::Create(CreateRequest {
                    parent_id: parent,
                    name: format!("large-{chunk}-{n}"),
                    object_id: ObjectRef::new_v4(),
                    mode: 0o644,
                    xattrs: [("user.large".into(), vec![1; 30_000])].into(),
                    ..Default::default()
                }))],
            })
            .collect();
        assert!(f.batch(groups).await?.iter().all(|r| r.error.is_none()));
    }
    let page = f
        .api
        .list(request(
            &f.owner.session_key,
            ListRequest {
                directory_id: parent,
                after: None,
                limit: 4096,
            },
        )?)
        .await?
        .into_inner();
    assert_eq!(page.entries.len(), 133);
    assert!(page.next_after.is_none());
    assert!(page.encoded_len() < 64 * 1024);
    let stat = f
        .api
        .stat(request(
            &f.owner.session_key,
            StatRequest {
                object_ids: page
                    .entries
                    .iter()
                    .map(|e| e.object.as_ref().map(|o| o.id).context("attribute"))
                    .collect::<Result<Vec<_>>>()?,
            },
        )?)
        .await?
        .into_inner();
    assert_eq!(stat.results.len(), 133);
    assert!(stat.results.iter().all(|r| r.error.is_none()));
    Ok(())
}
