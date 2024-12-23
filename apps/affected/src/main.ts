import * as core from '@actions/core';
import * as github from '@actions/github';
import { parse } from './parser';
import {getChangedFiles} from './changedFiles';
import {evaluateStatementsForChanges} from './evaluateStatementsForChanges';
import {allGitFiles, evaluateStatementsForHashes} from './evaluateStatementsForHashes';
import { AST } from './parser.types';

export const getImageName = (appTarget: string, sha: string, truncateSha1Size = 0, imageTagRegistry = '', imageTagPrefix = '', imageTagSuffix = '') => {
  let sha1 = sha;
  if (isNaN(truncateSha1Size) || truncateSha1Size === 0) {
    sha1=sha;
  } else if (truncateSha1Size > 0) {
    sha1=sha.slice(0, truncateSha1Size);
  } else {
    sha1=sha.slice(truncateSha1Size);
  }

  const imageName1 = `${appTarget}:${imageTagPrefix}${sha1}${imageTagSuffix}`;

  let imageName2 = `${appTarget}:latest`;
  if (github.context.eventName === 'pull_request') {
    imageName2 = `${appTarget}:pr-${github.context.payload.pull_request.number}`;
  }

  return [imageName1, imageName2].map((imageName) => `${imageTagRegistry || ''}${imageName}`);
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
    const truncateSha1Size = parseInt(core.getInput('recommended-imagetags-tag-truncate-size', { required: false }) || '0');
    const imageTagPrefix = core.getInput('recommended-imagetags-tag-prefix', { required: false }) || '';
    const imageTagSuffix = core.getInput('recommended-imagetags-tag-suffix', { required: false }) || '';
    const imageTagRegistry = core.getInput('recommended-imagetags-registry', { required: false }) || '';

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

      const allFiles = await allGitFiles();
      log(`All Git Files: ${allFiles.join('\n')}`, verbose);
      const commitSha = await evaluateStatementsForHashes(statements, allFiles);

      for (const statement of statements) {
        if (statement.type !== 'STATEMENT') continue;

        const { key } = statement;
        if (key.path) {
          affectedShas[key.name] = commitSha[key.name];

          const imageName = getImageName(key.name, commitSha[key.name], truncateSha1Size, imageTagRegistry, imageTagPrefix, imageTagSuffix);
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
