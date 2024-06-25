use anyhow::{anyhow, Result};
use cloud_storage::Object;
use serde::{Deserialize, Serialize};
use tokio::try_join;
use tracing::info;

use crate::utils;

use super::data_source::{DataSource, Document, Section};

#[derive(Serialize, Deserialize, Debug)]
pub struct FileStorageDocument {
    pub document_id: String,
    pub full_text: String,
    pub sections: Section,
}

impl FileStorageDocument {
    pub async fn get_bucket() -> Result<String> {
        match std::env::var("DUST_DATA_SOURCES_BUCKET") {
            Ok(bucket) => Ok(bucket),
            Err(_) => Err(anyhow!("DUST_DATA_SOURCES_BUCKET is not set")),
        }
    }

    pub async fn get_stored_document(
        data_source: &DataSource,
        document_created: u64,
        document_id_hash: &str,
        document_hash: &str,
    ) -> Result<FileStorageDocument> {
        let file_path = FileStorageDocument::get_document_file_path(
            data_source,
            document_created,
            document_id_hash,
            document_hash,
        );
        let bucket = FileStorageDocument::get_bucket().await?;

        let bytes = Object::download(&bucket, &file_path).await?;

        match String::from_utf8(bytes) {
            Ok(content) => Ok(serde_json::from_str(&content)?),
            Err(err) => Err(anyhow!("Failed to retrieve stored document: {}", err)),
        }
    }

    pub fn get_document_file_path(
        data_source: &DataSource,
        document_created: u64,
        document_id_hash: &str,
        document_hash: &str,
    ) -> String {
        let ds_bucket_path = format!(
            "{}/{}",
            data_source.project().project_id(),
            data_source.internal_id()
        );

        let filename = format!("{}_{}", document_created, document_hash);

        format!("{}/{}/{}.json", ds_bucket_path, document_id_hash, filename)
    }

    pub async fn save_document_in_file_storage(
        data_source: &DataSource,
        document: &Document,
        document_id_hash: &str,
        full_text: &str,
        text: Section,
    ) -> Result<()> {
        let bucket = FileStorageDocument::get_bucket().await?;

        let data_source_project_id = data_source.project().project_id();
        let data_source_internal_id = data_source.internal_id();

        let document_hash = &document.hash;
        let document_id = &document.document_id;

        // TODO(2024-06-03 flav) Delete once fully migrated to new format.
        // Legacy.
        let legacy_bucket_path = format!(
            "{}/{}/{}",
            data_source_project_id, data_source_internal_id, document_id_hash
        );

        let document_id_path = format!("{}/document_id.txt", legacy_bucket_path);
        let content_path = format!("{}/{}/content.txt", legacy_bucket_path, document_hash);

        // New.
        let document_file_path = FileStorageDocument::get_document_file_path(
            data_source,
            document.created,
            document_id_hash,
            document_hash,
        );
        let file_storage_document = FileStorageDocument {
            document_id: document_id.to_string(),
            full_text: full_text.to_string(),
            sections: text,
        };
        let serialized_document = serde_json::to_vec(&file_storage_document)?;

        let now = utils::now();
        let _ = try_join!(
            // TODO(2024-06-03 flav) Delete once fully migrated to new format.
            // Legacy.
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
            // New logic.
            Object::create(
                &bucket,
                serialized_document,
                &document_file_path,
                "application/json",
            ),
        )?;

        info!(
            data_source_internal_id = data_source_internal_id,
            document_id = document_id,
            duration = utils::now() - now,
            // Legacy.
            legacy_blob_url = format!("gs://{}/{}", bucket, content_path),
            // New.
            blob_url = format!("gs://{}/{}", bucket, document_file_path),
            "Created document blob"
        );

        Ok(())
    }
}
