import * as core from '@actions/core';
import * as github from '@actions/github';
import * as yaml from 'js-yaml';
import { parse } from './parser';
import { execSync } from 'child_process';
import picomatch from 'picomatch';

function parseYaml(input: string): any {
  try {
    return yaml.load(input);
  } catch (error) {
    throw new Error(`Failed to parse as YAML: ${error.message} \n\n${input}`);
  }
}

function evaluateStatements(statements, changedFiles) {
  const result = {};
  const seen = new Set<string>();

  function evaluateStatement(statementKey) {
    if (seen.has(statementKey)) {
      throw new Error(`Recursive or circular reference detected for statement: ${statementKey}`);
    }
    seen.add(statementKey);

    const statement = statements.find((s) => s.key === statementKey);
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
      result[statement.key] = evaluateStatement(statement.key);
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

export function getCommitHash(folderOfInterest: string): string {
  const baseRef = process.env.BASE_REF || github.context.payload?.pull_request?.base?.ref || github.context.ref;
  const pragmaForceBuild = process.env.LATEST_EVEN_WITHOUT_CHANGES === 'true';

  let commitSha = execSync(
    `git log remotes/origin/${baseRef} --oneline --pretty=format:"%H" -n 1 -- "./${folderOfInterest}"`
  ).toString().trim();

  if (pragmaForceBuild) {
    // Force build, always take the latest commit hash
    commitSha = execSync(`git log --oneline --pretty=format:"%H" -n 1 -- "./${folderOfInterest}"`)
      .toString()
      .trim();
  } else {
    // Verify if there are any actual changes to the folder of interest
    const modifiedFiles = execSync(`echo ${process.env.BASE_DIFF}`).toString().trim().split(/\s+/);

    for (const item of modifiedFiles) {
      const escapedInput = folderOfInterest.replace(/\//g, '\\/');
      if (item.startsWith(`${escapedInput}/`)) {
        commitSha = execSync(`git log --oneline --pretty=format:"%H" -n 1 -- "./${folderOfInterest}"`)
          .toString()
          .trim();
        break;
      }
    }
  }

  return commitSha;
}

export function getDevOrProdPrefixImageName(appTarget: string, sha: string, folderOfInterest?: string): string {
  folderOfInterest = folderOfInterest || appTarget;

  const baseRef = process.env.BASE_REF || github.context.payload?.pull_request?.base?.ref || github.context.ref;
  const pragmaForceBuild = process.env.LATEST_EVEN_WITHOUT_CHANGES === 'true';

  const commitShaBefore = execSync(
    `git log remotes/origin/${baseRef} --oneline --pretty=format:"%H" -n 1 -- "./${folderOfInterest}"`
  ).toString().trim();

  let commitShaAfter = commitShaBefore;

  if (pragmaForceBuild) {
    commitShaAfter = execSync(`git log --oneline --pretty=format:"%H" -n 1 -- "./${folderOfInterest}"`)
      .toString()
      .trim();
  } else {
    // Only set commitShaAfter if there are real diff changes.
    const modifiedFiles = execSync(`echo ${process.env.BASE_DIFF}`).toString().trim().split(/\s+/);

    for (const item of modifiedFiles) {
      const escapedInput = folderOfInterest.replace(/\//g, '\\/');
      if (item.startsWith(`${escapedInput}/`)) {
        commitShaAfter = execSync(`git log --oneline --pretty=format:"%H" -n 1 -- "./${folderOfInterest}"`)
          .toString()
          .trim();
        break;
      }
    }
  }

  let imageName = `${appTarget}:dev-${sha}`;
  if (commitShaBefore === commitShaAfter) {
    imageName = `${appTarget}:prod-${sha}`;
  }

  return imageName;
}


export async function run() {
  try {
    const affectedImages: string[] = [];
    const affectedShas: Record<string, string> = {};
    const affectedChanges: Record<string, boolean> = {};
    const shaPathInput = core.getInput('shaPaths', { required: false });
    if (shaPathInput) {
      const shaPath = parseYaml(shaPathInput);
      if (!Array.isArray(shaPath)) {
        throw new Error('shaPaths must be an array of key-value pairs');
      }

      if(!process.env.JEST_WORKER_ID) {
        for (const entry of shaPath) {
          const [key, value] = Object.entries(entry)[0];
          
          // Generate the commit SHA for the given folder of interest
          const commitSha = getCommitHash(value as string);
          affectedShas[key] = commitSha;

          // Generate the image name with the appropriate prefix (dev or prod)
          const imageName = getDevOrProdPrefixImageName(key, commitSha, value as string);
          affectedImages.push(imageName);

          core.info(`Key: ${key}, Value: ${value}, Commit SHA: ${commitSha}, Image: ${imageName}`);
        }
      }
    }


    const hasChangesRules = core.getInput('hasChangesRules', { required: false });
    if (hasChangesRules) {
      const statements = parse(hasChangesRules, undefined);
      const affected = evaluateStatements(statements, await getChangedFiles()) as Record<string, boolean>;
      for (const [key, value] of Object.entries(affected)) {
        affectedChanges[key] = value;
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
