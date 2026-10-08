use crate::{client::Client, model::*};
use std::collections::HashMap;

struct Pending {
    identity: PublicationId,
    mutation: Mutation,
    targets: Vec<Id>,
}

#[derive(Default)]
pub struct Publications {
    receipts: HashMap<Id, PublicationReceipt>,
    pending: Vec<Pending>,
}

impl Publications {
    fn targets(mutation: &Mutation) -> Vec<Id> {
        match mutation {
            Mutation::Create { parent, .. } | Mutation::Unlink { parent, .. } => {
                vec![parent.clone()]
            }
            Mutation::Write { node, .. }
            | Mutation::Truncate { node, .. }
            | Mutation::SetAttr { node, .. }
            | Mutation::Grant { node, .. } => vec![node.clone()],
            Mutation::Rename {
                parent, new_parent, ..
            } => vec![parent.clone(), new_parent.clone()],
            Mutation::PutFiles { files } => files
                .iter()
                .flat_map(|file| {
                    std::iter::once(file.node.id.clone()).chain(file.node.parent.clone())
                })
                .collect(),
            Mutation::Member { .. } => Vec::new(),
        }
    }

    fn record(&mut self, mut targets: Vec<Id>, publication: Publication) -> Outcome {
        if let Some(node) = &publication.outcome.node {
            targets.push(node.id.clone());
        }
        for target in targets {
            let previous = self
                .receipts
                .entry(target)
                .or_insert_with(|| publication.receipt.clone());
            if previous.tenant_head < publication.receipt.tenant_head {
                *previous = publication.receipt.clone();
            }
        }
        publication.outcome
    }

    pub fn batch_fits(&self, files: usize, capacity: usize) -> bool {
        self.receipts
            .len()
            .saturating_add(files.saturating_mul(2))
            .saturating_add(
                self.pending
                    .iter()
                    .map(|pending| pending.targets.len() + 1)
                    .sum::<usize>(),
            )
            <= capacity
    }

    pub fn record_batch<'a>(
        &mut self,
        files: impl Iterator<Item = &'a FileUpdate>,
        publication: Publication,
    ) {
        let targets = files
            .flat_map(|file| std::iter::once(file.node.id.clone()).chain(file.node.parent.clone()))
            .collect();
        self.record(targets, publication);
    }

    pub async fn publish(
        &mut self,
        client: &Client,
        mutation: Mutation,
        capacity: usize,
    ) -> Result<Outcome> {
        let targets = Self::targets(&mutation);
        if self.pending.iter().any(|pending| {
            pending
                .targets
                .iter()
                .any(|target| targets.contains(target))
        }) {
            return Err(err(libc::ETIMEDOUT, "resolve prior publication with fsync"));
        }
        let reserved = self
            .pending
            .iter()
            .map(|pending| pending.targets.len() + 1)
            .sum::<usize>();
        let additional = targets
            .iter()
            .filter(|target| !self.receipts.contains_key(*target))
            .count()
            + 1;
        if self.pending.len() >= 128 || self.receipts.len() + reserved + additional > capacity {
            return Err(err(
                libc::EAGAIN,
                "publication tracking capacity; synchronize first",
            ));
        }
        let identity = client.prepare_publication(&mutation)?;
        match client.publish(identity.clone(), mutation.clone()).await {
            Ok(publication) => Ok(self.record(targets, publication)),
            Err(error) => {
                if matches!(error.code, libc::ETIMEDOUT | libc::EIO) {
                    self.pending.push(Pending {
                        identity,
                        mutation,
                        targets,
                    });
                }
                Err(error)
            }
        }
    }

    pub async fn resolve(&mut self, client: &Client, node: Option<&str>) -> Result<bool> {
        let mut resolved = false;
        while let Some(index) = self.pending.iter().position(|pending| {
            node.is_none_or(|node| pending.targets.iter().any(|target| target == node))
        }) {
            let pending = &self.pending[index];
            let publication = client
                .publish(pending.identity.clone(), pending.mutation.clone())
                .await?;
            let pending = self.pending.remove(index);
            self.record(pending.targets, publication);
            resolved = true;
        }
        Ok(resolved)
    }

    pub async fn persist(&mut self, client: &Client, node: Option<&str>) -> Result<()> {
        let receipt = match node {
            Some(node) => self.receipts.get(node),
            None => self
                .receipts
                .values()
                .max_by_key(|receipt| receipt.tenant_head),
        }
        .cloned();
        if let Some(receipt) = receipt {
            let confirmed_head = receipt.tenant_head;
            let confirmation = client.persist_through(receipt).await?;
            if confirmation.incarnation != client.session.incarnation {
                return Err(err(libc::ESTALE, "persistence incarnation changed"));
            }
            self.receipts
                .retain(|_, candidate| candidate.tenant_head > confirmed_head);
        }
        Ok(())
    }
}
