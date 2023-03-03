use crate::datasources::splitter::SplitterID;
use crate::providers::provider::ProviderID;
use crate::run::Credentials;
use crate::stores::{sqlite::SQLiteStore, store::Store};
use crate::utils;
use anyhow::{anyhow, Result};
use cloud_storage::{Bucket, NewBucket, Object};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::slice::Iter;

/// A Chunk is a subset of a document that was inserted into Pinecone. `has` covers both the chunk
/// text and the parent document metadata (inserted into pinecone on each chunk to leverage metadata
/// filters there).
pub struct Chunk {
    pub created: u64,
    pub text: String,
    pub hash: String,
    pub score: Option<f64>,
}

/// Document is used as a data-strucutre for insertion into the SQL store and Pinecone. It is also
/// used as a result from search (only the retrieved chunks are provided in the result). `hash`
/// covers both the original document id and text and the document metadata and is used to no-op in
/// case of match.
pub struct Document {
    pub created: u64,
    pub document_id: String,
    pub metadata: Value,
    pub hash: String,
    pub chunks: Vec<Chunk>,
}

impl Document {
    pub fn new(document_id: &str, metadata: &Value, hash: &str) -> Result<Self> {
        Ok(Document {
            created: utils::now(),
            document_id: document_id.to_string(),
            metadata: metadata.clone(),
            hash: hash.to_string(),
            chunks: vec![],
        })
    }
}

#[derive(Serialize, Deserialize, PartialEq, Clone, Debug)]
pub struct DataSourceConfig {
    pub provider_id: ProviderID,
    pub model_id: String,
    pub splitter_id: SplitterID,
    pub max_chunk_size: usize,
}

/// The `data_source_id` is the unique identifier that allows routing to the right data in SQL store
/// as well as Pinecone store. It is a generated unique ID.
#[derive(Debug, Serialize)]
pub struct DataSource {
    created: u64,
    data_source_id: String,
    config: DataSourceConfig,
}

impl DataSource {
    pub fn new(config: &DataSourceConfig) -> Self {
        return DataSource {
            created: utils::now(),
            data_source_id: utils::new_id(),
            config: config.clone(),
        };
    }

    async fn upsert(
        &self,
        credentials: Credentials,
        document_id: &str,
        text: &str,
        metadata: Value,
        // add store
    ) -> Result<()> {
        // Hash document.
        let mut hasher = blake3::Hasher::new();
        hasher.update(document_id.as_bytes());
        hasher.update(text.as_bytes());
        hasher.update(metadata.to_string().as_bytes());
        let document_hash = format!("{}", hasher.finalize().to_hex());

        let mut document = Document::new(document_id, &metadata, &document_hash)?;

        // GCP store raw text
        let bucket = match std::env::var("DUST_DATA_SOURCES_BUCKET") {
            Ok(bucket) => bucket,
            Err(_) => Err(anyhow!("DUST_DATA_SOURCES_BUCKET is not set"))?,
        };

        let bucket_path = format!("{}/{}/{}", self.data_source_id, document_id, document_hash);

        let mut object_text = Object::create(
            &bucket,
            text.as_bytes().to_vec(),
            &format!("{}/content.txt", bucket_path),
            "application/text",
        )
        .await?;

        let mut object_metadata = Object::create(
            &bucket,
            metadata.to_string().as_bytes().to_vec(),
            &format!("{}/metadata.json", bucket_path),
            "application/json",
        )
        .await?;

        // Split document in chunks
        // Embed chunks

        // Clean-up previous document chunk (pinecone)
        // Upsert new chunks (pinecone and SQL)

        Ok(())
    }

    async fn search(
        &self,
        credentials: Credentials,
        query: &str,
        top_k: usize,
        metadata_filter: Option<Value>,
    ) -> Result<Vec<Document>> {
        unimplemented!()
    }

    async fn delete(&self, document_id: &str) -> Result<()> {
        unimplemented!()
    }
}
