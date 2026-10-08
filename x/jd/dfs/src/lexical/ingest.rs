use super::index::{Fields, MAX_TEXT_BYTES};
use crate::{
    memory::{Budget, Reservation},
    model::{CHUNK_BYTES, MAX_IO_BYTES},
};
use anyhow::{Result, ensure};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use tantivy::schema::{Document, Field, OwnedValue};

pub const INGEST_BYTES: usize = 32 << 20;
const EXTRACTION_SCRATCH_BYTES: usize = 2 * MAX_IO_BYTES + 2 * CHUNK_BYTES;

pub struct IngestDocument {
    fields: Fields,
    slot: OwnedValue,
    text: OwnedValue,
    _reservation: Reservation,
}

impl IngestDocument {
    pub fn extract(
        fields: Fields,
        slot: u32,
        size: usize,
        budget: &Arc<Budget>,
        mut read: impl FnMut(usize, usize) -> Result<Vec<u8>>,
    ) -> Result<(&'static str, Option<Self>)> {
        ensure!(size <= MAX_TEXT_BYTES as usize, "extraction size limit");
        if size == 0 {
            return Ok(("empty", None));
        }
        let mut reservation = budget.acquire(
            size + size_of::<Self>() + EXTRACTION_SCRATCH_BYTES,
            Instant::now() + Duration::from_secs(10),
        )?;
        let mut bytes = Vec::with_capacity(size);
        while bytes.len() < size {
            let requested = (size - bytes.len()).min(MAX_IO_BYTES);
            let part = read(bytes.len(), requested)?;
            ensure!(
                !part.is_empty() && part.len() <= requested,
                "invalid index read length"
            );
            bytes.extend(part);
        }
        let Ok(text) = String::from_utf8(bytes) else {
            return Ok(("unsupported", None));
        };
        if text
            .chars()
            .any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t'))
        {
            return Ok(("unsupported", None));
        }
        reservation.shrink_to(text.capacity() + size_of::<Self>())?;
        Ok((
            "indexed",
            Some(Self {
                fields,
                slot: OwnedValue::U64(slot.into()),
                text: OwnedValue::Str(text),
                _reservation: reservation,
            }),
        ))
    }
}

impl Document for IngestDocument {
    type Value<'a> = &'a OwnedValue;
    type FieldsValuesIter<'a> = std::array::IntoIter<(Field, &'a OwnedValue), 3>;

    fn iter_fields_and_values(&self) -> Self::FieldsValuesIter<'_> {
        [
            (self.fields.slot, &self.slot),
            (self.fields.text, &self.text),
            (self.fields.grams, &self.text),
        ]
        .into_iter()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fields() -> Fields {
        Fields {
            slot: Field::from_field_id(0),
            text: Field::from_field_id(1),
            grams: Field::from_field_id(2),
        }
    }

    #[test]
    fn extraction_admits_before_reading_and_releases_scratch_before_queueing() {
        let budget = Budget::new(INGEST_BYTES, 1);
        let (status, document) =
            IngestDocument::extract(fields(), 7, 4, &budget, |offset, size| {
                assert_eq!((offset, size), (0, 4));
                assert!(budget.usage().used_bytes >= 4 + EXTRACTION_SCRATCH_BYTES);
                Ok(b"test".to_vec())
            })
            .unwrap();
        assert_eq!(status, "indexed");
        let document = document.unwrap();
        assert_eq!(budget.usage().used_bytes, 4 + size_of::<IngestDocument>());
        {
            let values: Vec<_> = document.iter_fields_and_values().collect();
            assert!(std::ptr::eq(values[1].1, values[2].1));
        }
        drop(document);
        assert_eq!(budget.usage().used_bytes, 0);
        let small = Budget::new(4, 1);
        assert!(
            IngestDocument::extract(fields(), 0, 4, &small, |_, _| {
                panic!("read before admission")
            })
            .is_err()
        );
    }

    #[test]
    fn failed_and_unsupported_extraction_release_all_capacity() {
        let budget = Budget::new(INGEST_BYTES, 1);
        assert!(
            IngestDocument::extract(fields(), 0, 4, &budget, |_, _| {
                anyhow::bail!("read failed")
            })
            .is_err()
        );
        assert_eq!(budget.usage().used_bytes, 0);
        for bytes in [vec![0xff], vec![0]] {
            let (status, document) =
                IngestDocument::extract(fields(), 0, 1, &budget, |_, _| Ok(bytes.clone())).unwrap();
            assert_eq!(status, "unsupported");
            assert!(document.is_none());
            assert_eq!(budget.usage().used_bytes, 0);
        }
        for bytes in [vec![], vec![b'x'; 5]] {
            assert!(
                IngestDocument::extract(fields(), 0, 4, &budget, |_, _| Ok(bytes.clone())).is_err()
            );
            assert_eq!(budget.usage().used_bytes, 0);
        }
    }
}
