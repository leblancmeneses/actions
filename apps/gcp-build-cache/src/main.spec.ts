jest.mock('@google-cloud/storage');
jest.mock("@actions/core");
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

import {Storage} from '@google-cloud/storage';
import * as core from "@actions/core";
import { run } from "./main";
import { GoogleCloudAuthException } from "./exceptions/google-cloud-auth.exception";

describe("run", () => {
  const mockGetInput = core.getInput as jest.MockedFunction<
    typeof core.getInput
  >;
  const mockSetFailed = core.setFailed as jest.MockedFunction<
    typeof core.setFailed
  >;
  const mockInfo = core.info as jest.MockedFunction<typeof core.info>;

  const mockFile = {
    exists: jest.fn(),
  };

  const mockBucket = {
    file: jest.fn(() => mockFile),
  };

  const mockStorageInstance = {
    bucket: jest.fn(() => mockBucket),
  };


  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    (Storage as unknown as jest.Mock).mockImplementation(() => mockStorageInstance);

    mockGetInput.mockImplementation((name: string) => {
      if (name === "cache_key_path") return "path/to/cache";
      return "";
    });

    process.env.GOOGLE_APPLICATION_CREDENTIALS = "path/to/credentials.json";
  });

  it("should set failed status if auth is not available", async () => {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    await expect(run()).rejects.toThrow(GoogleCloudAuthException);
    expect(mockSetFailed).toHaveBeenCalledWith(new GoogleCloudAuthException().message);
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

  it("should set CACHE_HIT to true if cache exists", async () => {
    mockFile.exists.mockResolvedValue([true]);

    await run();

    expect(core.setOutput).toHaveBeenCalledWith("cache-hit", "true");
    expect(core.exportVariable).toHaveBeenCalledWith("CACHE_HIT", "true");
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  it("should set CACHE_HIT to false if cache does not exist", async () => {
    mockFile.exists.mockResolvedValue([false]);

    await run();

    expect(core.setOutput).toHaveBeenCalledWith("cache-hit", "false");
    expect(core.exportVariable).toHaveBeenCalledWith("CACHE_HIT", "false");
    expect(mockInfo).toHaveBeenCalledWith(
      "🚀 Cache not found: path/to/cache.",
    );
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  it("should check cache existence for each key in gcpBuildCache when cacheKeyPath is not provided", async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === "gcs-root-path") return "gs://abc-123/github-integration";
      if (name === "affected") {
        return JSON.stringify({
          "project-ui": {
            changes: true ,
            sha: "38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
          }
        });
      }
      if (name === "additional-keys") {
        return JSON.stringify({ "project-ui": ["lint", "build", "e2e"] });
      }
      return "";
    });

    mockFile.exists.mockResolvedValue([true]);

    await run();

    expect(mockStorageInstance.bucket).toHaveBeenCalledWith('gs://abc-123');
    expect(mockBucket.file).toHaveBeenCalledWith('github-integration/pr-123-project-ui-38aabc2d6ae9866f3c1d601cba956bb935c02cf5');
    expect(mockBucket.file).toHaveBeenCalledWith('github-integration/pr-123-project-ui-lint-38aabc2d6ae9866f3c1d601cba956bb935c02cf5');
    expect(mockBucket.file).toHaveBeenCalledWith('github-integration/pr-123-project-ui-build-38aabc2d6ae9866f3c1d601cba956bb935c02cf5');
    expect(mockBucket.file).toHaveBeenCalledWith('github-integration/pr-123-project-ui-e2e-38aabc2d6ae9866f3c1d601cba956bb935c02cf5');
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
          "project-ui": {
            changes: true ,
            sha: "38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
          }
        });
      }
      if (name === "additional-keys") {
        return JSON.stringify({ "project-ui": ["lint", "build", "e2e"] });
      }
      return "";
    });

    mockFile.exists.mockResolvedValue([false]);

    await run();

    expect(mockStorageInstance.bucket).toHaveBeenCalledWith('gs://abc-123');
    expect(mockBucket.file).toHaveBeenCalledWith('github-integration/pr-123-project-ui-38aabc2d6ae9866f3c1d601cba956bb935c02cf5');
    expect(mockBucket.file).toHaveBeenCalledWith('github-integration/pr-123-project-ui-lint-38aabc2d6ae9866f3c1d601cba956bb935c02cf5');
    expect(mockBucket.file).toHaveBeenCalledWith('github-integration/pr-123-project-ui-build-38aabc2d6ae9866f3c1d601cba956bb935c02cf5');
    expect(mockBucket.file).toHaveBeenCalledWith('github-integration/pr-123-project-ui-e2e-38aabc2d6ae9866f3c1d601cba956bb935c02cf5');
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
          "project-ui": {
            changes: true ,
            sha: "38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
          }
        });
      }
      if (name === "additional-keys") {
        return JSON.stringify({ "project-ui": ["lint", "build", "e2e"] });
      }
      return "";
    });

    mockFile.exists.mockResolvedValue([true]);

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
          "project-ui": {
            changes: true ,
            sha: "38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
          }
        });
      }
      if (name === "additional-keys") {
        return JSON.stringify({ "project-ui": ["lint", "build", "e2e"] });
      }
      return "";
    });

    mockFile.exists.mockResolvedValue([true]);

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
          "project-ui": {
            changes: true ,
            sha: "38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
          }
        });
      }
      if (name === "additional-keys") {
        return JSON.stringify({ "project-ui": ["lint", "build", "e2e"] });
      }
      return "";
    });

    mockFile.exists.mockResolvedValue([true]);

    await run();

    expect(core.setOutput).toHaveBeenCalledWith("cache", {
      "project-ui": { "cache-hit": false, "path": "gs://abc-123/github-integration/pr-123-project-ui-38aabc2d6ae9866f3c1d601cba956bb935c02cf5" },
      "project-ui-lint": { "cache-hit": false, "path": "gs://abc-123/github-integration/pr-123-project-ui-lint-38aabc2d6ae9866f3c1d601cba956bb935c02cf5" },
      "project-ui-build": { "cache-hit": false, "path": "gs://abc-123/github-integration/pr-123-project-ui-build-38aabc2d6ae9866f3c1d601cba956bb935c02cf5" },
      "project-ui-e2e": { "cache-hit": false, "path": "gs://abc-123/github-integration/pr-123-project-ui-e2e-38aabc2d6ae9866f3c1d601cba956bb935c02cf5" }
    });
  });
});
