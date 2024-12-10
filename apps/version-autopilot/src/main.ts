import * as core from '@actions/core';
import * as github from '@actions/github';

function getVersion(versionMajor, versionMinor, versionPatch, versionShift) {
  const patch = (versionPatch + versionShift) % 100;
  const minor = (versionMinor + Math.floor((versionPatch + versionShift) / 100)) % 100;
  const major = versionMajor + Math.floor((versionMinor + Math.floor((versionPatch + versionShift) / 100)) / 100);
  const versionString = `${major}.${minor}.${patch}`;
  const versionCode = major * 10000 + minor * 100 + patch;
  return {
    versionString,
    versionCode
  };
}

export async function run() {
  try {
    const major = parseInt(core.getInput('major') || '0', 10);
    const minor = parseInt(core.getInput('minor') || '0', 10);
    const shift = parseInt(core.getInput('shift') || '0', 10);

    // PATCH_OVERRIDE is used for testing purposes.
    const patch = process.env['PATCH_OVERRIDE'] ? parseInt(process.env['PATCH_OVERRIDE'] || '0', 10) : github.context.runNumber;
    const version = getVersion(major, minor, patch, shift);
    const shortSha = `${github.context.sha}`.substring(0, 12);
    let versionStringRecommended = `${version.versionString}-${process.env['GITHUB_REF_NAME'] || ''}-${shortSha}`;
    if (github.context.eventName === 'pull_request') {
      versionStringRecommended = `${version.versionString}-pr-${github.context.payload.pull_request.number}-${shortSha}`;
    }
    core.setOutput('version_autopilot_string_recommended', versionStringRecommended);
    core.setOutput('version_autopilot_string', version.versionString);
    core.setOutput('version_autopilot_code', version.versionCode);

    core.info(`version: ${JSON.stringify({
      version_autopilot_string_recommended: versionStringRecommended,
      version_autopilot_string: version.versionString,
      version_autopilot_code: version.versionCode
    }, null, 2)}!`);
  } catch (error) {
    core.setFailed(error.message);
  }
}

if (!process.env.JEST_WORKER_ID) {
  run();
}
