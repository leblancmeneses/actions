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

// Extend Expression to include EXPRESSION_WITH_EXCEPT
export type Expression = 
    OrExpression
  | AndExpression
  | NegateExpression
  | ExpressionWithExcept
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
export interface NegateExpression {
  type: 'NEGATE';
  exp: Expression;
}

// New ExpressionWithExcept interface
// base is the main expression, excludes is an array of ValueOfInterest patterns to exclude
export interface ExpressionWithExcept {
  type: 'EXPRESSION_WITH_EXCEPT';
  base: Expression;
  excludes: ValueOfInterest[];
}

// A ValueOfInterest can be a quoted literal or a statement reference
export type ValueOfInterest = QuoteLiteral | RegexLiteral | StatementRef;

export interface QuoteLiteral {
  type: 'QUOTE_LITERAL';
  value: string;
  suffix?: string; // optional suffix
  ignoreCase?: boolean; // optional flag
}


export interface RegexLiteral {
  type: 'REGEX_LITERAL';
  pattern: string;
  flags?: string; // optional flags
  suffix?: string; // optional suffix
}

export interface StatementRef {
  type: 'STATEMENT_REF';
  value: string;
}
