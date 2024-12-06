import * as core from '@actions/core';
import * as github from '@actions/github';
import { parse } from './parser';
import { execSync } from 'child_process';
import picomatch from 'picomatch';


function evaluateStatements(statements, changedFiles) {
  const result = {};
  const seen = new Set<string>();

  function evaluateStatement(statementKey) {
    if (seen.has(statementKey)) {
      throw new Error(`Recursive or circular reference detected for statement: ${statementKey}`);
    }
    seen.add(statementKey);

    const statement = statements.find((s) => s.key.name === statementKey);
    if (!statement) {
      throw new Error(`Referenced statement key '${statementKey}' does not exist.`);
    }

    let matches = false;

    for (const value of statement.value) {
      if (value.type === 'QUOTE_LITERAL') {
        const isMatch = picomatch(value.value);
        matches = matches || changedFiles.some((file) => isMatch(file));
      } else if (value.type === 'STATEMENT_REF') {
        matches = matches || evaluateStatement(value.value);
      } else if (value.type === 'INVERSE' && value.exp.type === 'QUOTE_LITERAL') {
        const isMatch = picomatch(value.exp.value);
        matches = matches && !changedFiles.some((file) => isMatch(file));
      }
    }

    seen.delete(statementKey);
    return matches;
  }

  for (const statement of statements) {
    if (statement.type === 'STATEMENT') {
      result[statement.key.name] = evaluateStatement(statement.key.name);
    }
  }

  return result;
}


export const getChangedFiles = async () => {
  const eventName = github.context.eventName;
  const baseSha = process.env.BASE_SHA || github.context.payload?.pull_request?.base?.sha;
  const headSha = process.env.HEAD_SHA || github.context.payload?.pull_request?.head?.sha || github.context.sha;

  let changedFiles = [];

  try {
    if (
      eventName === 'pull_request' || eventName === 'workflow_dispatch'
    ) {
      // Pull request or workflow dispatch event
      const baseDiffCommand = `git diff --name-only --diff-filter=ACMRT ${baseSha} ${headSha}`;
      changedFiles = execSync(baseDiffCommand)
        .toString()
        .trim()
        .split('\n')
        .map((file) => file.trim())
        .filter(Boolean);
    } else if (eventName === 'push') {
      // Push event
      const baseDiffCommand = 'git diff --name-only HEAD~1';
      changedFiles = execSync(baseDiffCommand)
        .toString()
        .trim()
        .split('\n')
        .map((file) => file.trim())
        .filter(Boolean);
    }

    core.info(`Changed Files: ${changedFiles.join('\n')}`);
    return changedFiles;
  } catch (error) {
    console.error('Error executing Git command:', error.message);
    return [];
  }
}

export const getCommitHash = (path: string, hasChanges: boolean) => {
  const folderOfInterest = path.startsWith("./") ? path : `./${path}`;
  const baseRef = process.env.BASE_REF || github.context.payload?.pull_request?.base?.ref || github.context.ref;
  const pragmaForceBuild = process.env.LATEST_EVEN_WITHOUT_CHANGES === 'true';

  let commitSha = execSync(
    `git log remotes/origin/${baseRef} --oneline --pretty=format:"%H" -n 1 -- "${folderOfInterest}"`
  ).toString().trim();

  if (pragmaForceBuild) {
    // Force build, always take the latest commit hash
    commitSha = execSync(`git log --oneline --pretty=format:"%H" -n 1 -- "${folderOfInterest}"`)
      .toString()
      .trim();
  } else if (hasChanges) {
    commitSha = execSync(`git log --oneline --pretty=format:"%H" -n 1 -- "${folderOfInterest}"`)
      .toString()
      .trim();
  }

  return commitSha;
}

export const getDevOrProdPrefixImageName = (hasChanges: boolean, sha: string, appTarget: string, path?: string) => {
  const folderOfInterest = path? path.startsWith("./") ? path : `./${path}`: `./${appTarget}`;

  const baseRef = process.env.BASE_REF || github.context.payload?.pull_request?.base?.ref || github.context.ref;
  const pragmaForceBuild = process.env.LATEST_EVEN_WITHOUT_CHANGES === 'true';

  const commitShaBefore = execSync(
    `git log remotes/origin/${baseRef} --oneline --pretty=format:"%H" -n 1 -- "${folderOfInterest}"`
  ).toString().trim();

  let commitShaAfter = commitShaBefore;

  if (pragmaForceBuild) {
    commitShaAfter = execSync(`git log --oneline --pretty=format:"%H" -n 1 -- "${folderOfInterest}"`)
      .toString()
      .trim();
  } else if(hasChanges) {
    commitShaAfter = execSync(`git log --oneline --pretty=format:"%H" -n 1 -- "${folderOfInterest}"`)
      .toString()
      .trim();
  }

  let imageName = `${appTarget}:dev-${sha}`;
  if (commitShaBefore === commitShaAfter) {
    imageName = `${appTarget}:prod-${sha}`;
  }

  return imageName;
}


export async function run() {
  try {
    const affectedImages: Record<string, string> = {};
    const affectedShas: Record<string, string> = {};
    const affectedChanges: Record<string, boolean> = {};

    const rulesInput = core.getInput('rules', { required: true });

    if (rulesInput) {
      const statements = parse(rulesInput, undefined);

      if (!Array.isArray(statements)) {
        throw new Error('Rules must be an array of statements');
      }

      const affected = evaluateStatements(statements, await getChangedFiles()) as Record<string, boolean>;
      for (const [key, value] of Object.entries(affected)) {
        affectedChanges[key] = value;
      }

      for (const statement of statements) {
        if (statement.type !== 'STATEMENT') continue;

        const { key } = statement;
        if (key.path) {
          const commitSha = getCommitHash(key.path, affectedChanges[key.name]);
          affectedShas[key.name] = commitSha;

          const imageName = getDevOrProdPrefixImageName(affectedChanges[key.name], commitSha, key.name, key.path);
          affectedImages[key.name] = imageName;

          core.info(
            `Key: ${key.name}, Path: ${key.path}, Commit SHA: ${commitSha}, Image: ${imageName}`
          );
        }
      }
    }

    core.setOutput('affected_images', affectedImages);
    core.setOutput('affected_shas', affectedShas);
    core.setOutput('affected_changes', affectedChanges);
  } catch (error) {
    core.setFailed(error.message);
  }
}

if (!process.env.JEST_WORKER_ID) {
  run();
}
