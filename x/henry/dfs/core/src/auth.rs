//! Access evaluation over the policies on an object's current ancestor chain.

use dfs_proto::Right;

use crate::records::Policy;

#[derive(Clone, Debug)]
pub struct Principal {
    pub name: String,
    pub admin: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Access {
    pub read: bool,
    pub write: bool,
}

/// @cc [owner:fontanierh,label:security;product] write-stop-boundaries
/// `chain` MUST list the policies of the object's current ancestors from the tenant root down to
/// the object itself. Read is granted by any `Read` or `Write` grant anywhere on the chain. Write
/// is granted only by a `Write` grant collected walking downward, where every boundary clears all
/// write grants collected above it (including explicit ones) before adding its own grants. A
/// subject matches the principal's name or one of its current groups. Tenant administration
/// (`Manage`, admin tokens) MUST NOT imply read or write.
pub fn evaluate(principal: &Principal, groups: &[String], chain: &[Option<&Policy>]) -> Access {
    let matches = |subject: &str| subject == principal.name || groups.iter().any(|g| g == subject);
    let mut access = Access::default();
    let mut writers: Vec<&str> = Vec::new();
    for policy in chain.iter().flatten() {
        if policy.boundary {
            writers.clear();
        }
        for (subject, right) in &policy.grants {
            match right {
                Right::Read => access.read |= matches(subject),
                Right::Write => {
                    access.read |= matches(subject);
                    writers.push(subject);
                }
                Right::Manage => {}
            }
        }
    }
    access.write = writers.iter().any(|subject| matches(subject));
    access
}

#[cfg(test)]
mod tests {
    use super::*;

    fn grants(grants: &[(&str, Right)], boundary: bool) -> Policy {
        Policy { grants: grants.iter().map(|(s, r)| (s.to_string(), *r)).collect(), boundary }
    }

    #[test]
    fn boundary_stops_inherited_writes_and_allows_exceptions() {
        let alice = Principal { name: "alice".into(), admin: false };
        let bob = Principal { name: "bob".into(), admin: false };
        let groups = vec!["team".to_string()];
        let team = grants(&[("team", Right::Write)], false);
        let skills = grants(&[("alice", Right::Write)], true);
        let released = grants(&[], true);
        let chain = [Some(&team), None, Some(&skills)];
        assert_eq!(evaluate(&alice, &groups, &chain), Access { read: true, write: true });
        assert_eq!(evaluate(&bob, &groups, &chain), Access { read: true, write: false });
        let deeper = [Some(&team), Some(&skills), Some(&released)];
        assert_eq!(evaluate(&alice, &groups, &deeper), Access { read: true, write: false });
        assert_eq!(evaluate(&bob, &[], &[Some(&team)]), Access::default());
    }
}
