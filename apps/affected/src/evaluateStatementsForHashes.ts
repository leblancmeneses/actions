import { execSync } from 'child_process';
import picomatch from 'picomatch';
import crypto from 'crypto';
import { AST, Expression } from './parser.types';
import { EXEC_SYNC_MAX_BUFFER } from './constants';
import { existsSync } from 'fs';

interface EvaluationResult {
  matchedFiles: string[];
  excludedFiles: string[];
}

export function allGitFiles() {
  return execSync('git ls-files -s', { encoding: 'utf-8', maxBuffer: EXEC_SYNC_MAX_BUFFER })
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [mode, hash, stage, ...fileParts] = line.split(/\s+/);
      const file = fileParts.join('');
      return { mode, hash, stage, file };
    })
    .filter(f => existsSync(f.file));
};

export async function evaluateStatementsForHashes(statements: AST): Promise<Record<string, string>> {
  const stageFiles = await allGitFiles();
  const allFiles = stageFiles.map(f => f.file);

  // A cache to avoid re-evaluating the same statement multiple times
  const seen = new Map<string, EvaluationResult>();

  function uniqueFiles(files: string[]): string[] {
    return Array.from(new Set(files));
  }

  function unionFiles(a: string[], b: string[]): string[] {
    return uniqueFiles([...a, ...b]);
  }

  function evaluateStatement(statementKey: string, files: string[]): EvaluationResult {
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

    const evaluatedResult = evaluateNode(statement.value, files);
    seen.set(statementKey, evaluatedResult);
    return evaluatedResult;
  }

  function evaluateNode(node: Expression, files: string[]): EvaluationResult {
    switch (node.type) {
      case 'EXPRESSION_WITH_EXCEPT': {
        // Evaluate base
        const baseResult = evaluateNode(node.base, files);

        // Evaluate excludes
        let excludeMatches: string[] = [];
        for (const excludeNode of node.excludes) {
          const res = evaluateNode(excludeNode, files);
          excludeMatches = unionFiles(excludeMatches, res.matchedFiles);
        }

        // Remove excluded matches from base matchedFiles
        const excludeSet = new Set(excludeMatches);
        const netFiles = baseResult.matchedFiles.filter((f) => !excludeSet.has(f));

        return {
          matchedFiles: netFiles,
          excludedFiles: []
        };
      }

      case 'OR': {
        if (node.values.length === 0) {
          return { matchedFiles: [], excludedFiles: [] };
        }

        let allMatches: string[] = [];
        for (const child of node.values) {
          const res = evaluateNode(child, files);
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

        // For AND, we need files that appear in all sets.
        // We'll intersect as we go along.
        let currentMatches: string[] | null = null;
        for (const child of node.values) {
          const res = evaluateNode(child, files);
          if (res.matchedFiles.length === 0) {
            // If any child fails to match, the whole AND fails
            return { matchedFiles: [], excludedFiles: [] };
          }

          if (currentMatches === null) {
            currentMatches = res.matchedFiles;
          } else {
            // intersect
            const setB = new Set(res.matchedFiles);
            currentMatches = currentMatches.filter(f => setB.has(f));
          }

          if (currentMatches.length === 0) {
            return { matchedFiles: [], excludedFiles: [] };
          }
        }

        return { matchedFiles: currentMatches || [], excludedFiles: [] };
      }

      case 'QUOTE_LITERAL': {
        const isMatch = picomatch(node.value, { dot: true });
        const matchingFiles = files.filter((f) => isMatch(f));

        return {
          matchedFiles: matchingFiles,
          excludedFiles: []
        };
      }

      case 'NEGATE': {
        // NOT operation: !exp
        // If exp matched M and excluded E, then !exp = all_files - (M ∪ E).
        const res = evaluateNode(node.exp, files);
        const considered = unionFiles(res.matchedFiles, res.excludedFiles);
        const consideredSet = new Set(considered);
        const complement = files.filter((f) => !consideredSet.has(f));

        return {
          matchedFiles: complement,
          excludedFiles: considered
        };
      }

      case 'STATEMENT_REF': {
        return evaluateStatement(node.value, files);
      }

      default:
        throw new Error(`Unsupported node type: ${(node as { type: string }).type}`);
    }
  }

  const resultHashes: Record<string, string> = {};
  for (const statement of statements) {
    if (statement.type === 'STATEMENT') {
      const { matchedFiles, excludedFiles } = evaluateStatement(statement.key.name, allFiles);
      if (statement.key.path) {
        // netFiles = matchedFiles - excludedFiles
        const excludedSet = new Set(excludedFiles);
        const netFiles = matchedFiles.filter((f) => !excludedSet.has(f));

        const sortedFiles = netFiles.slice().sort();
        const hash = crypto.createHash('sha1');
        for (const f of sortedFiles) {
          const fileHash = stageFiles.find(s => s.file === f).hash.trim();
          hash.update(fileHash + '\n');
        }

        resultHashes[statement.key.path] = hash.digest('hex');
      }
    }
  }

  return resultHashes;
}
