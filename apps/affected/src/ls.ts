import { AST, Expression, Statement } from "./parser.types";

export function reduceAST(ast: AST, entryKeys: string[]): AST {
  const statementMap = new Map<string, Statement>();

  for (const stmt of ast) {
    statementMap.set(stmt.key.name, stmt);
  }

  const visited = new Set<string>();

  function collect(key: string) {
    if (visited.has(key)) return;
    visited.add(key);

    const stmt = statementMap.get(key);
    if (!stmt) return;

    findRefsInExpression(stmt.value).forEach(collect);
  }

  entryKeys.forEach(collect);

  return ast.filter(stmt => visited.has(stmt.key.name));
}

// Helper to find referenced keys in an Expression
function findRefsInExpression(exp: Expression): string[] {
  const refs: string[] = [];

  function visit(e: Expression) {
    switch (e.type) {
      case 'STATEMENT_REF':
        refs.push(e.value);
        break;
      case 'OR':
      case 'AND':
        e.values.forEach(visit);
        break;
      case 'NEGATE':
        visit(e.exp);
        break;
      case 'EXPRESSION_WITH_EXCEPT':
        visit(e.base);
        // excludes are ValueOfInterest, check if they are STATEMENT_REFs
        e.excludes.forEach((v) => {
          if (v.type === 'STATEMENT_REF') refs.push(v.value);
        });
        break;
    }
  }

  visit(exp);
  return refs;
}

export function generateASTDependencyDOT(ast: AST): string {
  const edges: string[] = [];

  for (const stmt of ast) {
    const from = stmt.key.name;
    const refs = findRefsInExpression(stmt.value);
    refs.forEach((to) => {
      edges.push(`  "${from}" -> "${to}";`);
    });
  }

  return `digraph AST {\n${edges.join('\n')}\n}`;
}