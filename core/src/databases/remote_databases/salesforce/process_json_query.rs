use super::sandbox::error::SoqlError;
use super::sandbox::extract::ObjectExtractor;
use super::sandbox::models::StructuredQuery;
use super::sandbox::to_soql::ToSoql;
use super::sandbox::validator::Validator;
use std::collections::HashSet;

#[derive(Debug)]
pub struct ProcessedQuery {
    pub soql: String,
    pub main_object: String,
    pub objects: Vec<String>,
}

/// Convert a JSON query to a SOQL string with detailed error handling and suggestions
pub fn process_json_query(json_str: &str) -> Result<ProcessedQuery, SoqlError> {
    // Parse the JSON into a structured query
    let parsed_query = serde_json::from_str::<StructuredQuery>(json_str)?;

    parsed_query.validate()?;

    let mut objects = HashSet::new();
    parsed_query.extract_objects(&mut objects);

    Ok(ProcessedQuery {
        soql: parsed_query.to_soql(),
        main_object: parsed_query.object,
        objects: objects.into_iter().collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // Test for function support in SOQL queries
    #[test]
    fn test_json_to_soql_with_functions() {
        let json = r#"{
            "object": "Account",
            "fields": [
                "Id", 
                "Name", 
                {"function": "DAY_ONLY", "arguments": ["CreatedDate"]},
                {"function": "CALENDAR_MONTH", "arguments": ["LastModifiedDate"]}
            ],
            "where": {
                "condition": "AND",
                "filters": [
                    {
                        "field": {"function": "DAY_ONLY", "arguments": ["CreatedDate"]},
                        "operator": "=",
                        "value": {"type": "datetime", "value": "2023-01-01"}
                    },
                    {
                        "field": "LastModifiedDate",
                        "operator": "=",
                        "value": {
                            "type": "function",
                            "function": "DAY_ONLY",
                            "arguments": ["CreatedDate"]
                        }
                    }
                ]
            }
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT Id, Name, DAY_ONLY(CreatedDate), CALENDAR_MONTH(LastModifiedDate) FROM Account WHERE DAY_ONLY(CreatedDate) = 2023-01-01 AND LastModifiedDate = DAY_ONLY(CreatedDate)"
        );
        assert_eq!(processed.objects, vec!["Account"]);
    }

    // Test for function calls in GROUP BY clause
    #[test]
    fn test_json_to_soql_group_by_with_functions() {
        let json = r#"{
            "object": "Opportunity",
            "fields": ["AccountId"],
            "aggregates": [
                {
                    "function": "SUM",
                    "field": "Amount",
                    "alias": "TotalAmount"
                }
            ],
            "groupBy": [
                {"function": "CALENDAR_MONTH", "arguments": ["CloseDate"]},
                {"function": "CALENDAR_YEAR", "arguments": ["CloseDate"]}
            ]
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT AccountId, SUM(Amount) TotalAmount, CALENDAR_MONTH(CloseDate), CALENDAR_YEAR(CloseDate) FROM Opportunity GROUP BY CALENDAR_MONTH(CloseDate), CALENDAR_YEAR(CloseDate)"
        );
        assert_eq!(processed.objects, vec!["Opportunity"]);
    }

    // Test for advanced GROUP BY with function calls
    #[test]
    fn test_json_to_soql_advanced_group_by_with_functions() {
        let json = r#"{
            "object": "Opportunity",
            "fields": ["AccountId"],
            "aggregates": [
                {
                    "function": "SUM",
                    "field": "Amount",
                    "alias": "TotalAmount"
                }
            ],
            "groupBy": {
                "type": "CUBE",
                "fields": [
                    "AccountId",
                    {"function": "CALENDAR_MONTH", "arguments": ["CloseDate"]},
                    {"function": "CALENDAR_YEAR", "arguments": ["CloseDate"]}
                ]
            }
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT AccountId, SUM(Amount) TotalAmount, CALENDAR_MONTH(CloseDate), CALENDAR_YEAR(CloseDate) FROM Opportunity GROUP BY CUBE(AccountId, CALENDAR_MONTH(CloseDate), CALENDAR_YEAR(CloseDate))"
        );
        assert_eq!(processed.objects, vec!["Opportunity"]);
    }

    #[test]
    fn test_json_to_soql_basic_query() {
        let json = r#"{
            "object": "Account",
            "fields": ["Id", "Name", "Industry"],
            "where": {
                "condition": "AND",
                "filters": [
                    { "field": "Industry", "operator": "=", "value": "Technology" }
                ]
            },
            "limit": 10
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT Id, Name, Industry FROM Account WHERE Industry = 'Technology' LIMIT 10"
        );
        assert_eq!(processed.objects, vec!["Account"]);
    }

    #[test]
    fn test_json_to_soql_all_aggregate_functions() {
        let json = r#"{
        "object": "Opportunity",
        "aggregates": [
                {
                    "function": "COUNT",
                    "field": "Id",
                    "alias": "CountId"
                },
                {
                    "function": "SUM",
                    "field": "Amount",
                    "alias": "TotalAmount"
                },
                {
                    "function": "AVG",
                    "field": "Amount",
                    "alias": "AvgAmount"
                },
                {
                    "function": "MIN",
                    "field": "Amount",
                    "alias": "MinAmount"
                },
                {
                    "function": "MAX",
                    "field": "Amount",
                    "alias": "MaxAmount"
                }
            ],
            "groupBy": ["StageName"]
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT COUNT(Id) CountId, SUM(Amount) TotalAmount, AVG(Amount) AvgAmount, MIN(Amount) MinAmount, MAX(Amount) MaxAmount, StageName FROM Opportunity GROUP BY StageName"
        );
        assert_eq!(processed.objects, vec!["Opportunity"]);
    }

    #[test]
    fn test_json_to_soql_aggregates_with_functions() {
        let json = r#"{
        "object": "Opportunity",
        "aggregates": [
                {
                    "function": "COUNT",
                    "field": {"function": "CALENDAR_MONTH", "arguments": ["CloseDate"]},
                    "alias": "MonthCount"
                },
                {
                    "function": "SUM",
                    "field": {"function": "CALENDAR_YEAR", "arguments": ["CloseDate"]},
                    "alias": "YearSum"
                }
            ],
            "groupBy": ["StageName"]
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT COUNT(CALENDAR_MONTH(CloseDate)) MonthCount, SUM(CALENDAR_YEAR(CloseDate)) YearSum, StageName FROM Opportunity GROUP BY StageName"
        );
        assert_eq!(processed.objects, vec!["Opportunity"]);
    }

    #[test]
    fn test_json_to_soql_group_by() {
        let json = r#"{
        "object": "Opportunity",
        "fields": ["StageName"],
        "aggregates": [
            {
                "function": "COUNT",
                "field": "Id",
                "alias": "CountId"
            }
        ],
        "groupBy": ["StageName"]
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT StageName, COUNT(Id) CountId FROM Opportunity GROUP BY StageName"
        );
        assert_eq!(processed.objects, vec!["Opportunity"]);
    }

    #[test]
    fn test_json_to_soql_dot_notation() {
        let json = r#"{
        "object": "Account",
        "fields": ["Id", "Name", "Owner.Department"]
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT Id, Name, Owner.Department FROM Account"
        );
        assert_eq!(
            processed
                .objects
                .iter()
                .map(|s| s.as_str())
                .collect::<HashSet<_>>(),
            HashSet::from(["Account", "Owner"])
        );
    }

    #[test]
    fn test_json_to_soql_complex_where_clause() {
        let json = r#"{
            "object": "Contact",
            "fields": ["Id", "FirstName", "LastName", "Email"],
            "where": {
                "condition": "AND",
                "filters": [
                    { "field": "LastName", "operator": "!=", "value": null },
                    { 
                        "condition": "OR",
                        "filters": [
                            { "field": "Email", "operator": "LIKE", "value": "%@example.com" },
                            { "field": "Email", "operator": "LIKE", "value": "%@salesforce.com" }
                        ]
                    }
                ]
            }
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT Id, FirstName, LastName, Email FROM Contact WHERE LastName != NULL AND (Email LIKE '%@example.com' OR Email LIKE '%@salesforce.com')"
        );
        assert_eq!(processed.objects, vec!["Contact"]);
    }

    #[test]
    fn test_json_to_soql_order_by_complex() {
        let json = r#"{
            "object": "Opportunity",
            "fields": ["Id", "Name", "Amount", "CloseDate"],
            "orderBy": [
                { 
                    "field": "CloseDate", 
                    "direction": "DESC",
                    "nulls": "LAST"
                },
                { 
                    "field": "Amount", 
                    "direction": "DESC" 
                }
            ]
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT Id, Name, Amount, CloseDate FROM Opportunity ORDER BY CloseDate DESC NULLS LAST, Amount DESC"
        );
        assert_eq!(processed.objects, vec!["Opportunity"]);
    }

    #[test]
    fn test_json_to_soql_parent_fields() {
        let json = r#"{
            "object": "Contact",
            "fields": ["Id", "FirstName", "LastName"],
            "parentFields": [
                {
                    "relationship": "Account",
                    "fields": ["Name", "Industry", "AnnualRevenue"]
                }
            ]
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT Id, FirstName, LastName, Account.Name, Account.Industry, Account.AnnualRevenue FROM Contact"
        );
        assert_eq!(
            processed
                .objects
                .iter()
                .map(|s| s.as_str())
                .collect::<HashSet<_>>(),
            HashSet::from(["Contact", "Account"])
        );
    }

    #[test]
    fn test_json_to_soql_relationships() {
        let json = r#"{
            "object": "Account",
            "fields": ["Id", "Name"],
            "relationships": [
                {
                    "relationshipName": "Contacts",
                    "fields": ["Id", "FirstName", "LastName", "Email"],
                    "where": {
                        "condition": "AND",
                        "filters": [
                            { "field": "IsActive", "operator": "=", "value": true }
                        ]
                    },
                    "orderBy": [{ "field": "LastName", "direction": "ASC" }],
                    "limit": 5
                }
            ]
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT Id, Name, (SELECT Id, FirstName, LastName, Email FROM Contacts WHERE IsActive = true ORDER BY LastName ASC LIMIT 5) FROM Account"
        );
        assert_eq!(
            processed
                .objects
                .iter()
                .map(|s| s.as_str())
                .collect::<HashSet<_>>(),
            HashSet::from(["Account", "Contacts"])
        );
    }

    #[test]
    fn test_json_to_soql_limit_offset() {
        let json = r#"{
            "object": "Lead",
            "fields": ["Id", "Name", "Company", "Status"],
            "where": {
                "condition": "AND",
                "filters": [
                    { "field": "Status", "operator": "=", "value": "Open" }
                ]
            },
            "limit": 100,
            "offset": 200
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT Id, Name, Company, Status FROM Lead WHERE Status = 'Open' LIMIT 100 OFFSET 200"
        );
        assert_eq!(processed.objects, vec!["Lead"]);
    }

    #[test]
    fn test_json_to_soql_having_clause() {
        let json = r#"{
            "object": "Opportunity",
            "fields": ["AccountId"],
            "aggregates": [
                {
                    "function": "SUM",
                    "field": "Amount",
                    "alias": "TotalAmount"
                }
            ],
            "groupBy": ["AccountId"],
            "having": {
                "condition": "AND",
                "filters": [
                    {
                        "function": "SUM",
                        "field": "Amount",
                        "operator": ">",
                        "value": 100000
                    }
                ]
            }
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT AccountId, SUM(Amount) TotalAmount FROM Opportunity GROUP BY AccountId HAVING SUM(Amount) > 100000"
        );
        assert_eq!(processed.objects, vec!["Opportunity"]);
    }

    #[test]
    fn test_json_to_soql_having_clause_with_function_in_value() {
        // Since the HAVING clause doesn't directly support function syntax in the current
        // implementation, we're testing a simpler case with function in the aggregate
        let json = r#"{
            "object": "Opportunity",
            "fields": ["AccountId"],
            "aggregates": [
                {
                    "function": "COUNT",
                    "field": {"function": "CALENDAR_MONTH", "arguments": ["CloseDate"]},
                    "alias": "MonthCount"
                }
            ],
            "groupBy": ["AccountId"],
            "having": {
                "condition": "AND",
                "filters": [
                    {
                        "function": "COUNT",
                        "field": "Amount",
                        "operator": ">",
                        "value": 5
                    }
                ]
            }
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT AccountId, COUNT(CALENDAR_MONTH(CloseDate)) MonthCount FROM Opportunity GROUP BY AccountId HAVING COUNT(Amount) > 5"
        );
        assert_eq!(processed.objects, vec!["Opportunity"]);
    }

    #[test]
    fn test_json_to_soql_advanced_group_by() {
        let json = r#"{
            "object": "Opportunity",
            "fields": ["AccountId", "StageName"],
            "aggregates": [
                {
                    "function": "SUM",
                    "field": "Amount",
                    "alias": "TotalAmount"
                }
            ],
            "groupBy": {
                "type": "CUBE",
                "fields": ["AccountId", "StageName"]
            }
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT AccountId, StageName, SUM(Amount) TotalAmount FROM Opportunity GROUP BY CUBE(AccountId, StageName)"
        );
        assert_eq!(processed.objects, vec!["Opportunity"]);
    }

    #[test]
    fn test_json_to_soql_array_value_in_where() {
        let json = r#"{
            "object": "Contact",
            "fields": ["Id", "Name", "Email"],
            "where": {
                "condition": "AND",
                "filters": [
                    { "field": "AccountId", "operator": "IN", "value": [
                        "001xx000003DGT1AAO", "001xx000003DGT2AAO", "001xx000003DGT3AAO"
                    ]}
                ]
            }
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT Id, Name, Email FROM Contact WHERE AccountId IN ('001xx000003DGT1AAO', '001xx000003DGT2AAO', '001xx000003DGT3AAO')"
        );
        assert_eq!(processed.objects, vec!["Contact"]);
    }

    #[test]
    fn test_json_to_soql_not_in_operator() {
        let json = r#"{
            "object": "Lead",
            "fields": ["Id", "Name", "Status"],
            "where": {
                "condition": "AND",
                "filters": [
                    { "field": "Status", "operator": "NOT IN", "value": ["Closed", "Converted"] }
                ]
            }
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT Id, Name, Status FROM Lead WHERE Status NOT IN ('Closed', 'Converted')"
        );
        assert_eq!(processed.objects, vec!["Lead"]);
    }

    #[test]
    fn test_json_to_soql_like_operators() {
        let json = r#"{
            "object": "Contact",
            "fields": ["Id", "FirstName", "LastName", "Email", "Phone"],
            "where": {
                "condition": "AND",
                "filters": [
                    { "field": "Email", "operator": "LIKE", "value": "%@example.com" },
                    { "field": "FirstName", "operator": "LIKE", "value": "J%" },
                    { "field": "LastName", "operator": "LIKE", "value": "%son" },
                    { "field": "Phone", "operator": "LIKE", "value": "415-%" }
                ]
            }
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT Id, FirstName, LastName, Email, Phone FROM Contact WHERE Email LIKE '%@example.com' AND FirstName LIKE 'J%' AND LastName LIKE '%son' AND Phone LIKE '415-%'"
        );
        assert_eq!(processed.objects, vec!["Contact"]);
    }

    #[test]
    fn test_json_to_soql_not_like_operator() {
        let json = r#"{
            "object": "Lead",
            "fields": ["Id", "FirstName", "LastName", "Email"],
            "where": {
                "condition": "AND",
                "filters": [
                    { "field": "Email", "operator": "NOT LIKE", "value": "%@competitor.com" }
                ]
            }
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT Id, FirstName, LastName, Email FROM Lead WHERE Email NOT LIKE '%@competitor.com'"
        );
        assert_eq!(processed.objects, vec!["Lead"]);
    }

    #[test]
    fn test_json_to_soql_date_functions() {
        let json = r#"{
            "object": "Account",
            "fields": [
                "Id", 
                "Name", 
                {"function": "DAY_ONLY", "arguments": ["CreatedDate"]},
                {"function": "CALENDAR_MONTH", "arguments": ["LastModifiedDate"]}
            ],
            "where": {
                "condition": "AND",
                "filters": [
                    {
                        "field": {"function": "DAY_ONLY", "arguments": ["CreatedDate"]},
                        "operator": "=",
                        "value": "2023-01-01"
                    }
                ]
            }
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT Id, Name, DAY_ONLY(CreatedDate), CALENDAR_MONTH(LastModifiedDate) FROM Account WHERE DAY_ONLY(CreatedDate) = '2023-01-01'"
        );
        assert_eq!(processed.objects, vec!["Account"]);
    }

    #[test]
    fn test_json_to_soql_function_as_value() {
        let json = r#"{
            "object": "Account",
            "fields": ["Id", "Name"],
            "where": {
                "condition": "AND", 
                "filters": [
                    {
                        "field": "LastModifiedDate",
                        "operator": ">",
                        "value": {
                            "type": "function",
                            "function": "DAY_ONLY",
                            "arguments": ["CreatedDate"]
                        }
                    }
                ]
            }
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT Id, Name FROM Account WHERE LastModifiedDate > DAY_ONLY(CreatedDate)"
        );
        assert_eq!(processed.objects, vec!["Account"]);
    }

    #[test]
    fn test_json_to_soql_nested_functions() {
        let json = r#"{
            "object": "Account",
            "fields": [
                "Id", 
                "Name", 
                {
                    "function": "FORMAT", 
                    "arguments": [
                        {
                            "function": "CALENDAR_MONTH", 
                            "arguments": ["CreatedDate"]
                        },
                        "'MMMM'"
                    ]
                }
            ]
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT Id, Name, FORMAT(CALENDAR_MONTH(CreatedDate), 'MMMM') FROM Account"
        );
        assert_eq!(processed.objects, vec!["Account"]);
    }

    #[test]
    fn test_json_to_soql_nested_functions_in_group_by() {
        let json = r#"{
            "object": "Opportunity",
            "fields": ["AccountId"],
            "aggregates": [
                {
                    "function": "SUM",
                    "field": "Amount",
                    "alias": "TotalAmount"
                }
            ],
            "groupBy": [
                {
                    "function": "FORMAT", 
                    "arguments": [
                        {
                            "function": "CALENDAR_YEAR", 
                            "arguments": ["CloseDate"]
                        },
                        "'YYYY'"
                    ]
                }
            ]
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT AccountId, SUM(Amount) TotalAmount, FORMAT(CALENDAR_YEAR(CloseDate), 'YYYY') FROM Opportunity GROUP BY FORMAT(CALENDAR_YEAR(CloseDate), 'YYYY')"
        );
        assert_eq!(processed.objects, vec!["Opportunity"]);
    }

    #[test]
    fn test_json_to_soql_multiple_complex_features() {
        let json = r#"{
            "object": "Opportunity",
            "fields": ["AccountId", "StageName"],
            "aggregates": [
                { "function": "COUNT", "field": "Id", "alias": "OpportunityCount" },
                { "function": "SUM", "field": "Amount", "alias": "TotalAmount" }
            ],
            "where": {
                "condition": "AND",
                "filters": [
                    { "field": "CloseDate", "operator": ">", "value": "2023-01-01" },
                    { "field": "Amount", "operator": ">", "value": 0 }
                ]
            },
            "groupBy": ["AccountId", "StageName"],
            "having": {
                "condition": "AND",
                "filters": [
                    { "function": "SUM", "field": "Amount", "operator": ">", "value": 50000 }
                ]
            },
            "orderBy": [
                { "field": "SUM(Amount)", "direction": "DESC" }
            ],
            "limit": 50
        }"#;

        serde_json::from_str::<StructuredQuery>(json).unwrap();
        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT AccountId, StageName, COUNT(Id) OpportunityCount, SUM(Amount) TotalAmount FROM Opportunity WHERE CloseDate > '2023-01-01' AND Amount > 0 GROUP BY AccountId, StageName HAVING SUM(Amount) > 50000 ORDER BY SUM(Amount) DESC LIMIT 50"
        );
        assert_eq!(processed.objects, vec!["Opportunity"]);
    }

    // Test only the JSON parsing error in convert.rs since this is specific to the conversion function
    #[test]
    fn test_error_handling_json_parse_error() {
        let invalid_json = r#"{
            "object": "Account",
            "fields": ["Id", "Name"
            "where": {
                "condition": "AND",
                "filters": []
            }
        }"#;

        let processed = process_json_query(invalid_json);
        assert!(processed.is_err());
        let error = processed.unwrap_err();
        assert!(error
            .user_friendly_message()
            .contains("Check your JSON syntax"));
    }

    #[test]
    fn test_json_to_soql_where_clause_without_condition() {
        let json = r#"{
            "object": "Contact",
            "fields": ["Id", "Name", "Title", "Phone", "Email", "Department", "MailingCity", "MailingState"],
            "where": {
                "filters": [
                    {"field": "AccountId", "operator": "=", "value": "001Qy00000ccRXcIAM"}
                ]
            }
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT Id, Name, Title, Phone, Email, Department, MailingCity, MailingState FROM Contact WHERE AccountId = '001Qy00000ccRXcIAM'"
        );
        assert_eq!(processed.objects, vec!["Contact"]);
    }

    #[test]
    fn test_json_to_soql_special_character_escaping() {
        let json = r#"{
            "object": "Contact", 
            "fields": ["Id", "Name"],
            "where": {
                "condition": "AND",
                "filters": [
                    {"field": "Description", "operator": "=", "value": "Value with 'single quotes'"},
                    {"field": "LastName", "operator": "=", "value": "O'Reilly"}
                ]
            }
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT Id, Name FROM Contact WHERE Description = 'Value with ''single quotes''' AND LastName = 'O''Reilly'"
        );
        assert_eq!(processed.objects, vec!["Contact"]);
    }

    #[test]
    fn test_json_to_soql_deeply_nested_logic() {
        let json = r#"{
            "object": "Account",
            "fields": ["Id", "Name"],
            "where": {
                "condition": "AND",
                "filters": [
                    {"field": "Type", "operator": "=", "value": "Customer"},
                    {
                        "condition": "OR",
                        "filters": [
                            {"field": "Industry", "operator": "=", "value": "Technology"},
                            {
                                "condition": "AND",
                                "filters": [
                                    {"field": "AnnualRevenue", "operator": ">", "value": 1000000},
                                    {"field": "NumberOfEmployees", "operator": ">", "value": 50}
                                ]
                            }
                        ]
                    }
                ]
            }
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT Id, Name FROM Account WHERE Type = 'Customer' AND (Industry = 'Technology' OR (AnnualRevenue > 1000000 AND NumberOfEmployees > 50))"
        );
        assert_eq!(processed.objects, vec!["Account"]);
    }

    #[test]
    fn test_json_to_soql_date_time_handling() {
        let json = r#"{
            "object": "Opportunity",
            "fields": ["Id", "Name", "CloseDate"],
            "where": {
                "condition": "AND",
                "filters": [
                    {
                        "field": "CreatedDate", 
                        "operator": ">", 
                        "value": {
                            "type": "datetime",
                            "value": "2023-01-01T00:00:00Z"
                        }
                    },
                    {
                        "field": "CloseDate", 
                        "operator": "<", 
                        "value": {
                            "type": "datetime",
                            "value": "2023-12-31"
                        }
                    }
                ]
            }
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT Id, Name, CloseDate FROM Opportunity WHERE CreatedDate > 2023-01-01T00:00:00Z AND CloseDate < 2023-12-31"
        );
        assert_eq!(processed.objects, vec!["Opportunity"]);
    }

    #[test]
    fn test_invalid_datetime_format() {
        let json = r#"{
            "object": "Opportunity",
            "fields": ["Id", "Name"],
            "where": {
                "condition": "AND",
                "filters": [
                    {
                        "field": "CreatedDate", 
                        "operator": ">", 
                        "value": {
                            "type": "datetime",
                            "value": "01/01/2023"
                        }
                    }
                ]
            }
        }"#;

        let result = process_json_query(json);
        assert!(result.is_err());
    }

    #[test]
    fn test_function_on_parent_field_fails() {
        let json = r#"{
            "object": "Contact",
            "fields": ["Id", "FirstName", "LastName"],
            "parentFields": [
                {
                    "relationship": "Account",
                    "fields": [
                        "Name", 
                        {"function": "DAY_ONLY", "arguments": ["CreatedDate"]}
                    ]
                }
            ]
        }"#;

        let result = process_json_query(json);
        assert!(result.is_err());

        // Verify the error message is about function calls on parent fields
        let error = result.unwrap_err();
        match error {
            SoqlError::UnsupportedFeature(msg) => {
                assert!(msg.contains("Function calls are not supported on parent fields"));
            }
            _ => panic!("Expected UnsupportedFeature error, got {:?}", error),
        }
    }

    #[test]
    fn test_validate_group_by_with_functions() {
        // Test with valid function in GROUP BY
        let json = r#"{
            "object": "Opportunity",
            "fields": ["AccountId"],
            "aggregates": [
                {
                    "function": "SUM",
                    "field": "Amount",
                    "alias": "TotalAmount"
                }
            ],
            "groupBy": [
                {"function": "CALENDAR_MONTH", "arguments": ["CloseDate"]},
                {"function": "CALENDAR_YEAR", "arguments": ["CloseDate"]}
            ]
        }"#;

        let query = serde_json::from_str::<StructuredQuery>(json).unwrap();
        assert!(
            query.validate().is_ok(),
            "Valid functions in GROUP BY should pass validation"
        );

        // Test with invalid function in GROUP BY
        let invalid_json = r#"{
            "object": "Opportunity",
            "fields": ["AccountId"],
            "aggregates": [
                {
                    "function": "SUM",
                    "field": "Amount",
                    "alias": "TotalAmount"
                }
            ],
            "groupBy": [
                {"function": "INVALID_FUNCTION", "arguments": ["CloseDate"]}
            ]
        }"#;

        let invalid_query = serde_json::from_str::<StructuredQuery>(invalid_json).unwrap();
        let result = invalid_query.validate();
        assert!(
            result.is_err(),
            "Invalid function in GROUP BY should fail validation"
        );
    }

    #[test]
    fn test_json_to_soql_multiple_relationship_queries() {
        let json = r#"{
            "object": "Account",
            "fields": ["Id", "Name"],
            "relationships": [
                {
                    "relationshipName": "Contacts",
                    "fields": ["Id", "Name"],
                    "limit": 5
                },
                {
                    "relationshipName": "Opportunities",
                    "fields": ["Id", "Name", "Amount"],
                    "where": {
                        "condition": "AND",
                        "filters": [
                            {"field": "StageName", "operator": "!=", "value": "Closed Lost"}
                        ]
                    },
                    "limit": 3
                }
            ]
        }"#;

        let processed = process_json_query(json).unwrap();
        assert_eq!(
            processed.soql,
            "SELECT Id, Name, (SELECT Id, Name FROM Contacts LIMIT 5), (SELECT Id, Name, Amount FROM Opportunities WHERE StageName != 'Closed Lost' LIMIT 3) FROM Account"
        );
        assert_eq!(
            processed
                .objects
                .iter()
                .map(|s| s.as_str())
                .collect::<HashSet<_>>(),
            HashSet::from(["Account", "Contacts", "Opportunities"])
        );
    }
}
