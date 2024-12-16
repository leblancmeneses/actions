import picomatch from 'picomatch';
import { AST, Expression } from './parser.types';
import { ChangedFile, mapGitStatusCode } from './changedFiles';

interface EvaluationResult {
  matchedFiles: ChangedFile[];
  excludedFiles: ChangedFile[];
}

export interface Options {
  enableSuffix: boolean;
}

export function evaluateStatementsForChanges(statements: AST, originalChangedFiles: ChangedFile[], options: Options = {enableSuffix:true}): {
  changes: Record<string, boolean>;
  netFiles: Record<string, ChangedFile[]>;
} {
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
      case 'EXPRESSION_WITH_EXCEPT': {
        // Evaluate base
        const baseResult = evaluateNode(node.base, changedFiles);

        // Evaluate excludes
        let excludeMatches: ChangedFile[] = [];
        for (const excludeNode of node.excludes) {
          const res = evaluateNode(excludeNode, changedFiles);
          // Note: exclude nodes are ValueOfInterest, they shouldn't produce excluded files by themselves
          // Just union their matchedFiles into excludeMatches
          excludeMatches = unionFiles(excludeMatches, res.matchedFiles);
        }

        // Remove excluded matches from base matchedFiles
        const excludeSet = new Set(excludeMatches.map((f) => f.file));
        const netFiles = baseResult.matchedFiles.filter((f) => !excludeSet.has(f.file));

        return {
          matchedFiles: netFiles,
          excludedFiles: []
        };
      }

      case 'OR': {
        if (node.values.length === 0) {
          return { matchedFiles: [], excludedFiles: [] };
        }

        let allMatches: ChangedFile[] = [];
        for (const child of node.values) {
          const res = evaluateNode(child, changedFiles);
          allMatches = unionFiles(allMatches, res.matchedFiles);
        }
        return {
          matchedFiles: allMatches,
          excludedFiles: []
        };
      }

      case 'AND': {
        if (node.values.length === 0) {
          return { matchedFiles: [], excludedFiles: [] };
        }

        let allMatches: ChangedFile[] = [];
        for (const child of node.values) {
          const res = evaluateNode(child, changedFiles);
          if (res.matchedFiles.length === 0) {
            // If any child fails to match, the whole AND fails
            return { matchedFiles: [], excludedFiles: [] };
          }
          // If this child passed, union its matches with what we have so far
          allMatches = unionFiles(allMatches, res.matchedFiles);
        }

        // If we reach here, all children matched. Return the union of their matches.
        return { matchedFiles: allMatches, excludedFiles: [] };
      }

      case 'QUOTE_LITERAL': {
        const isMatch = picomatch(node.value, { dot: true });
        let matchingFiles = changedFiles.filter((cf) => isMatch(cf.file));

        if (node.suffix && options.enableSuffix) {
          const requiredStatus = mapGitStatusCode(node.suffix);
          matchingFiles = matchingFiles.filter((cf) => cf.status === requiredStatus);
        }

        return {
          matchedFiles: matchingFiles,
          excludedFiles: []
        };
      }

      case 'NEGATE': {
        // NOT operation: !exp
        // If exp matched M and excluded E, then !exp should match all files not in M ∪ E.
        const res = evaluateNode(node.exp, changedFiles);
        const considered = unionFiles(res.matchedFiles, res.excludedFiles);
        const consideredSet = new Set(considered.map((f) => f.file));
        const complement = changedFiles.filter((cf) => !consideredSet.has(cf.file));

        // excludedFiles for !exp is what exp considered: M ∪ E
        return {
          matchedFiles: complement,
          excludedFiles: considered
        };
      }

      case 'STATEMENT_REF': {
        return evaluateStatement(node.value, changedFiles);
      }

      default:
        throw new Error(`Unsupported node type: ${(node as any).type}`);
    }
  }

  const changesKeyValue: Record<string, boolean> = {};
  const netFilesKeyValue: Record<string, ChangedFile[]> = {};
  for (const statement of statements) {
    if (statement.type === 'STATEMENT') {
      const { matchedFiles, excludedFiles } = evaluateStatement(statement.key.name, originalChangedFiles);
      // netFiles = matchedFiles - excludedFiles
      const excludedSet = new Set(excludedFiles.map((f) => f.file));
      const netFiles = matchedFiles.filter((f) => !excludedSet.has(f.file));

      changesKeyValue[statement.key.name] = netFiles.length > 0;
      if (statement.key.path) {
        netFilesKeyValue[statement.key.name] = [...netFiles].sort();
      }
    }
  }

  return {
    changes: changesKeyValue,
    netFiles: netFilesKeyValue
  };
}
