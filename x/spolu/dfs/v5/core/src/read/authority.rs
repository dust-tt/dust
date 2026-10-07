use super::*;
use crate::tree::{Access, Proof, TenantTree};
use dfs_protocol::{ObjectId, Revision};
use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::Instant,
};

/// @cc [owner:spolu,label:security;concurrency] pinned-permission-generation
/// Every decision in an authority context MUST use one tenant, root, incarnation and generation.
/// Missing/mismatched objects, changed generations and stale proofs MUST invalidate the context;
/// callers MUST discard all results or private mutations and retry the whole operation in FDB.
/// The tree's memory reservation MUST remain owned for the full lifetime of every pinned context.
pub struct Authority {
    keys: Keys,
    tree: Arc<TenantTree>,
    proof: Proof,
    invalid: AtomicBool,
}
impl Authority {
    pub fn pin(tenant: &str, tree: Arc<TenantTree>) -> Result<Arc<Self>> {
        let proof = tree.proof();
        tree.check_proof(proof, Instant::now())
            .map_err(|_| status(ErrorCode::StaleView))?;
        Ok(Arc::new(Self {
            keys: Keys::new(tenant)?,
            tree,
            proof,
            invalid: AtomicBool::new(false),
        }))
    }
    pub fn check(&self) -> Result<()> {
        if self.invalid.load(Ordering::Acquire)
            || self.tree.check_proof(self.proof, Instant::now()).is_err()
        {
            return Err(status(ErrorCode::StaleView));
        }
        Ok(())
    }
    pub(super) fn decision(
        &self,
        record: &Record,
        grants: &[crate::tree::GrantId],
    ) -> Result<bool> {
        let id = record.object.id.real().map_err(failed)?;
        let parent = record
            .parent
            .as_ref()
            .map(|p| p.id.real())
            .transpose()
            .map_err(failed)?;
        match self
            .tree
            .authorize_object(id, parent, grants, Instant::now())
        {
            Ok((proof, access)) if self.same_generation(proof) && access != Access::Fallback => {
                Ok(access == Access::Allowed)
            }
            _ => self.invalidate(),
        }
    }
    fn filter(&self, ids: &[ObjectId], grants: &[crate::tree::GrantId]) -> Result<Vec<bool>> {
        match self.tree.authorize(ids, grants, Instant::now()) {
            Ok((proof, decisions)) if self.same_generation(proof) => Ok(decisions),
            _ => self.invalidate(),
        }
    }
    pub fn filter_candidates(
        &self,
        ids: Vec<ObjectId>,
        grants: &[crate::tree::GrantId],
    ) -> Result<Vec<ObjectId>> {
        if ids.len() > crate::tree::MAX_AUTH_BATCH {
            return Err(status(ErrorCode::InvalidInput));
        }
        let allowed = self.filter(&ids, grants)?;
        Ok(ids
            .into_iter()
            .zip(allowed)
            .filter_map(|(id, allowed)| allowed.then_some(id))
            .collect())
    }
    fn same_generation(&self, proof: Proof) -> bool {
        proof.incarnation == self.proof.incarnation && proof.generation == self.proof.generation
    }
    fn invalidate<T>(&self) -> Result<T> {
        self.invalid.store(true, Ordering::Release);
        Err(status(ErrorCode::StaleView))
    }
    fn revision(&self) -> Revision {
        use sha2::{Digest, Sha256};
        let mut digest = Sha256::new();
        digest.update(b"ram-authority-v5");
        digest.update(self.proof.incarnation.as_bytes());
        digest.update(self.proof.generation.to_be_bytes());
        let bytes = digest.finalize();
        let mut revision = [0; 16];
        revision.copy_from_slice(&bytes[..16]);
        revision.into()
    }
}
impl View {
    pub fn bind_ram_authority(&mut self, authority: Arc<Authority>) -> Result<()> {
        if authority.keys != self.keys || self.root.real().map_err(failed)? != authority.tree.root()
        {
            return Err(status(ErrorCode::Forbidden));
        }
        authority.check()?;
        self.authorization_view = authority.revision();
        self.authority = Some(authority);
        Ok(())
    }
    pub fn check_authority(&self) -> Result<()> {
        match &self.authority {
            Some(authority) => authority.check(),
            None => Ok(()),
        }
    }
    /// @cc [owner:spolu,label:security;concurrency] private-creation-authority
    /// Only a successfully prepared Create in this same transaction MAY register a new object here.
    /// Its parent MUST already be authorized in the pinned generation. Reuse MUST still check that
    /// generation's freshness; this exception MUST NOT admit objects created by another transaction.
    pub(crate) fn created(&self, id: ObjectRef) {
        self.created.lock().insert(id);
    }
    /// @cc [owner:spolu,label:security;performance] shared-search-permission-evaluator
    /// Warm search filtering MUST use the same complete-tree evaluator as filesystem authorization,
    /// under one generation for the whole bounded candidate batch. Unknown candidates MUST be
    /// excluded. Without a usable tree, each proof MUST use this single fresh FDB snapshot.
    pub async fn filter_search_candidates(&self, ids: Vec<ObjectId>) -> Result<Vec<ObjectId>> {
        if ids.len() > crate::tree::MAX_AUTH_BATCH {
            return Err(status(ErrorCode::InvalidInput));
        }
        if let Some(authority) = &self.authority {
            return authority.filter_candidates(ids, &self.grants);
        }
        stream::iter(ids)
            .map(|id| async move {
                match self.stat(&ObjectRef::Object(id)).await {
                    Ok(_) => Ok(Some(id)),
                    Err(error) if dfs_protocol::error::code(&error) == ErrorCode::NotFound => {
                        Ok(None)
                    }
                    Err(error) => Err(error),
                }
            })
            .buffered(16)
            .try_filter_map(|id| async move { Ok(id) })
            .try_collect()
            .await
    }
}
