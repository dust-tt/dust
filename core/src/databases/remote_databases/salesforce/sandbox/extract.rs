use super::structured_query::{
    Aggregate, Filter, GroupBy, HavingClause, ParentField, Relationship, StructuredQuery,
    WhereClause,
};
use std::collections::HashSet;

pub fn extract_objects(query: &StructuredQuery) -> Vec<String> {
    let mut objects = HashSet::new();
    query.extract_objects(&mut objects);
    objects.into_iter().collect()
}

fn extract_objects_from_field(field: &str, objects: &mut HashSet<String>) {
    let parts: Vec<&str> = field.split('.').collect();
    if parts.len() <= 1 {
        return;
    }

    // insert each part of the path (except the last, which is a field, not an object)
    for relationship in parts.iter().take(parts.len() - 1) {
        objects.insert(relationship.to_string());
    }
}

trait ObjectExtractor {
    fn extract_objects(&self, objects: &mut HashSet<String>);
}

impl ObjectExtractor for StructuredQuery {
    fn extract_objects(&self, objects: &mut HashSet<String>) {
        // Add the main object
        objects.insert(self.object.clone());

        // Extract objects from fields (dot notation)
        for field in &self.fields {
            extract_objects_from_field(field, objects);
        }

        // Extract objects from where clause
        if let Some(where_clause) = &self.where_clause {
            where_clause.extract_objects(objects);
        }

        // Extract objects from order by
        for order in &self.order_by {
            extract_objects_from_field(&order.field, objects);
        }

        // Extract objects from relationships
        for relationship in &self.relationships {
            relationship.extract_objects(objects);
        }

        // Extract objects from parent fields
        for parent in &self.parent_fields {
            parent.extract_objects(objects);
        }

        // Extract objects from group by
        if let Some(group_by) = &self.group_by {
            group_by.extract_objects(objects);
        }

        // Extract objects from having
        if let Some(having) = &self.having {
            having.extract_objects(objects);
        }

        // Extract objects from aggregates
        for aggregate in &self.aggregates {
            aggregate.extract_objects(objects);
        }
    }
}

impl ObjectExtractor for WhereClause {
    fn extract_objects(&self, objects: &mut HashSet<String>) {
        for filter in &self.filters {
            filter.extract_objects(objects);
        }
    }
}

impl ObjectExtractor for Filter {
    fn extract_objects(&self, objects: &mut HashSet<String>) {
        match self {
            Filter::Condition { field, .. } => {
                extract_objects_from_field(field, objects);
            }
            Filter::NestedCondition(where_clause) => {
                where_clause.extract_objects(objects);
            }
        }
    }
}

impl ObjectExtractor for Relationship {
    fn extract_objects(&self, objects: &mut HashSet<String>) {
        // Extract the relationship name
        objects.insert(self.relationship_name.clone());

        // Extract objects from where clause
        if let Some(where_clause) = &self.where_clause {
            where_clause.extract_objects(objects);
        }

        // Extract objects from order by
        for order in &self.order_by {
            extract_objects_from_field(&order.field, objects);
        }

        // Extract objects from fields
        for field in &self.fields {
            extract_objects_from_field(field, objects);
        }
    }
}

impl ObjectExtractor for ParentField {
    fn extract_objects(&self, objects: &mut HashSet<String>) {
        // Extract the relationship name
        objects.insert(self.relationship.clone());

        // Extract objects from fields
        for field in &self.fields {
            extract_objects_from_field(field, objects);
        }
    }
}

impl ObjectExtractor for GroupBy {
    fn extract_objects(&self, objects: &mut HashSet<String>) {
        match self {
            GroupBy::Simple(fields) | GroupBy::Advanced { fields, .. } => {
                for field in fields {
                    extract_objects_from_field(field, objects);
                }
            }
        }
    }
}

impl ObjectExtractor for HavingClause {
    fn extract_objects(&self, objects: &mut HashSet<String>) {
        for filter in &self.filters {
            extract_objects_from_field(&filter.field, objects);
        }
    }
}

impl ObjectExtractor for Aggregate {
    fn extract_objects(&self, objects: &mut HashSet<String>) {
        extract_objects_from_field(&self.field, objects);
    }
}

#[cfg(test)]
mod tests {
    use crate::databases::remote_databases::salesforce::sandbox::structured_query::{
        Aggregate, AggregateFilter, AggregateFunction, Filter, GroupBy, HavingClause,
        LogicalOperator, OrderBy, OrderDirection, ParentField, Relationship, TypedValue, WhereClause,
    };

    use super::*;
    use serde_json::json;

    #[test]
    fn test_extract_main_object() {
        let query = StructuredQuery {
            object: "Account".to_string(),
            fields: vec!["Id".to_string(), "Name".to_string()],
            where_clause: None,
            order_by: vec![],
            limit: None,
            offset: None,
            relationships: vec![],
            parent_fields: vec![],
            aggregates: vec![],
            group_by: None,
            having: None,
        };

        let objects = extract_objects(&query);
        assert_eq!(objects, vec!["Account"]);
    }

    #[test]
    fn test_extract_simple_dot_notation() {
        let query = StructuredQuery {
            object: "Account".to_string(),
            fields: vec![
                "Id".to_string(),
                "Name".to_string(),
                "Owner.Department".to_string(),
            ],
            where_clause: None,
            order_by: vec![],
            limit: None,
            offset: None,
            relationships: vec![],
            parent_fields: vec![],
            aggregates: vec![],
            group_by: None,
            having: None,
        };

        let objects = extract_objects(&query);
        let expected = HashSet::from(["Account", "Owner"]);
        assert_eq!(
            objects.iter().map(|s| s.as_str()).collect::<HashSet<_>>(),
            expected
        );
    }

    #[test]
    fn test_extract_parent_fields() {
        let query = StructuredQuery {
            object: "Contact".to_string(),
            fields: vec!["Id".to_string(), "Name".to_string()],
            where_clause: None,
            order_by: vec![],
            limit: None,
            offset: None,
            relationships: vec![],
            parent_fields: vec![ParentField {
                relationship: "Account".to_string(),
                fields: vec!["Name".to_string(), "Industry".to_string()],
            }],
            aggregates: vec![],
            group_by: None,
            having: None,
        };

        let objects = extract_objects(&query);
        let expected = HashSet::from(["Account", "Contact"]);
        assert_eq!(
            objects.iter().map(|s| s.as_str()).collect::<HashSet<_>>(),
            expected
        );
    }

    #[test]
    fn test_extract_relationships() {
        let query = StructuredQuery {
            object: "Account".to_string(),
            fields: vec!["Id".to_string(), "Name".to_string()],
            where_clause: None,
            order_by: vec![],
            limit: None,
            offset: None,
            relationships: vec![Relationship {
                relationship_name: "Contacts".to_string(),
                fields: vec![
                    "Id".to_string(),
                    "FirstName".to_string(),
                    "LastName".to_string(),
                ],
                where_clause: None,
                order_by: vec![],
                limit: None,
            }],
            parent_fields: vec![],
            aggregates: vec![],
            group_by: None,
            having: None,
        };

        let objects = extract_objects(&query);
        let expected = HashSet::from(["Account", "Contacts"]);
        assert_eq!(
            objects.iter().map(|s| s.as_str()).collect::<HashSet<_>>(),
            expected
        );
    }

    #[test]
    fn test_extract_where_clause() {
        let query = StructuredQuery {
            object: "Account".to_string(),
            fields: vec!["Id".to_string(), "Name".to_string()],
            where_clause: Some(WhereClause {
                condition: LogicalOperator::And,
                filters: vec![Filter::Condition {
                    field: "Owner.Department".to_string(),
                    operator: "=".to_string(),
                    value: TypedValue::Regular(json!("Sales")),
                }],
            }),
            order_by: vec![],
            limit: None,
            offset: None,
            relationships: vec![],
            parent_fields: vec![],
            aggregates: vec![],
            group_by: None,
            having: None,
        };

        let objects = extract_objects(&query);
        let expected = HashSet::from(["Account", "Owner"]);
        assert_eq!(
            objects.iter().map(|s| s.as_str()).collect::<HashSet<_>>(),
            expected
        );
    }

    #[test]
    fn test_extract_order_by() {
        let query = StructuredQuery {
            object: "Account".to_string(),
            fields: vec!["Id".to_string(), "Name".to_string()],
            where_clause: None,
            order_by: vec![OrderBy {
                field: "Dust.DoIt".to_string(),
                direction: OrderDirection::Asc,
                nulls: None,
            }],
            limit: None,
            offset: None,
            relationships: vec![],
            parent_fields: vec![],
            aggregates: vec![],
            group_by: None,
            having: None,
        };

        let objects = extract_objects(&query);
        let expected = HashSet::from(["Account", "Dust"]);
        assert_eq!(
            objects.iter().map(|s| s.as_str()).collect::<HashSet<_>>(),
            expected
        );
    }

    #[test]
    fn test_extract_group_by() {
        let query = StructuredQuery {
            object: "Account".to_string(),
            fields: vec!["Id".to_string(), "Name".to_string()],
            where_clause: None,
            order_by: vec![],
            limit: None,
            offset: None,
            relationships: vec![],
            parent_fields: vec![],
            aggregates: vec![],
            group_by: Some(GroupBy::Simple(vec!["Cha.Warma".to_string()])),
            having: None,
        };

        let objects = extract_objects(&query);
        let expected = HashSet::from(["Account", "Cha"]);
        assert_eq!(
            objects.iter().map(|s| s.as_str()).collect::<HashSet<_>>(),
            expected
        );
    }

    #[test]
    fn test_extract_having() {
        let query = StructuredQuery {
            object: "Account".to_string(),
            fields: vec!["Id".to_string(), "Name".to_string()],
            where_clause: None,
            order_by: vec![],
            limit: None,
            offset: None,
            relationships: vec![],
            parent_fields: vec![],
            aggregates: vec![],
            group_by: None,
            having: Some(HavingClause {
                condition: LogicalOperator::And,
                filters: vec![AggregateFilter {
                    field: "Hello.World".to_string(),
                    operator: "=".to_string(),
                    value: TypedValue::Regular(json!("Sales")),
                    function: AggregateFunction::Count,
                }],
            }),
        };

        let objects = extract_objects(&query);
        let expected = HashSet::from(["Account", "Hello"]);
        assert_eq!(
            objects.iter().map(|s| s.as_str()).collect::<HashSet<_>>(),
            expected
        );
    }

    #[test]
    fn test_extract_aggregate_function() {
        let query = StructuredQuery {
            object: "Account".to_string(),
            fields: vec!["Id".to_string(), "Name".to_string()],
            aggregates: vec![Aggregate {
                field: "Hello.World".to_string(),
                function: AggregateFunction::Count,
                alias: "hello_world_count".to_string(),
            }],
            where_clause: None,
            order_by: vec![],
            limit: None,
            offset: None,
            relationships: vec![],
            parent_fields: vec![],
            group_by: None,
            having: None,
        };

        let objects = extract_objects(&query);
        let expected = HashSet::from(["Account", "Hello"]);
        assert_eq!(
            objects.iter().map(|s| s.as_str()).collect::<HashSet<_>>(),
            expected
        );
    }
}
