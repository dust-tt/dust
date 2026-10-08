use crate::memory::{Budget, Reservation};
use anyhow::{Result, ensure};
use roaring::RoaringBitmap;
use std::{sync::Arc, time::Instant};

pub const CHUNK_SLOTS: u32 = 4096;
const SINGLETON_HEADER: [u8; 4] = [b'M', b'B', 1, 0];
const BITMAP_HEADER: [u8; 4] = [b'M', b'B', 1, 1];
const BITMAP_WORK_BYTES: usize = 32 * 1024;
const CONTAINER_ALLOWANCE: usize = 512;
pub const MAX_ENCODED_BYTES: usize = 4 + 16 + 2 * CHUNK_SLOTS as usize;

pub fn split_slot(slot: u32) -> (u32, u16) {
    (slot / CHUNK_SLOTS, (slot % CHUNK_SLOTS) as u16)
}

pub fn join_slot(block: u32, offset: u16) -> Result<u32> {
    ensure!(block <= u32::MAX / CHUNK_SLOTS, "membership block range");
    ensure!(u32::from(offset) < CHUNK_SLOTS, "membership offset range");
    Ok(block * CHUNK_SLOTS + u32::from(offset))
}

enum Contents {
    Empty,
    Singleton(u16),
    Bitmap(RoaringBitmap),
}

pub struct MembershipChunk {
    contents: Contents,
    reservation: Reservation,
}

pub struct EncodedChunk {
    bytes: Vec<u8>,
    _reservation: Reservation,
}

impl AsRef<[u8]> for EncodedChunk {
    fn as_ref(&self) -> &[u8] {
        &self.bytes
    }
}

impl MembershipChunk {
    pub fn empty(budget: &Arc<Budget>, deadline: Instant) -> Result<Self> {
        Ok(Self {
            contents: Contents::Empty,
            reservation: budget.acquire(size_of::<Self>(), deadline)?,
        })
    }

    pub fn decode(bytes: &[u8], budget: &Arc<Budget>, deadline: Instant) -> Result<Self> {
        ensure!(bytes.len() >= 4, "short membership value");
        ensure!(bytes.len() <= MAX_ENCODED_BYTES, "membership value size");
        let (contents, reservation) = if bytes[..4] == SINGLETON_HEADER {
            ensure!(bytes.len() == 6, "singleton encoding length");
            let offset = u16::from_le_bytes([bytes[4], bytes[5]]);
            ensure!(u32::from(offset) < CHUNK_SLOTS, "membership offset range");
            (
                Contents::Singleton(offset),
                budget.acquire(size_of::<Self>(), deadline)?,
            )
        } else {
            ensure!(bytes[..4] == BITMAP_HEADER, "membership encoding version");
            validate_roaring(&bytes[4..])?;
            let reservation = budget.acquire(size_of::<Self>() + BITMAP_WORK_BYTES, deadline)?;
            let bitmap = RoaringBitmap::deserialize_from(&bytes[4..])?;
            (Contents::Bitmap(bitmap), reservation)
        };
        let mut chunk = Self {
            contents,
            reservation,
        };
        chunk.reconcile_charge()?;
        Ok(chunk)
    }

    pub fn len(&self) -> u64 {
        match &self.contents {
            Contents::Empty => 0,
            Contents::Singleton(_) => 1,
            Contents::Bitmap(bitmap) => bitmap.len(),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn contains(&self, offset: u16) -> bool {
        match &self.contents {
            Contents::Empty => false,
            Contents::Singleton(value) => *value == offset,
            Contents::Bitmap(bitmap) => bitmap.contains(u32::from(offset)),
        }
    }

    pub fn iter(&self) -> impl Iterator<Item = u16> + '_ {
        let singleton = match &self.contents {
            Contents::Singleton(value) => Some(*value),
            _ => None,
        };
        let bitmap = match &self.contents {
            Contents::Bitmap(bitmap) => Some(bitmap),
            _ => None,
        };
        singleton.into_iter().chain(
            bitmap
                .into_iter()
                .flat_map(|bitmap| bitmap.iter().map(|value| value as u16)),
        )
    }

    pub fn set(&mut self, offset: u16, present: bool) -> Result<bool> {
        ensure!(u32::from(offset) < CHUNK_SLOTS, "membership offset range");
        if self.contains(offset) == present {
            return Ok(false);
        }
        if matches!(&self.contents, Contents::Bitmap(_))
            || (present && matches!(&self.contents, Contents::Singleton(_)))
        {
            let additional = size_of::<Self>() + BITMAP_WORK_BYTES - self.reservation.bytes();
            self.reservation.try_grow(additional)?;
        }
        match &mut self.contents {
            Contents::Empty => self.contents = Contents::Singleton(offset),
            Contents::Singleton(value) if present => {
                self.contents =
                    Contents::Bitmap([u32::from(*value), u32::from(offset)].into_iter().collect());
            }
            Contents::Singleton(_) => self.contents = Contents::Empty,
            Contents::Bitmap(bitmap) => {
                if present {
                    bitmap.insert(u32::from(offset));
                } else {
                    bitmap.remove(u32::from(offset));
                }
                if bitmap.len() == 1 {
                    self.contents = Contents::Singleton(bitmap.min().expect("one member") as u16);
                }
            }
        }
        self.reconcile_charge()?;
        Ok(true)
    }

    pub fn encode(&self, budget: &Arc<Budget>) -> Result<Option<EncodedChunk>> {
        let size = match &self.contents {
            Contents::Empty => return Ok(None),
            Contents::Singleton(_) => 6,
            Contents::Bitmap(bitmap) => 4 + bitmap.serialized_size(),
        };
        ensure!(size <= MAX_ENCODED_BYTES, "membership encoded size");
        let reservation = budget.acquire(size + size_of::<EncodedChunk>(), Instant::now())?;
        let mut bytes = Vec::with_capacity(size);
        match &self.contents {
            Contents::Empty => unreachable!(),
            Contents::Singleton(value) => {
                bytes.extend_from_slice(&SINGLETON_HEADER);
                bytes.extend_from_slice(&value.to_le_bytes());
            }
            Contents::Bitmap(bitmap) => {
                bytes.extend_from_slice(&BITMAP_HEADER);
                bitmap.serialize_into(&mut bytes)?;
                validate_roaring(&bytes[4..])?;
            }
        }
        Ok(Some(EncodedChunk {
            bytes,
            _reservation: reservation,
        }))
    }

    pub fn charged_bytes(&self) -> usize {
        self.reservation.bytes()
    }

    fn reconcile_charge(&mut self) -> Result<()> {
        let heap = match &self.contents {
            Contents::Bitmap(bitmap) => {
                let stats = bitmap.statistics();
                CONTAINER_ALLOWANCE
                    + (stats.n_bytes_array_containers
                        + stats.n_bytes_bitset_containers
                        + stats.n_bytes_run_containers) as usize
            }
            _ => 0,
        };
        self.reservation.shrink_to(size_of::<Self>() + heap)
    }
}

fn validate_roaring(bytes: &[u8]) -> Result<()> {
    ensure!(bytes.len() >= 16, "short roaring chunk");
    ensure!(
        bytes[..8] == [58, 48, 0, 0, 1, 0, 0, 0],
        "roaring chunk header"
    );
    ensure!(bytes[8..10] == [0, 0], "roaring container key");
    let count = usize::from(u16::from_le_bytes([bytes[10], bytes[11]])) + 1;
    ensure!(
        (2..=CHUNK_SLOTS as usize).contains(&count),
        "roaring chunk cardinality"
    );
    ensure!(bytes[12..16] == [16, 0, 0, 0], "roaring chunk offset");
    ensure!(bytes.len() == 16 + 2 * count, "roaring chunk length");
    let mut previous = None;
    for pair in bytes[16..].as_chunks::<2>().0 {
        let value = u16::from_le_bytes(*pair);
        ensure!(u32::from(value) < CHUNK_SLOTS, "roaring member range");
        ensure!(
            previous.is_none_or(|old| old < value),
            "roaring member order"
        );
        previous = Some(value);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunks_round_trip_boundaries_and_collapse_after_removal() {
        let budget = Budget::new(1 << 20, 0);
        for slot in [0, 4095, 4096, 8191, u32::MAX] {
            let (block, offset) = split_slot(slot);
            assert_eq!(join_slot(block, offset).unwrap(), slot);
        }
        assert!(join_slot(u32::MAX, 0).is_err());
        assert!(join_slot(0, 4096).is_err());
        let mut chunk = MembershipChunk::empty(&budget, Instant::now()).unwrap();
        assert!(chunk.encode(&budget).unwrap().is_none());
        for offset in 0..4096 {
            assert!(chunk.set(offset, true).unwrap());
        }
        let encoded = chunk.encode(&budget).unwrap().unwrap();
        let decoded = MembershipChunk::decode(encoded.as_ref(), &budget, Instant::now()).unwrap();
        assert_eq!(
            decoded.iter().collect::<Vec<_>>(),
            (0..4096).collect::<Vec<_>>()
        );
        for offset in 1..4096 {
            assert!(chunk.set(offset, false).unwrap());
        }
        let singleton = chunk.encode(&budget).unwrap().unwrap();
        assert_eq!(singleton.as_ref(), &[b'M', b'B', 1, 0, 0, 0]);
        assert_eq!(chunk.charged_bytes(), size_of::<MembershipChunk>());
        assert!(chunk.set(0, false).unwrap());
        assert!(chunk.is_empty());
        assert!(chunk.encode(&budget).unwrap().is_none());
        drop((chunk, decoded, encoded, singleton));
        assert_eq!(budget.usage().used_bytes, 0);
    }

    #[test]
    fn malformed_chunks_fail_before_decode_allocation() {
        let budget = Budget::new(1 << 20, 0);
        let mut chunk = MembershipChunk::empty(&budget, Instant::now()).unwrap();
        chunk.set(1, true).unwrap();
        chunk.set(4095, true).unwrap();
        let encoded = chunk.encode(&budget).unwrap().unwrap();
        let valid = encoded.as_ref();
        let validation_budget = Budget::new(0, 0);
        for cut in 0..valid.len() {
            assert!(
                MembershipChunk::decode(&valid[..cut], &validation_budget, Instant::now()).is_err()
            );
        }
        for (index, value) in [(2, 2), (8, 255), (12, 1), (16, 0), (21, 255)] {
            let mut corrupt = valid.to_vec();
            corrupt[index] = value;
            assert!(MembershipChunk::decode(&corrupt, &validation_budget, Instant::now()).is_err());
        }
        let mut trailing = valid.to_vec();
        trailing.push(0);
        assert!(MembershipChunk::decode(&trailing, &validation_budget, Instant::now()).is_err());
        assert!(
            MembershipChunk::decode(
                &[b'M', b'B', 1, 0, 0, 16],
                &validation_budget,
                Instant::now()
            )
            .is_err()
        );
        assert_eq!(validation_budget.usage().rejections, 0);
    }

    #[test]
    fn failed_growth_preserves_singleton_membership_and_its_charge() {
        let budget = Budget::new(size_of::<MembershipChunk>(), 0);
        let mut chunk = MembershipChunk::empty(&budget, Instant::now()).unwrap();
        chunk.set(7, true).unwrap();
        assert!(chunk.set(8, true).is_err());
        assert!(chunk.contains(7));
        assert!(!chunk.contains(8));
        assert_eq!(chunk.len(), 1);
        assert_eq!(budget.usage().used_bytes, size_of::<MembershipChunk>());
        assert!(!chunk.set(7, true).unwrap());
        assert!(chunk.set(4096, true).is_err());
    }
}
