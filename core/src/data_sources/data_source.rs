use crate::consts::DATA_SOURCE_DOCUMENT_SYSTEM_TAG_PREFIX;
use crate::data_sources::qdrant::{QdrantClients, QdrantDataSourceConfig};
use crate::data_sources::splitter::{splitter, SplitterID};
use crate::databases_store::store::DatabasesStore;
use crate::project::Project;
use crate::providers::embedder::{EmbedderRequest, EmbedderVector};
use crate::providers::provider::{provider, ProviderID};
use crate::run::Credentials;
use crate::stores::store::Store;
use crate::utils;
use anyhow::{anyhow, Result};
use cloud_storage::Object;
use futures::future::try_join_all;
use futures::StreamExt;
use futures::TryStreamExt;
use itertools::Itertools;
use qdrant_client::qdrant::vectors::VectorsOptions;
use qdrant_client::qdrant::{
    points_selector::PointsSelectorOneOf, Filter, PointId, PointsSelector, RetrievedPoint,
    ScoredPoint, ScrollPoints,
};
use qdrant_client::{
    prelude::{Payload, QdrantClient},
    qdrant,
};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::try_join;
use tokio_stream::{self as stream};
use tracing::{error, info};
use uuid::Uuid;

/// A filter to apply to the search query based on `tags`. All documents returned must have at least
/// one tag in `is_in` and none of the tags in `is_not`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TagsFilter {
    #[serde(rename = "in")]
    pub is_in: Option<Vec<String>>,
    #[serde(rename = "not")]
    pub is_not: Option<Vec<String>>,
}

/// A filter to apply to the search query based on document parents. All documents returned must have at least
/// one parent in `is_in` and none of their parents in `is_not`. The `is_in_map` field allows to
/// sepecify parents per data_source_id.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ParentsFilter {
    #[serde(rename = "in")]
    pub is_in: Option<Vec<String>>,
    #[serde(rename = "in_map")]
    pub is_in_map: Option<HashMap<String, Vec<String>>>,
    #[serde(rename = "not")]
    pub is_not: Option<Vec<String>>,
}

/// A filter to apply to the search query based on `timestamp`. All documents returned must have a
/// timestamp greater than `gt` and less than `lt`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TimestampFilter {
    pub gt: Option<u64>,
    pub lt: Option<u64>,
}

// Custom deserializer for `TimestampFilter`
fn deserialize_timestamp_filter<'de, D>(
    deserializer: D,
) -> Result<Option<TimestampFilter>, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Deserialize)]
    struct InnerTimestampFilter {
        gt: Option<f64>,
        lt: Option<f64>,
    }

    let f = Option::<InnerTimestampFilter>::deserialize(deserializer)?.map(|inner_filter| {
        TimestampFilter {
            gt: inner_filter.gt.map(|value| value as u64), // Convert f64 to u64
            lt: inner_filter.lt.map(|value| value as u64), // Convert f64 to u64
        }
    });

    Ok(f)
}

/// Filter argument to perform semantic search or simple reverse-chron querying.
/// It is used to filter the search results based on the
/// presence of tags, parents, or time spans for timestamps.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchFilter {
    pub tags: Option<TagsFilter>,
    pub parents: Option<ParentsFilter>,
    #[serde(deserialize_with = "deserialize_timestamp_filter")]
    pub timestamp: Option<TimestampFilter>,
}

impl SearchFilter {
    pub fn from_json_str(json: &str) -> Result<Self> {
        let filter: SearchFilter = serde_json::from_str(json)?;
        Ok(filter)
    }

    pub fn from_json(json: &Value) -> Result<Self> {
        let filter: SearchFilter = serde_json::from_value(json.clone())?;
        Ok(filter)
    }

    // This function applies the passed SearchFilter to the current SearchFilter. Applying means
    // merging the tags, parents, filters arrays or overriding the timestamp values.
    pub fn apply(&mut self, other: &SearchFilter) -> () {
        match other.tags {
            None => (),
            Some(ref tags) => match &mut self.tags {
                None => self.tags = Some(tags.clone()),
                Some(ref mut self_tags) => {
                    match &tags.is_in {
                        None => (),
                        Some(ref is_in) => match &mut self_tags.is_in {
                            None => self_tags.is_in = Some(is_in.clone()),
                            Some(ref mut self_is_in) => {
                                self_is_in.extend(is_in.clone());
                            }
                        },
                    }
                    match &tags.is_not {
                        None => (),
                        Some(ref is_not) => match &mut self_tags.is_not {
                            None => self_tags.is_not = Some(is_not.clone()),
                            Some(ref mut self_is_not) => {
                                self_is_not.extend(is_not.clone());
                            }
                        },
                    }
                }
            },
        }

        match other.parents {
            None => (),
            Some(ref parents) => match &mut self.parents {
                None => self.parents = Some(parents.clone()),
                Some(ref mut self_parents) => {
                    match &parents.is_in {
                        None => (),
                        Some(ref is_in) => match &mut self_parents.is_in {
                            None => self_parents.is_in = Some(is_in.clone()),
                            Some(ref mut self_is_in) => {
                                self_is_in.extend(is_in.clone());
                            }
                        },
                    }
                    match &parents.is_in_map {
                        None => (),
                        Some(ref is_in_map) => match &mut self_parents.is_in_map {
                            None => self_parents.is_in_map = Some(is_in_map.clone()),
                            Some(ref mut self_is_in_map) => {
                                for (k, v) in is_in_map.iter() {
                                    match self_is_in_map.get_mut(k) {
                                        None => {
                                            self_is_in_map.insert(k.clone(), v.clone());
                                        }
                                        Some(ref mut self_v) => {
                                            self_v.extend(v.clone());
                                        }
                                    }
                                }
                            }
                        },
                    }
                    match &parents.is_not {
                        None => (),
                        Some(ref is_not) => match &mut self_parents.is_not {
                            None => self_parents.is_not = Some(is_not.clone()),
                            Some(ref mut self_is_not) => {
                                self_is_not.extend(is_not.clone());
                            }
                        },
                    }
                }
            },
        }

        match other.timestamp {
            None => (),
            Some(ref timestamp) => match &mut self.timestamp {
                None => self.timestamp = Some(timestamp.clone()),
                Some(ref mut self_timestamp) => {
                    match &timestamp.gt {
                        None => (),
                        Some(ref gt) => self_timestamp.gt = Some(gt.clone()),
                    }
                    match &timestamp.lt {
                        None => (),
                        Some(ref lt) => self_timestamp.lt = Some(lt.clone()),
                    }
                }
            },
        }
    }

    // We postprocess `parents.is_in_map` if it is set to augment or set `parents.is_in` based on
    // the current `data_source_id`` and set `parents.is_in_map` to `None` since this is a virtual
    // filter that we never want to send to qdrant.
    pub fn postprocess_for_data_source(&self, data_source_id: &str) -> SearchFilter {
        let filter = SearchFilter {
            tags: self.tags.clone(),
            parents: match &self.parents {
                Some(parents) => {
                    let mut is_in: Option<Vec<String>> = None;

                    match &parents.is_in {
                        Some(v) => {
                            is_in = Some(v.clone());
                        }
                        None => (),
                    }

                    match &parents.is_in_map {
                        Some(h) => match h.get(data_source_id) {
                            Some(v) => match &mut is_in {
                                Some(is_in) => {
                                    is_in.extend(v.clone());
                                }
                                None => {
                                    is_in = Some(v.clone());
                                }
                            },
                            None => (),
                        },
                        None => (),
                    }

                    info!(
                        data_source_id = data_source_id,
                        is_in = ?parents.is_in,
                        is_in_map = ?parents.is_in_map,
                        postprocessed_is_in = ?is_in,
                        "Postprocessed `parents.in`"
                    );

                    Some(ParentsFilter {
                        is_in,
                        is_in_map: None,
                        is_not: parents.is_not.clone(),
                    })
                }
                None => None,
            },
            timestamp: self.timestamp.clone(),
        };
        filter
    }

    pub fn ensure_postprocessed(&self) -> Result<()> {
        match &self.parents {
            Some(parents) => match &parents.is_in_map {
                Some(_) => Err(anyhow!(
                    "SearchFilter must be postprocessed before being used"
                )),
                None => Ok(()),
            },
            None => Ok(()),
        }
    }
}

/// Section is used to represent the structure of document to be taken into account during chunking.
/// Section prefixes are repeated in all chunks generated from the section (and its children). We do
/// not insert any separators the separators are the responsibility of the caller (\n at end of
/// sections, ...)
#[derive(Serialize, Deserialize, Debug)]
pub struct Section {
    pub prefix: Option<String>,
    pub content: Option<String>,
    pub sections: Vec<Section>,
}

impl Section {
    pub fn full_text(&self) -> String {
        format!(
            "{}{}{}",
            match self.prefix {
                Some(ref prefix) => prefix,
                None => "",
            },
            match self.content {
                Some(ref content) => content,
                None => "",
            },
            self.sections.iter().map(|s| s.full_text()).join("")
        )
    }
}

/// A Chunk is a subset of a document that was inserted into vector search db. `hash` covers both
/// the chunk text and the parent document tags (inserted into vector db search on each chunk to
/// leverage tags filtering there). It is used as unique ID for the chunk in vector search db.
#[derive(Debug, Serialize, Clone)]
pub struct Chunk {
    pub text: String,
    pub hash: String,
    pub offset: usize,
    pub vector: Option<Vec<f64>>,
    pub score: Option<f64>,
}

/// Document is used as a data-strucutre for insertion into the SQL store (no
/// chunks, they are directly inserted in the vector search db). It is also used
/// as a result from search (only the retrieved chunks are provided in the
/// result). `hash` covers both the original document id and text and the
/// document metadata and is used to no-op in case of match.
///
/// Field details - `parents`
/// =========================
/// The "parents" field is an array of ids of parents to the document,
/// corresponding to its hierarchy, ordered by closest parent first.
///
/// Parents are at the time of writing only relevant for managed datasources
/// since standard datasources do not allow specifying a hierarchy.
///
/// Parents id
/// ----------
/// A parent is represented by a string of characters that:
/// - should be unique per workspace;
/// - should be the same as the one used in connectors for permissions (often
///   the one stored in DB `dust-connectors` in the parent document
///   corresponding table)
///
/// For some sources, this is well emboodied by  the parent's external id,
/// provided by the managed datasource’s API: the Notion id (notionPageId column
/// in `notion_pages`) for Notion pages and databases, the Google drive id
/// (driveFileId column in `google_drive_documents`).
///
/// For other sources, such as github: github issues / discussions do not have a
/// proper external id, so we use our computed document id. The repo is
/// considered a parent, and has a proper external “repo id”, which is stored at
/// 2nd place in the array
///
/// Parents array
/// -------------
/// At index 0 is the string id of the document itself, then at index 1 its
/// direct parent, then at index 2 is the direct parent of the element
/// represented at index 1, etc. It is assumed that a document (or folder, or
/// hierarchical level) only has at most one direct parent. Therefore, there is
/// an unambiguous mapping between the parents array and the document's
/// hierarchical position. For example, for a regular file system (or
/// filesystem-like such as Google Drive), each parent would correspond to a
/// subfolder in the path to the document.
///
/// The id of the document itself is stored at index 0 because the field is used
/// in filtering search to search only parts of the hierarchy: it is natural
/// that if the document’s id is selected as a parent filter, the document
/// itself shows up in the search.
///
///
/// Note however that the hierarchical system depends on the managed datasource.
/// For example, in the Slack managed datasource, documents are aggregated
/// messages from a channel. A channel does not have any parent, and there are
/// no slack ids for our slack "documents" so the only value in the parents
/// array is the slack channel id

#[derive(Debug, Serialize, Clone)]
pub struct Document {
    pub data_source_id: String,
    pub created: u64,
    pub document_id: String,
    pub timestamp: u64,
    pub tags: Vec<String>,
    pub parents: Vec<String>,
    pub source_url: Option<String>,
    pub hash: String,
    pub text_size: u64,
    pub chunk_count: usize,
    pub chunks: Vec<Chunk>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    pub token_count: Option<usize>,
}

impl Document {
    pub fn new(
        data_source_id: &str,
        document_id: &str,
        timestamp: u64,
        tags: &Vec<String>,
        parents: &Vec<String>,
        source_url: &Option<String>,
        hash: &str,
        text_size: u64,
    ) -> Result<Self> {
        Ok(Document {
            data_source_id: data_source_id.to_string(),
            created: utils::now(),
            document_id: document_id.to_string(),
            timestamp,
            tags: tags.clone(),
            parents: parents.clone(),
            source_url: source_url.clone(),
            hash: hash.to_string(),
            text_size,
            chunk_count: 0,
            chunks: vec![],
            text: None,
            token_count: None,
        })
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct DocumentVersion {
    pub created: u64,
    pub hash: String,
}

#[derive(Serialize, Deserialize, PartialEq, Clone, Debug)]
pub struct DataSourceConfig {
    pub provider_id: ProviderID,
    pub model_id: String,
    pub extras: Option<Value>,
    pub splitter_id: SplitterID,
    pub max_chunk_size: usize,
    pub qdrant_config: Option<QdrantDataSourceConfig>,
}

/// The `data_source_id` is the unique identifier that allows routing to the right data in SQL store
/// as well as vector search db. It is a generated unique ID.
#[derive(Debug, Serialize)]
pub struct DataSource {
    project: Project,
    created: u64,
    data_source_id: String,
    internal_id: String,
    config: DataSourceConfig,
}

fn target_document_tokens_offsets(
    offsets: Vec<usize>,
    chunks_to_grow: usize,
    total_chunks_count: usize,
) -> HashMap<usize, usize> {
    // Note: we could increment num_addable when we don't get enough chunks on a given chunks to
    // cram more chunks.
    if total_chunks_count == 0 {
        return HashMap::new();
    }
    let mut offsets = offsets;
    offsets.sort();
    let mut offset_set = offsets
        .clone()
        .into_iter()
        .collect::<std::collections::HashSet<_>>();
    let mut results: HashMap<usize, usize> = HashMap::new();
    let mut extras: Vec<(usize, usize)> = vec![];
    let num_per_chunk = chunks_to_grow / offsets.len();
    for i in 0..offsets.len() {
        let cur_extra_right = if i == offsets.len() - 1 {
            total_chunks_count - offsets[i] - 1
        } else {
            offsets[i + 1] - offsets[i] - 1
        };
        let cur_extra_left = if i == 0 {
            offsets[i]
        } else {
            offsets[i] - (offsets[i - 1] + 1 + extras[i - 1].1)
        };
        if cur_extra_left >= num_per_chunk / 2 && cur_extra_right >= num_per_chunk / 2 {
            extras.push((num_per_chunk / 2, num_per_chunk / 2));
        } else if (cur_extra_left + cur_extra_right) < num_per_chunk {
            extras.push((cur_extra_left, cur_extra_right));
        } else if cur_extra_left < cur_extra_right {
            extras.push((cur_extra_left, num_per_chunk - cur_extra_left));
        } else {
            extras.push((num_per_chunk - cur_extra_right, cur_extra_right));
        }
    }
    for i in 0..offsets.len() {
        let (cur_extra_left, cur_extra_right) = extras[i];
        for offset in offsets[i] - cur_extra_left..offsets[i] + cur_extra_right + 1 {
            if !offset_set.contains(&offset) {
                results.insert(offset, offsets[i]);
                offset_set.insert(offset);
            }
        }
    }
    results
}

impl DataSource {
    pub fn new(project: &Project, data_source_id: &str, config: &DataSourceConfig) -> Self {
        DataSource {
            project: project.clone(),
            created: utils::now(),
            data_source_id: data_source_id.to_string(),
            internal_id: utils::new_id(),
            config: config.clone(),
        }
    }

    pub fn new_from_store(
        project: &Project,
        created: u64,
        data_source_id: &str,
        internal_id: &str,
        config: &DataSourceConfig,
    ) -> Self {
        DataSource {
            project: project.clone(),
            created,
            data_source_id: data_source_id.to_string(),
            internal_id: internal_id.to_string(),
            config: config.clone(),
        }
    }

    pub fn created(&self) -> u64 {
        self.created
    }

    pub fn data_source_id(&self) -> &str {
        &self.data_source_id
    }

    pub fn internal_id(&self) -> &str {
        &self.internal_id
    }

    pub fn config(&self) -> &DataSourceConfig {
        &self.config
    }

    pub fn qdrant_collection(&self) -> String {
        format!("ds_{}", self.internal_id)
    }

    pub async fn update_config(
        &mut self,
        store: Box<dyn Store + Sync + Send>,
        config: &DataSourceConfig,
    ) -> Result<()> {
        self.config = config.clone();
        store
            .update_data_source_config(&self.project, &self.data_source_id, &self.config)
            .await?;
        Ok(())
    }

    pub async fn create_qdrant_collection(
        &self,
        credentials: Credentials,
        qdrant_client: Arc<QdrantClient>,
    ) -> Result<()> {
        let mut embedder = provider(self.config.provider_id).embedder(self.config.model_id.clone());
        embedder.initialize(credentials).await?;

        qdrant_client
            .create_collection(&qdrant::CreateCollection {
                collection_name: self.qdrant_collection(),
                vectors_config: Some(qdrant::VectorsConfig {
                    config: Some(qdrant::vectors_config::Config::Params(
                        qdrant::VectorParams {
                            size: embedder.embedding_size() as u64,
                            distance: qdrant::Distance::Cosine.into(),
                            on_disk: Some(true),
                            ..Default::default()
                        },
                    )),
                }),
                hnsw_config: Some(qdrant::HnswConfigDiff {
                    m: Some(16),
                    max_indexing_threads: Some(1),
                    ..Default::default()
                }),
                optimizers_config: Some(qdrant::OptimizersConfigDiff {
                    memmap_threshold: Some(8192),
                    ..Default::default()
                }),
                quantization_config: Some(qdrant::QuantizationConfig {
                    quantization: Some(qdrant::quantization_config::Quantization::Scalar(
                        qdrant::ScalarQuantization {
                            r#type: qdrant::QuantizationType::Int8.into(),
                            quantile: Some(0.99),
                            always_ram: Some(true),
                        },
                    )),
                }),
                // We keep the entire payload on disk and index on document_id and tags.
                on_disk_payload: Some(true),
                ..Default::default()
            })
            .await?;

        let _ = qdrant_client
            .create_field_index(
                self.qdrant_collection(),
                "document_id_hash",
                qdrant::FieldType::Keyword,
                None,
                None,
            )
            .await?;

        let _ = qdrant_client
            .create_field_index(
                self.qdrant_collection(),
                "tags",
                qdrant::FieldType::Keyword,
                None,
                None,
            )
            .await?;

        let _ = qdrant_client
            .create_field_index(
                self.qdrant_collection(),
                "parents",
                qdrant::FieldType::Keyword,
                None,
                None,
            )
            .await?;

        let _ = qdrant_client
            .create_field_index(
                self.qdrant_collection(),
                "timestamp",
                qdrant::FieldType::Integer,
                None,
                None,
            )
            .await?;

        Ok(())
    }

    pub async fn setup(
        &self,
        credentials: Credentials,
        qdrant_clients: QdrantClients,
    ) -> Result<()> {
        let qdrant_client = qdrant_clients.main_client(&self.config.qdrant_config);

        // GCP store created data to test GCP.
        let bucket = match std::env::var("DUST_DATA_SOURCES_BUCKET") {
            Ok(bucket) => bucket,
            Err(_) => Err(anyhow!("DUST_DATA_SOURCES_BUCKET is not set"))?,
        };

        let bucket_path = format!("{}/{}", self.project.project_id(), self.internal_id);
        let data_source_created_path = format!("{}/created.txt", bucket_path);

        Object::create(
            &bucket,
            format!("{}", self.created).as_bytes().to_vec(),
            &data_source_created_path,
            "application/text",
        )
        .await?;

        info!(
            data_source_id = self.data_source_id(),
            "Created GCP bucket for data_source"
        );

        // Qdrant create collection and indexes.
        self.create_qdrant_collection(credentials, qdrant_client.clone())
            .await?;

        info!(
            data_source_id = self.data_source_id(),
            "Created Qdrant collection and indexes for data_source"
        );

        Ok(())
    }

    pub async fn update_parents(
        &self,
        store: Box<dyn Store + Sync + Send>,
        qdrant_clients: QdrantClients,
        document_id: String,
        parents: Vec<String>,
    ) -> Result<()> {
        store
            .update_data_source_document_parents(
                &self.project,
                &self.data_source_id(),
                &document_id.to_string(),
                &parents,
            )
            .await?;

        let mut hasher = blake3::Hasher::new();
        hasher.update(document_id.as_bytes());
        let document_id_hash = format!("{}", hasher.finalize().to_hex());

        self.update_document_payload(qdrant_clients, document_id_hash, "parents", parents)
            .await?;
        Ok(())
    }

    pub async fn update_tags(
        &self,
        store: Box<dyn Store + Sync + Send>,
        qdrant_clients: QdrantClients,
        document_id: String,
        add_tags: Vec<String>,
        remove_tags: Vec<String>,
    ) -> Result<Vec<String>> {
        let new_tags = store
            .update_data_source_document_tags(
                &self.project,
                &self.data_source_id(),
                &document_id.to_string(),
                &add_tags,
                &remove_tags,
            )
            .await?;

        let mut hasher = blake3::Hasher::new();
        hasher.update(document_id.as_bytes());
        let document_id_hash = format!("{}", hasher.finalize().to_hex());

        self.update_document_payload(qdrant_clients, document_id_hash, "tags", new_tags.clone())
            .await?;
        Ok(new_tags)
    }

    async fn update_document_payload(
        &self,
        qdrant_clients: QdrantClients,
        document_id_hash: String,
        field_name: &str,
        field_value: impl Into<Value>,
    ) -> Result<()> {
        let qdrant_client = qdrant_clients.main_client(&self.config.qdrant_config);

        let mut payload = Payload::new();
        payload.insert(field_name, field_value.into());

        let field_condition = qdrant::FieldCondition {
            key: "document_id_hash".to_string(),
            r#match: Some(qdrant::Match {
                match_value: Some(qdrant::r#match::MatchValue::Keyword(document_id_hash)),
            }),
            ..Default::default()
        };

        let points_selector = PointsSelector {
            points_selector_one_of: Some(PointsSelectorOneOf::Filter(Filter {
                must: vec![field_condition.into()],
                ..Default::default()
            })),
        };

        match qdrant_clients.shadow_write_client(&self.config.qdrant_config) {
            Some(qdrant_client) => {
                match qdrant_client
                    .set_payload(
                        self.qdrant_collection().to_string(),
                        None,
                        &points_selector,
                        payload.clone(),
                        None,
                    )
                    .await
                {
                    Ok(_) => {
                        info!(
                            cluster = ?qdrant_clients.shadow_write_cluster(&self.config.qdrant_config),
                            collection = self.qdrant_collection(),
                            "[SHADOW_WRITE_SUCCESS] Update payload"
                        );
                    }
                    Err(e) => {
                        error!(
                            cluster = ?qdrant_clients.shadow_write_cluster(&self.config.qdrant_config),
                            collection = self.qdrant_collection(),
                            error = %e,
                            "[SHADOW_WRITE_FAIL] Update payload"
                        );
                    }
                }
            }
            None => (),
        }

        qdrant_client
            .set_payload(
                self.qdrant_collection().to_string(),
                None,
                &points_selector,
                payload,
                None,
            )
            .await?;

        Ok(())
    }

    pub async fn upsert(
        &self,
        credentials: Credentials,
        store: Box<dyn Store + Sync + Send>,
        qdrant_clients: QdrantClients,
        document_id: &str,
        timestamp: Option<u64>,
        tags: &Vec<String>,
        parents: &Vec<String>,
        source_url: &Option<String>,
        text: Section,
        preserve_system_tags: bool,
    ) -> Result<Document> {
        let qdrant_client = qdrant_clients.main_client(&self.config.qdrant_config);

        let full_text = text.full_text();
        // Disallow preserve_system_tags=true if tags contains a string starting with the system
        // tag prefix prevents having duplicate system tags or have users accidentally add system
        // tags (from UI/API).
        if preserve_system_tags
            && tags
                .iter()
                .any(|tag| tag.starts_with(DATA_SOURCE_DOCUMENT_SYSTEM_TAG_PREFIX))
        {
            Err(anyhow!(
                "preserve_system_tags=true is not allowed if \
                 `tags` contains a string starting with \"{}\"",
                DATA_SOURCE_DOCUMENT_SYSTEM_TAG_PREFIX
            ))?;
        }

        let store = store.clone();

        let current_system_tags = if preserve_system_tags {
            let current_doc = store
                .load_data_source_document(
                    &self.project,
                    &self.data_source_id(),
                    &document_id.to_string(),
                    &None,
                )
                .await?;

            let current_tags = match current_doc {
                Some(current_doc) => current_doc.tags,
                None => vec![],
            };

            current_tags
                .iter()
                .filter(|tag| tag.starts_with(DATA_SOURCE_DOCUMENT_SYSTEM_TAG_PREFIX))
                .map(|tag| tag.to_string())
                .collect()
        } else {
            vec![]
        };

        let tags: Vec<String> = tags
            .iter()
            .chain(current_system_tags.iter())
            .map(|tag| tag.to_string())
            .collect();

        let timestamp = match timestamp {
            Some(timestamp) => timestamp,
            None => utils::now(),
        };

        // Hash document.
        let mut hasher = blake3::Hasher::new();
        hasher.update(document_id.as_bytes());
        hasher.update(full_text.as_bytes());
        hasher.update(format!("{}", timestamp).as_bytes());
        tags.iter().for_each(|tag| {
            hasher.update(tag.as_bytes());
        });
        parents.iter().for_each(|parent| {
            hasher.update(parent.as_bytes());
        });
        let document_hash = format!("{}", hasher.finalize().to_hex());

        let mut hasher = blake3::Hasher::new();
        hasher.update(document_id.as_bytes());
        let document_id_hash = format!("{}", hasher.finalize().to_hex());

        let mut document = Document::new(
            &self.data_source_id,
            document_id,
            timestamp,
            &tags,
            &parents,
            source_url,
            &document_hash,
            full_text.len() as u64,
        )?;

        // GCP store raw text and document_id.
        let bucket = match std::env::var("DUST_DATA_SOURCES_BUCKET") {
            Ok(bucket) => bucket,
            Err(_) => Err(anyhow!("DUST_DATA_SOURCES_BUCKET is not set"))?,
        };

        let bucket_path = format!(
            "{}/{}/{}",
            self.project.project_id(),
            self.internal_id,
            document_id_hash
        );

        let document_id_path = format!("{}/document_id.txt", bucket_path);
        let content_path = format!("{}/{}/content.txt", bucket_path, document_hash);

        let now = utils::now();
        let _ = try_join!(
            Object::create(
                &bucket,
                document_id.as_bytes().to_vec(),
                &document_id_path,
                "application/text",
            ),
            Object::create(
                &bucket,
                full_text.as_bytes().to_vec(),
                &content_path,
                "application/text",
            ),
        )?;

        info!(
            data_source_id = self.data_source_id(),
            document_id = document_id,
            duration = utils::now() - now,
            blob_url = format!("gs://{}/{}", bucket, content_path),
            "Created document blob"
        );

        // Commented for future debug use
        // match document_id {
        //     "notion-95804d6b-0274-43f6-8957-5b024234e3bf" => {
        //         let debug_path = format!("{}/{}/debug.json", bucket_path, document_hash);
        //         Object::create(
        //             &bucket,
        //             serde_json::to_string(&text).unwrap().into_bytes(),
        //             &debug_path,
        //             "application/json",
        //         )
        //         .await?;
        //         info!(
        //             data_source_id = self.data_source_id(),
        //             document_id = document_id,
        //             debug_blob_url = format!("gs://{}/{}", bucket, debug_path),
        //             "Uploaded buggy document"
        //         );
        //         panic!("BUGGY document `{}`", document_id);
        //     }
        //     _ => (),
        // };

        let now = utils::now();

        // ChunkInfo is used to store the chunk text and associated hash to avoid recomputing the
        // hash multiple time.
        struct ChunkInfo {
            text: String,
            hash: String,
        }

        // Split text in chunks.
        let splits = splitter(self.config.splitter_id)
            .split(
                credentials.clone(),
                self.config.provider_id,
                &self.config.model_id,
                self.config.max_chunk_size,
                text,
            )
            .await?;

        let splits_with_hash: Vec<ChunkInfo> = splits
            .iter()
            .map(|s| {
                let mut hasher = blake3::Hasher::new();
                hasher.update(s.as_bytes());
                let text_hash = format!("{}", hasher.finalize().to_hex());
                ChunkInfo {
                    text: s.clone(),
                    hash: text_hash,
                }
            })
            .collect::<Vec<_>>();

        info!(
            data_source_id = self.data_source_id(),
            document_id = document_id,
            split_counts = splits.len(),
            duration = utils::now() - now,
            "Splitted document"
        );

        let now = utils::now();
        let mut embeddings: HashMap<String, EmbedderVector> = HashMap::new();
        let mut page_offset: Option<PointId> = None;
        loop {
            let scroll_results = qdrant_client
                .scroll(&ScrollPoints {
                    collection_name: self.qdrant_collection(),
                    with_vectors: Some(true.into()),
                    limit: Some(1024),
                    offset: page_offset,
                    filter: Some(qdrant::Filter {
                        must_not: vec![],
                        should: vec![],
                        must: vec![qdrant::FieldCondition {
                            key: "document_id_hash".to_string(),
                            r#match: Some(qdrant::Match {
                                match_value: Some(qdrant::r#match::MatchValue::Keyword(
                                    document_id_hash.clone(),
                                )),
                            }),
                            ..Default::default()
                        }
                        .into()],
                    }),
                    ..Default::default()
                })
                .await?;

            for result in &scroll_results.result {
                if let Some(qdrant::value::Kind::StringValue(chunk_text)) =
                    result.payload.get("text").and_then(|t| t.kind.as_ref())
                {
                    if let Some(VectorsOptions::Vector(v)) = result
                        .vectors
                        .as_ref()
                        .and_then(|v| v.vectors_options.as_ref())
                    {
                        let text_hash = format!(
                            "{}",
                            blake3::Hasher::new()
                                .update(chunk_text.as_bytes())
                                .finalize()
                                .to_hex()
                        );

                        embeddings.insert(
                            text_hash,
                            EmbedderVector {
                                created: document.created,
                                vector: v.data.iter().map(|&v| v as f64).collect(),
                                model: self.config.model_id.clone(),
                                provider: self.config.provider_id.to_string(),
                            },
                        );
                    }
                }
            }

            page_offset = scroll_results.next_page_offset;
            if page_offset.is_none() {
                break;
            }
        }

        info!(
            data_source_id = self.data_source_id(),
            document_id = document_id,
            chunk_count = embeddings.len(),
            duration = utils::now() - now,
            "Finished retrieving cache from Qdrant"
        );

        let now = utils::now();

        let splits_to_embbed = splits_with_hash
            .iter()
            .filter(|ci| !embeddings.contains_key(&ci.hash))
            .collect::<Vec<_>>();

        // Chunk splits into a vectors of 8 chunks (Vec<Vec<String>>)
        let chunked_splits = splits_to_embbed
            .chunks(8)
            .map(|chunk| chunk.to_vec())
            .collect::<Vec<_>>();

        // Embed batched chunks sequentially.
        for chunk in chunked_splits {
            let r = EmbedderRequest::new(
                self.config.provider_id.clone(),
                &self.config.model_id,
                chunk.iter().map(|ci| ci.text.as_str()).collect::<Vec<_>>(),
                self.config.extras.clone(),
            );

            let v = match r.execute(credentials.clone()).await {
                Ok(v) => v,
                Err(e) => Err(anyhow!("DataSource chunk embedding error: {}", e))?,
            };

            for (ci, v) in chunk.into_iter().zip(v.into_iter()) {
                embeddings.insert(ci.hash.clone(), v);
            }
        }

        info!(
            data_source_id = self.data_source_id(),
            document_id = document_id,
            chunk_count = splits_to_embbed.len(),
            duration = utils::now() - now,
            "Finished embedding chunks"
        );

        // Final ordered results with (offset, string, vector). `splits_with_hash` is the original
        // list of splits, including all chunks. We go retrieve in embeddings their vector which
        // should all be populated (from qdrant retrieval or actual embedding).
        let vectors = splits_with_hash
            .iter()
            .enumerate()
            .map(|(i, ci)| match embeddings.get(&ci.hash) {
                Some(v) => Ok((i, ci.text.clone(), v)),
                None => Err(anyhow!(
                    "DataSource embedding error: Chunk not found in cache"
                )),
            })
            .collect::<Result<Vec<_>>>()?;

        document.chunks = vectors
            .into_iter()
            .map(|(i, s, v)| {
                let mut hasher = blake3::Hasher::new();
                hasher.update(document_hash.as_bytes());
                hasher.update(s.as_bytes());
                let hash = format!("{}", hasher.finalize().to_hex());

                Chunk {
                    text: s,
                    hash,
                    offset: i,
                    vector: Some(v.vector.clone()),
                    score: None,
                }
            })
            .collect::<Vec<_>>();
        document.chunk_count = document.chunks.len();
        document.token_count = Some(document.chunks.len() * self.config.max_chunk_size);

        let now = utils::now();

        // Clean-up previous document chunks (vector search db).
        let filter: PointsSelector = qdrant::Filter {
            must_not: vec![],
            should: vec![],
            must: vec![qdrant::FieldCondition {
                key: "document_id_hash".to_string(),
                r#match: Some(qdrant::Match {
                    match_value: Some(qdrant::r#match::MatchValue::Keyword(
                        document_id_hash.clone(),
                    )),
                }),
                ..Default::default()
            }
            .into()],
        }
        .into();

        match qdrant_clients.shadow_write_client(&self.config.qdrant_config) {
            Some(qdrant_client) => {
                match qdrant_client
                    .delete_points(self.qdrant_collection(), None, &filter, None)
                    .await
                {
                    Ok(_) => {
                        info!(
                            cluster = ?qdrant_clients.shadow_write_cluster(&self.config.qdrant_config),
                            collection = self.qdrant_collection(),
                            "[SHADOW_WRITE_SUCCESS] Delete points"
                        );
                    }
                    Err(e) => {
                        error!(
                            cluster = ?qdrant_clients.shadow_write_cluster(&self.config.qdrant_config),
                            collection = self.qdrant_collection(),
                            error = %e,
                            "[SHADOW_WRITE_FAIL] Delete points"
                        );
                    }
                }
            }
            None => (),
        }

        qdrant_client
            .delete_points(self.qdrant_collection(), None, &filter, None)
            .await?;

        info!(
            data_source_id = self.data_source_id(),
            document_id = document_id,
            duration = utils::now() - now,
            "Deleted previous document in Qdrant"
        );

        // Insert new chunks (vector search db).
        let points = document
            .chunks
            .iter()
            .map(|c| {
                let uid = Uuid::new_v4();
                let mut payload = Payload::new();
                payload.insert("tags", document.tags.clone());
                payload.insert("parents", document.parents.clone());
                payload.insert("timestamp", document.timestamp as i64);
                payload.insert("chunk_offset", c.offset as i64);
                payload.insert("chunk_hash", c.hash.clone());
                payload.insert("data_source_id", self.data_source_id.clone());
                payload.insert("data_source_internal_id", self.internal_id.clone());
                payload.insert("document_id", document.document_id.clone());
                payload.insert("document_id_hash", document_id_hash.clone());
                payload.insert("text", c.text.clone());

                qdrant::PointStruct::new(
                    uid.to_string(),
                    c.vector
                        .as_ref()
                        .unwrap()
                        .iter()
                        .map(|v| *v as f32)
                        .collect::<Vec<f32>>(),
                    payload,
                )
            })
            .collect::<Vec<_>>();

        const MAX_QDRANT_VECTOR_PER_UPSERT: usize = 128;

        let start = utils::now();
        let points_len = points.len();

        if points.len() > 0 {
            // Chunk the points in groups of MAX_QDRANT_VECTOR_PER_UPSERT to avoid big upserts.
            let mut chunked_points = vec![];
            let mut chunk = vec![];
            for point in points {
                chunk.push(point);
                if chunk.len() == MAX_QDRANT_VECTOR_PER_UPSERT {
                    chunked_points.push(chunk);
                    chunk = vec![];
                }
            }
            if chunk.len() > 0 {
                chunked_points.push(chunk);
            }

            for chunk in chunked_points {
                let now = utils::now();
                let chunk_len = chunk.len();

                match qdrant_clients.shadow_write_client(&self.config.qdrant_config) {
                    Some(qdrant_client) => {
                        match qdrant_client
                            .upsert_points(self.qdrant_collection(), None, chunk.clone(), None)
                            .await
                        {
                            Ok(_) => {
                                info!(
                                    cluster = ?qdrant_clients.shadow_write_cluster(&self.config.qdrant_config),
                                    collection = self.qdrant_collection(),
                                    "[SHADOW_WRITE_SUCCESS] Upsert points"
                                )
                            }
                            Err(e) => {
                                error!(
                                    cluster = ?qdrant_clients.shadow_write_cluster(&self.config.qdrant_config),
                                    collection = self.qdrant_collection(),
                                    error = %e,
                                    "[SHADOW_WRITE_FAIL] Upsert points"
                                );
                            }
                        }
                    }
                    None => (),
                }

                qdrant_client
                    .upsert_points(self.qdrant_collection(), None, chunk, None)
                    .await?;

                info!(
                    points_count = chunk_len,
                    duration = utils::now() - now,
                    "Success upserting chunk in Qdrant"
                );
            }
        }

        info!(
            data_source_id = self.data_source_id(),
            document_id = document_id,
            points_count = points_len,
            duration = utils::now() - start,
            "Inserted vectors in Qdrant"
        );

        // Upsert document (SQL)
        store
            .upsert_data_source_document(&self.project, &self.data_source_id, &document)
            .await?;

        Ok(document)
    }

    const MAX_TOP_K_SEARCH: usize = 1024;

    pub async fn search(
        &self,
        credentials: Credentials,
        store: Box<dyn Store + Sync + Send>,
        qdrant_clients: QdrantClients,
        query: &Option<String>,
        top_k: usize,
        filter: Option<SearchFilter>,
        full_text: bool,
        target_document_tokens: Option<usize>,
    ) -> Result<Vec<Document>> {
        let qdrant_client = qdrant_clients.main_client(&self.config.qdrant_config);

        // We ensure that we have not left a `parents.is_in_map`` in the filter.
        match filter.as_ref() {
            Some(filter) => {
                filter.ensure_postprocessed()?;
            }
            None => (),
        }

        if top_k > DataSource::MAX_TOP_K_SEARCH {
            return Err(anyhow!("top_k must be <= {}", DataSource::MAX_TOP_K_SEARCH));
        }

        let time_embedding_start = utils::now();

        let query = match query {
            Some(q) => match q.len() {
                0 => None,
                _ => Some(q),
            },
            None => None,
        };

        let chunks = match query {
            None => {
                let store = store.clone();
                if !target_document_tokens.is_none() {
                    Err(anyhow!(
                        "target_document_tokens is only supported with query"
                    ))?;
                }
                let chunks = self
                    .retrieve_chunks_without_query(store, &qdrant_client, top_k, &filter)
                    .await?;
                info!(
                    duration = utils::now() - time_embedding_start,
                    "DSSTAT Finished retrieving chunks without query"
                );
                chunks
            }
            Some(q) => {
                let r = EmbedderRequest::new(
                    self.config.provider_id,
                    &self.config.model_id,
                    vec![&q],
                    self.config.extras.clone(),
                );
                let v = r.execute(credentials).await?;
                assert!(v.len() == 1);

                info!(
                    duration = utils::now() - time_embedding_start,
                    "DSSTAT Finished embedding query"
                );

                // Construct the filters for the search query if specified.
                let f = build_qdrant_filter(&filter);

                let time_search_start = utils::now();
                let results = qdrant_client
                    .search_points(&qdrant::SearchPoints {
                        collection_name: self.qdrant_collection(),
                        vector: v[0].vector.iter().map(|v| *v as f32).collect::<Vec<f32>>(),
                        filter: f,
                        limit: top_k as u64,
                        with_payload: Some(true.into()),
                        params: None,
                        score_threshold: None,
                        offset: None,
                        vector_name: None,
                        with_vectors: None,
                        read_consistency: None,
                        shard_key_selector: None,
                        timeout: None,
                        sparse_indices: None,
                    })
                    .await?;

                info!(
                    collection_name = self.qdrant_collection(),
                    duration = utils::now() - time_search_start,
                    results_count = results.result.len(),
                    "DSSTAT Finished searching Qdrant documents"
                );

                let time_chunk_start = utils::now();
                let chunks = parse_points_into_chunks(
                    &self.data_source_id,
                    &self.internal_id,
                    &(results
                        .result
                        .into_iter()
                        .map(QdrantPoint::Scored)
                        .collect()),
                )?;

                info!(
                    collection_name = self.qdrant_collection(),
                    duration = utils::now() - time_chunk_start,
                    chunk_length = chunks.len(),
                    "DSSTAT Finished chunking documents"
                );

                chunks
            }
        };

        // get a list of unique document_id
        let document_ids = chunks
            .iter()
            .map(|(document_id, _)| document_id.clone())
            .collect::<std::collections::HashSet<_>>();

        // GCP retrieve raw text and document_id.
        let bucket = match std::env::var("DUST_DATA_SOURCES_BUCKET") {
            Ok(bucket) => bucket,
            Err(_) => Err(anyhow!("DUST_DATA_SOURCES_BUCKET is not set"))?,
        };

        // Retrieve the documents from the store.
        let time_store_start = utils::now();
        let documents = stream::iter(document_ids)
            .map(|document_id| {
                let store = store.clone();
                let document_id = document_id.clone();
                let data_source_id = self.data_source_id.clone();
                let project = self.project.clone();
                let bucket = bucket.clone();
                let internal_id = self.internal_id.clone();
                tokio::spawn(async move {
                    let mut d: Document = match store
                        .load_data_source_document(&project, &data_source_id, &document_id, &None)
                        .await?
                    {
                        Some(d) => d,
                        None => Err(anyhow!("Document not found"))?,
                    };

                    if full_text {
                        let mut hasher = blake3::Hasher::new();
                        hasher.update(document_id.as_bytes());
                        let document_id_hash = format!("{}", hasher.finalize().to_hex());

                        let bucket_path = format!(
                            "{}/{}/{}",
                            project.project_id(),
                            internal_id,
                            document_id_hash
                        );
                        let content_path = format!("{}/{}/content.txt", bucket_path, d.hash);
                        let bytes = Object::download(&bucket, &content_path).await?;
                        let text = String::from_utf8(bytes)?;

                        d.text = Some(text.clone());
                    }
                    Ok::<Document, anyhow::Error>(d)
                })
            })
            .buffer_unordered(16)
            .map(|r| match r {
                Err(e) => Err(anyhow!("Data source document retrieval error: {}", e))?,
                Ok(r) => r,
            })
            .try_collect::<Vec<_>>()
            .await?;

        info!(
            collection_name = self.qdrant_collection(),
            duration = utils::now() - time_store_start,
            document_len = documents.len(),
            "DSSTAT Finished fetching documents from the store"
        );

        // Qdrant client implements the sync and send traits, so we just need
        // to wrap it in an Arc so that it can be cloned.
        let time_qdrant_scroll_start = utils::now();
        let mut documents = match target_document_tokens {
            Some(target) => {
                stream::iter(documents)
                    .map(|mut d| {
                        let mut chunks = chunks
                            .iter()
                            .filter(|(document_id, _)| document_id == &d.document_id)
                            .map(|(_, c)| c.clone())
                            .collect::<Vec<Chunk>>();
                        let collection = self.qdrant_collection();
                        let chunk_size = self.config.max_chunk_size;
                        let qdrant_client = qdrant_client.clone();
                        let mut token_count = chunks.len() * chunk_size;
                        d.token_count = Some(token_count);
                        tokio::spawn(async move {
                            let mut offset_set = std::collections::HashSet::new();
                            for chunk in chunks.iter() {
                                offset_set.insert(chunk.offset);
                            }
                            let current_length = chunks.len() * chunk_size;
                            if (target as i64 - current_length as i64) / chunk_size as i64 <= 0 {
                                d.chunks = chunks;
                                return Ok(d);
                            }
                            let new_offsets = target_document_tokens_offsets(
                                chunks.iter().map(|c| c.offset).collect(),
                                (target - current_length) / chunk_size,
                                d.chunk_count,
                            );
                            let offset_values: Vec<i64> = new_offsets
                                .keys()
                                .cloned()
                                .collect::<Vec<usize>>()
                                .into_iter()
                                .map(|o| o as i64)
                                .collect();
                            let new_offsets_count = offset_values.len() as u32;
                            if new_offsets_count == 0 {
                                d.chunks = chunks;
                                return Ok(d);
                            }

                            let mut hasher = blake3::Hasher::new();
                            hasher.update(d.document_id.as_bytes());
                            let document_id_hash = format!("{}", hasher.finalize().to_hex());
                            let filter = qdrant::Filter {
                                must: vec![
                                    qdrant::FieldCondition {
                                        key: "document_id_hash".to_string(),
                                        r#match: Some(qdrant::Match {
                                            match_value: Some(
                                                qdrant::r#match::MatchValue::Keyword(
                                                    document_id_hash,
                                                ),
                                            ),
                                        }),
                                        ..Default::default()
                                    }
                                    .into(),
                                    qdrant::FieldCondition {
                                        key: "chunk_offset".to_string(),
                                        r#match: Some(qdrant::Match {
                                            match_value: Some(
                                                qdrant::r#match::MatchValue::Integers(
                                                    qdrant::RepeatedIntegers {
                                                        integers: offset_values,
                                                    },
                                                ),
                                            ),
                                        }),
                                        ..Default::default()
                                    }
                                    .into(),
                                ],
                                ..Default::default()
                            };
                            let search_points = qdrant::ScrollPoints {
                                collection_name: collection,
                                filter: Some(filter),
                                limit: Some(new_offsets_count),
                                ..Default::default()
                            };
                            let results_expand = match qdrant_client.scroll(&search_points).await {
                                Ok(r) => r.result,
                                Err(e) => {
                                    error!(
                                        error = %e,
                                        "Qdrant scroll error"
                                    );
                                    Err(anyhow!("Qdrant scroll error: {}", e))?
                                }
                            };
                            let mut parsed_results = results_expand
                                .iter()
                                .map(|r| {
                                    let text = match r.payload.get("text") {
                                        Some(t) => match t.kind {
                                            Some(qdrant::value::Kind::StringValue(ref s)) => s,
                                            _ => Err(anyhow!("Missing `text` in chunk payload"))?,
                                        },
                                        None => Err(anyhow!("Missing `text` in chunk payload"))?,
                                    };
                                    let chunk_offset = match r.payload.get("chunk_offset") {
                                        Some(t) => match t.kind {
                                            Some(qdrant::value::Kind::IntegerValue(i)) => i,
                                            _ => Err(anyhow!(
                                                "Missing `chunk_offset` in chunk payload"
                                            ))?,
                                        },
                                        None => {
                                            Err(anyhow!("Missing `chunk_offset` in chunk payload"))?
                                        }
                                    };
                                    Ok((text, chunk_offset as usize))
                                })
                                .collect::<Result<Vec<_>>>()?;
                            parsed_results.sort_by(|a, b| a.1.cmp(&b.1));
                            let mut counter = 0;
                            chunks.sort_by(|a, b| a.offset.cmp(&b.offset));
                            chunks = chunks
                                .into_iter()
                                .map(|mut chunk| {
                                    let mut prepend = "".to_owned();
                                    while counter < parsed_results.len()
                                        && *new_offsets.get(&parsed_results[counter].1).unwrap()
                                            == chunk.offset
                                    {
                                        let c_offset = parsed_results[counter].1;
                                        if chunk.offset < c_offset {
                                            chunk.text.push_str(
                                                &(" ".to_owned()
                                                    + &parsed_results[counter].0.clone()),
                                            );
                                        } else {
                                            prepend.push_str(
                                                &(parsed_results[counter].0.clone() + " "),
                                            );
                                        }
                                        counter += 1;
                                        token_count += chunk_size;
                                    }
                                    chunk.text = prepend + &chunk.text;
                                    chunk
                                })
                                .collect::<Vec<_>>();
                            chunks.sort_by(|a, b| {
                                let b_score = b.score.unwrap_or(0.0);
                                let a_score = a.score.unwrap_or(0.0);
                                b_score
                                    .partial_cmp(&a_score)
                                    .unwrap_or(std::cmp::Ordering::Equal)
                            });
                            d.chunks = chunks;
                            d.token_count = Some(token_count);

                            Ok::<Document, anyhow::Error>(d)
                        })
                    })
                    .buffer_unordered(16)
                    .map(|r| match r {
                        Err(e) => Err(anyhow!(
                            "Data source document retrieval expansion error: {}",
                            e
                        ))?,
                        Ok(r) => r,
                    })
                    .try_collect::<Vec<_>>()
                    .await?
            }
            None => documents
                .into_iter()
                .map(|mut d| {
                    let chunks = chunks
                        .iter()
                        .filter(|(document_id, _)| document_id == &d.document_id)
                        .map(|(_, c)| c.clone())
                        .collect::<Vec<Chunk>>();
                    d.token_count = Some(chunks.len() * self.config.max_chunk_size);
                    d.chunks = chunks;
                    d
                })
                .collect::<Vec<_>>(),
        };

        info!(
            collection_name = self.qdrant_collection(),
            duration = utils::now() - time_qdrant_scroll_start,
            results_count = documents.len(),
            "DSSTAT Finished scrolling documents"
        );

        if !query.is_none() {
            // Sort the documents by the score of the first chunk (guaranteed ordered).
            documents.sort_by(|a, b| {
                let b_score = b.chunks.first().unwrap().score.unwrap_or(0.0);
                let a_score = a.chunks.first().unwrap().score.unwrap_or(0.0);
                b_score
                    .partial_cmp(&a_score)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
        } else {
            // Sort the documents by the timestamp of the doc (desc).
            documents.sort_by(|a, b| {
                let b_timestamp = b.timestamp;
                let a_timestamp = a.timestamp;
                b_timestamp
                    .partial_cmp(&a_timestamp)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
        }

        info!(
            data_source_id = self.data_source_id(),
            document_count = documents.len(),
            chunk_count = documents.iter().map(|d| d.chunks.len()).sum::<usize>(),
            duration = utils::now() - time_embedding_start,
            "Searched data source"
        );

        Ok(documents)
    }

    async fn retrieve_chunks_without_query(
        &self,
        store: Box<dyn Store + Sync + Send>,
        qdrant_client: &Arc<QdrantClient>,
        top_k: usize,
        filter: &Option<SearchFilter>,
    ) -> Result<Vec<(String, Chunk)>> {
        let store = store.clone();

        let (doc_ids, _) = store
            .find_data_source_document_ids(
                &self.project,
                self.data_source_id(),
                filter,
                // with top_k documents, we should be guaranteed to have at
                // least top_k chunks, if we make the assumption that each
                // document has at least one chunk.
                Some((top_k, 0)),
            )
            .await?;

        let qdrant_batch_size: usize = 8; // number of `document_ids` to query at once in Qdrant
        let qdrant_page_size: u32 = 128; // number of points to fetch per page in Qdrant
        let qdrant_max_pages: usize = 16_000; // stop iteration if we can't get all the points in a batch after iterating this many pages

        let mut chunks: Vec<(String, Chunk)> = vec![];

        // iterate over the doc_ids in batches of qdrant_batch_size
        for batch in doc_ids.chunks(qdrant_batch_size) {
            let document_id_hashes = batch
                .iter()
                .map(|document_id| {
                    let mut hasher = blake3::Hasher::new();
                    hasher.update(document_id.as_bytes());
                    format!("{}", hasher.finalize().to_hex())
                })
                .collect::<Vec<_>>();
            let document_id_condition = qdrant::FieldCondition {
                key: "document_id_hash".to_string(),
                r#match: Some(qdrant::Match {
                    match_value: Some(qdrant::r#match::MatchValue::Keywords(
                        qdrant::RepeatedStrings {
                            strings: document_id_hashes,
                        },
                    )),
                }),
                ..Default::default()
            }
            .into();
            let qdrant_batch_filter = qdrant::Filter {
                must: vec![document_id_condition],
                ..Default::default()
            };

            let mut page_offset: Option<PointId> = None;
            let mut batch_points: Vec<RetrievedPoint> = vec![];

            // we must scroll through all result pages of a batch, because we want to
            // to sort by reverse-chron timestamp and then by chunk_offset
            // and Qdrant doesn't support any kind of sorting
            let mut page_count = 0;
            loop {
                let mut r = qdrant_client
                    .scroll(&qdrant::ScrollPoints {
                        collection_name: self.qdrant_collection(),
                        filter: Some(qdrant_batch_filter.clone()),
                        limit: Some(qdrant_page_size),
                        offset: page_offset,
                        ..Default::default()
                    })
                    .await?;
                batch_points.append(&mut r.result);
                page_offset = r.next_page_offset;
                if page_offset.is_none() {
                    break;
                }
                page_count += 1;
                if page_count > qdrant_max_pages {
                    return Err(anyhow!(
                        "Reached max page count ({}) for batch",
                        qdrant_max_pages
                    ));
                }
            }

            let mut batch_chunks: Vec<(String, Chunk)> = parse_points_into_chunks(
                &self.data_source_id,
                &self.internal_id,
                &batch_points
                    .into_iter()
                    .map(QdrantPoint::Retrieved)
                    .collect(),
            )?;

            // sort chunks by document_id (in their original order)
            // and then by chunk_offset
            let mut batch_index: HashMap<String, usize> = HashMap::new();
            for (idx, doc_id) in batch.iter().enumerate() {
                batch_index.insert(doc_id.clone(), idx);
            }
            batch_chunks.sort_by(|(doc_id_a, a), (doc_id_b, b)| {
                let a_idx = batch_index.get(doc_id_a).unwrap_or(&usize::MAX);
                let b_idx = batch_index.get(doc_id_b).unwrap_or(&usize::MAX);

                match a_idx.cmp(b_idx) {
                    // if the document_ids have the same original order, sort by chunk_offset
                    std::cmp::Ordering::Equal => a.offset.cmp(&b.offset),
                    // Else use the original order
                    ordering => ordering,
                }
            });

            // add the first `top_k` chunks to the result
            // (or all chunks if there are less than `top_k`)
            for chunk in batch_chunks.into_iter().take(top_k) {
                chunks.push(chunk);
            }

            // if we have enough chunks, we can stop
            if chunks.len() >= top_k {
                break;
            }
        }

        Ok(chunks)
    }

    pub async fn retrieve(
        &self,
        store: Box<dyn Store + Sync + Send>,
        document_id: &str,
        remove_system_tags: bool,
        version_hash: &Option<String>,
    ) -> Result<Option<Document>> {
        let store = store.clone();

        let mut d = match store
            .load_data_source_document(
                &self.project,
                &self.data_source_id,
                document_id,
                version_hash,
            )
            .await?
        {
            Some(d) => d,
            None => {
                return Ok(None);
            }
        };

        d.tags = if remove_system_tags {
            // remove tags that are prefixed with the system tag prefix
            d.tags
                .into_iter()
                .filter(|t| !t.starts_with(DATA_SOURCE_DOCUMENT_SYSTEM_TAG_PREFIX))
                .collect::<Vec<_>>()
        } else {
            d.tags
        };

        let mut hasher = blake3::Hasher::new();
        hasher.update(document_id.as_bytes());
        let document_id_hash = format!("{}", hasher.finalize().to_hex());

        // GCP retrieve raw text and document_id.
        let bucket = match std::env::var("DUST_DATA_SOURCES_BUCKET") {
            Ok(bucket) => bucket,
            Err(_) => Err(anyhow!("DUST_DATA_SOURCES_BUCKET is not set"))?,
        };

        let bucket_path = format!(
            "{}/{}/{}",
            self.project.project_id(),
            self.internal_id,
            document_id_hash
        );
        let content_path = format!("{}/{}/content.txt", bucket_path, d.hash);
        let bytes = Object::download(&bucket, &content_path).await?;
        let text = String::from_utf8(bytes)?;

        d.text = Some(text.clone());

        Ok(Some(d))
    }

    pub async fn delete_document(
        &self,
        store: Box<dyn Store + Sync + Send>,
        qdrant_clients: QdrantClients,
        document_id: &str,
    ) -> Result<()> {
        let qdrant_client = qdrant_clients.main_client(&self.config.qdrant_config);
        let store = store.clone();

        let mut hasher = blake3::Hasher::new();
        hasher.update(document_id.as_bytes());
        let document_id_hash = format!("{}", hasher.finalize().to_hex());

        // Clean-up document chunks (vector search db).
        let filter: PointsSelector = qdrant::Filter {
            must_not: vec![],
            should: vec![],
            must: vec![qdrant::FieldCondition {
                key: "document_id_hash".to_string(),
                r#match: Some(qdrant::Match {
                    match_value: Some(qdrant::r#match::MatchValue::Keyword(
                        document_id_hash.clone(),
                    )),
                }),
                ..Default::default()
            }
            .into()],
        }
        .into();

        match qdrant_clients.shadow_write_client(&self.config.qdrant_config) {
            Some(qdrant_client) => {
                match qdrant_client
                    .delete_points(self.qdrant_collection(), None, &filter, None)
                    .await
                {
                    Ok(_) => {
                        info!(
                            cluster = ?qdrant_clients.shadow_write_cluster(&self.config.qdrant_config),
                            collection = self.qdrant_collection(),
                            "[SHADOW_WRITE_SUCCESS] Delete points"
                        );
                    }
                    Err(e) => {
                        error!(
                            cluster = ?qdrant_clients.shadow_write_cluster(&self.config.qdrant_config),
                            collection = self.qdrant_collection(),
                            error = %e,
                            "[SHADOW_WRITE_FAIL] Delete points"
                        );
                    }
                }
            }
            None => (),
        }

        qdrant_client
            .delete_points(self.qdrant_collection(), None, &filter, None)
            .await?;

        // Delete document (SQL)
        store
            .delete_data_source_document(&self.project, &self.data_source_id, document_id)
            .await?;

        Ok(())
    }

    pub async fn delete(
        &self,
        store: Box<dyn Store + Sync + Send>,
        databases_store: Box<dyn DatabasesStore + Sync + Send>,
        qdrant_clients: QdrantClients,
    ) -> Result<()> {
        if qdrant_clients
            .shadow_write_cluster(&self.config.qdrant_config)
            .is_some()
        {
            Err(anyhow!(
                "Cannot delete data source with a shadow_write_cluster set"
            ))?;
        }

        let qdrant_client = qdrant_clients.main_client(&self.config.qdrant_config);
        let store = store.clone();

        // Delete collection (vector search db).
        qdrant_client
            .delete_collection(self.qdrant_collection())
            .await?;

        info!(
            data_source_id = self.data_source_id(),
            "Deleted Qdrant collection"
        );

        // Delete tables (concurrently).
        let (tables, total) = store
            .list_tables(&self.project, &self.data_source_id, None)
            .await?;
        try_join_all(
            tables
                .iter()
                .map(|t| t.delete(store.clone(), databases_store.clone())),
        )
        .await?;

        info!(
            data_source_id = self.data_source_id(),
            table_count = total,
            "Deleted tables"
        );

        // Delete data source and documents (SQL).
        store
            .delete_data_source(&self.project, &self.data_source_id)
            .await?;

        info!(
            data_source_id = self.data_source_id(),
            "Deleted data source records"
        );

        Ok(())
    }
}

fn build_qdrant_filter(filter: &Option<SearchFilter>) -> Option<qdrant::Filter> {
    fn qdrant_match_field_condition(key: &str, v: Vec<String>) -> qdrant::Condition {
        qdrant::FieldCondition {
            key: key.to_string(),
            r#match: Some(qdrant::Match {
                match_value: Some(qdrant::r#match::MatchValue::Keywords(
                    qdrant::RepeatedStrings { strings: v },
                )),
            }),
            ..Default::default()
        }
        .into()
    }

    // Construct the filters for the search query if specified.
    match filter {
        Some(f) => {
            let mut must_filter: Vec<qdrant::Condition> = vec![];
            let mut must_not_filter: Vec<qdrant::Condition> = vec![];

            match &f.tags {
                Some(tags) => {
                    match tags.is_in.clone() {
                        Some(v) => must_filter.push(qdrant_match_field_condition("tags", v)),
                        None => (),
                    };
                    match tags.is_not.clone() {
                        Some(v) => must_not_filter.push(qdrant_match_field_condition("tags", v)),
                        None => (),
                    };
                }
                None => (),
            };

            match &f.parents {
                Some(parents) => {
                    match parents.is_in.clone() {
                        Some(v) => must_filter.push(qdrant_match_field_condition("parents", v)),
                        None => (),
                    };
                    match parents.is_not.clone() {
                        Some(v) => must_not_filter.push(qdrant_match_field_condition("parents", v)),
                        None => (),
                    };
                }
                None => (),
            };

            match &f.timestamp {
                Some(timestamp) => {
                    match timestamp.gt.clone() {
                        Some(v) => must_filter.push(
                            qdrant::FieldCondition {
                                key: "timestamp".to_string(),
                                range: Some(qdrant::Range {
                                    gte: Some(v as f64),
                                    ..Default::default()
                                }),
                                ..Default::default()
                            }
                            .into(),
                        ),
                        None => (),
                    };
                    match timestamp.lt.clone() {
                        Some(v) => must_filter.push(
                            qdrant::FieldCondition {
                                key: "timestamp".to_string(),
                                range: Some(qdrant::Range {
                                    lte: Some(v as f64),
                                    ..Default::default()
                                }),
                                ..Default::default()
                            }
                            .into(),
                        ),
                        None => (),
                    };
                }
                None => (),
            };

            Some(qdrant::Filter {
                must: must_filter,
                must_not: must_not_filter,
                ..Default::default()
            })
        }
        None => None,
    }
}

enum QdrantPoint {
    Retrieved(RetrievedPoint),
    Scored(ScoredPoint),
}

fn parse_points_into_chunks(
    data_source_id: &str,
    internal_id: &str,
    points: &Vec<QdrantPoint>,
) -> Result<Vec<(String, Chunk)>, anyhow::Error> {
    let chunks: Vec<(String, Chunk)> = points
        .iter()
        .map(|r| match r {
            QdrantPoint::Retrieved(r) => (&r.payload, None),
            QdrantPoint::Scored(s) => (&s.payload, Some(s.score as f64)),
        })
        .filter(|(payload, _)| {
            payload.get("document_id").is_some()
                && payload.get("text").is_some()
                && payload.get("chunk_hash").is_some()
                && payload.get("chunk_offset").is_some()
        })
        .map(|(payload, maybe_score)| {
            let document_id = match payload.get("document_id") {
                Some(t) => match t.kind {
                    Some(qdrant::value::Kind::StringValue(ref s)) => s.clone(),
                    _ => Err(anyhow!(
                        "Invalid `document_id` in chunk payload \
                            (data_source_id={} internal_id={} kind={:?})",
                        data_source_id,
                        internal_id,
                        t.kind
                    ))?,
                },
                None => Err(anyhow!(
                    "Missing `document_id` in chunk payload (data_source_id={} internal_id={})",
                    data_source_id,
                    internal_id
                ))?,
            };
            let text = match payload.get("text") {
                Some(t) => match t.kind {
                    Some(qdrant::value::Kind::StringValue(ref s)) => s,
                    _ => Err(anyhow!("Missing `text` in chunk payload"))?,
                },
                None => Err(anyhow!("Missing `text` in chunk payload"))?,
            };
            let chunk_hash = match payload.get("chunk_hash") {
                Some(t) => match t.kind {
                    Some(qdrant::value::Kind::StringValue(ref s)) => s,
                    _ => Err(anyhow!("Missing `chunk_hash` in chunk payload"))?,
                },
                None => Err(anyhow!("Missing `chunk_hash` in chunk payload"))?,
            };
            let chunk_offset = match payload.get("chunk_offset") {
                Some(t) => match t.kind {
                    Some(qdrant::value::Kind::IntegerValue(i)) => i,
                    _ => Err(anyhow!("Missing `chunk_offset` in chunk payload"))?,
                },
                None => Err(anyhow!("Missing `chunk_offset` in chunk payload"))?,
            };

            Ok((
                document_id,
                Chunk {
                    text: text.clone(),
                    hash: chunk_hash.clone(),
                    offset: chunk_offset as usize,
                    vector: None,
                    score: maybe_score,
                },
            ))
        })
        .collect::<Result<Vec<(String, Chunk)>>>()?;

    Ok(chunks)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_c() {
        let tests = HashMap::from([
            (
                (vec![1, 4, 5], 6, 8),
                HashMap::from([(0, 1), (2, 1), (3, 4), (6, 5), (7, 5)]),
            ),
            (
                (vec![7, 9, 11], 18, 18),
                HashMap::from([
                    (2, 7),
                    (3, 7),
                    (4, 7),
                    (5, 7),
                    (6, 7),
                    (8, 7),
                    (10, 9),
                    (12, 11),
                    (13, 11),
                    (14, 11),
                    (15, 11),
                    (16, 11),
                    (17, 11),
                ]),
            ),
            (
                (vec![0, 31], 6, 32),
                HashMap::from([(1, 0), (2, 0), (3, 0), (28, 31), (29, 31), (30, 31)]),
            ),
            ((vec![0, 1], 6, 32), HashMap::from([(2, 1), (3, 1), (4, 1)])),
            (
                (vec![0, 2], 6, 32),
                HashMap::from([(3, 2), (4, 2), (5, 2), (1, 0)]),
            ),
            (
                (vec![30, 31], 6, 32),
                HashMap::from([(27, 30), (28, 30), (29, 30)]),
            ),
            ((vec![29, 31], 6, 32), HashMap::from([(28, 29), (30, 29)])),
            (
                (vec![15, 16], 6, 32),
                HashMap::from([(12, 15), (13, 15), (14, 15), (17, 16), (18, 16), (19, 16)]),
            ),
            (
                (vec![4, 20], 6, 32),
                HashMap::from([(3, 4), (5, 4), (19, 20), (21, 20)]),
            ),
        ]);
        // execute every test:
        for ((offsets, text_size, chunk_size), result) in tests {
            assert_eq!(
                target_document_tokens_offsets(offsets, text_size, chunk_size),
                result
            );
        }
    }

    #[test]
    fn test_section_simple() {
        let section = Section {
            prefix: None,
            content: Some("Hello world".to_string()),
            sections: vec![],
        };

        assert_eq!(section.full_text(), "Hello world");
    }

    #[test]
    fn test_sections() {
        let section = Section {
            prefix: Some("# title\n".to_string()),
            content: Some("This is an introduction.\n".to_string()),
            sections: vec![
                Section {
                    prefix: Some("## paragraph 2\n".to_string()),
                    content: Some("This is a paragraph1.\n".to_string()),
                    sections: vec![],
                },
                Section {
                    prefix: Some("## paragraph 2\n".to_string()),
                    content: Some("This is a paragraph2.\n".to_string()),
                    sections: vec![],
                },
            ],
        };

        assert_eq!(
            section.full_text(),
            "# title\nThis is an introduction.\n## paragraph 2\nThis \
             is a paragraph1.\n## paragraph 2\nThis is a paragraph2.\n"
        );
    }
}
