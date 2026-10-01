use std::collections::BTreeSet;

use super::*;

async fn listing(f: &Fixture, key: &str, directory: &str, limit: usize) -> Result<Vec<Value>> {
    let mut entries = Vec::new();
    let mut after = Value::Null;
    let mut cursors = BTreeSet::new();
    loop {
        let (status, page) = call(
            &f.app,
            "POST",
            "/objects/list",
            Some(key),
            json!({
                "directory_id":directory,"limit":limit,"after":after,
            }),
        )
        .await?;
        ensure!(status == StatusCode::OK, "{page}");
        let rows = page["entries"].as_array().context("entries")?;
        ensure!(rows.len() <= limit);
        entries.extend(rows.iter().cloned());
        after = page["next_after"].clone();
        if after.is_null() {
            break;
        }
        ensure!(cursors.insert(after.to_string()), "cursor did not advance");
    }
    Ok(entries)
}

async fn lookup(f: &Fixture, parent: &str, name: &str) -> Result<(StatusCode, Value)> {
    f.request("/objects/lookup", json!({"parent_id":parent,"name":name}))
        .await
}

#[tokio::test]
async fn session_roots_expose_shared_targets_without_private_ancestors() -> Result<()> {
    let f = Fixture::new().await?;
    for id in ["root", "shared"] {
        let (status, attrs) = f.request("/objects/stat", json!({"object_id":id})).await?;
        ensure!(status == StatusCode::OK && attrs["object_id"] == id);
        ensure!(attrs["kind"] == "directory" && attrs["mode"] == 0o555);
        ensure!(attrs.get("parent_id").is_none());
    }
    let root = listing(&f, &f.key, "root", 1).await?;
    ensure!(root.len() == 1 && root[0]["name"] == "shared");
    ensure!(lookup(&f, "root", "shared").await?.1["object_id"] == "shared");
    ensure!(lookup(&f, "root", "private-ancestor").await?.0 == StatusCode::NOT_FOUND);
    let shared = listing(&f, &f.key, "shared", 1).await?;
    ensure!(shared.len() == 1 && shared[0]["name"] == format!("shared-subtree--{}", f.shared.id));
    ensure!(shared[0]["attributes"]["object_id"] == f.shared.id.to_string());
    ensure!(!serde_json::to_string(&shared)?.contains(&f.private.id.to_string()));
    ensure!(
        lookup(&f, "shared", &format!("shared-subtree--{}", f.shared.id))
            .await?
            .1
            == shared[0]["attributes"]
    );
    let children = listing(&f, &f.key, &f.shared.id.to_string(), 1).await?;
    ensure!(
        children
            .iter()
            .map(|entry| entry["name"].as_str())
            .collect::<Vec<_>>()
            == [Some("A.txt"), Some("a b%?.txt"), Some("é.txt")]
    );
    for name in ["..", "."] {
        ensure!(lookup(&f, "shared", name).await?.0 == StatusCode::BAD_REQUEST);
    }
    let empty = f.session_key(&[]).await?;
    ensure!(listing(&f, &empty, "root", 1).await?.len() == 1);
    ensure!(listing(&f, &empty, "shared", 1).await?.is_empty());
    // A leaf attachment is suppressed while its containing directory remains accessible.
    ensure!(
        f.patch_grants(f.files[0].id, 0, json!({"reader":true}))
            .await?
            .0
            == StatusCode::OK
    );
    ensure!(listing(&f, &f.key, "shared", 1).await?.len() == 1);
    ensure!(
        f.patch_grants(f.shared.id, 0, json!({"reader":false}))
            .await?
            .0
            == StatusCode::OK
    );
    let shared = listing(&f, &f.key, "shared", 1).await?;
    ensure!(shared.len() == 1 && shared[0]["name"] == format!("A.txt--{}", f.files[0].id));
    ensure!(shared[0]["attributes"]["kind"] == "file");
    ensure!(
        lookup(&f, "shared", &format!("shared-subtree--{}", f.shared.id))
            .await?
            .0
            == StatusCode::NOT_FOUND
    );
    ensure!(
        lookup(&f, "shared", &format!("A.txt--{}", f.files[0].id))
            .await?
            .0
            == StatusCode::OK
    );
    f.close().await
}

#[tokio::test]
async fn projection_rechecks_ancestor_grants_moves_renames_and_removal() -> Result<()> {
    let mut f = Fixture::new().await?;
    ensure!(
        f.patch_grants(f.private.id, 0, json!({"reader":true}))
            .await?
            .0
            == StatusCode::OK
    );
    let root = listing(&f, &f.key, "root", 1).await?;
    ensure!(
        root.iter().map(|r| r["name"].as_str()).collect::<Vec<_>>()
            == [Some("private-ancestor"), Some("shared")]
    );
    ensure!(listing(&f, &f.key, "shared", 1).await?.is_empty());
    ensure!(
        lookup(&f, "shared", &format!("shared-subtree--{}", f.shared.id))
            .await?
            .0
            == StatusCode::NOT_FOUND
    );
    ensure!(
        f.patch_grants(f.private.id, 1, json!({"reader":false}))
            .await?
            .0
            == StatusCode::OK
    );
    ensure!(listing(&f, &f.key, "shared", 1).await?.len() == 1);
    let reader = f.key.clone();
    f.key = f.session_key(&["owner"]).await?;
    ensure!(
        f.rename_entry(f.shared.id, 0, f.private.id, "renamed", false)
            .await?
            .0
            == StatusCode::OK
    );
    f.key = reader.clone();
    ensure!(
        lookup(&f, "shared", &format!("shared-subtree--{}", f.shared.id))
            .await?
            .0
            == StatusCode::NOT_FOUND
    );
    ensure!(
        lookup(&f, "shared", &format!("renamed--{}", f.shared.id))
            .await?
            .1["object_id"]
            == f.shared.id.to_string()
    );
    f.key = f.session_key(&["owner"]).await?;
    ensure!(
        f.rename_entry(f.shared.id, 1, f.root, "promoted", false)
            .await?
            .0
            == StatusCode::OK
    );
    f.key = reader;
    ensure!(listing(&f, &f.key, "shared", 1).await?.is_empty());
    ensure!(lookup(&f, "root", "promoted").await?.1["object_id"] == f.shared.id.to_string());
    ensure!(
        lookup(&f, "shared", &format!("renamed--{}", f.shared.id))
            .await?
            .0
            == StatusCode::NOT_FOUND
    );
    ensure!(
        f.patch_grants(f.shared.id, 2, json!({"reader":false}))
            .await?
            .0
            == StatusCode::OK
    );
    ensure!(lookup(&f, "root", "promoted").await?.0 == StatusCode::NOT_FOUND);
    f.key = f.session_key(&["owner"]).await?;
    let empty = f.mkdir_id(f.private.id, "empty-share").await?;
    ensure!(f.patch_grants(empty, 0, json!({"reader":true})).await?.0 == StatusCode::OK);
    ensure!(f.remove_entry("/objects/rmdir", empty, 1).await?.0 == StatusCode::NO_CONTENT);
    ensure!(
        lookup(&f, "shared", &format!("empty-share--{empty}"))
            .await?
            .0
            == StatusCode::NOT_FOUND
    );
    f.close().await
}

#[tokio::test]
async fn shared_suffixes_are_always_present_stable_and_unicode_safe() -> Result<()> {
    let f = Fixture::new().await?;
    let long = format!("{}x", "é".repeat(127));
    let first = directory(&f.workspace, f.private.id, &long)?;
    let second = directory(&f.workspace, f.elsewhere.id, &long)?;
    let first_name = format!("{}--{}", "é".repeat(110), first.id);
    let second_name = format!("{}--{}", "é".repeat(110), second.id);
    let mut batch = MetadataBatch::default();
    for object in [&first, &second] {
        add_object(&mut batch, object)?;
    }
    batch.mutations.push(MetadataMutation::SetGrant {
        object_id: first.id,
        grant: "reader".to_owned(),
        attached: true,
    });
    f.storage.workspace(&f.workspace)?.commit(batch).await?;
    ensure!(lookup(&f, "shared", &first_name).await?.1["object_id"] == first.id.to_string());
    ensure!(lookup(&f, "shared", &second_name).await?.0 == StatusCode::NOT_FOUND);
    for invalid in [
        long.clone(),
        "shared-subtree".to_owned(),
        "shared-subtree--bad-id".to_owned(),
        format!("wrong-name--{}", first.id),
        format!("shared-subtree--{}", f.private.id),
    ] {
        ensure!(lookup(&f, "shared", &invalid).await?.0 == StatusCode::NOT_FOUND);
    }
    // Sharing a namesake never changes an existing alias.
    ensure!(
        f.patch_grants(second.id, 0, json!({"reader":true}))
            .await?
            .0
            == StatusCode::OK
    );
    ensure!(lookup(&f, "shared", &first_name).await?.1["object_id"] == first.id.to_string());
    ensure!(lookup(&f, "shared", &second_name).await?.1["object_id"] == second.id.to_string());
    // A literal basename resembling another alias still receives its own ID suffix.
    let literal = directory(&f.workspace, f.shared.id, &first_name)?;
    let mut batch = MetadataBatch::default();
    add_object(&mut batch, &literal)?;
    batch.mutations.push(MetadataMutation::SetGrant {
        object_id: literal.id,
        grant: "reader".to_owned(),
        attached: true,
    });
    f.storage.workspace(&f.workspace)?.commit(batch).await?;
    ensure!(
        f.patch_grants(f.shared.id, 0, json!({"reader":false}))
            .await?
            .0
            == StatusCode::OK
    );
    let rows = listing(&f, &f.key, "shared", 1).await?;
    ensure!(rows.len() == 3);
    let mut names = BTreeSet::new();
    for row in &rows {
        let name = text(row, "name")?;
        let id = text(&row["attributes"], "object_id")?;
        ensure!(name.len() <= 255 && names.insert(name));
        ensure!(name.ends_with(&format!("--{id}")));
        ensure!(lookup(&f, "shared", name).await?.1 == row["attributes"]);
    }
    ensure!(names.contains(first_name.as_str()) && names.contains(second_name.as_str()));
    // The 221-byte basename prefix includes the first hyphen of the literal's original suffix.
    let literal_name = format!("{}---{}", "é".repeat(110), literal.id);
    ensure!(names.contains(literal_name.as_str()));
    // Revoking a namesake also leaves all other aliases unchanged.
    ensure!(
        f.patch_grants(second.id, 1, json!({"reader":false}))
            .await?
            .0
            == StatusCode::OK
    );
    ensure!(lookup(&f, "shared", &second_name).await?.0 == StatusCode::NOT_FOUND);
    ensure!(lookup(&f, "shared", &first_name).await?.1["object_id"] == first.id.to_string());
    ensure!(lookup(&f, "shared", &literal_name).await?.1["object_id"] == literal.id.to_string());
    f.close().await
}

#[tokio::test]
async fn reserved_shared_name_and_synthetic_mutations_preserve_canonical_storage() -> Result<()> {
    let mut f = Fixture::new().await?;
    f.key = f.session_key(&["owner"]).await?;
    let reserved = f.mkdir_id(f.root, "shared").await?;
    let root = listing(&f, &f.key, "root", 1).await?;
    ensure!(root.iter().filter(|r| r["name"] == "shared").count() == 1);
    ensure!(lookup(&f, "root", "shared").await?.1["object_id"] == "shared");
    ensure!(
        lookup(&f, "shared", &format!("shared--{reserved}"))
            .await?
            .1["object_id"]
            == reserved.to_string()
    );
    let shared = listing(&f, &f.key, "shared", 1).await?;
    ensure!(shared.len() == 1 && shared[0]["attributes"]["object_id"] == reserved.to_string());
    for id in ["root", "shared"] {
        for (path, body) in [
            ("/objects/mkdir", json!({"parent_id":id,"name":"forbidden"})),
            (
                "/objects/update",
                json!({"object_id":id,"expected_metadata_revision":0,"mode":0}),
            ),
            (
                "/objects/rename",
                json!({"object_id":id,"expected_metadata_revision":0,"parent_id":f.root.to_string(),"name":"forbidden"}),
            ),
            (
                "/objects/rename",
                json!({"object_id":reserved.to_string(),"expected_metadata_revision":0,"parent_id":id,"name":"forbidden"}),
            ),
            (
                "/objects/unlink",
                json!({"object_id":id,"expected_metadata_revision":0}),
            ),
            (
                "/objects/rmdir",
                json!({"object_id":id,"expected_metadata_revision":0}),
            ),
        ] {
            ensure!(f.request(path, body).await?.0 == StatusCode::FORBIDDEN);
        }
    }
    ensure!(
        f.storage
            .workspace(&f.workspace)?
            .read_view()
            .await?
            .child(f.root, &"shared".parse()?)
            .await?
            == Some(reserved)
    );
    f.close().await
}

#[tokio::test]
async fn discovery_pages_deduplicate_many_grants_and_reauthorize_continuations() -> Result<()> {
    let f = Fixture::new().await?;
    let mut batch = MetadataBatch::default();
    let mut expected = BTreeSet::new();
    for index in 1_u128..=1069 {
        // The first full discovery page contains only entries rendered at the session root.
        let parent = if index <= 64 { f.root } else { f.private.id };
        let mut object = directory(&f.workspace, parent, &format!("entry-{index}"))?;
        object.id = ObjectId::from_bytes(index.to_be_bytes());
        add_object(&mut batch, &object)?;
        for grant in ["bulk", "duplicate/\0é"] {
            batch.mutations.push(MetadataMutation::SetGrant {
                object_id: object.id,
                grant: grant.to_owned(),
                attached: true,
            });
        }
        if index > 64 {
            expected.insert(object.id.to_string());
        }
    }
    f.storage.workspace(&f.workspace)?.commit(batch).await?;
    let grants: Vec<_> = ["bulk".to_owned(), "duplicate/\0é".to_owned()]
        .into_iter()
        .chain((0..510).map(|i| format!("unmatched-{i}")))
        .collect();
    let refs: Vec<_> = grants.iter().map(String::as_str).collect();
    let key = f.session_key(&refs).await?;
    let (status, first) = call(
        &f.app,
        "POST",
        "/objects/list",
        Some(&key),
        json!({
            "directory_id":"shared","limit":1,
        }),
    )
    .await?;
    ensure!(
        status == StatusCode::OK
            && first["entries"] == json!([])
            && first["next_after"].is_string()
    );
    let entries = listing(&f, &key, "shared", 1000).await?;
    let actual: BTreeSet<_> = entries
        .iter()
        .map(|e| text(&e["attributes"], "object_id").map(str::to_owned))
        .collect::<Result<_>>()?;
    ensure!(actual == expected && entries.len() == expected.len());
    let victim = ObjectId::from_bytes(65_u128.to_be_bytes());
    ensure!(
        f.patch_grants(victim, 0, json!({"bulk":false,"duplicate/\0é":false}))
            .await?
            .0
            == StatusCode::OK
    );
    let (_, next) = call(
        &f.app,
        "POST",
        "/objects/list",
        Some(&key),
        json!({
            "directory_id":"shared","limit":1,"after":first["next_after"],
        }),
    )
    .await?;
    ensure!(
        next["entries"][0]["attributes"]["object_id"]
            == ObjectId::from_bytes(66_u128.to_be_bytes()).to_string()
    );
    // Matching grants in another workspace cannot discover or resolve these objects.
    let (_, other) = call(
        &f.app,
        "POST",
        "/workspaces",
        Some(SERVER_KEY),
        json!({"workspace_id":"other"}),
    )
    .await?;
    let (_, session) = call(
        &f.app,
        "POST",
        "/sessions",
        Some(text(&other, "workspace_key")?),
        json!({
            "workspace_id":"other","grants":["bulk","duplicate/\0é"],
        }),
    )
    .await?;
    let other_key = text(&session, "session_key")?;
    ensure!(listing(&f, other_key, "shared", 1).await?.is_empty());
    ensure!(call(&f.app,"POST","/objects/lookup",Some(other_key),json!({
        "parent_id":"shared","name":format!("entry-66--{}",ObjectId::from_bytes(66_u128.to_be_bytes())),
    })).await?.0 == StatusCode::NOT_FOUND);
    for body in [
        json!({"directory_id":"shared","after":"bad"}),
        json!({"directory_id":"root","after":"../bad"}),
        json!({"directory_id":"shared","limit":1001}),
    ] {
        ensure!(f.request("/objects/list", body).await?.0 == StatusCode::BAD_REQUEST);
    }
    f.close().await
}
