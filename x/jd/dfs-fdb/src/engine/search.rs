use super::indexing::Checkpoint;
use super::*;

#[derive(Clone, Copy)]
pub enum Authority<'a> {
    Session(&'a str),
    Token(&'a str),
}

pub(crate) struct SearchSnapshot {
    context: Context,
    pub checkpoint: Option<Checkpoint>,
}

impl SearchSnapshot {
    pub fn session(&self) -> &Session {
        &self.context.record.session
    }

    pub fn head(&self) -> u64 {
        self.context.state.head
    }

    pub fn auth_generation(&self) -> u64 {
        self.context.state.auth_generation
    }
}

impl Engine {
    pub(crate) async fn search_snapshot(&self, authority: Authority<'_>) -> Result<SearchSnapshot> {
        let context = match authority {
            Authority::Session(session) => self.context(session).await?,
            Authority::Token(token) => {
                if token.is_empty() || token.len() > 4096 {
                    return Err(err(libc::EACCES, "invalid credential length"));
                }
                let tenant = self.tenant_for_token(token)?;
                let batch = self.store.snapshot(&tenant).await?.batch();
                let credential_hash = token_hash(token);
                let credential: Credential =
                    batch
                        .load(&["credential", &credential_hash])
                        .await?
                        .ok_or_else(|| err(libc::EACCES, "credential revoked"))?;
                if credential.tenant != tenant || credential.expires_ms <= now_ms() {
                    return Err(err(libc::EACCES, "credential expired or changed"));
                }
                let state = batch
                    .load(&["state"])
                    .await?
                    .ok_or_else(|| err(libc::EIO, "tenant state missing"))?;
                Context {
                    batch,
                    state,
                    record: SessionRecord {
                        session: Session {
                            id: String::new(),
                            tenant,
                            principal: credential.principal,
                            admin: credential.admin,
                            scope: credential.scope,
                            incarnation: self.incarnation.clone(),
                            expires_ms: credential.expires_ms,
                            retry_epoch: String::new(),
                            retry_expires_ms: 0,
                        },
                        credential: credential_hash,
                        handles: 0,
                    },
                }
            }
        };
        let checkpoint = context.batch.load(&["index_checkpoint"]).await?;
        Ok(SearchSnapshot {
            context,
            checkpoint,
        })
    }

    pub(crate) async fn search_candidates(
        &self,
        snapshot: &SearchSnapshot,
        nodes: &[Id],
    ) -> Result<View> {
        if nodes.len() > 100 {
            return Err(err(libc::E2BIG, "search result capacity"));
        }
        self.search_view(&snapshot.context, nodes).await
    }
}

impl Engine {
    pub async fn validate_search(&self, session: &str, nodes: &[Id]) -> Result<View> {
        if nodes.len() > 100 {
            return Err(err(libc::E2BIG, "search result capacity"));
        }
        let context = self.context(session).await?;
        self.search_view(&context, nodes).await
    }

    async fn search_view(&self, context: &Context, nodes: &[Id]) -> Result<View> {
        let caller = &context.record.session;
        let root = caller.scope.as_ref().unwrap_or(&context.state.root);
        let mut output = Vec::new();
        for id in nodes.iter().collect::<BTreeSet<_>>() {
            let Some(mut node) = context.batch.load::<Node>(&["node", id]).await? else {
                continue;
            };
            if node.unlinked {
                continue;
            }
            let verbs = self.verbs(&context.batch, caller, id).await?;
            if verbs == 0 {
                continue;
            }
            let parent_visible = if let Some(parent) = &node.parent {
                self.verbs(&context.batch, caller, parent).await? & (LIST | TRAVERSE)
                    == LIST | TRAVERSE
            } else {
                false
            };
            let (visible_parent, visible_name) = if id == root {
                (None, "files".to_owned())
            } else if parent_visible {
                (node.parent.clone(), node.name.clone())
            } else {
                (None, format!("{}~{}", node.name, node.id))
            };
            node.parent = visible_parent.clone();
            node.name = visible_name.clone();
            output.push(ViewNode {
                node,
                visible_parent,
                visible_name,
                verbs,
            });
        }
        Ok(View {
            incarnation: self.incarnation.clone(),
            head: context.state.head,
            auth_generation: context.state.auth_generation,
            nodes: output,
        })
    }
}
