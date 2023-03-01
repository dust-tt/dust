use crate::datasources::splitter::SplitterID;
use crate::providers::provider::ProviderID;
use crate::run::Credentials;
use crate::stores::{sqlite::SQLiteStore, store::Store};
use crate::utils;
use anyhow::Result;
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
/// covers both the original document text and the document metadata and is used to no-op in case of
/// match.
pub struct Document {
    pub created: u64,
    pub document_id: String,
    pub metadata: Value,
    pub hash: String,
    pub chunks: Vec<Chunk>,
}

#[derive(Serialize, Deserialize, PartialEq, Clone, Debug)]
pub struct DataSourceConfig {
    pub provider_id: ProviderID,
    pub model_id: String,
    pub splitter_id: SplitterID,
    pub max_chunk_size: usize,
}

/// The `data_source_id` is the unique identifier that allows routing to the right data in SQL store
/// as well as Pinecone store.
#[derive(Debug, Serialize)]
pub struct DataSource {
    created: u64,
    data_source_id: String,
    config: DataSourceConfig,
}

impl DataSource {
    async fn upsert(
        &self,
        credentials: Credentials,
        document_id: &str,
        text: &str,
        metadata: Value,
    ) -> Result<()> {
        // Hash document.
        let mut hasher = blake3::Hasher::new();
        hasher.update(text.as_bytes());
        let document_hash = format!("{}", hasher.finalize().to_hex());

        // GCP store raw text if needed
        // Check if the document exists and check hash

        // Split document in chunks
        // Embed chunks

        // Clean-up previous document chunk (pinecone)
        // Upsert new chunks (pinecone and SQL)

        // Questions:
        // Embed chunks may be a long-ish process?
        // Alternatives are:
        // Synchronous, or async with retries
        // Let's start with synchronous here as this might not be too slow

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
