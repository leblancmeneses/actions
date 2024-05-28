import * as core from '@actions/core';
import * as github from '@actions/github';

function getVersion(versionMajor, versionMinor, versionPatch, versionShift) {
  const patch = (versionPatch + versionShift)%100;
  const minor = (versionMinor + Math.floor((versionPatch + versionShift)/100)) % 100;
  const major = versionMajor + Math.floor((versionMinor + Math.floor((versionPatch + versionShift)/100))/100);
  const appVersionString = `${major}.${minor}.${patch}`;
  const appVersionCode= major*10000 + minor*100 + patch;
  return {
    appVersionString,
    appVersionCode
  };
}

async function run() {
  try {
    const major = parseInt(core.getInput('major') || '0', 10);
    const minor = parseInt(core.getInput('minor') || '0', 10);
    const shift = parseInt(core.getInput('shift') || '0', 10);

    const patch = core.getInput('patch')? parseInt(core.getInput('patch') || '0', 10) : github.context.runNumber;
    const version = getVersion(major, minor, patch, shift);
    console.log(`version: ${JSON.stringify(version, null, 2)}!`);
    const shortSha = `${github.context.sha}`.substring(0, 12);
    if (github.context.eventName === 'pull_request') {
      core.setOutput('version_autopilot_string_recommended', `${version.appVersionString}-pr-${github.context.payload.pull_request.number}-${shortSha}`);
    } else {
      core.setOutput('version_autopilot_string_recommended', `${version.appVersionString}-${github.context.ref}-${shortSha}`);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();