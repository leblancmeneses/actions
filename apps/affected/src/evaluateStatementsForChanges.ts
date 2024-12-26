import picomatch from 'picomatch';
import { AST, Expression } from './parser.types';
import { ChangedFile, mapGitStatusCode } from './changedFiles';

interface EvaluationResult {
  isTrue: boolean;
  matchedFiles: ChangedFile[];
}

export function evaluateStatementsForChanges(statements: AST, originalChangedFiles: ChangedFile[]): {
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
      const value = seen.get(statementKey);
      if (value === undefined) {
        throw new Error(`Unexpected undefined value for key: ${statementKey}`);
      }
      return value;
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
        const baseResult = evaluateNode(node.base, changedFiles);

        // Evaluate excludes
        let excludeFiles: ChangedFile[] = [];
        for (const excludeNode of node.excludes) {
          const res = evaluateNode(excludeNode, changedFiles);
          // Excluding files that match exclude patterns
          excludeFiles = unionFiles(excludeFiles, res.matchedFiles);
        }

        // Remove excluded matches from base matchedFiles
        const excludeSet = new Set(excludeFiles.map((f) => f.file));
        const netFiles = baseResult.matchedFiles.filter((f) => !excludeSet.has(f.file));

        return {
          isTrue: baseResult.isTrue && netFiles.length > 0,
          matchedFiles: netFiles
        };
      }

      case 'OR': {
        let anyTrue = false;
        let allMatches: ChangedFile[] = [];
        for (const child of node.values) {
          const res = evaluateNode(child, changedFiles);
          if (res.isTrue) {
            anyTrue = true;
            allMatches = unionFiles(allMatches, res.matchedFiles);
          }
        }
        return {
          isTrue: anyTrue,
          matchedFiles: anyTrue ? allMatches : []
        };
      }

      case 'AND': {
        if (node.values.length === 0) {
          // Empty AND should probably be considered true with no matches
          return { isTrue: true, matchedFiles: [] };
        }

        let allTrue = true;
        let combinedMatches: ChangedFile[] = [];
        for (const child of node.values) {
          const res = evaluateNode(child, changedFiles);
          if (!res.isTrue) {
            // If any child is false, AND is false
            allTrue = false;
            break;
          }
          combinedMatches = unionFiles(combinedMatches, res.matchedFiles);
        }

        return {
          isTrue: allTrue,
          matchedFiles: allTrue ? combinedMatches : []
        };
      }

      case 'QUOTE_LITERAL': {
        const isMatch = picomatch(node.value, { dot: true, nocase: !!node.ignoreCase });
        let matchingFiles = changedFiles.filter((cf) => isMatch(cf.file));

        if (node.suffix) {
          const requiredStatus = mapGitStatusCode(node.suffix);
          matchingFiles = matchingFiles.filter((cf) => cf.status === requiredStatus);
        }

        return {
          isTrue: matchingFiles.length > 0,
          matchedFiles: matchingFiles
        };
      }

      case 'REGEX_LITERAL': {
        const regex = new RegExp(node.pattern, node.flags);
        let matchingFiles = changedFiles.filter((cf) => regex.test(cf.file));

        if (node.suffix) {
          const requiredStatus = mapGitStatusCode(node.suffix);
          matchingFiles = matchingFiles.filter((cf) => cf.status === requiredStatus);
        }

        return {
          isTrue: matchingFiles.length > 0,
          matchedFiles: matchingFiles
        };
      }

      case 'NEGATE': {
        const res = evaluateNode(node.exp, changedFiles);
        // Negation: If inner is true, negation is false; if inner is false, negation is true.
        // Negation represents absence, so matchedFiles for a negation should be empty when isTrue is true.
        return {
          isTrue: !res.isTrue,
          matchedFiles: !res.isTrue ? [] : []
        };
      }

      case 'STATEMENT_REF': {
        return evaluateStatement(node.value, changedFiles);
      }

      default:
        throw new Error(`Unsupported node type: ${(node as { type: string }).type}`);
    }
  }

  const changesKeyValue: Record<string, boolean> = {};
  const netFilesKeyValue: Record<string, ChangedFile[]> = {};
  for (const statement of statements) {
    if (statement.type === 'STATEMENT') {
      const { isTrue, matchedFiles } = evaluateStatement(statement.key.name, originalChangedFiles);
      changesKeyValue[statement.key.name] = isTrue;
      if (statement.key.path) {
        netFilesKeyValue[statement.key.name] = [...matchedFiles].sort((a, b) => a.file.localeCompare(b.file));
      }
    }
  }

  return {
    changes: changesKeyValue,
    netFiles: netFilesKeyValue
  };
}
