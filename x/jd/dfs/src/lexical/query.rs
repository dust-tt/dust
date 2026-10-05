use super::{
    LexicalIndex,
    index::{PermissionKey, Published, grams},
    timing::Trace,
};
use crate::{engine::node_label, model::*};
use anyhow::{Result, bail, ensure};
use roaring::RoaringBitmap;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    sync::Arc,
    time::{Duration, Instant},
};
use tantivy::{
    DocAddress, TantivyDocument, Term,
    query::{AllQuery, BooleanQuery, Occur, PhraseQuery, Query as TantivyQuery, TermQuery},
    schema::{IndexRecordOption, Value as TantivyValue},
    tokenizer::TokenStream,
};

#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum Query {
    All,
    Node { id: String },
    Exact { value: String },
    Prefix { value: String },
    Substring { value: String },
    Match { terms: String },
    Phrase { terms: String },
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub query: Query,
    #[serde(default = "default_k")]
    pub k: usize,
    #[serde(default)]
    pub offset: usize,
    #[serde(default)]
    pub include_text: bool,
    #[serde(default)]
    pub kind: Option<String>,
}
fn default_k() -> usize {
    20
}

#[derive(Serialize)]
pub struct Response {
    pub rows: Vec<Value>,
    pub dfs: Value,
    #[serde(skip)]
    pub timings_ms: BTreeMap<String, f64>,
}

impl Request {
    pub fn validate(&self, table: &str) -> Result<()> {
        ensure!(matches!(table, "nodes" | "documents"), "unknown table");
        ensure!(
            self.k > 0 && self.k <= 100 && self.offset <= 10_000,
            "query bounds"
        );
        ensure!(
            self.kind
                .as_deref()
                .is_none_or(|kind| matches!(kind, "file" | "directory")),
            "invalid kind"
        );
        ensure!(
            !self.include_text || table == "documents",
            "text only available for documents"
        );
        let value = match &self.query {
            Query::All => "",
            Query::Node { id } => id,
            Query::Exact { value } | Query::Prefix { value } | Query::Substring { value } => value,
            Query::Match { terms } | Query::Phrase { terms } => terms,
        };
        ensure!(
            value.len() <= 4096 && (matches!(self.query, Query::All) || !value.is_empty()),
            "query length"
        );
        if table == "documents" {
            ensure!(
                !matches!(self.query, Query::Exact { .. } | Query::Prefix { .. }),
                "exact and prefix are name operations"
            );
        } else {
            ensure!(
                !matches!(self.query, Query::Match { .. } | Query::Phrase { .. }),
                "word and phrase operations require documents"
            );
        }
        Ok(())
    }
}

impl LexicalIndex {
    pub fn validate_request(&self, table: &str, request: &Request) -> Result<()> {
        request.validate(table)?;
        if table == "documents" {
            self.body_query(&request.query)?;
        }
        Ok(())
    }

    pub fn search(&self, session: &str, table: &str, request: &Request) -> Result<Response> {
        request.validate(table)?;
        let mut trace = Trace::default();
        let deadline = Instant::now() + Duration::from_secs(10);
        let caller = self.engine.session(session)?;
        ensure!(caller.tenant == self.tenant, "workspace mismatch");
        let published = self
            .published
            .read()
            .clone()
            .ok_or_else(|| anyhow::anyhow!("index unavailable"))?;
        let context = self
            .engine
            .search_context(session, &published.metadata.cursor)?;
        trace.mark("context");
        let body = table == "documents";
        if !context.complete {
            return Ok(response(&published, vec![], true, trace));
        }
        let key = PermissionKey {
            principal: caller.principal,
            scope: caller.scope,
            admin: caller.admin,
            policy: context.grants.auth_generation,
            namespace: context.grants.namespace_head,
            body,
        };
        let cached = published.permissions.lock().get(&key).cloned();
        let allowed = if let Some(cached) = cached {
            cached
        } else {
            let mut allowed = if context.grants.admin {
                published.lookups.all.clone()
            } else {
                RoaringBitmap::new()
            };
            let tokens = if body {
                &context.grants.read
            } else {
                &context.grants.metadata
            };
            if !context.grants.admin {
                for token in tokens {
                    let root = context
                        .roots
                        .get(token)
                        .ok_or_else(|| anyhow::anyhow!("missing grant root"))?;
                    if let Some(subtree) = published.lookups.subtrees.get(root) {
                        allowed |= subtree;
                    }
                }
            }
            if let Some(scope) = &context.grants.scope {
                match published
                    .lookups
                    .subtrees
                    .get(&node_label(&self.tenant, scope))
                {
                    Some(subtree) => allowed &= subtree,
                    None => allowed.clear(),
                }
            }
            for root in &context.excluded {
                if let Some(subtree) = published.lookups.subtrees.get(root) {
                    allowed -= subtree;
                }
            }
            if body {
                allowed &= &published.lookups.bodies;
            }
            let allowed = Arc::new(allowed);
            let mut cache = published.permissions.lock();
            if cache.len() >= 128 {
                cache.clear();
            }
            cache.insert(key, allowed.clone());
            allowed
        };
        let mut candidates = (*allowed).clone();
        if let Some(kind) = &request.kind {
            if kind == "file" {
                candidates &= &published.lookups.files;
            } else {
                candidates -= &published.lookups.files;
            }
        }
        match &request.query {
            Query::Node { id } => {
                if let Some(record) = published.metadata.records.get(id) {
                    candidates &= RoaringBitmap::from_iter([record.slot]);
                } else {
                    candidates.clear();
                }
            }
            Query::Exact { value } => match published.lookups.names.get(value) {
                Some(names) => candidates &= names,
                None => candidates.clear(),
            },
            Query::Prefix { value } => {
                let mut names = RoaringBitmap::new();
                for (name, slots) in published.lookups.names.range(value.clone()..) {
                    if !name.starts_with(value) {
                        break;
                    }
                    ensure!(Instant::now() < deadline, "query deadline");
                    names |= slots;
                }
                candidates &= names;
            }
            Query::Substring { value } if !body => {
                for gram in grams(value) {
                    if let Some(names) = published.lookups.grams.get(&gram) {
                        candidates &= names;
                    } else {
                        candidates.clear();
                        break;
                    }
                }
                candidates = candidates
                    .iter()
                    .filter(|slot| {
                        published.metadata.records[&published.lookups.slots[slot]]
                            .node
                            .name
                            .contains(value)
                    })
                    .collect();
            }
            _ => {}
        }
        trace.mark("predicate");
        let hits: Vec<(f32, u32, Option<DocAddress>)> = if !body {
            candidates
                .iter()
                .skip(request.offset)
                .take(request.k)
                .map(|slot| (0.0, slot, None))
                .collect()
        } else if candidates.is_empty() {
            vec![]
        } else {
            let query = self.body_query(&request.query)?;
            let phrase_terms = query
                .downcast_ref::<PhraseQuery>()
                .map(|phrase| phrase.phrase_terms());
            let docs = super::ranking::top_docs(
                &published.searcher,
                query.as_ref(),
                |slot| Ok(candidates.contains(slot)),
                request.offset..request.offset + request.k,
                deadline,
                phrase_terms.as_deref(),
                |address| {
                    let Query::Substring { value } = &request.query else {
                        return Ok(true);
                    };
                    let document = published.searcher.doc::<TantivyDocument>(address)?;
                    Ok(document
                        .get_first(self.fields.text)
                        .and_then(|v| v.as_str())
                        .is_some_and(|text| text.contains(value)))
                },
            )?;
            docs.into_iter()
                .map(|(score, address)| {
                    let slot = published
                        .searcher
                        .segment_reader(address.segment_ord)
                        .fast_fields()
                        .u64("slot")?
                        .first(address.doc_id)
                        .ok_or_else(|| anyhow::anyhow!("missing result slot"))?;
                    Ok((score, u32::try_from(slot)?, Some(address)))
                })
                .collect::<Result<_>>()?
        };
        ensure!(Instant::now() < deadline, "query deadline");
        trace.mark("retrieve");
        let ids: Vec<_> = hits
            .iter()
            .map(|(_, slot, _)| published.lookups.slots[slot].clone())
            .collect();
        let current = self.engine.validate_search(session, &ids)?;
        let policy_changed = current.auth_generation != context.grants.auth_generation
            || current.incarnation != context.grants.incarnation;
        let nodes: BTreeMap<_, _> = current
            .nodes
            .into_iter()
            .map(|node| (node.node.id.clone(), node))
            .collect();
        trace.mark("validate");
        let mut rows = Vec::new();
        let mut incomplete = policy_changed || !context.excluded.is_empty();
        let mut response_bytes = 0;
        if !policy_changed {
            for (score, slot, address) in hits {
                let record = &published.metadata.records[&published.lookups.slots[&slot]];
                let Some(current) = nodes.get(&record.node.id) else {
                    incomplete = true;
                    continue;
                };
                if (body && current.verbs & READ == 0)
                    || current.node.version != record.node.version
                    || current.node.entry_token != record.node.entry_token
                    || current.node.size != record.node.size
                    || current.node.mtime_ms != record.node.mtime_ms
                {
                    incomplete = true;
                    continue;
                }
                let mut row = if body {
                    json!({"node_id":record.node.id,"source_version":record.node.version,"_score":score})
                } else {
                    json!({"node_id":record.node.id,"source_version":record.node.version,"basename":current.visible_name,"kind":if record.node.kind==Kind::File {"file"} else {"directory"},"size":record.node.size,"mtime_ms":record.node.mtime_ms,"content_status":record.status})
                };
                if request.include_text {
                    let document = published.searcher.doc::<TantivyDocument>(
                        address.ok_or_else(|| anyhow::anyhow!("missing body address"))?,
                    )?;
                    let text = document
                        .get_first(self.fields.text)
                        .and_then(|value| value.as_str())
                        .ok_or_else(|| anyhow::anyhow!("missing document text"))?;
                    row["text"] = json!(text);
                }
                response_bytes += serde_json::to_vec(&row)?.len();
                ensure!(response_bytes <= (16 << 20) - 4096, "response size limit");
                rows.push(row);
            }
        }
        let (_, policy) = self.engine.head(session)?;
        if policy != current.auth_generation {
            rows.clear();
            incomplete = true;
        }
        trace.mark("project");
        Ok(response(&published, rows, incomplete, trace))
    }

    fn body_query(&self, query: &Query) -> Result<Box<dyn TantivyQuery>> {
        let (text, phrase) = match query {
            Query::Match { terms } => (terms, false),
            Query::Phrase { terms } => (terms, true),
            Query::Substring { value } => {
                let grams = grams(value);
                if grams.is_empty() {
                    return Ok(Box::new(AllQuery));
                }
                return Ok(Box::new(BooleanQuery::new(
                    grams
                        .into_iter()
                        .map(|gram| {
                            (
                                Occur::Must,
                                Box::new(TermQuery::new(
                                    Term::from_field_text(self.fields.grams, &gram),
                                    IndexRecordOption::Basic,
                                )) as Box<dyn TantivyQuery>,
                            )
                        })
                        .collect(),
                )));
            }
            Query::All | Query::Node { .. } => return Ok(Box::new(AllQuery)),
            _ => bail!("unsupported body query"),
        };
        let mut tokenizer = self
            .index
            .tokenizers()
            .get("words")
            .ok_or_else(|| anyhow::anyhow!("missing tokenizer"))?;
        let mut stream = tokenizer.token_stream(text);
        let mut terms = Vec::new();
        while stream.advance() {
            let token = stream.token();
            terms.push((
                token.position,
                Term::from_field_text(self.fields.text, &token.text),
            ));
            ensure!(terms.len() <= 64, "too many terms");
        }
        ensure!(!terms.is_empty(), "query contains no indexed terms");
        if phrase && terms.len() > 1 {
            Ok(Box::new(PhraseQuery::new_with_offset(terms)))
        } else {
            Ok(Box::new(BooleanQuery::new(
                terms
                    .into_iter()
                    .map(|(_, term)| {
                        (
                            Occur::Must,
                            Box::new(TermQuery::new(term, IndexRecordOption::WithFreqs))
                                as Box<dyn TantivyQuery>,
                        )
                    })
                    .collect(),
            )))
        }
    }
}

fn response(published: &Published, rows: Vec<Value>, incomplete: bool, trace: Trace) -> Response {
    Response {
        rows,
        dfs: json!({"indexed_through":published.metadata.cursor,"incomplete":incomplete,"engine":"tantivy"}),
        timings_ms: trace.finish("query_total"),
    }
}
