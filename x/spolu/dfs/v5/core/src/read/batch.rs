use super::*;
use dfs_protocol::{MAX_STAT, rpc::*};
use prost::Message;

impl View {
    /// @cc [owner:spolu,label:security;concurrency] validation-is-current-authority
    /// Every check MUST reauthorize at this view before comparing revisions. Results MUST preserve
    /// input order. Directory checks MUST reject projections and empty or unknown proof formats.
    /// No partial result MAY establish freshness after this view's transaction has failed.
    pub async fn validate_batch(&self, request: ValidateRequest) -> Result<ValidateResponse> {
        if !(1..=MAX_STAT).contains(&request.checks.len()) {
            return Err(status(ErrorCode::InvalidInput));
        }
        let results = stream::iter(request.checks)
            .map(|check| async move {
                let result = match self.validate_one(check).await {
                    Ok(unchanged) => ValidationResult {
                        outcome: if unchanged {
                            ValidationOutcome::Unchanged
                        } else {
                            ValidationOutcome::Changed
                        }
                        .into(),
                        error: None,
                    },
                    Err(error) => {
                        let code = dfs_protocol::error::code(&error);
                        if matches!(code, ErrorCode::Unavailable | ErrorCode::Internal) {
                            return Err(error);
                        }
                        let outcome = match code {
                            ErrorCode::Forbidden => ValidationOutcome::Denied,
                            ErrorCode::NotFound => ValidationOutcome::Missing,
                            _ => ValidationOutcome::Error,
                        };
                        ValidationResult {
                            outcome: outcome.into(),
                            error: Some(ErrorDetails { code: code.into() }),
                        }
                    }
                };
                Ok::<_, Status>(result)
            })
            .buffered(16)
            .try_collect()
            .await?;
        Ok(ValidateResponse {
            results,
            view: self.read_view(),
        })
    }
    async fn validate_one(&self, request: ValidationCheck) -> Result<bool> {
        use validation_check::Check;
        let check = request
            .check
            .ok_or_else(|| status(ErrorCode::InvalidInput))?;
        let id = match &check {
            Check::File(r) => r.object_id,
            Check::Directory(r) => r.object_id,
        };
        if id.is_virtual() {
            return Err(status(ErrorCode::Unsupported));
        }
        let record = self.object(&id).await?;
        if !self.authorized(&record).await? {
            return Err(status(ErrorCode::Forbidden));
        }
        match check {
            Check::File(r) => {
                if record.object.directory {
                    return Err(status(ErrorCode::IsDirectory));
                }
                Ok(!r.revision.is_empty() && r.revision == record.object.revision)
            }
            Check::Directory(r) => {
                if !record.object.directory {
                    return Err(status(ErrorCode::NotDirectory));
                }
                let token = self.listing_token(&id).await?;
                Ok(!token.is_empty() && token == r.listing_token)
            }
        }
    }
    /// @cc [owner:spolu,label:api;performance;concurrency] bounded-coherent-whole-files
    /// Returned attributes and bytes MUST share this FDB snapshot. Every input MUST have either one
    /// ordered result or an explicit omitted ID. Oversized files MUST fail individually; the encoded
    /// response MUST fit 4 MiB, and omitted files MUST NOT be downloaded to discover that they cannot fit.
    pub async fn read_files(&self, request: ReadFilesRequest) -> Result<ReadFilesResponse> {
        if !(1..=MAX_STAT).contains(&request.object_ids.len()) {
            return Err(status(ErrorCode::InvalidInput));
        }
        let mut response = ReadFilesResponse {
            view: self.read_view(),
            ..Default::default()
        };
        // Reserve the largest possible envelope, error and omitted-ID overhead before fetching bytes.
        let mut remaining = MAX_REPLY - MAX_STAT * 512;
        for id in request.object_ids {
            let result = async {
                let object = self.session_stat(&id).await?;
                if object.directory {
                    return Err(status(ErrorCode::IsDirectory));
                }
                if object.size > dfs_protocol::MAX_IO as u64 {
                    return Err(status(ErrorCode::Capacity));
                }
                let weight = object.size as usize + object.encoded_len() + 64;
                if weight > remaining {
                    return Ok(None);
                }
                let read = self
                    .read(ReadRequest {
                        object_id: id,
                        offset: 0,
                        length: object.size as u32,
                        revision: object.revision,
                    })
                    .await?;
                remaining -= weight;
                Ok(Some(FileResult {
                    object_id: id,
                    object: Some(read.object),
                    data: Some(read.data),
                    error: None,
                }))
            }
            .await;
            match result {
                Ok(Some(result)) => response.results.push(result),
                Ok(None) => response.omitted_ids.push(id),
                Err(error) => response.results.push(FileResult {
                    object_id: id,
                    error: Some(ErrorDetails {
                        code: dfs_protocol::error::code(&error).into(),
                    }),
                    ..Default::default()
                }),
            }
        }
        if response.encoded_len() > MAX_REPLY {
            return Err(status(ErrorCode::Capacity));
        }
        Ok(response)
    }
}
