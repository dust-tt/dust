use anyhow::{anyhow, Result};
use cloud_storage::Object;
use serde::{Deserialize, Serialize};
use tokio::try_join;
use tracing::info;

use crate::utils;

use super::data_source::{DataSource, Section};

#[derive(Serialize, Deserialize)]
pub struct FileStorageDocument {
    document_id: String,
    full_text: String,
    sections: Section,
}

impl FileStorageDocument {
    // Should live on DataSource instead?
    pub async fn get_bucket() -> Result<String> {
        match std::env::var("DUST_DATA_SOURCES_BUCKET") {
            Ok(bucket) => Ok(bucket),
            Err(_) => Err(anyhow!("DUST_DATA_SOURCES_BUCKET is not set")),
        }
    }

    pub fn get_document_file_path(data_source: &DataSource, document_id_hash: &str) -> String {
        let ds_bucket_path = format!(
            "{}/{}",
            data_source.project().project_id(),
            data_source.internal_id()
        );

        format!("{}/{}.txt", ds_bucket_path, document_id_hash)
    }

    pub async fn save_document_in_file_storage(
        data_source: &DataSource,
        document_id: &str,
        document_id_hash: &str,
        document_hash: &str,
        full_text: &str,
        text: Section,
    ) -> Result<()> {
        let bucket = FileStorageDocument::get_bucket().await?;

        let data_source_project_id = data_source.project().project_id();
        let data_source_internal_id = data_source.internal_id();

        // TODO(2024-06-03 flav) Delete once fully migrated to new format.
        // Legacy.
        let legacy_bucket_path = format!(
            "{}/{}/{}",
            data_source_project_id, data_source_internal_id, document_id_hash
        );

        let document_id_path = format!("{}/document_id.txt", legacy_bucket_path);
        let content_path = format!("{}/{}/content.txt", legacy_bucket_path, document_hash);

        // New.
        let document_file_path =
            FileStorageDocument::get_document_file_path(data_source, document_id_hash);
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

    pub async fn delete(data_source: &DataSource, document_id_hash: &str) -> Result<()> {
        let bucket = FileStorageDocument::get_bucket().await?;
        let document_file_path =
            FileStorageDocument::get_document_file_path(data_source, document_id_hash);

        Object::delete(&bucket, &document_file_path).await?;

        Ok(())
    }
}
