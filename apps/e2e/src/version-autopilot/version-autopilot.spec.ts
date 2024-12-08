// jobs:
//   init:
//     runs-on: ubuntu-latest
//     steps:
//       - name: Checkout code
//         uses: actions/checkout@v4
//
//       - name: patch major rollover
//         id: version
//         uses: leblancmeneses/actions/dist/apps/version-autopilot@main
//         env:
//           PATCH_OVERRIDE: 51
//         with:
//           major: 0
//           minor: 99
//           shift: 50
jest.mock("@actions/core");
jest.mock("@actions/github");
/* eslint-disable @nx/enforce-module-boundaries */
import { run } from "@version-autopilot/main";
import * as core from "@actions/core";
import * as github from "@actions/github";

describe("version-autopilot action", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    delete process.env["PATCH_OVERRIDE"];
    delete github.context.runNumber;
    delete github.context.eventName;
    delete github.context.payload;
    github.context.sha = "mockedSha123456789012";
    process.env["GITHUB_REF_NAME"] = "mockedBranch";
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should start at version 0.0.0", async () => {
    jest.spyOn(core, "getInput").mockImplementation((name) => {
      if (name === "major") return "0";
      if (name === "minor") return "0";
      if (name === "shift") return "0";
      return null;
    });
    const outputMock = jest.spyOn(core, "setOutput");
    github.context.runNumber = 0;

    await run();

    expect(outputMock).toHaveBeenCalledWith("version_autopilot_code", 0);
    expect(outputMock).toHaveBeenCalledWith("version_autopilot_string", "0.0.0");
    expect(outputMock).toHaveBeenCalledWith("version_autopilot_string_recommended", "0.0.0-mockedBranch-mockedSha123");
  });

  it("should correctly handle shift to version 0.0.50", async () => {
    jest.spyOn(core, "getInput").mockImplementation((name) => {
      if (name === "major") return "0";
      if (name === "minor") return "0";
      if (name === "shift") return "50";
      return null;
    });
    const outputMock = jest.spyOn(core, "setOutput");
    process.env["PATCH_OVERRIDE"] = "0";

    await run();

    expect(outputMock).toHaveBeenCalledWith("version_autopilot_code", 50);
    expect(outputMock).toHaveBeenCalledWith("version_autopilot_string", "0.0.50");
    expect(outputMock).toHaveBeenCalledWith("version_autopilot_string_recommended", "0.0.50-mockedBranch-mockedSha123");
  });

  it("should increment patch to version 0.0.51 with PATCH_OVERRIDE", async () => {
    jest.spyOn(core, "getInput").mockImplementation((name) => {
      if (name === "major") return "0";
      if (name === "minor") return "0";
      if (name === "shift") return "50";
      return null;
    });
    process.env["PATCH_OVERRIDE"] = "1";
    const outputMock = jest.spyOn(core, "setOutput");

    await run();

    expect(outputMock).toHaveBeenCalledWith("version_autopilot_code", 51);
    expect(outputMock).toHaveBeenCalledWith("version_autopilot_string", "0.0.51");
    expect(outputMock).toHaveBeenCalledWith("version_autopilot_string_recommended", "0.0.51-mockedBranch-mockedSha123");
  });

  it("should increment patch to version 0.0.51 without PATCH_OVERRIDE", async () => {
    jest.spyOn(core, "getInput").mockImplementation((name) => {
      if (name === "major") return "0";
      if (name === "minor") return "0";
      if (name === "shift") return "50";
      return null;
    });
    github.context.runNumber = 1;
    const outputMock = jest.spyOn(core, "setOutput");

    await run();

    expect(outputMock).toHaveBeenCalledWith("version_autopilot_code", 51);
    expect(outputMock).toHaveBeenCalledWith("version_autopilot_string", "0.0.51");
    expect(outputMock).toHaveBeenCalledWith("version_autopilot_string_recommended", "0.0.51-mockedBranch-mockedSha123");
  });

  it("should handle minor rollover to version 0.1.1", async () => {
    jest.spyOn(core, "getInput").mockImplementation((name) => {
      if (name === "major") return "0";
      if (name === "minor") return "0";
      if (name === "shift") return "50";
      return null;
    });
    github.context.runNumber = 51;
    const outputMock = jest.spyOn(core, "setOutput");

    await run();

    expect(outputMock).toHaveBeenCalledWith("version_autopilot_code", 101);
    expect(outputMock).toHaveBeenCalledWith("version_autopilot_string", "0.1.1");
    expect(outputMock).toHaveBeenCalledWith("version_autopilot_string_recommended", "0.1.1-mockedBranch-mockedSha123");
  });

  it("should handle major rollover to version 1.0.1", async () => {
    jest.spyOn(core, "getInput").mockImplementation((name) => {
      if (name === "major") return "0";
      if (name === "minor") return "99";
      if (name === "shift") return "50";
      return null;
    });
    github.context.runNumber = 51;
    const outputMock = jest.spyOn(core, "setOutput");

    await run();

    expect(outputMock).toHaveBeenCalledWith("version_autopilot_code", 10001);
    expect(outputMock).toHaveBeenCalledWith("version_autopilot_string", "1.0.1");
    expect(outputMock).toHaveBeenCalledWith("version_autopilot_string_recommended", "1.0.1-mockedBranch-mockedSha123");
  });

  it("should handle pull request event and generate appropriate version string", async () => {
    jest.spyOn(core, "getInput").mockImplementation((name) => {
      if (name === "major") return "0";
      if (name === "minor") return "1";
      if (name === "shift") return "0";
      return null;
    });
    github.context.runNumber = 1;
    github.context.eventName = "pull_request";
    github.context.payload = {
      pull_request: {
        number: 123
      }
    };
    const outputMock = jest.spyOn(core, "setOutput");

    await run();

    expect(outputMock).toHaveBeenCalledWith("version_autopilot_code", 101);
    expect(outputMock).toHaveBeenCalledWith("version_autopilot_string", "0.1.1");
    expect(outputMock).toHaveBeenCalledWith("version_autopilot_string_recommended", "0.1.1-pr-123-mockedSha123");
  });
});
