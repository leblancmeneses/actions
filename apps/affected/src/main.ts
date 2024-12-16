import * as core from '@actions/core';
import * as github from '@actions/github';
import { parse } from './parser';
import {getChangedFiles} from './changedFiles';
import {evaluateStatementsForChanges} from './evaluateStatementsForChanges';
import {evaluateStatementsForHashes} from './evaluateStatementsForHashes';
import { AST } from './parser.types';


export const getImageName = (appTarget: string, hasChanges: boolean, sha: string, productionBranch?: string, imageTagPrefix?: string) => {
  const baseRef = process.env.BASE_REF || github.context.payload?.pull_request?.base?.ref || process.env.GITHUB_REF_NAME;

  let imageName1 = `${appTarget}:${baseRef}-${sha}`;
  if (!hasChanges) {
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

    log(`github.context: ${JSON.stringify(github.context, undefined, 2)}`, verbose);

    if (rulesInput) {
      const statements = parse(rulesInput, undefined) as AST;

      if (!Array.isArray(statements)) {
        throw new Error('Rules must be an array of statements');
      }

      const changedFiles = await getChangedFiles();
      log(`Changed Files: ${changedFiles.join('\n')}`, verbose);

      const {changes} = evaluateStatementsForChanges(statements, changedFiles);
      for (const [key, value] of Object.entries(changes)) {
        affectedChanges[key] = value;
      }

      const commitSha = await evaluateStatementsForHashes(statements);

      for (const statement of statements) {
        if (statement.type !== 'STATEMENT') continue;

        const { key } = statement;
        if (key.path) {
          affectedShas[key.name] = commitSha[key.name];

          const imageName = getImageName(key.name, affectedChanges[key.name], commitSha[key.name], productionBranch, imageTagPrefix);
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
    core.setOutput('affected_shas', affectedShas);
    core.setOutput('affected_changes', affectedChanges);
    core.setOutput('affected_recommended_imagetags', affectedImageTags);
    core.info(`affected: ${JSON.stringify(affectedOutput, null, 2)}!`);
  } catch (error) {
    core.setFailed(error.message);
    throw error;
  }
}

if (!process.env.JEST_WORKER_ID) {
  run();
}
