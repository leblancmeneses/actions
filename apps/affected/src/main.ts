import * as core from '@actions/core';
import * as github from '@actions/github';
import { getRules, processRules } from './common';


export const log = (verbose: boolean, message: string) => {
  if (verbose) {
    core.info(message);
  }
};

export async function run() {
  try {
    const rulesInput = getRules(core.getInput('rules', { required: false }), core.getInput('rules-file', { required: false }));
    const verbose = core.getInput('verbose', { required: false }) === 'true';
    const truncateSha1Size = parseInt(core.getInput('recommended-imagetags-tag-truncate-size', { required: false }) || '0');
    const imageTagPrefix = core.getInput('recommended-imagetags-tag-prefix', { required: false }) || '';
    const imageTagSuffix = core.getInput('recommended-imagetags-tag-suffix', { required: false }) || '';
    const imageTagRegistry = core.getInput('recommended-imagetags-registry', { required: false }) || '';
    const changedFilesOutputFile = core.getInput('changed-files-output-file', { required: false }) || '';

    log(verbose, `github.context: ${JSON.stringify(github.context, undefined, 2)}`);

    const affectedOutput = await processRules(
      log.bind(null, verbose),
      rulesInput, truncateSha1Size, imageTagRegistry, imageTagPrefix, imageTagSuffix, changedFilesOutputFile,
      {event: github.context.eventName, pull_request_number: github.context.payload?.pull_request?.number});

    core.setOutput('affected', affectedOutput);
    core.setOutput('affected_shas', affectedOutput.shas);
    core.setOutput('affected_changes', affectedOutput.changes);
    core.setOutput('affected_recommended_imagetags', affectedOutput.recommended_imagetags);
    core.info(`affected: ${JSON.stringify(affectedOutput, null, 2)}!`);
  } catch (error) {
    core.setFailed(error.message);
    throw error;
  }
}

if (!process.env.JEST_WORKER_ID) {
  run();
}
