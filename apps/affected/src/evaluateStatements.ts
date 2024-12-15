import picomatch from 'picomatch';
import { AST, Expression } from './parser.types';
import { ChangedFile, mapGitStatusCode } from './changedFiles';


interface EvaluationResult {
  unMatchedFiles: ChangedFile[];
  matchedFiles: ChangedFile[];
  excludedFiles: ChangedFile[];
}

export function evaluateStatements(statements: AST, originalChangedFiles: ChangedFile[]): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  const seen = new Map<string, EvaluationResult>();

  function uniqueFiles(files: ChangedFile[]): ChangedFile[] {
    const seenSet = new Set<string>();
    const unique: ChangedFile[] = [];
    for (const f of files) {
      if (!seenSet.has(f.file)) {
        seenSet.add(f.file);
        unique.push(f);
      }
    }
    return unique;
  }

  function unionFiles(a: ChangedFile[], b: ChangedFile[]): ChangedFile[] {
    return uniqueFiles([...a, ...b]);
  }

  function intersectionFiles(a: ChangedFile[], b: ChangedFile[]): ChangedFile[] {
    const bSet = new Set(b.map((f) => f.file));
    return a.filter((f) => bSet.has(f.file));
  }

  function differenceFiles(a: ChangedFile[], b: ChangedFile[]): ChangedFile[] {
    const bSet = new Set(b.map((f) => f.file));
    return a.filter((f) => !bSet.has(f.file));
  }

  function evaluateStatement(statementKey: string, changedFiles: ChangedFile[]): EvaluationResult {
    if (seen.has(statementKey)) {
      return seen.get(statementKey)!;
    }

    const statement = statements.find((s) => s.key.name === statementKey);
    if (!statement) {
      throw new Error(`Referenced statement key '${statementKey}' does not exist.`);
    }

    const evaluatedResult = evaluateNode(statement.value, changedFiles);
    seen.set(statementKey, evaluatedResult);
    return evaluatedResult;
  }

  function evaluateNode(node: Expression, changedFiles: ChangedFile[]): EvaluationResult {
    switch (node.type) {
      case 'OR': {
        if (node.values.length === 0) {
          return { unMatchedFiles: changedFiles, matchedFiles: [], excludedFiles: [] };
        }

        let allNetMatches: ChangedFile[] = [];
        for (const child of node.values) {
          const res = evaluateNode(child, changedFiles);
          // Compute net matches for the child
          const excludedSet = new Set(res.excludedFiles.map((f) => f.file));
          const childNetMatches = res.matchedFiles.filter((f) => !excludedSet.has(f.file));
          // For OR, union these net matches with the accumulated matches
          allNetMatches = unionFiles(allNetMatches, childNetMatches);
        }
        // Return only net matches for OR
        return {
          unMatchedFiles: [],
          matchedFiles: allNetMatches,
          excludedFiles: []
        };
      }

      case 'AND': {
        if (node.values.length === 0) {
          return { unMatchedFiles: changedFiles, matchedFiles: [], excludedFiles: [] };
        }

        let allNetMatches: ChangedFile[] | null = null;
        for (const child of node.values) {
          const res = evaluateNode(child, changedFiles);
          const excludedSet = new Set(res.excludedFiles.map((f) => f.file));
          const childNetMatches = res.matchedFiles.filter((f) => !excludedSet.has(f.file));
          const unMatchedFiles = res.unMatchedFiles;

          if (allNetMatches === null) {
            allNetMatches = childNetMatches;
          } else {
            // For AND, intersect the net matches
            allNetMatches = intersectionFiles(changedFiles, childNetMatches).filter((f) => !excludedSet.has(f.file));
          }


          // If at any point intersection is empty, no need to continue
          if (allNetMatches.length === 0 && unMatchedFiles.length === 0) {
            return { unMatchedFiles: [], matchedFiles: [], excludedFiles: [] };
          }
        }

        return { unMatchedFiles: [], matchedFiles: allNetMatches ?? [], excludedFiles: [] };
      }

      case 'QUOTE_LITERAL': {
        const isMatch = picomatch(node.value, { dot: true });
        let matchingFiles = changedFiles.filter((cf) => isMatch(cf.file));

        if (node.suffix) {
          const requiredStatus = mapGitStatusCode(node.suffix);
          matchingFiles = matchingFiles.filter((cf) => cf.status === requiredStatus);
        }

        return {
          unMatchedFiles: differenceFiles(changedFiles, matchingFiles),
          matchedFiles: matchingFiles,
          excludedFiles: []
        };
      }

      case 'EXCLUDE': {
        const res = evaluateNode(node.exp, changedFiles);
        const excludedFiles = unionFiles(res.excludedFiles, res.matchedFiles);
        return {
           unMatchedFiles: [],
           matchedFiles: [...res.unMatchedFiles],
           excludedFiles };
      }

      case 'STATEMENT_REF': {
        return evaluateStatement(node.value, changedFiles);
      }

      default:
        throw new Error(`Unsupported node type: ${(node as any).type}`);
    }
  }

  for (const statement of statements) {
    if (statement.type === 'STATEMENT') {
      const { matchedFiles, excludedFiles } = evaluateStatement(statement.key.name, originalChangedFiles);

      const excludedSet = new Set(excludedFiles.map((f) => f.file));
      const netFiles = matchedFiles.filter((f) => !excludedSet.has(f.file));

      result[statement.key.name] = netFiles.length > 0;
    }
  }

  return result;
}