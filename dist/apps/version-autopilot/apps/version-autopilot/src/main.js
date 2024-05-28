var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var core = __toESM(require("@actions/core"));
var github = __toESM(require("@actions/github"));
function getVersion(versionMajor, versionMinor, versionPatch, versionShift) {
  const patch = (versionPatch + versionShift) % 100;
  const minor = (versionMinor + Math.floor((versionPatch + versionShift) / 100)) % 100;
  const major = versionMajor + Math.floor((versionMinor + Math.floor((versionPatch + versionShift) / 100)) / 100);
  const appVersionString = `${major}.${minor}.${patch}`;
  const appVersionCode = major * 1e4 + minor * 100 + patch;
  return {
    appVersionString,
    appVersionCode
  };
}
async function run() {
  try {
    const major = parseInt(core.getInput("major") || "0", 10);
    const minor = parseInt(core.getInput("minor") || "0", 10);
    const shift = parseInt(core.getInput("shift") || "0", 10);
    const patch = core.getInput("patch") ? parseInt(core.getInput("patch") || "0", 10) : github.context.runNumber;
    const version = getVersion(major, minor, patch, shift);
    console.log(`version: ${JSON.stringify(version, null, 2)}!`);
    const shortSha = `${github.context.sha}`.substring(0, 12);
    if (github.context.eventName === "pull_request") {
      core.setOutput("version_autopilot_string_recommended", `${version.appVersionString}-pr-${github.context.payload.pull_request.number}-${shortSha}`);
    } else {
      core.setOutput("version_autopilot_string_recommended", `${version.appVersionString}-${github.context.ref}-${shortSha}`);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}
run();
