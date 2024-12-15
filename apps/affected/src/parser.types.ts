// A top-level AST node is usually a list of Statements
export type AST = Statement[];

// A Statement node with a key and a value that is an Expression
export interface Statement {
  type: 'STATEMENT';
  key: Key;
  value: Expression;
}

// Keys can be simple or nested, but here we show a general structure
export interface Key {
  name: string;
  path?: string; // optional if nested keys are used
}

// Expressions can be logical operators (AND, OR), inversions, or values
export type Expression = 
    OrExpression
  | AndExpression
  | ExcludeExpression
  | ValueOfInterest; 

export interface OrExpression {
  type: 'OR';
  values: Expression[];
}

export interface AndExpression {
  type: 'AND';
  values: Expression[];
}

// Exclude applies logical negation to any Expression
export interface ExcludeExpression {
  type: 'EXCLUDE';
  exp: Expression;
}

// A ValueOfInterest can be a quoted literal or a statement reference
export type ValueOfInterest = QuoteLiteral | StatementRef;

export interface QuoteLiteral {
  type: 'QUOTE_LITERAL';
  value: string;
  suffix?: string; // optional suffix
}

export interface StatementRef {
  type: 'STATEMENT_REF';
  value: string;
}
