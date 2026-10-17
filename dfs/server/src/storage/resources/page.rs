use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use foundationdb::{FdbBindingError, KeySelector, RangeOption, Transaction, tuple::Subspace};

pub(crate) struct RawPage {
    pub entries: Vec<(Vec<u8>, Vec<u8>)>,
    pub next_after: Option<String>,
}

pub(crate) fn decode_cursor(
    subspace: &Subspace,
    after: &str,
    is_well_formed_entry: impl Fn(&[u8]) -> bool,
) -> Option<Vec<u8>> {
    let key = URL_SAFE_NO_PAD.decode(after).ok()?;
    (subspace.is_start_of(&key) && is_well_formed_entry(&key)).then_some(key)
}

pub(crate) fn encode_cursor(key: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(key)
}

pub(crate) async fn read_page(
    tx: &Transaction,
    subspace: &Subspace,
    after: Option<Vec<u8>>,
    limit: usize,
) -> Result<RawPage, FdbBindingError> {
    let mut range = RangeOption {
        limit: Some(limit.saturating_add(1)),
        ..RangeOption::from(subspace.range())
    };
    if let Some(after) = after {
        range.begin = KeySelector::first_greater_than(after);
    }
    let mut entries: Vec<(Vec<u8>, Vec<u8>)> = Vec::new();
    let mut next_range = Some(range);
    let mut iteration = 1;
    // Each batch's range continues from the previous batch, so reads stay sequential.
    while let Some(range) = next_range {
        let batch = tx.get_range(&range, iteration, false).await?;
        next_range = range.next_range(&batch);
        for entry in &batch {
            if entries.len() == limit {
                let next_after = entries.last().map(|(key, _)| encode_cursor(key));
                return Ok(RawPage {
                    entries,
                    next_after,
                });
            }
            entries.push((entry.key().to_vec(), entry.value().to_vec()));
        }
        iteration += 1;
    }
    Ok(RawPage {
        entries,
        next_after: None,
    })
}
