use super::*;
use std::hash::Hash;

/// Replacement capacity is allocated while readers can still use the old topology. Installation
/// swaps buffers without allocation; old buffers remain owned here until after the write guard.
pub(super) struct Growth {
    index: Option<HashMap<ObjectId, u32>>,
    parents: Option<Vec<u32>>,
    policies: Option<Vec<u32>>,
    kinds: Option<Vec<u8>>,
    children: Option<Vec<u32>>,
    free: Option<Vec<u32>>,
    grant_index: Option<HashMap<Arc<[GrantId]>, u32>>,
    grant_values: Option<Vec<Option<Policy>>>,
    grant_free: Option<Vec<u32>>,
}
impl Growth {
    pub(super) fn prepare(
        tree: &Tree,
        length: usize,
        added: usize,
        changed: usize,
    ) -> Result<Self, Error> {
        Ok(Self {
            index: table(&tree.index, tree.index.len() + added)?,
            parents: vector(&tree.parents, length)?,
            policies: vector(&tree.policies, length)?,
            kinds: vector(&tree.kinds, length)?,
            children: vector(&tree.children, length)?,
            free: vector(&tree.free, tree.free.len() + changed)?,
            grant_index: table(&tree.grants.index, tree.grants.index.len() + changed)?,
            grant_values: vector(&tree.grants.values, tree.grants.values.len() + changed)?,
            grant_free: vector(&tree.grants.free, tree.grants.free.len() + changed)?,
        })
    }
    pub(super) fn install(&mut self, tree: &mut Tree) {
        swap(&mut self.index, &mut tree.index);
        swap(&mut self.parents, &mut tree.parents);
        swap(&mut self.policies, &mut tree.policies);
        swap(&mut self.kinds, &mut tree.kinds);
        swap(&mut self.children, &mut tree.children);
        swap(&mut self.free, &mut tree.free);
        swap(&mut self.grant_index, &mut tree.grants.index);
        swap(&mut self.grant_values, &mut tree.grants.values);
        swap(&mut self.grant_free, &mut tree.grants.free);
    }
}
fn swap<T>(prepared: &mut Option<T>, current: &mut T) {
    if let Some(prepared) = prepared {
        std::mem::swap(prepared, current);
    }
}
fn vector<T: Clone>(old: &Vec<T>, required: usize) -> Result<Option<Vec<T>>, Error> {
    if old.capacity() >= required {
        return Ok(None);
    }
    let mut next = Vec::new();
    next.try_reserve_exact(required.max(old.capacity().saturating_mul(2)))
        .map_err(|_| Error::Capacity)?;
    next.extend_from_slice(old);
    Ok(Some(next))
}
fn table<K: Clone + Hash + Eq, V: Clone>(
    old: &HashMap<K, V>,
    required: usize,
) -> Result<Option<HashMap<K, V>>, Error> {
    if old.capacity() >= required {
        return Ok(None);
    }
    let mut next = HashMap::new();
    next.try_reserve(required.max(old.capacity().saturating_mul(2)))
        .map_err(|_| Error::Capacity)?;
    next.extend(old.iter().map(|(k, v)| (k.clone(), v.clone())));
    Ok(Some(next))
}
