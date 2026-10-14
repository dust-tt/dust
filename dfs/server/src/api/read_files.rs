use dfs_protocol::{
    ObjectId, READ_MAX_BYTES,
    rpc::{Attr, ErrorCode, ErrorDetails, FileResult, FilesBatch},
};
use foundationdb::Transaction;
use futures::{StreamExt, TryStreamExt, stream};
use prost::{Message, encoding};

use crate::storage::{
    self,
    resources::{
        file::{self, FileResource},
        session::SessionResource,
    },
};

const CONCURRENT_FILE_READS: usize = 16;
const BATCH_RESULTS_TAG: u32 = 1;
const FILE_DATA_TAG: u32 = 3;

#[cfg(test)]
#[path = "../../tests/api/read_files_budget.rs"]
mod tests;

/**
 * @cc [owner:spolu,label:api;security] read-files-results
 * Callers MUST supply 1-256 IDs and a transaction with no staged writes. Results MUST preserve
 * order and duplicates, with either whole-file data and attributes or an error. Authorization,
 * attributes, and bytes MUST share that transaction. Unreadable objects MUST be concealed as
 * NOT_FOUND. Missing, unreadable, non-file, and invalid-block results MUST NOT suppress other
 * results. Invalid IDs MUST fail the batch; FDB failures MUST propagate unchanged for retry.
 */
/**
 * @cc [owner:spolu,label:api;performance] read-files-budget
 * Readable files over 1 MiB or unable to fit in the 4 MiB encoded batch MUST receive CAPACITY before
 * any content reads. Admission MUST follow input order and reserve space for every remaining result.
 * Budgeting MUST include attributes, errors, optional empty data, and protobuf framing. Content
 * reads MUST have bounded concurrency.
 */
pub(super) async fn read_files(
    tx: &Transaction,
    session: &SessionResource,
    object_ids: &[ObjectId],
) -> Result<FilesBatch, storage::Error<file::Error>> {
    let files = FileResource::fetch_many_for_session(tx, session, object_ids).await?;
    let mut batch = FilesBatch::default();
    let mut pending = Vec::new();
    for (index, (object_id, result)) in object_ids.iter().zip(files).enumerate() {
        let error = match result {
            Ok((file, object)) => {
                pending.push((index, file, object));
                ErrorDetails {
                    code: ErrorCode::Capacity.into(),
                }
            }
            Err(error) => error.into(),
        };
        batch.results.push(FileResult {
            object_id: *object_id,
            object: None,
            data: None,
            error: Some(error),
        });
    }
    // Reserve every fallback error before selecting files, including duplicate IDs.
    let mut budget_bytes = batch.encoded_len();
    let mut reads = Vec::new();
    for (index, file, object) in pending {
        if object.size > u64::from(READ_MAX_BYTES) {
            continue;
        }
        let length = object.size as u32;
        let result = &mut batch.results[index];
        let fallback_bytes = encoding::message::encoded_len(BATCH_RESULTS_TAG, result);
        let success_bytes = success_encoded_len(result.object_id, &object, length as usize);
        let next_budget_bytes = budget_bytes - fallback_bytes + success_bytes;
        if next_budget_bytes > crate::MAX_MESSAGE_SIZE_BYTES {
            continue;
        }
        budget_bytes = next_budget_bytes;
        result.object = Some(object);
        result.error = None;
        reads.push((index, file, length));
    }
    let contents: Vec<_> = stream::iter(reads)
        .map(|(index, file, length)| async move {
            let data = match file.read(tx, 0, length).await {
                Ok(data) => Ok(data),
                Err(storage::Error::Resource(error)) => Err(error),
                Err(error) => return Err(error),
            };
            Ok((index, data))
        })
        .buffer_unordered(CONCURRENT_FILE_READS)
        .try_collect()
        .await?;
    for (index, data) in contents {
        let result = &mut batch.results[index];
        match data {
            Ok(data) => result.data = Some(data),
            Err(error) => {
                result.object = None;
                result.error = Some(error.into());
            }
        }
    }
    Ok(batch)
}

// Calculate both length prefixes without allocating or downloading the file's contents.
fn success_encoded_len(object_id: ObjectId, object: &Attr, data_len: usize) -> usize {
    let result = FileResult {
        object_id,
        object: Some(object.clone()),
        data: None,
        error: None,
    };
    let result_len = result.encoded_len()
        + encoding::key_len(FILE_DATA_TAG)
        + encoding::encoded_len_varint(data_len as u64)
        + data_len;
    encoding::key_len(BATCH_RESULTS_TAG)
        + encoding::encoded_len_varint(result_len as u64)
        + result_len
}
