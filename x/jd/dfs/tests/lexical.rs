#![cfg(feature = "lexical-search")]

use dfs_poc::{
    engine::{Engine, Limits, token_hash},
    lexical::{LexicalIndex, Query, Request},
    model::*,
};
use std::sync::Arc;
use tempfile::TempDir;

struct Fixture {
    db: TempDir,
    index: TempDir,
    engine: Arc<Engine>,
    search: LexicalIndex,
    admin: Session,
    alice: Session,
    root: Id,
}
fn credentials() -> Vec<Credential> {
    ["admin", "alice", "bob"]
        .into_iter()
        .map(|name| Credential {
            token_hash: token_hash(name),
            tenant: "tenant".into(),
            issuer: "test".into(),
            subject: name.into(),
            principal: name.into(),
            admin: name == "admin",
            scope: None,
            expires_ms: u64::MAX,
        })
        .collect()
}
impl Fixture {
    fn new() -> Self {
        let db = TempDir::new().unwrap();
        let index = TempDir::new().unwrap();
        let engine = Arc::new(Engine::open(db.path(), credentials(), Limits::default()).unwrap());
        let admin = engine.login("admin").unwrap();
        let alice = engine.login("alice").unwrap();
        let root = engine.view(&admin.id).unwrap().nodes[0].node.id.clone();
        let search = LexicalIndex::open(engine.clone(), "tenant".into(), index.path()).unwrap();
        Self {
            db,
            index,
            engine,
            search,
            admin,
            alice,
            root,
        }
    }
    fn apply(&self, mutation: Mutation) -> Outcome {
        self.engine
            .mutate(&self.admin.id, self.admin.request_id(), mutation)
            .unwrap()
    }
    fn create(&self, parent: &str, name: &str, kind: Kind) -> Node {
        self.apply(Mutation::Create {
            parent: parent.into(),
            name: name.into(),
            kind,
            mode: 0o755,
        })
        .node
        .unwrap()
    }
    fn file(&self, parent: &str, name: &str, text: &str) -> Node {
        let node = self.create(parent, name, Kind::File);
        self.write(&node, text)
    }
    fn write(&self, node: &Node, text: &str) -> Node {
        self.apply(Mutation::Write {
            node: node.id.clone(),
            base: node.version.clone(),
            offset: 0,
            data: text.as_bytes().to_vec(),
            append: false,
            handle: None,
        })
        .node
        .unwrap()
    }
    fn grant(&self, node: &str, subject: &str, verbs: u16) {
        self.apply(Mutation::Grant {
            node: node.into(),
            subject: subject.into(),
            verbs,
        });
    }
    fn refresh(&self) {
        self.search.refresh(&self.admin.id).unwrap();
    }
    fn search(
        &self,
        session: &Session,
        table: &str,
        query: Query,
        k: usize,
    ) -> dfs_poc::lexical::Response {
        self.search
            .search(
                &session.id,
                table,
                &Request {
                    query,
                    k,
                    offset: 0,
                    include_text: table == "documents",
                    kind: None,
                },
            )
            .unwrap()
    }
}
fn phrase(terms: &str) -> Query {
    Query::Phrase {
        terms: terms.into(),
    }
}
fn text_segments(path: &std::path::Path) -> Vec<String> {
    let meta: serde_json::Value =
        serde_json::from_slice(&std::fs::read(path.join("meta.json")).unwrap()).unwrap();
    meta["segments"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s["segment_id"].to_string())
        .collect()
}

#[test]
fn current_grants_prefilter_top_k_without_reindexing_text() {
    let f = Fixture::new();
    let hidden = f.create(&f.root, "hidden", Kind::Directory);
    for i in 0..24 {
        f.file(&hidden.id, &format!("hidden-{i}"), "rare secret signal");
    }
    let visible = f.file(
        &f.root,
        "visible.txt",
        "rare secret signal additional words for a longer lower scoring document",
    );
    f.refresh();
    assert!(
        f.search(&f.alice, "documents", phrase("rare secret"), 1)
            .rows
            .is_empty()
    );
    let before = text_segments(f.index.path());
    f.grant(&visible.id, "team", READ);
    f.apply(Mutation::Member {
        group: "team".into(),
        principal: "alice".into(),
        present: true,
    });
    let result = f.search(&f.alice, "documents", phrase("rare secret"), 1);
    assert_eq!(result.rows[0]["node_id"], visible.id);
    f.refresh();
    assert_eq!(text_segments(f.index.path()), before);
    assert_eq!(
        f.search(&f.alice, "documents", phrase("rare secret"), 1)
            .rows[0]["_score"],
        result.rows[0]["_score"]
    );
    f.apply(Mutation::Member {
        group: "team".into(),
        principal: "alice".into(),
        present: false,
    });
    assert!(
        f.search(&f.alice, "documents", phrase("rare secret"), 1)
            .rows
            .is_empty()
    );
    f.refresh();
    f.apply(Mutation::Member {
        group: "team".into(),
        principal: "alice".into(),
        present: true,
    });
    assert_eq!(
        f.search(&f.alice, "documents", phrase("rare secret"), 1)
            .rows
            .len(),
        1
    );
    f.grant(&visible.id, "team", LIST);
    assert!(
        f.search(&f.alice, "documents", phrase("rare secret"), 1)
            .rows
            .is_empty()
    );
    let names = f.search(
        &f.alice,
        "nodes",
        Query::Exact {
            value: "visible.txt".into(),
        },
        1,
    );
    assert_eq!(
        names.rows[0]["basename"],
        format!("visible.txt~{}", visible.id)
    );
}

#[test]
fn incremental_export_omits_unchanged_nodes_and_policy_only_work() {
    let f = Fixture::new();
    let file = f.file(&f.root, "a", "initial text");
    for i in 0..10 {
        f.file(&f.root, &format!("b-{i}"), "unrelated content");
    }
    let initial = f.engine.begin_index_delta(&f.admin.id, None).unwrap();
    let boundary = initial.cursor.clone();
    assert!(initial.reset);
    f.engine
        .end_index_snapshot(&f.admin.id, &initial.lease)
        .unwrap();
    f.grant(&f.root, "alice", READ);
    let policy = f
        .engine
        .begin_index_delta(&f.admin.id, Some(boundary))
        .unwrap();
    assert!(!policy.reset);
    assert!(
        f.engine
            .list_index_nodes(&f.admin.id, &policy.lease, 0)
            .unwrap()
            .is_empty()
    );
    f.engine
        .end_index_snapshot(&f.admin.id, &policy.lease)
        .unwrap();
    f.write(&file, "replacement text");
    let delta = f
        .engine
        .begin_index_delta(&f.admin.id, Some(policy.cursor))
        .unwrap();
    assert!(!delta.reset);
    let nodes = f
        .engine
        .list_index_nodes(&f.admin.id, &delta.lease, 0)
        .unwrap();
    assert_eq!(nodes.len(), 1);
    assert_eq!(nodes[0].id, file.id);
    f.engine
        .end_index_snapshot(&f.admin.id, &delta.lease)
        .unwrap();
    assert!(f.engine.begin_index_delta(&f.alice.id, None).is_err());
}

#[test]
fn literal_queries_verify_before_limit_and_names_keep_case() {
    let f = Fixture::new();
    f.file(
        &f.root,
        "Plan.txt",
        "abc bcd cde def with separated trigrams",
    );
    let exact = f.file(
        &f.root,
        "plan.txt",
        "whole abcdef inside a document and BENCH_RARE_NEEDLE across tokens",
    );
    f.grant(&f.root, "alice", READ | LIST | TRAVERSE);
    f.refresh();
    let result = f.search(
        &f.alice,
        "documents",
        Query::Substring {
            value: "abcdef".into(),
        },
        1,
    );
    assert_eq!(result.rows.len(), 1);
    assert_eq!(result.rows[0]["node_id"], exact.id);
    assert!(
        f.search(
            &f.alice,
            "documents",
            Query::Substring {
                value: "ABCDEF".into()
            },
            1
        )
        .rows
        .is_empty()
    );
    assert_eq!(
        f.search(&f.alice, "documents", phrase("bench rare needle"), 10)
            .rows
            .len(),
        1
    );
    assert_eq!(
        f.search(
            &f.alice,
            "nodes",
            Query::Exact {
                value: "plan.txt".into()
            },
            10
        )
        .rows
        .len(),
        1
    );
    assert_eq!(
        f.search(
            &f.alice,
            "nodes",
            Query::Prefix {
                value: "Pla".into()
            },
            10
        )
        .rows
        .len(),
        1
    );
    assert_eq!(
        f.search(
            &f.alice,
            "nodes",
            Query::Substring {
                value: "lan.t".into()
            },
            10
        )
        .rows
        .len(),
        2
    );
    assert_eq!(
        f.search(
            &f.alice,
            "documents",
            Query::Substring { value: "bc".into() },
            10
        )
        .rows
        .len(),
        2
    );
}

#[test]
fn stale_content_moves_and_overwrite_never_leak_or_retokenize_rename() {
    let f = Fixture::new();
    let visible = f.create(&f.root, "visible", Kind::Directory);
    let private = f.create(&f.root, "private", Kind::Directory);
    f.grant(&visible.id, "alice", READ | LIST | TRAVERSE);
    let file = f.file(&visible.id, "source.txt", "original needle");
    let victim = f.file(&private.id, "target.txt", "victim needle");
    f.refresh();
    let before = text_segments(f.index.path());
    f.apply(Mutation::Rename {
        parent: visible.id.clone(),
        name: file.name.clone(),
        expected: file.entry_token.clone(),
        new_parent: private.id.clone(),
        new_name: victim.name.clone(),
        destination: Some(victim.entry_token.clone()),
    });
    let moved = f.search(&f.alice, "documents", phrase("needle"), 10);
    assert!(moved.rows.is_empty());
    assert_eq!(moved.dfs["incomplete"], true);
    f.refresh();
    assert!(
        text_segments(f.index.path())
            .iter()
            .all(|segment| before.contains(segment))
    );
    assert!(
        f.search(&f.alice, "documents", phrase("needle"), 10)
            .rows
            .is_empty()
    );
    let rows = f.search(&f.admin, "documents", phrase("needle"), 10).rows;
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["node_id"], file.id);
    let current = f.engine.stat(&f.admin.id, &file.id, None).unwrap();
    f.write(&current, "changed content with longer text");
    let stale = f.search(&f.admin, "documents", phrase("original needle"), 10);
    assert!(stale.rows.is_empty());
    assert_eq!(stale.dfs["incomplete"], true);
    f.refresh();
    assert_eq!(
        f.search(&f.admin, "documents", phrase("changed content"), 10)
            .rows
            .len(),
        1
    );
    assert!(
        f.search(&f.admin, "documents", phrase("original needle"), 10)
            .rows
            .is_empty()
    );
}

#[test]
fn published_index_reopens_and_new_incarnation_reconciles() {
    let f = Fixture::new();
    let file = f.file(&f.root, "keep.txt", "retained needle");
    f.refresh();
    let Fixture {
        db,
        index,
        engine,
        search,
        admin,
        alice: _,
        root: _,
    } = f;
    drop(search);
    let search = LexicalIndex::open(engine.clone(), "tenant".into(), index.path()).unwrap();
    let request = Request {
        query: phrase("retained needle"),
        k: 10,
        offset: 0,
        include_text: true,
        kind: None,
    };
    assert_eq!(
        search
            .search(&admin.id, "documents", &request)
            .unwrap()
            .rows[0]["node_id"],
        file.id
    );
    assert!(!search.refresh(&admin.id).unwrap());
    drop(search);
    engine.drain().unwrap();
    drop(engine);
    let engine = Arc::new(Engine::open(db.path(), credentials(), Limits::default()).unwrap());
    let admin = engine.login("admin").unwrap();
    let search = LexicalIndex::open(engine, "tenant".into(), index.path()).unwrap();
    assert!(search.search(&admin.id, "documents", &request).is_err());
    search.refresh(&admin.id).unwrap();
    assert_eq!(
        search
            .search(&admin.id, "documents", &request)
            .unwrap()
            .rows
            .len(),
        1
    );
}

#[test]
fn failed_persistence_does_not_publish_an_index_boundary() {
    let f = Fixture::new();
    let file = f.file(&f.root, "keep.txt", "retained needle");
    f.refresh();
    f.write(&file, "replacement needle with more text");
    f.engine
        .fail_sync
        .store(true, std::sync::atomic::Ordering::SeqCst);
    assert!(f.search.refresh(&f.admin.id).is_err());
    let stale = f.search(&f.admin, "documents", phrase("retained needle"), 10);
    assert!(stale.rows.is_empty());
    assert_eq!(stale.dfs["incomplete"], true);
}

#[test]
fn scope_tenant_pagination_and_extraction_bounds() {
    let f = Fixture::new();
    let inside = f.create(&f.root, "inside", Kind::Directory);
    let outside = f.create(&f.root, "outside", Kind::Directory);
    for i in 0..4 {
        f.file(&inside.id, &format!("inside-{i}"), "shared phrase");
    }
    f.file(&outside.id, "outside.txt", "shared phrase");
    let empty = f.create(&inside.id, "empty", Kind::File);
    let binary = f.create(&inside.id, "binary", Kind::File);
    f.write(&binary, "has\u{0}nul");
    let large = f.create(&inside.id, "large", Kind::File);
    f.apply(Mutation::Truncate {
        node: large.id.clone(),
        base: large.version.clone(),
        size: (8 << 20) + 1,
        handle: None,
    });
    f.grant(&f.root, "alice", READ | LIST | TRAVERSE);
    let Fixture {
        db,
        index,
        engine,
        search,
        admin: _,
        alice: _,
        root: _,
    } = f;
    drop(search);
    engine.drain().unwrap();
    drop(engine);
    let mut credentials = credentials();
    let mut scoped = credentials[1].clone();
    scoped.token_hash = token_hash("scoped");
    scoped.scope = Some(inside.id.clone());
    credentials.push(scoped);
    let mut foreign = credentials[0].clone();
    foreign.tenant = "foreign".into();
    foreign.token_hash = token_hash("foreign");
    credentials.push(foreign);
    let engine = Arc::new(Engine::open(db.path(), credentials, Limits::default()).unwrap());
    let admin = engine.login("admin").unwrap();
    let scoped = engine.login("scoped").unwrap();
    let foreign = engine.login("foreign").unwrap();
    let search = LexicalIndex::open(engine.clone(), "tenant".into(), index.path()).unwrap();
    search.refresh(&admin.id).unwrap();
    let mut request = Request {
        query: phrase("shared phrase"),
        k: 2,
        offset: 0,
        include_text: false,
        kind: None,
    };
    let first = search.search(&scoped.id, "documents", &request).unwrap();
    request.offset = 2;
    let second = search.search(&scoped.id, "documents", &request).unwrap();
    assert_eq!(first.rows.len(), 2);
    assert_eq!(second.rows.len(), 2);
    assert!(
        first
            .rows
            .iter()
            .all(|a| second.rows.iter().all(|b| a["node_id"] != b["node_id"]))
    );
    request.offset = 4;
    assert!(
        search
            .search(&scoped.id, "documents", &request)
            .unwrap()
            .rows
            .is_empty()
    );
    assert!(search.search(&foreign.id, "documents", &request).is_err());
    for (node, status) in [
        (empty, "empty"),
        (binary, "unsupported"),
        (large, "too_large"),
    ] {
        let request = Request {
            query: Query::Node { id: node.id },
            k: 1,
            offset: 0,
            include_text: false,
            kind: None,
        };
        assert_eq!(
            search.search(&scoped.id, "nodes", &request).unwrap().rows[0]["content_status"],
            status
        );
        assert!(
            search
                .search(&scoped.id, "documents", &request)
                .unwrap()
                .rows
                .is_empty()
        );
    }
    engine.logout(&scoped.id);
    assert!(search.search(&scoped.id, "documents", &request).is_err());
}

#[test]
fn failed_index_publication_keeps_previous_checkpoint_and_writer_is_fenced() {
    let f = Fixture::new();
    let file = f.file(&f.root, "checkpoint.txt", "checkpoint original");
    f.refresh();
    assert!(LexicalIndex::open(f.engine.clone(), "tenant".into(), f.index.path()).is_err());
    let before = std::fs::read(f.index.path().join("meta.json")).unwrap();
    f.write(&file, "checkpoint replacement is longer");
    let moved = f.index.path().with_extension("moved");
    std::fs::rename(f.index.path(), &moved).unwrap();
    std::fs::write(f.index.path(), b"blocked directory").unwrap();
    assert!(f.search.refresh(&f.admin.id).is_err());
    std::fs::remove_file(f.index.path()).unwrap();
    std::fs::rename(&moved, f.index.path()).unwrap();
    assert_eq!(
        std::fs::read(f.index.path().join("meta.json")).unwrap(),
        before
    );
    assert!(f.search.refresh(&f.admin.id).is_err());
    let Fixture {
        db: _db,
        index,
        engine,
        search,
        admin,
        alice: _,
        root: _,
    } = f;
    drop(search);
    let search = LexicalIndex::open(engine, "tenant".into(), index.path()).unwrap();
    search.refresh(&admin.id).unwrap();
    let request = Request {
        query: phrase("checkpoint replacement"),
        k: 1,
        offset: 0,
        include_text: true,
        kind: None,
    };
    assert_eq!(
        search
            .search(&admin.id, "documents", &request)
            .unwrap()
            .rows
            .len(),
        1
    );
}

#[test]
fn deep_tree_indexing_preserves_authority_after_move() {
    let f = Fixture::new();
    let source = f.create(&f.root, "source", Kind::Directory);
    let file = f.file(&source.id, "deep.txt", "deep searchable content");
    let mut parent = f.root.clone();
    for index in 0..160 {
        parent = f.create(&parent, &format!("d-{index}"), Kind::Directory).id;
    }
    f.grant(&parent, "alice", READ | LIST | TRAVERSE);
    f.refresh();
    assert!(
        f.search(&f.alice, "documents", phrase("deep searchable"), 10)
            .rows
            .is_empty()
    );
    f.apply(Mutation::Rename {
        parent: f.root.clone(),
        name: source.name,
        expected: source.entry_token,
        new_parent: parent.clone(),
        new_name: "moved".into(),
        destination: None,
    });
    f.refresh();
    let result = f.search(&f.alice, "documents", phrase("deep searchable"), 10);
    assert_eq!(result.rows.len(), 1);
    assert_eq!(result.rows[0]["node_id"], file.id);
    f.grant(&parent, "alice", 0);
    assert!(
        f.search(&f.alice, "documents", phrase("deep searchable"), 10)
            .rows
            .is_empty()
    );
}
