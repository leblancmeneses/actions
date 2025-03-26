import * as core from '@actions/core';
import * as github from '@actions/github';
import { getRules, mapResultToOutput, parseRegistryInput, processRules } from './common';


export const log = (verbose: boolean, message: string) => {
  if (verbose) {
    core.info(message);
  }
};


export async function run() {
  try {
    const rulesInput = getRules(core.getInput('rules', { required: false }), core.getInput('rules-file', { required: false }));
    const verbose = core.getInput('verbose', { required: false }) === 'true';
    const imageTagFormat = core.getInput('recommended-imagetags-tag-format', { required: false }) || '';
    const imageTagFormatWhenChanged = core.getInput('recommended-imagetags-tag-format-whenchanged', { required: false }) || '';
    const imageTagRegistry = parseRegistryInput(core.getInput('recommended-imagetags-registry', { required: false }) || '');
    const removeTarget = core.getInput('recommended-imagetags-tag-remove-target', { required: false }) === 'true';
    const changedFilesOutputFile = core.getInput('changed-files-output-file', { required: false }) || '';

    log(verbose, `github.context: ${JSON.stringify(github.context, undefined, 2)}`);

    const affectedResults = await processRules(
      log.bind(null, verbose),
      rulesInput, imageTagRegistry, imageTagFormat, imageTagFormatWhenChanged, removeTarget, changedFilesOutputFile,
      {event: github.context.eventName, pull_request_number: github.context.payload?.pull_request?.number});

    const output = mapResultToOutput(affectedResults);
    core.setOutput('affected', output);
    core.setOutput('affected_shas', affectedResults.shas);
    core.setOutput('affected_changes', affectedResults.changes);
    core.setOutput('affected_recommended_imagetags', affectedResults.recommended_imagetags);
    core.info(`affected:\n${JSON.stringify(output, undefined, 2)}`);
  } catch (error) {
    core.setFailed(error.message);
    throw error;
  }
}

if (!process.env.JEST_WORKER_ID) {
  run();
}
