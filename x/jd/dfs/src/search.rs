use super::*;

pub(super) fn grant_token(node: &str, subject: &str) -> Id {
    let mut hash = Sha256::new();
    hash.update((node.len() as u64).to_le_bytes());
    hash.update(node.as_bytes());
    hash.update(subject.as_bytes());
    format!("{:x}", hash.finalize())
}

pub fn node_label(tenant: &str, node: &str) -> Id {
    let mut hash = Sha256::new();
    hash.update(b"dfs-search-node-v1");
    hash.update((tenant.len() as u64).to_le_bytes());
    hash.update(tenant.as_bytes());
    hash.update(node.as_bytes());
    format!("{:x}", hash.finalize())
}

struct SearchPermissions<'a, 'db> {
    reader: &'a Reader<'db>,
    session: &'a Session,
    subjects: Vec<Id>,
    nodes: BTreeMap<Id, Node>,
    inherited: BTreeMap<Id, (u16, bool)>,
}

impl SearchPermissions<'_, '_> {
    fn node(&mut self, id: &str) -> Result<Node> {
        if let Some(node) = self.nodes.get(id) {
            return Ok(node.clone());
        }
        let node = self.reader.node(&self.session.tenant, id)?;
        self.nodes.insert(id.to_owned(), node.clone());
        Ok(node)
    }

    fn verbs(&mut self, id: &str) -> Result<u16> {
        let mut chain = Vec::new();
        let mut seen = BTreeSet::new();
        let mut next = Some(id.to_owned());
        let mut inherited = (0, self.session.scope.is_none());
        while let Some(current) = next {
            if let Some(cached) = self.inherited.get(&current) {
                inherited = *cached;
                break;
            }
            if !seen.insert(current.clone()) {
                return Err(err(libc::ELOOP, "invalid ancestry"));
            }
            let node = self.node(&current)?;
            next = node.parent.clone();
            chain.push(node);
        }
        for node in chain.into_iter().rev() {
            if self.session.admin {
                inherited.0 = ALL;
            } else {
                for subject in &self.subjects {
                    inherited.0 |= self
                        .reader
                        .get::<u16>(
                            "metadata",
                            key(&self.session.tenant, &["grant_by_node", &node.id, subject]),
                        )?
                        .unwrap_or(0);
                }
            }
            inherited.1 |= self.session.scope.as_ref() == Some(&node.id);
            self.inherited.insert(node.id, inherited);
        }
        Ok(if inherited.1 { inherited.0 } else { 0 })
    }
}

impl Engine {
    pub fn search_grants(&self, session: &str) -> Result<SearchGrants> {
        let session = self.session(session)?;
        let reader = self.store.reader();
        self.search_grants_at(&reader, &session)
            .map(|(grants, _)| grants)
    }

    fn search_grants_at(
        &self,
        reader: &Reader<'_>,
        session: &Session,
    ) -> Result<(SearchGrants, BTreeMap<Id, Id>)> {
        let state = reader.state(&session.tenant)?;
        let mut roots = BTreeMap::new();
        let mut metadata = BTreeSet::new();
        let mut read = BTreeSet::new();
        if !session.admin {
            for subject in self.subjects(reader, session)? {
                for (_, (node, verbs)) in reader.scan::<(Id, u16)>(
                    "metadata",
                    key(&session.tenant, &["grant_by_subject", &subject]),
                )? {
                    if verbs != 0 {
                        let token = grant_token(&node, &subject);
                        if verbs & READ != 0 {
                            read.insert(token.clone());
                        }
                        roots.insert(token.clone(), node_label(&session.tenant, &node));
                        metadata.insert(token);
                    }
                    if metadata.len() > 4096 {
                        return Err(err(libc::EOVERFLOW, "search grant capacity"));
                    }
                }
            }
        }
        Ok((
            SearchGrants {
                incarnation: self.incarnation.clone(),
                head: state.head,
                auth_generation: state.auth_generation,
                namespace_head: reader
                    .get("metadata", key(&session.tenant, &["search_namespace_head"]))?
                    .unwrap_or(0),
                admin: session.admin,
                scope: session.scope.clone(),
                metadata: metadata.into_iter().collect(),
                read: read.into_iter().collect(),
            },
            roots,
        ))
    }

    pub fn search_context(&self, session: &str, indexed: &IndexBoundary) -> Result<SearchContext> {
        let session = self.session(session)?;
        if indexed.tenant != session.tenant || indexed.incarnation != self.incarnation {
            return Err(err(libc::EIO, "search index boundary unavailable"));
        }
        let reader = self.store.reader();
        let (grants, roots) = self.search_grants_at(&reader, &session)?;
        if indexed.head > grants.head {
            return Err(err(libc::EIO, "search index ahead of source"));
        }
        let mut cursor = grants.namespace_head;
        let mut excluded = BTreeSet::new();
        let mut events = 0;
        let mut complete = true;
        while cursor > indexed.head {
            if events == 256 {
                complete = false;
                break;
            }
            let Some(change) = reader.get::<SearchNamespaceChange>(
                "metadata",
                key(
                    &session.tenant,
                    &["search_namespace_change", &format!("{cursor:020}")],
                ),
            )?
            else {
                complete = false;
                break;
            };
            if change.previous >= cursor {
                return Err(err(libc::EIO, "invalid search namespace journal"));
            }
            excluded.extend(change.roots);
            cursor = change.previous;
            events += 1;
        }
        Ok(SearchContext {
            grants,
            roots,
            excluded: excluded.into_iter().collect(),
            complete,
        })
    }

    pub fn validate_search(&self, session: &str, nodes: &[Id]) -> Result<View> {
        if nodes.len() > 100 {
            return Err(err(libc::E2BIG, "search result capacity"));
        }
        let session = self.session(session)?;
        let reader = self.store.reader();
        let state = reader.state(&session.tenant)?;
        let root = session.scope.as_ref().unwrap_or(&state.root);
        let mut permissions = SearchPermissions {
            reader: &reader,
            session: &session,
            subjects: if session.admin {
                Vec::new()
            } else {
                self.subjects(&reader, &session)?
            },
            nodes: BTreeMap::new(),
            inherited: BTreeMap::new(),
        };
        let mut output = Vec::new();
        for id in nodes.iter().collect::<BTreeSet<_>>() {
            let mut node = match permissions.node(id) {
                Ok(node) if !node.unlinked => node,
                Ok(_) => continue,
                Err(error) if error.code == libc::ENOENT => continue,
                Err(error) => return Err(error),
            };
            let verbs = permissions.verbs(id)?;
            if verbs == 0 {
                continue;
            }
            let parent_visible = if let Some(parent) = &node.parent {
                permissions.verbs(parent)? & (LIST | TRAVERSE) == LIST | TRAVERSE
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
            head: state.head,
            auth_generation: state.auth_generation,
            nodes: output,
        })
    }
}
