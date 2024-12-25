import * as core from '@actions/core';
import * as ini from 'ini';
import * as github from '@actions/github';

export const log = (message: string, verbose: boolean) => {
  if (verbose) {
    core.info(message);
  }
};

const convertValue = (value: string) => {
  value = String(value).trim();

  if (value === 'true') return true;
  if (value === 'false') return false;

  if (!isNaN(Number(value))) return Number(value);

  return value;
};

const extractVariables = (input: string) => {
  const regex = /x__([a-zA-Z0-9._-]+)\s*=\s*['"]?([^'"\r\n]+)['"]?(?=[\r\n]|$)/g;
  const result: { [key: string]: string | number | boolean } = {};
  let match;

  while ((match = regex.exec(input)) !== null) {
    const key = match[1].toUpperCase(); // Remove the `x__` prefix
    result[key] = convertValue(match[2].trim());
  }

  return result;
}

export async function run() {
  try {
    const variablesInput = core.getInput('variables', { required: true });
    const verbose = core.getInput('verbose', { required: false }) === 'true';
    const iniObject = ini.parse(variablesInput) || {};
    let variablesObject = Object.keys(iniObject).reduce((agg, key) => {
      agg[key.toUpperCase()] = convertValue(iniObject[key]);
      return agg;
    }, {} as Record<string, unknown>);
    log(`pragma default variables: ${JSON.stringify(variablesObject, undefined, 2)}`, verbose);
    const description = (process.env['PR_BODY'] || github.context.payload?.pull_request?.body || '');
    if (description) {
      const overrideVars = extractVariables(description);
      log(`pragma override variables: ${JSON.stringify(overrideVars, undefined, 2)}`, verbose);
      variablesObject = { ...variablesObject, ...overrideVars };
    }

    core.setOutput('pragma', variablesObject);
    core.info(`pragma: ${JSON.stringify(variablesObject, undefined, 2)}`);
  } catch (error) {
    core.setFailed(error.message);
    throw error;
  }
}

if (!process.env.JEST_WORKER_ID) {
  run();
}
