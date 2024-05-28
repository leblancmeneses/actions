import * as core from '@actions/core';

async function run() {
  try {
    const nameToGreet = core.getInput('who-to-greet');
    console.log(`Hello ${nameToGreet}!`);
    const time = new Date().toTimeString();
    core.setOutput('time', time);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();