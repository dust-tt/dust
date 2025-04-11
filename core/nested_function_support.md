# Nested Function Support in Salesforce SOQL Structured Query

## Overview

This enhancement adds comprehensive support for nested function calls in the Salesforce SOQL Structured Query DSL. Previously, function arguments could only be field references or literal values. With this update, functions can now be used as arguments to other functions, enabling more complex and powerful query expressions across all query clauses.

## Examples of New Functionality

Before, we could only do simple function calls like:

```sql
-- Simple function with a field reference
DAY_ONLY(CreatedDate)

-- Simple function with a literal value
FORMAT(CreatedDate, 'YYYY-MM-DD')
```

Now, we can nest functions in various contexts:

```sql
-- Nested function in field selection
FORMAT(CALENDAR_MONTH(CreatedDate), 'MMMM')

-- Nested function in GROUP BY
GROUP BY FORMAT(CALENDAR_YEAR(CloseDate), 'YYYY')

-- Nested function in aggregate
COUNT(CALENDAR_MONTH(CloseDate))

-- Nested function in WHERE condition
WHERE StageName = FORMAT(DAY_ONLY(Contact.FirstContactDate), 'YYYY-MM-DD')

-- Deeply nested functions
FORMAT(CALENDAR_MONTH(CALENDAR_YEAR(CreatedDate)), 'MMMM YYYY')
```

## Implementation Changes

### 1. New Data Structures

#### Added `FunctionArgument` Enum
We introduced a new `FunctionArgument` enum that can represent either:
- A field expression (which can itself be a function call)
- A literal value

```rust
pub enum FunctionArgument {
    /// A field expression (field reference or function call)
    Expression(FieldExpression),
    
    /// A literal value
    Literal(serde_json::Value),
}
```

#### Updated `FieldExpression::Function`
The `Function` variant of `FieldExpression` now uses `FunctionArgument` instead of just strings:

```rust
pub enum FieldExpression {
    /// A simple field reference.
    Field(String),

    /// A function call.
    Function {
        function: String,
        arguments: Vec<FunctionArgument>, // Changed from Vec<String>
    },
}
```

### 2. Validation with Depth Tracking

To prevent overly complex queries and infinite recursion, we implemented depth-aware validation:

#### Added `RecursiveValidator` Trait
```rust
pub trait RecursiveValidator {
    fn validate(&self, depth: usize) -> Result<(), SoqlError>;
}
```

#### Maximum Nesting Depth
Added a constant to limit nesting:
```rust
const MAX_FUNCTION_NESTING_DEPTH: usize = 4; // Allow up to 4 levels of nesting
```

#### Implemented Validation Logic
Implemented validation that checks:
- Whether the nesting exceeds the maximum depth
- Whether function names are valid
- Whether function arguments are correctly formed and of appropriate types
- Specific argument requirements for different function types

### 3. Enhanced Support Across Query Clauses

Extended function call support to all relevant parts of the SOQL query:

#### Aggregate Functions
```rust
// Enhanced aggregate function support with nested functions
aggregates: vec![Aggregate {
    function: AggregateFunction::Count,
    field: FieldExpression::Function {
        function: "CALENDAR_MONTH".to_string(),
        arguments: vec![FunctionArgument::Expression(FieldExpression::Field("CloseDate".to_string()))],
    },
    alias: "MonthCount".to_string(),
}]
```

#### GROUP BY Clause
```rust
// GROUP BY with nested functions
group_by: Some(GroupBy::Simple(vec![
    FieldExpression::Function {
        function: "FORMAT".to_string(),
        arguments: vec![
            FunctionArgument::Expression(FieldExpression::Function {
                function: "CALENDAR_YEAR".to_string(),
                arguments: vec![FunctionArgument::Expression(FieldExpression::Field("CloseDate".to_string()))],
            }),
            FunctionArgument::Literal(serde_json::json!("YYYY")),
        ],
    }
]))
```

#### WHERE Clause
```rust
// WHERE clause with nested functions as values
where_clause: Some(WhereClause {
    condition: LogicalOperator::And,
    filters: vec![Filter::Condition {
        field: FieldExpression::Field("StageName".to_string()),
        operator: "=".to_string(),
        value: TypedValue::Function {
            value_type: FunctionType::Function,
            function: "FORMAT".to_string(),
            arguments: vec![
                FunctionArgument::Expression(FieldExpression::Function {
                    function: "DAY_ONLY".to_string(),
                    arguments: vec![FunctionArgument::Expression(FieldExpression::Field("Contact.FirstContactDate".to_string()))],
                }),
                FunctionArgument::Literal(serde_json::json!("YYYY-MM-DD")),
            ],
        },
    }],
})
```

### 4. Formatting and Conversion Updates

Updated the formatting logic in `convert.rs` to handle nested function calls:

```rust
// For function arguments
impl FunctionArgument {
    pub fn format(&self) -> String {
        match self {
            FunctionArgument::Expression(expr) => expr.format(),
            FunctionArgument::Literal(value) => format_json_value(value),
        }
    }
}

// For function fields
match self {
    FieldExpression::Function { function, arguments } => {
        let args_str = arguments
            .iter()
            .map(|arg| arg.format())
            .collect::<Vec<_>>()
            .join(", ");
        
        format!("{}({})", function, args_str)
    }
    // ...
}
```

### 5. Object Extraction

Enhanced object extraction to work with nested functions in all contexts:

```rust
fn extract_objects_from_function_argument(arg: &FunctionArgument, objects: &mut HashSet<String>) {
    match arg {
        FunctionArgument::Expression(expr) => {
            extract_objects_from_field(expr, objects);
        },
        FunctionArgument::Literal(_) => {
            // Literal values don't contain any object references
        }
    }
}
```

## Testing

Added comprehensive tests covering:

1. **Validation Tests**: Ensuring nested functions are correctly validated
   - Basic nesting works
   - Excessive nesting fails
   - Specific function requirements are enforced

2. **Formatting Tests**: Ensuring nested functions are correctly formatted into SOQL
   - Simple nested functions like `FORMAT(CALENDAR_MONTH(CreatedDate), 'MMMM')`
   - Complex nested functions in various contexts (fields, WHERE clauses, etc.)
   - Nested functions in GROUP BY clauses
   - Nested functions in aggregates

3. **Object Extraction Tests**: Ensuring objects are correctly extracted from nested functions
   - Basic extraction from simple nested functions
   - Extraction from complex queries with deep nesting
   - Extraction from WHERE clauses and other contexts

## Compatibility

This implementation ensures backward compatibility. All existing queries using the previous structure will continue to work without modification. The enhanced structure only extends capabilities without breaking existing functionality.

## Limitations

1. Maximum nesting depth is set to 4 levels to prevent overly complex queries.
2. Function calls in parent fields are still not supported (as in the original implementation).

## Usage Examples

### Basic Nested Function

```json
{
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
        "MMMM"
      ]
    }
  ]
}
```

Converts to:
```sql
SELECT Id, Name, FORMAT(CALENDAR_MONTH(CreatedDate), 'MMMM') FROM Account
```

### Nested Functions in Aggregates

```json
{
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
}
```

Converts to:
```sql
SELECT COUNT(CALENDAR_MONTH(CloseDate)) MonthCount, SUM(CALENDAR_YEAR(CloseDate)) YearSum, StageName 
FROM Opportunity 
GROUP BY StageName
```

### Complex Example with Nested Functions in GROUP BY

```json
{
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
        "YYYY"
      ]
    }
  ]
}
```

Converts to:
```sql
SELECT AccountId, SUM(Amount) TotalAmount, FORMAT(CALENDAR_YEAR(CloseDate), 'YYYY') 
FROM Opportunity 
GROUP BY FORMAT(CALENDAR_YEAR(CloseDate), 'YYYY')
```

### WHERE Clause with Nested Functions

```json
{
  "object": "Opportunity",
  "fields": ["Id", "Name"],
  "where": {
    "condition": "AND",
    "filters": [
      {
        "field": "StageName",
        "operator": "=",
        "value": {
          "type": "function",
          "function": "FORMAT",
          "arguments": [
            {
              "function": "DAY_ONLY",
              "arguments": ["Contact.FirstContactDate"]
            },
            "YYYY-MM-DD"
          ]
        }
      }
    ]
  }
}
```

Converts to:
```sql
SELECT Id, Name 
FROM Opportunity 
WHERE StageName = FORMAT(DAY_ONLY(Contact.FirstContactDate), 'YYYY-MM-DD')
```