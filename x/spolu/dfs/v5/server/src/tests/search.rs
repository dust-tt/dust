use super::*;
use crate::search::{Search, SearchConfig};

async fn indexed(f: &Fixture, search: &Search) -> Result<()> {
    let keys = keys::Keys::new(&f.tenant.tenant_id)?;
    for _ in 0..100 {
        search.process(&f.api.0, &f.tenant.tenant_id).await?;
        let view = read::View::from_snapshot(
            f.api.0.storage.snapshot().await?,
            &f.tenant.tenant_id,
            Default::default(),
        )
        .await?;
        if view.rows(keys.search_pending(), None, 1).await?.is_empty() {
            return Ok(());
        }
    }
    anyhow::bail!("index did not drain")
}

async fn find(
    f: &Fixture,
    session: &Session,
    request_body: SearchRequest,
) -> Result<SearchResponse> {
    Ok(f.api
        .search(request(&session.session_key, request_body)?)
        .await?
        .into_inner())
}

pub(super) async fn contracts() -> Result<()> {
    let Ok(url) = std::env::var("DFS_TEST_ES_URL") else {
        return Ok(());
    };
    let f = Fixture::new().await?;
    let index_name = format!("dfs-v5-test-{}", uuid::Uuid::new_v4().simple());
    let search = Search::open(SearchConfig {
        es_url: Some(url.clone()),
        es_index: index_name.clone(),
    })?;
    f.api
        .0
        .search
        .set(search.clone())
        .map_err(|_| anyhow::anyhow!("configured twice"))?;
    let folder = f.create(&f.tenant.root_id, "invoices", true).await?;
    let nested = f.create(&folder.id, "archive", true).await?;
    let file = f.create(&nested.id, "receipt.txt", false).await?;
    let unrelated = f.create(&f.tenant.root_id, "unrelated", true).await?;
    f.api
        .write(request(
            &f.owner.session_key,
            WriteRequest {
                object_id: file.id,
                data: b"invoices selective content".to_vec(),
                ..Default::default()
            },
        )?)
        .await?;
    indexed(&f, &search).await?;
    let query = SearchRequest {
        query: "invoices".into(),
        ..Default::default()
    };
    let hits = find(&f, &f.owner, query.clone()).await?.hits;
    assert_eq!(hits.len(), 2);
    assert!(
        hits.iter()
            .any(|h| h.object.id == folder.id && h.excerpt.is_none())
    );
    assert!(
        hits.iter().any(|h| h.object.id == file.id
            && h.excerpt.as_deref() == Some("invoices selective content"))
    );
    assert_eq!(
        find(
            &f,
            &f.owner,
            SearchRequest {
                fields: vec![SearchField::Name as i32],
                ..query.clone()
            }
        )
        .await?
        .hits
        .len(),
        1
    );
    assert_eq!(
        find(
            &f,
            &f.owner,
            SearchRequest {
                fields: vec![SearchField::Content as i32],
                ..query.clone()
            }
        )
        .await?
        .hits[0]
            .object
            .id,
        file.id
    );
    let scoped = SearchRequest {
        scope: Some(SearchScope {
            directory_id: folder.id,
            recursive: Some(true),
        }),
        ..Default::default()
    };
    assert_eq!(find(&f, &f.owner, scoped.clone()).await?.hits.len(), 2);
    let direct = SearchRequest {
        scope: Some(SearchScope {
            directory_id: folder.id,
            recursive: Some(false),
        }),
        ..Default::default()
    };
    assert_eq!(
        find(&f, &f.owner, direct).await?.hits[0].object.id,
        nested.id
    );
    let keys = keys::Keys::new(&f.tenant.tenant_id)?;
    f.api
        .rename(request(
            &f.owner.session_key,
            RenameRequest {
                object_id: nested.id,
                parent_id: unrelated.id,
                name: "archive".into(),
                replace: false,
            },
        )?)
        .await?;
    assert!(
        f.api
            .0
            .storage
            .snapshot()
            .await?
            .get(keys.pending_object(&file.id)?)
            .await?
            .is_none(),
        "moving ancestors must not enqueue descendant indexing"
    );
    assert!(find(&f, &f.owner, scoped).await?.hits.is_empty());
    assert_eq!(
        find(
            &f,
            &f.owner,
            SearchRequest {
                scope: Some(SearchScope {
                    directory_id: unrelated.id,
                    recursive: None
                }),
                ..query.clone()
            }
        )
        .await?
        .hits[0]
            .object
            .id,
        file.id
    );
    let reader = Fixture::session(&f.api, &f.tenant, &["reader"]).await?;
    assert!(find(&f, &reader, query.clone()).await?.hits.is_empty());
    f.api
        .update_grants(request(
            &f.tenant.tenant_key,
            UpdateGrantsRequest {
                tenant_id: f.tenant.tenant_id.clone(),
                object_id: unrelated.id,
                changes: vec![GrantChange {
                    grant: "reader".into(),
                    attached: true,
                }],
            },
        )?)
        .await?;
    assert_eq!(
        find(&f, &reader, query.clone()).await?.hits[0].object.id,
        file.id
    );
    f.api
        .update_grants(request(
            &f.tenant.tenant_key,
            UpdateGrantsRequest {
                tenant_id: f.tenant.tenant_id.clone(),
                object_id: unrelated.id,
                changes: vec![GrantChange {
                    grant: "reader".into(),
                    attached: false,
                }],
            },
        )?)
        .await?;
    assert!(find(&f, &reader, query.clone()).await?.hits.is_empty());
    f.api
        .write(request(
            &f.owner.session_key,
            WriteRequest {
                object_id: file.id,
                data: b"changed".to_vec(),
                ..Default::default()
            },
        )?)
        .await?;
    let content = SearchRequest {
        query: "selective".into(),
        fields: vec![SearchField::Content as i32],
        ..Default::default()
    };
    assert!(
        find(&f, &f.owner, content.clone()).await?.hits.is_empty(),
        "stale snippets must be suppressed before indexing"
    );
    indexed(&f, &search).await?;
    f.api
        .remove(request(
            &f.owner.session_key,
            RemoveRequest {
                object_id: file.id,
                directory: false,
            },
        )?)
        .await?;
    assert!(find(&f, &f.owner, content).await?.hits.is_empty());
    indexed(&f, &search).await?;
    let other = f
        .api
        .create_tenant(request(
            &"ab".repeat(32),
            CreateTenantRequest {
                tenant_id: "isolated".into(),
                root_grants: vec!["owner".into()],
            },
        )?)
        .await?
        .into_inner();
    let other_session = Fixture::session(&f.api, &other, &["owner"]).await?;
    assert!(
        find(&f, &other_session, SearchRequest::default())
            .await?
            .hits
            .is_empty()
    );
    assert!(
        find(
            &f,
            &f.owner,
            SearchRequest {
                filter: Some(SearchFilter {
                    kind: Some(SearchKind::Directory as i32),
                    min_size: Some(0),
                    ..Default::default()
                }),
                ..Default::default()
            }
        )
        .await
        .is_err()
    );
    let http = reqwest::Client::new();
    let info: serde_json::Value = http
        .get(format!("{url}/{index_name}"))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let previous_alias = info[&index_name]["mappings"]["_meta"]["write_alias"]
        .as_str()
        .context("generation write alias")?;
    http.delete(format!("{url}/{index_name}"))
        .send()
        .await?
        .error_for_status()?;
    let delayed = format!(
        "{}\n{}\n",
        serde_json::json!({"create": {"_index": previous_alias, "_id": "delayed", "routing": "test"}}),
        serde_json::json!({"deleted": true})
    );
    let late: serde_json::Value = http
        .post(format!("{url}/_bulk?require_alias=true"))
        .header("content-type", "application/x-ndjson")
        .body(delayed.clone())
        .send()
        .await?
        .json()
        .await?;
    assert_eq!(
        late["errors"], true,
        "deleted index must reject delayed publication"
    );
    assert_eq!(
        http.head(format!("{url}/{index_name}"))
            .send()
            .await?
            .status(),
        404
    );
    assert!(find(&f, &f.owner, SearchRequest::default()).await.is_err());
    indexed(&f, &search).await?;
    let late: serde_json::Value = http
        .post(format!("{url}/_bulk?require_alias=true"))
        .header("content-type", "application/x-ndjson")
        .body(delayed)
        .send()
        .await?
        .json()
        .await?;
    assert_eq!(
        late["errors"], true,
        "old alias must not target a rebuilt index"
    );
    assert_eq!(
        find(
            &f,
            &f.owner,
            SearchRequest {
                filter: Some(SearchFilter {
                    kind: Some(SearchKind::Directory as i32),
                    ..Default::default()
                }),
                ..Default::default()
            }
        )
        .await?
        .hits
        .len(),
        3
    );
    retry_and_supersession(&f, &search, &url, &index_name).await?;
    Ok(())
}

async fn retry_and_supersession(
    f: &Fixture,
    search: &Search,
    url: &str,
    index: &str,
) -> Result<()> {
    use crate::search::queue::{self, Pending};
    let file = f.create(&f.tenant.root_id, "retry.txt", false).await?;
    let keys = keys::Keys::new(&f.tenant.tenant_id)?;
    let pending_key = keys.pending_object(&file.id)?;
    let previous: Pending = storage::decode(
        &f.api
            .0
            .storage
            .get(&pending_key)
            .await?
            .context("pending creation")?,
    )?;
    indexed(f, search).await?;
    f.api
        .write(request(
            &f.owner.session_key,
            WriteRequest {
                object_id: file.id,
                data: b"superseded document".to_vec(),
                ..Default::default()
            },
        )?)
        .await?;
    let cleared = f
        .api
        .0
        .storage
        .transact(|snapshot| async move {
            let view = read::View::from_snapshot(snapshot, &f.tenant.tenant_id, Default::default())
                .await?;
            let mut edit = mutation::Edit::new();
            let cleared = queue::complete(&view, &mut edit, &file.id, &previous.token).await?;
            Ok((edit.batch, cleared))
        })
        .await?;
    assert!(!cleared, "late completion must retain a newer mutation");

    let http = reqwest::Client::new();
    let settings = format!("{url}/{index}/_settings");
    http.put(&settings)
        .json(&serde_json::json!({"index.blocks.write": true}))
        .send()
        .await?
        .error_for_status()?;
    let attempt = search.process(&f.api.0, &f.tenant.tenant_id).await;
    http.put(&settings)
        .json(&serde_json::json!({"index.blocks.write": false}))
        .send()
        .await?
        .error_for_status()?;
    attempt?;
    let retained: Pending = storage::decode(
        &f.api
            .0
            .storage
            .get(&pending_key)
            .await?
            .context("failed publication must remain pending")?,
    )?;
    assert!(retained.attempts > 0);
    f.api
        .write(request(
            &f.owner.session_key,
            WriteRequest {
                object_id: file.id,
                data: b"recovered document!".to_vec(),
                ..Default::default()
            },
        )?)
        .await?;
    indexed(f, search).await?;
    let response = find(
        f,
        &f.owner,
        SearchRequest {
            query: "recovered".into(),
            fields: vec![SearchField::Content as i32],
            ..Default::default()
        },
    )
    .await?;
    assert_eq!(response.hits.len(), 1);
    assert_eq!(response.hits[0].object.id, file.id);
    assert_eq!(
        response.hits[0].excerpt.as_deref(),
        Some("recovered document!")
    );
    Ok(())
}
