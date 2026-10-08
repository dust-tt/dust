use super::ingest::{INGEST_BYTES, IngestDocument};
use crate::memory::Budget;
use crate::{
    engine::{Engine, node_label},
    model::*,
};
use anyhow::{Result, ensure};
use parking_lot::{Mutex, RwLock};
use roaring::RoaringBitmap;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    fs::{self, File},
    io::{BufWriter, Write},
    path::{Path, PathBuf},
    sync::Arc,
};
use tantivy::{
    DocAddress, Index, IndexReader, IndexWriter, ReloadPolicy, Searcher, Term,
    schema::{FAST, Field, INDEXED, IndexRecordOption, Schema, TextFieldIndexing, TextOptions},
    tokenizer::{LowerCaser, NgramTokenizer, RemoveLongFilter, SimpleTokenizer, TextAnalyzer},
};

const SCHEMA: u32 = 1;
pub const MAX_TEXT_BYTES: u64 = 8 << 20;

#[derive(Clone, Serialize, Deserialize)]
pub struct Record {
    pub node: Node,
    pub slot: u32,
    pub status: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Metadata {
    pub schema: u32,
    pub cursor: IndexBoundary,
    pub next_slot: u32,
    pub records: BTreeMap<Id, Record>,
}

#[derive(Clone, Serialize, Deserialize)]
struct Commit {
    schema: u32,
    artifact: String,
    cursor: IndexBoundary,
}

#[derive(Default)]
pub struct Lookups {
    pub slots: BTreeMap<u32, Id>,
    pub all: RoaringBitmap,
    pub bodies: RoaringBitmap,
    pub files: RoaringBitmap,
    pub subtrees: BTreeMap<Id, RoaringBitmap>,
    pub names: BTreeMap<String, RoaringBitmap>,
    pub grams: BTreeMap<String, RoaringBitmap>,
}

#[derive(Clone, Hash, PartialEq, Eq)]
pub struct PermissionKey {
    pub principal: Id,
    pub scope: Option<Id>,
    pub admin: bool,
    pub policy: u64,
    pub namespace: u64,
    pub body: bool,
}

pub struct Published {
    pub metadata: Arc<Metadata>,
    pub lookups: Arc<Lookups>,
    pub searcher: Searcher,
    pub addresses: Arc<BTreeMap<u32, DocAddress>>,
    pub permissions: Mutex<HashMap<PermissionKey, Arc<RoaringBitmap>>>,
}

#[derive(Clone, Copy)]
pub struct Fields {
    pub slot: Field,
    pub text: Field,
    pub grams: Field,
}

struct Writer {
    writer: IndexWriter<IngestDocument>,
    budget: Arc<Budget>,
    reader: IndexReader,
    failed: bool,
}

pub struct LexicalIndex {
    pub engine: Arc<Engine>,
    pub tenant: Id,
    path: PathBuf,
    pub index: Index,
    pub fields: Fields,
    writer: Mutex<Writer>,
    pub published: RwLock<Option<Arc<Published>>>,
}

pub fn grams(value: &str) -> BTreeSet<String> {
    let chars: Vec<_> = value.chars().collect();
    chars
        .windows(3)
        .map(|window| window.iter().collect())
        .collect()
}

impl Lookups {
    fn build(metadata: &Metadata) -> Result<Self> {
        let mut output = Self::default();
        let labels: BTreeMap<_, _> = metadata
            .records
            .keys()
            .map(|id| (id.as_str(), node_label(&metadata.cursor.tenant, id)))
            .collect();
        for (id, record) in &metadata.records {
            ensure!(
                id == &record.node.id && !record.node.unlinked && record.slot < metadata.next_slot,
                "invalid metadata record"
            );
            let slot = record.slot;
            ensure!(
                output.slots.insert(slot, record.node.id.clone()).is_none(),
                "duplicate slot"
            );
            output.all.insert(slot);
            if record.node.kind == Kind::File {
                output.files.insert(slot);
            }
            if record.status == "indexed" {
                output.bodies.insert(slot);
            }
            output
                .names
                .entry(record.node.name.clone())
                .or_default()
                .insert(slot);
            for gram in grams(&record.node.name) {
                output.grams.entry(gram).or_default().insert(slot);
            }
            let mut current = Some(record.node.id.as_str());
            let mut seen = BTreeSet::new();
            while let Some(id) = current {
                ensure!(seen.insert(id), "invalid index ancestry");
                let node = &metadata
                    .records
                    .get(id)
                    .ok_or_else(|| anyhow::anyhow!("missing ancestor"))?
                    .node;
                output
                    .subtrees
                    .entry(labels[id].clone())
                    .or_default()
                    .insert(slot);
                current = node.parent.as_deref();
            }
        }
        Ok(output)
    }
}

impl LexicalIndex {
    pub fn open(engine: Arc<Engine>, tenant: Id, path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref().to_path_buf();
        fs::create_dir_all(&path)?;
        let mut schema = Schema::builder();
        let fields = Fields {
            slot: schema.add_u64_field("slot", FAST | INDEXED),
            text: schema.add_text_field(
                "text",
                TextOptions::default().set_stored().set_indexing_options(
                    TextFieldIndexing::default()
                        .set_tokenizer("words")
                        .set_index_option(IndexRecordOption::WithFreqsAndPositions),
                ),
            ),
            grams: schema.add_text_field(
                "grams",
                TextOptions::default().set_indexing_options(
                    TextFieldIndexing::default()
                        .set_tokenizer("grams")
                        .set_index_option(IndexRecordOption::Basic),
                ),
            ),
        };
        let schema = schema.build();
        let index = Index::open_or_create(
            tantivy::directory::MmapDirectory::open(&path)?,
            schema.clone(),
        )?;
        ensure!(index.schema() == schema, "incompatible lexical schema");
        index.tokenizers().register(
            "words",
            TextAnalyzer::builder(SimpleTokenizer::default())
                .filter(RemoveLongFilter::limit(256))
                .filter(LowerCaser)
                .build(),
        );
        index
            .tokenizers()
            .register("grams", NgramTokenizer::new(3, 3, false)?);
        let writer = index.writer_with_num_threads(2, 64 << 20)?;
        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::Manual)
            .try_into()?;
        let mut output = Self {
            engine,
            tenant,
            path,
            index,
            fields,
            writer: Mutex::new(Writer {
                writer,
                budget: Budget::new(INGEST_BYTES, 1),
                reader,
                failed: false,
            }),
            published: RwLock::new(None),
        };
        output.restore()?;
        Ok(output)
    }

    fn restore(&mut self) -> Result<()> {
        let Some(payload) = self.index.load_metas()?.payload else {
            return Ok(());
        };
        let commit: Commit = serde_json::from_str(&payload)?;
        ensure!(
            commit.schema == SCHEMA
                && commit.artifact.len() == 37
                && commit.artifact.ends_with(".json")
                && commit.artifact[..32].bytes().all(|b| b.is_ascii_hexdigit()),
            "invalid lexical checkpoint"
        );
        let metadata: Metadata =
            serde_json::from_slice(&fs::read(self.path.join(&commit.artifact))?)?;
        ensure!(
            metadata.schema == SCHEMA
                && metadata.cursor.tenant == self.tenant
                && metadata.cursor.tenant == commit.cursor.tenant
                && metadata.cursor.incarnation == commit.cursor.incarnation
                && metadata.cursor.head == commit.cursor.head,
            "inconsistent lexical checkpoint"
        );
        if metadata.cursor.incarnation != self.engine.incarnation {
            return Ok(());
        }
        let lookups = Arc::new(Lookups::build(&metadata)?);
        let searcher = self.writer.lock().reader.searcher();
        let addresses = Arc::new(addresses(&searcher, &lookups)?);
        *self.published.write() = Some(Arc::new(Published {
            metadata: Arc::new(metadata),
            lookups,
            searcher,
            addresses,
            permissions: Mutex::new(HashMap::new()),
        }));
        Ok(())
    }

    pub fn refresh(&self, session: &str) -> Result<bool> {
        let mut writer = self.writer.lock();
        ensure!(
            !writer.failed,
            "index writer requires restart after commit failure"
        );
        let previous = self.published.read().clone();
        let source = self.engine.session(session)?;
        ensure!(
            source.tenant == self.tenant && source.admin && source.scope.is_none(),
            "invalid indexer"
        );
        let (head, _) = self.engine.head(session)?;
        if previous
            .as_ref()
            .is_some_and(|p| p.metadata.cursor.head == head)
        {
            return Ok(false);
        }
        let snapshot = self.engine.begin_index_delta(
            session,
            previous.as_ref().map(|p| p.metadata.cursor.clone()),
        )?;
        let committed = writer.writer.commit_opstamp();
        let lease = super::lease::Lease::new(self.engine.clone(), session, &snapshot.lease)?;
        let result = self.apply(&mut writer, previous.as_deref(), session, &snapshot, lease);
        if result.is_err() {
            writer.failed = writer.writer.commit_opstamp() != committed;
            if let Err(error) = writer.writer.rollback() {
                writer.failed = true;
                return Err(error.into());
            }
        }
        result?;
        Ok(true)
    }

    fn apply(
        &self,
        writer: &mut Writer,
        previous: Option<&Published>,
        session: &str,
        snapshot: &IndexSnapshot,
        lease: super::lease::Lease,
    ) -> Result<()> {
        let mut trace = super::timing::Trace::default();
        let mut metadata = previous.map(|p| (*p.metadata).clone()).unwrap_or(Metadata {
            schema: SCHEMA,
            cursor: snapshot.cursor.clone(),
            next_slot: 0,
            records: BTreeMap::new(),
        });
        let mut exported = BTreeMap::new();
        let mut offset = 0;
        loop {
            let page = self
                .engine
                .list_index_nodes(session, &snapshot.lease, offset)?;
            if page.is_empty() {
                break;
            }
            offset += page.len() as u32;
            exported.extend(page.into_iter().map(|node| (node.id.clone(), node)));
        }
        trace.mark("export");
        if previous.is_none() {
            writer.writer.delete_all_documents()?;
        }
        let removed: Vec<_> = metadata
            .records
            .keys()
            .filter(|id| {
                (snapshot.reset && !exported.contains_key(*id))
                    || exported.get(*id).is_some_and(|node| node.unlinked)
            })
            .cloned()
            .collect();
        let mut body_changed = previous.is_none();
        let mut metadata_changed = previous.is_none() || !removed.is_empty();
        for id in removed {
            let record = metadata.records.remove(&id).expect("existing record");
            writer
                .writer
                .delete_term(Term::from_field_u64(self.fields.slot, record.slot.into()));
            body_changed |= record.status == "indexed";
        }
        let mut extracted = 0;
        for node in exported.values().filter(|node| !node.unlinked) {
            let old = metadata.records.get(&node.id);
            if old.is_some_and(|old| old.node == *node) {
                continue;
            }
            metadata_changed |= old.is_none_or(|old| {
                old.node.name != node.name
                    || old.node.parent != node.parent
                    || old.node.kind != node.kind
            });
            let slot = match old {
                Some(old) => old.slot,
                None => {
                    let slot = metadata.next_slot;
                    metadata.next_slot = slot
                        .checked_add(1)
                        .ok_or_else(|| anyhow::anyhow!("slot capacity"))?;
                    slot
                }
            };
            let (status, document) = if old.is_some_and(|old| old.node.version == node.version) {
                (old.expect("existing version").status.clone(), None)
            } else {
                extracted += usize::from(node.kind == Kind::File && node.size <= MAX_TEXT_BYTES);
                let (status, document) =
                    self.extract(session, snapshot, node, slot, &writer.budget)?;
                if old.is_some_and(|old| old.status == "indexed") {
                    writer
                        .writer
                        .delete_term(Term::from_field_u64(self.fields.slot, slot.into()));
                    body_changed = true;
                }
                (status, document)
            };
            metadata_changed |=
                old.is_none_or(|old| (old.status == "indexed") != (status == "indexed"));
            if let Some(document) = document {
                writer.writer.add_document(document)?;
                body_changed = true;
            }
            metadata.records.insert(
                node.id.clone(),
                Record {
                    node: node.clone(),
                    slot,
                    status,
                },
            );
        }
        metadata.cursor = snapshot.cursor.clone();
        trace.mark("extract_index");
        lease.finish()?;
        let lookups = if metadata_changed {
            Arc::new(Lookups::build(&metadata)?)
        } else {
            previous.expect("unchanged publication").lookups.clone()
        };
        trace.mark("metadata_indexes");
        let artifact = format!("{}.json", id());
        let mut file = BufWriter::new(File::create(self.path.join(&artifact))?);
        serde_json::to_writer(&mut file, &metadata)?;
        file.flush()?;
        file.get_ref().sync_all()?;
        File::open(&self.path)?.sync_all()?;
        let commit = Commit {
            schema: SCHEMA,
            artifact,
            cursor: snapshot.cursor.clone(),
        };
        let mut prepared = writer.writer.prepare_commit()?;
        prepared.set_payload(&serde_json::to_string(&commit)?);
        prepared.commit()?;
        writer.reader.reload()?;
        let searcher = writer.reader.searcher();
        let addresses = if let Some(previous) = previous.filter(|previous| {
            !body_changed
                && previous
                    .searcher
                    .segment_readers()
                    .iter()
                    .map(|segment| segment.segment_id())
                    .eq(searcher
                        .segment_readers()
                        .iter()
                        .map(|segment| segment.segment_id()))
        }) {
            previous.addresses.clone()
        } else {
            Arc::new(addresses(&searcher, &lookups)?)
        };
        trace.mark("commit");
        *self.published.write() = Some(Arc::new(Published {
            metadata: Arc::new(metadata),
            lookups,
            searcher,
            addresses,
            permissions: Mutex::new(HashMap::new()),
        }));
        let usage = writer.budget.usage();
        tracing::info!(ingest_used_bytes=usage.used_bytes, ingest_peak_bytes=usage.peak_bytes, ingest_waits=usage.waits, ingest_rejections=usage.rejections, event="lexical_index", head=snapshot.cursor.head, exported=exported.len(), extracted, body_changed, stages_ms=%serde_json::to_string(&trace.finish("total"))?);
        Ok(())
    }

    fn extract(
        &self,
        session: &str,
        snapshot: &IndexSnapshot,
        node: &Node,
        slot: u32,
        budget: &Arc<Budget>,
    ) -> Result<(String, Option<IngestDocument>)> {
        if node.kind != Kind::File {
            return Ok(("directory".into(), None));
        }
        if node.size > MAX_TEXT_BYTES {
            return Ok(("too_large".into(), None));
        }
        let (status, document) = IngestDocument::extract(
            self.fields,
            slot,
            node.size as usize,
            budget,
            |offset, size| {
                Ok(self.engine.read_index_content(
                    session,
                    &snapshot.lease,
                    &node.id,
                    offset as u64,
                    size as u32,
                )?)
            },
        )?;
        Ok((status.into(), document))
    }
}

fn addresses(searcher: &Searcher, lookups: &Lookups) -> Result<BTreeMap<u32, DocAddress>> {
    let mut output = BTreeMap::new();
    for (segment_ord, segment) in searcher.segment_readers().iter().enumerate() {
        let slots = segment.fast_fields().u64("slot")?;
        for doc in segment.doc_ids_alive() {
            let slot = u32::try_from(
                slots
                    .first(doc)
                    .ok_or_else(|| anyhow::anyhow!("missing document slot"))?,
            )?;
            ensure!(
                lookups.bodies.contains(slot)
                    && output
                        .insert(slot, DocAddress::new(segment_ord as u32, doc))
                        .is_none(),
                "invalid document coverage"
            );
        }
    }
    ensure!(
        output.len() as u64 == lookups.bodies.len(),
        "incomplete document coverage"
    );
    Ok(output)
}
