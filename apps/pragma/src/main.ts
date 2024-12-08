import * as core from '@actions/core';
import * as ini from 'ini';
import * as github from '@actions/github';

const convertValue = (value: string) => {
  value = String(value).trim();

  if (value === 'true') return true;
  if (value === 'false') return false;

  if (!isNaN(Number(value))) return Number(value);

  return value;
};

const extractVariables = (input: string) => {
  const regex = /x__([a-zA-Z0-9._-]+)\s*=\s*['"]?([^'"\r\n]+)['"]?(?=[\r\n]|$)/g;
  const result: { [key: string]: any } = {};
  let match;

  while ((match = regex.exec(input)) !== null) {
    const key = match[1]; // Remove the `x__` prefix
    result[key] = convertValue(match[2].trim());
  }

  return result;
}

export async function run() {
  try {
    const variablesInput = core.getInput('variables');

    let variablesObject = ini.parse(variablesInput) || {};
    Object.keys(variablesObject).forEach((key) => {
      variablesObject[key] = convertValue(variablesObject[key]);
    });
    core.info(`pragma default variables: ${JSON.stringify(variablesObject, undefined, 2)}`);
    core.info(JSON.stringify(github, undefined, 2));
    const description = (process.env['PR_BODY'] || github.context.payload?.pull_request?.body || '');
    if (description) {
      const overrideVars = extractVariables(description);
      core.info(`pragma override variables: ${JSON.stringify(overrideVars, undefined, 2)}`);
      variablesObject = {...variablesObject, ...overrideVars};
      core.info(`merged json: ${JSON.stringify(variablesObject, undefined, 2)}`);
    }

    core.setOutput('pragma', JSON.stringify(variablesObject));
  } catch (error) {
    core.setFailed(error.message);
  }
}

if (!process.env.JEST_WORKER_ID) {
  run();
}
