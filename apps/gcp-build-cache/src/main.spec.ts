jest.mock("@actions/core");
jest.mock("@actions/exec");
jest.mock("@actions/github", () => {
  return {
    context: {
      ref: "refs/heads/main",
      eventName: "pull_request",
      payload: {
        pull_request: {
          number: 123,
          base: { sha: "base-sha" },
          head: { sha: "head-sha" },
        },
      },
      sha: "commit-sha",
    },
  };
});

import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { run } from "./main";

describe("run", () => {
  const mockGetInput = core.getInput as jest.MockedFunction<
    typeof core.getInput
  >;
  const mockExec = exec.exec as jest.MockedFunction<typeof exec.exec>;
  const mockSetFailed = core.setFailed as jest.MockedFunction<
    typeof core.setFailed
  >;
  const mockInfo = core.info as jest.MockedFunction<typeof core.info>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockGetInput.mockImplementation((name: string) => {
      if (name === "cache_key_path") return "path/to/cache";
      return "";
    });
  });

  it("should set CACHE_HIT to true if cache exists", async () => {
    mockExec.mockImplementation(async (command: string, args?: string[]) => {
      if (command === "gsutil" && args?.includes("stat")) {
        return 0;
      }
      if (
        (command === "gcloud" || command === "gsutil") &&
        args?.includes("--version")
      ) {
        return 0;
      }
      throw new Error("Command failed");
    });

    await run();

    expect(core.setOutput).toHaveBeenCalledWith("cache-hit", "true");
    expect(core.exportVariable).toHaveBeenCalledWith("CACHE_HIT", "true");
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  it("should set CACHE_HIT to false if cache does not exist", async () => {
    mockExec.mockImplementation(async (command: string, args?: string[]) => {
      if (command === "gsutil" && args?.includes("stat")) {
        throw new Error("Cache not found");
      }
      if (
        (command === "gcloud" || command === "gsutil") &&
        args?.includes("--version")
      ) {
        return 0;
      }
      throw new Error("Command failed");
    });

    await run();

    expect(core.setOutput).toHaveBeenCalledWith("cache-hit", "false");
    expect(core.exportVariable).toHaveBeenCalledWith("CACHE_HIT", "false");
    expect(mockInfo).toHaveBeenCalledWith(
      "🚀 Cache not found: path/to/cache, proceeding with build.",
    );
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  it("should set failed status if an error occurs", async () => {
    mockGetInput.mockImplementation(() => {
      throw new Error("Input error");
    });

    await expect(run()).rejects.toThrow();

    expect(mockSetFailed).toHaveBeenCalledWith(
      "Error checking cache: Input error",
    );
  });

  it("should check cache existence for each key in gcpBuildCache when cacheKeyPath is not provided", async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === "gcs-root-path") return "gs://abc-123/github-integration";
      if (name === "affected") {
        return JSON.stringify({
          changes: { "project-ui": true },
          shas: { "project-ui": "38aabc2d6ae9866f3c1d601cba956bb935c02cf5" },
        });
      }
      if (name === "additional-keys") {
        return JSON.stringify({ "project-ui": ["lint", "build", "e2e"] });
      }
      return "";
    });

    mockExec.mockImplementation(async (command: string, args?: string[]) => {
      if (
        (command === "gcloud" || command === "gsutil") &&
        args?.includes("--version")
      ) {
        return 0;
      }
      if (command === "gsutil" && args?.includes("stat")) {
        return 0; // Simulate cache exists
      }
      throw new Error("Command failed");
    });

    await run();

    expect(mockExec).toHaveBeenCalledWith("gcloud", [
      "--version",
    ]);
    expect(mockExec).toHaveBeenCalledWith("gsutil", [
      "--version",
    ]);
    expect(mockExec).toHaveBeenCalledWith("gsutil", [
      "-q",
      "stat",
      "gs://abc-123/github-integration/pr-123-project-ui-38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
    ], { silent: false });
    expect(mockExec).toHaveBeenCalledWith("gsutil", [
      "-q",
      "stat",
      "gs://abc-123/github-integration/pr-123-project-ui-lint-38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
    ], { silent: false });
    expect(mockExec).toHaveBeenCalledWith("gsutil", [
      "-q",
      "stat",
      "gs://abc-123/github-integration/pr-123-project-ui-build-38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
    ], { silent: false });
    expect(mockExec).toHaveBeenCalledWith("gsutil", [
      "-q",
      "stat",
      "gs://abc-123/github-integration/pr-123-project-ui-e2e-38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
    ], { silent: false });

    expect(core.setOutput).toHaveBeenCalledWith("cache", {
      "project-ui": {
        "cache-hit": true,
        "path":
          "gs://abc-123/github-integration/pr-123-project-ui-38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
      },
      "project-ui-lint": {
        "cache-hit": true,
        "path":
          "gs://abc-123/github-integration/pr-123-project-ui-lint-38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
      },
      "project-ui-build": {
        "cache-hit": true,
        "path":
          "gs://abc-123/github-integration/pr-123-project-ui-build-38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
      },
      "project-ui-e2e": {
        "cache-hit": true,
        "path":
          "gs://abc-123/github-integration/pr-123-project-ui-e2e-38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
      },
    });
  });

  it("should handle cache miss for each key in gcpBuildCache when cacheKeyPath is not provided", async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === "gcs-root-path") return "gs://abc-123/github-integration";
      if (name === "affected") {
        return JSON.stringify({
          changes: { "project-ui": true },
          shas: { "project-ui": "38aabc2d6ae9866f3c1d601cba956bb935c02cf5" },
        });
      }
      if (name === "additional-keys") {
        return JSON.stringify({ "project-ui": ["lint", "build", "e2e"] });
      }
      return "";
    });

    mockExec.mockImplementation(async (command: string, args?: string[]) => {
      if ((command === "gcloud" || command === "gsutil") && args?.includes("--version")) {
        return 0;
      }
      if (command === "gsutil" && args?.includes("stat")) {
        throw new Error("Cache not found"); // Simulate cache does not exist
      }
      throw new Error("Command failed");
    });

    await run();

    expect(mockExec).toHaveBeenCalledWith("gsutil", [
      "-q",
      "stat",
      "gs://abc-123/github-integration/pr-123-project-ui-38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
    ], { silent: false });
    expect(mockExec).toHaveBeenCalledWith("gsutil", [
      "-q",
      "stat",
      "gs://abc-123/github-integration/pr-123-project-ui-lint-38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
    ], { silent: false });
    expect(mockExec).toHaveBeenCalledWith("gsutil", [
      "-q",
      "stat",
      "gs://abc-123/github-integration/pr-123-project-ui-build-38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
    ], { silent: false });
    expect(mockExec).toHaveBeenCalledWith("gsutil", [
      "-q",
      "stat",
      "gs://abc-123/github-integration/pr-123-project-ui-e2e-38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
    ], { silent: false });

    expect(core.setOutput).toHaveBeenCalledWith("cache", {
      "project-ui": {
        "cache-hit": false,
        "path":
          "gs://abc-123/github-integration/pr-123-project-ui-38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
      },
      "project-ui-lint": {
        "cache-hit": false,
        "path":
          "gs://abc-123/github-integration/pr-123-project-ui-lint-38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
      },
      "project-ui-build": {
        "cache-hit": false,
        "path":
          "gs://abc-123/github-integration/pr-123-project-ui-build-38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
      },
      "project-ui-e2e": {
        "cache-hit": false,
        "path":
          "gs://abc-123/github-integration/pr-123-project-ui-e2e-38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
      },
    });
  });

  it("should skip cache check for keys when pragma SKIP-CACHE is true", async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === "pragma") return JSON.stringify({ "SKIP-CACHE": true });
      if (name === "gcs-root-path") return "gs://abc-123/github-integration";
      if (name === "affected") {
        return JSON.stringify({
          changes: { "project-ui": true },
          shas: { "project-ui": "38aabc2d6ae9866f3c1d601cba956bb935c02cf5" },
        });
      }
      if (name === "additional-keys") {
        return JSON.stringify({ "project-ui": ["lint", "build", "e2e"] });
      }
      return "";
    });

    mockExec.mockImplementation(async (command: string, args?: string[]) => {
      if (
        (command === "gcloud" || command === "gsutil") &&
        args?.includes("--version")
      ) {
        return 0;
      }
      if (command === "gsutil" && args?.includes("stat")) {
        return 0; // Simulate cache exists
      }
      throw new Error("Command failed");
    });

    await run();

    expect(core.setOutput).toHaveBeenCalledWith("cache", {
      "project-ui": { "cache-hit": false, "path": "gs://abc-123/github-integration/pr-123-project-ui-38aabc2d6ae9866f3c1d601cba956bb935c02cf5" },
      "project-ui-lint": { "cache-hit": false, "path": "gs://abc-123/github-integration/pr-123-project-ui-lint-38aabc2d6ae9866f3c1d601cba956bb935c02cf5" },
      "project-ui-build": { "cache-hit": false, "path": "gs://abc-123/github-integration/pr-123-project-ui-build-38aabc2d6ae9866f3c1d601cba956bb935c02cf5" },
      "project-ui-e2e": { "cache-hit": false, "path": "gs://abc-123/github-integration/pr-123-project-ui-e2e-38aabc2d6ae9866f3c1d601cba956bb935c02cf5" }
    });
  });


  it("should skip cache check for keys when pragma project-ui-build-cache is skip", async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === "pragma") return JSON.stringify({ ["project-ui-build-cache".toLocaleUpperCase()]: 'skip' });
      if (name === "gcs-root-path") return "gs://abc-123/github-integration";
      if (name === "affected") {
        return JSON.stringify({
          changes: { "project-ui": true },
          shas: { "project-ui": "38aabc2d6ae9866f3c1d601cba956bb935c02cf5" },
        });
      }
      if (name === "additional-keys") {
        return JSON.stringify({ "project-ui": ["lint", "build", "e2e"] });
      }
      return "";
    });

    mockExec.mockImplementation(async (command: string, args?: string[]) => {
      if (
        (command === "gcloud" || command === "gsutil") &&
        args?.includes("--version")
      ) {
        return 0;
      }
      if (command === "gsutil" && args?.includes("stat")) {
        return 0; // Simulate cache exists
      }
      throw new Error("Command failed");
    });

    await run();

    expect(core.setOutput).toHaveBeenCalledWith("cache", {
      "project-ui": { "cache-hit": true, "path": "gs://abc-123/github-integration/pr-123-project-ui-38aabc2d6ae9866f3c1d601cba956bb935c02cf5" },
      "project-ui-lint": { "cache-hit": true, "path": "gs://abc-123/github-integration/pr-123-project-ui-lint-38aabc2d6ae9866f3c1d601cba956bb935c02cf5" },
      "project-ui-build": { "cache-hit": false, "path": "gs://abc-123/github-integration/pr-123-project-ui-build-38aabc2d6ae9866f3c1d601cba956bb935c02cf5" },
      "project-ui-e2e": { "cache-hit": true, "path": "gs://abc-123/github-integration/pr-123-project-ui-e2e-38aabc2d6ae9866f3c1d601cba956bb935c02cf5" }
    });
  });

  it("should skip cache check for keys when pragma project-ui-build-cache is skip and SKIP-CACHE is true", async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === "pragma") return JSON.stringify({ "SKIP-CACHE": true, ["project-ui-build-cache".toLocaleUpperCase()]: 'skip' });
      if (name === "gcs-root-path") return "gs://abc-123/github-integration";
      if (name === "affected") {
        return JSON.stringify({
          changes: { "project-ui": true },
          shas: { "project-ui": "38aabc2d6ae9866f3c1d601cba956bb935c02cf5" },
        });
      }
      if (name === "additional-keys") {
        return JSON.stringify({ "project-ui": ["lint", "build", "e2e"] });
      }
      return "";
    });

    mockExec.mockImplementation(async (command: string, args?: string[]) => {
      if (
        (command === "gcloud" || command === "gsutil") &&
        args?.includes("--version")
      ) {
        return 0;
      }
      if (command === "gsutil" && args?.includes("stat")) {
        return 0; // Simulate cache exists
      }
      throw new Error("Command failed");
    });

    await run();

    expect(core.setOutput).toHaveBeenCalledWith("cache", {
      "project-ui": { "cache-hit": false, "path": "gs://abc-123/github-integration/pr-123-project-ui-38aabc2d6ae9866f3c1d601cba956bb935c02cf5" },
      "project-ui-lint": { "cache-hit": false, "path": "gs://abc-123/github-integration/pr-123-project-ui-lint-38aabc2d6ae9866f3c1d601cba956bb935c02cf5" },
      "project-ui-build": { "cache-hit": false, "path": "gs://abc-123/github-integration/pr-123-project-ui-build-38aabc2d6ae9866f3c1d601cba956bb935c02cf5" },
      "project-ui-e2e": { "cache-hit": false, "path": "gs://abc-123/github-integration/pr-123-project-ui-e2e-38aabc2d6ae9866f3c1d601cba956bb935c02cf5" }
    });
  });
});
