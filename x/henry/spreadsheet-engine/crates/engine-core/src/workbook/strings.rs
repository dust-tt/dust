//! Shared-string arena: every distinct shared string stored once, contiguously.

use crate::value::StrRef;

#[derive(Debug, Default, Clone)]
pub struct SharedStrings {
    arena: String,
    refs: Vec<StrRef>,
}

impl SharedStrings {
    pub fn push(&mut self, s: &str) {
        let offset = self.arena.len() as u32;
        self.arena.push_str(s);
        self.refs.push(StrRef {
            offset,
            len: s.len() as u32,
        });
    }

    pub fn get(&self, idx: u32) -> Option<&str> {
        let r = self.refs.get(idx as usize)?;
        Some(&self.arena[r.offset as usize..(r.offset + r.len) as usize])
    }

    pub fn len(&self) -> usize {
        self.refs.len()
    }

    pub fn is_empty(&self) -> bool {
        self.refs.is_empty()
    }
}
