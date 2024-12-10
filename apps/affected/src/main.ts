import * as core from '@actions/core';
import * as github from '@actions/github';
import { parse } from './parser';
import { execSync } from 'child_process';
import fs from 'fs';
import picomatch from 'picomatch';


function evaluateStatements(statements, originalChangedFiles) {
  const result = {};

  function evaluateStatement(statementKey, changedFiles, seen = new Set<string>()) {
    if (seen.has(statementKey)) {
      throw new Error(`Recursive or circular reference detected for statement: ${statementKey}`);
    }
    seen.add(statementKey);

    const statement = statements.find((s) => s.key.name === statementKey);
    if (!statement) {
      throw new Error(`Referenced statement key '${statementKey}' does not exist.`);
    }

    let remainingFiles = [];

    for (const value of statement.value) {
      let currentFiles = [...changedFiles]; // Start with original files for each value

      if (value.type === 'QUOTE_LITERAL') {
        // Filter the files that match the QUOTE_LITERAL pattern
        const isMatch = picomatch(value.value);
        currentFiles = currentFiles.filter((file) => isMatch(file));
      } else if (value.type === 'STATEMENT_REF') {
        // Recursively evaluate the referenced statement and append new matches
        const refMatches = evaluateStatement(value.value, originalChangedFiles, seen);
        currentFiles = [...new Set([...currentFiles, ...(refMatches || [])])];
      } else if (value.type === 'INVERSE' && value.exp.type === 'QUOTE_LITERAL') {
        // Filter out files that match the INVERSE pattern
        const isMatch = picomatch(value.exp.value);
        currentFiles = currentFiles.filter((file) => !isMatch(file));
      }

      // Append currentFiles to remainingFiles while avoiding duplicates
      remainingFiles = [...new Set([...remainingFiles, ...currentFiles])];
    }

    seen.delete(statementKey);
    return remainingFiles;
  }


  for (const statement of statements) {
    if (statement.type === 'STATEMENT') {
      result[statement.key.name] = evaluateStatement(statement.key.name, originalChangedFiles).length > 0;
    }
  }

  return result;
}


export const getChangedFiles = async () => {
  const eventName = github.context.eventName;
  const baseSha = process.env.BASE_SHA || github.context.payload?.pull_request?.base?.sha || github.context.sha;
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

    return changedFiles;
  } catch (error) {
    console.error('Error executing Git command:', error.message);
    return [];
  }
}

export const getCommitHash = (path: string, hasChanges: boolean) => {
  const folderOfInterest = path.startsWith("./") ? path : `./${path}`;
  const baseSha = process.env.BASE_SHA || github.context.payload?.pull_request?.base?.sha || github.context.sha;
  const headSha = process.env.HEAD_SHA || github.context.payload?.pull_request?.head?.sha || github.context.sha;

  let commitSha = execSync(
    `git log ${baseSha} --oneline --pretty=format:"%H" -n 1 -- "${folderOfInterest}"`
  ).toString().trim();

  if (hasChanges) {
    commitSha = execSync(`git log ${headSha} --oneline --pretty=format:"%H" -n 1 -- "${folderOfInterest}"`)
      .toString()
      .trim();
  }

  return commitSha;
}

export const getDevOrProdPrefixImageName = (hasChanges: boolean, sha: string, appTarget: string, path?: string, productionBranch?: string, imageTagPrefix?: string) => {
  const folderOfInterest = path ? path.startsWith("./") ? path : `./${path}` : `./${appTarget}`;

  const baseRef = process.env.BASE_REF || github.context.payload?.pull_request?.base?.ref || github.context.ref;
  const baseSha = process.env.BASE_SHA || github.context.payload?.pull_request?.base?.sha || github.context.sha;
  const headSha = process.env.HEAD_SHA || github.context.payload?.pull_request?.head?.sha || github.context.sha;

  const commitShaBefore = execSync(
    `git log ${baseSha} --oneline --pretty=format:"%H" -n 1 -- "${folderOfInterest}"`
  ).toString().trim();

  let commitShaAfter = commitShaBefore;

  if (hasChanges) {
    commitShaAfter = execSync(`git log ${headSha} --oneline --pretty=format:"%H" -n 1 -- "${folderOfInterest}"`)
      .toString()
      .trim();
  }


  let imageName1 = `${appTarget}:${baseRef}-${sha}`;
  if (commitShaBefore === commitShaAfter) {
    if (productionBranch) {
      imageName1 = `${appTarget}:${productionBranch}-${sha}`;
    }
  }

  let imageName2 = `${appTarget}:latest`;
  if (github.context.eventName === 'pull_request') {
    imageName2 = `${appTarget}:pr-${github.context.payload.pull_request.number}`;
  }

  return [imageName1, imageName2].map((imageName) => `${imageTagPrefix || ''}${imageName}`);
}

export const log = (message: string, verbose: boolean) => {
  if (verbose) {
    core.info(message);
  }
};

export async function run() {
  try {
    const affectedImageTags: Record<string, string[]> = {};
    const affectedShas: Record<string, string> = {};
    const affectedChanges: Record<string, boolean> = {};

    const rulesInput = core.getInput('rules', { required: true });
    const verbose = core.getInput('verbose', { required: false }) === 'true';
    const productionBranch = core.getInput('gitflow-production-branch', { required: false }) || '';
    const imageTagPrefix = core.getInput('recommended-imagetags-prefix', { required: false }) || '';

    if (rulesInput) {
      const statements = parse(rulesInput, undefined);

      if (!Array.isArray(statements)) {
        throw new Error('Rules must be an array of statements');
      }

      const changedFiles = await getChangedFiles();
      log(`Changed Files: ${changedFiles.join('\n')}`, verbose);

      const affected = evaluateStatements(statements, changedFiles) as Record<string, boolean>;
      for (const [key, value] of Object.entries(affected)) {
        affectedChanges[key] = value;
      }

      for (const statement of statements) {
        if (statement.type !== 'STATEMENT') continue;

        const { key } = statement;
        if (key.path) {
          if (!fs.existsSync(key.path) || !fs.lstatSync(key.path).isDirectory()) {
            throw new Error(`Invalid directory: ${key.path}`);
          }
          const commitSha = getCommitHash(key.path, affectedChanges[key.name]);
          affectedShas[key.name] = commitSha;

          const imageName = getDevOrProdPrefixImageName(affectedChanges[key.name], commitSha, key.name, key.path, productionBranch, imageTagPrefix);
          affectedImageTags[key.name] = imageName;

          log(`Key: ${key.name}, Path: ${key.path}, Commit SHA: ${commitSha}, Image: ${imageName}`, verbose);
        }
      }
    }

    const affectedOutput = {
      shas: affectedShas,
      changes: affectedChanges,
      recommended_imagetags: affectedImageTags,
    };
    core.setOutput('affected', affectedOutput);
    core.info(`affected: ${JSON.stringify(affectedOutput, null, 2)}!`);
  } catch (error) {
    core.setFailed(error.message);
  }
}

if (!process.env.JEST_WORKER_ID) {
  run();
}
