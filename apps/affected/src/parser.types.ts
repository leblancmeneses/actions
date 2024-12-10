export type QuoteLiteral = {
  type: 'QUOTE_LITERAL';
  value: string;
};

export type StatementRef = {
  type: 'STATEMENT_REF';
  value: string;
};

export type Inverse = {
  type: 'INVERSE';
  exp: Array<QuoteLiteral | StatementRef>;
};


export type Statement = {
  type: 'STATEMENT';
  key: string;
  value: Array<QuoteLiteral | StatementRef | Inverse>;
};

