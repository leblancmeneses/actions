jest.mock('./s3-client');
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

import * as core from "@actions/core";
import { run } from "./main";
import { S3AuthException } from "./exceptions/s3-auth.exception";
import { checkObjectExists, initializeS3Client } from './s3-client';

describe("run", () => {
  const mockGetInput = core.getInput as jest.MockedFunction<
    typeof core.getInput
  >;
  const mockSetFailed = core.setFailed as jest.MockedFunction<
    typeof core.setFailed
  >;
  const mockInfo = core.info as jest.MockedFunction<typeof core.info>;
  const mockCheckObjectExists = checkObjectExists as jest.MockedFunction<typeof checkObjectExists>;
  const mockInitializeS3Client = initializeS3Client as jest.MockedFunction<typeof initializeS3Client>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    mockGetInput.mockImplementation((name: string) => {
      if (name === "cache_key_path") return "s3://bucket/path/to/cache";
      if (name === "access-key") return "test-access-key";
      if (name === "secret-key") return "test-secret-key";
      return "";
    });
  });

  it("should set failed status if auth is not available", async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === "cache_key_path") return "s3://bucket/path/to/cache";
      if (name === "access-key") return "";
      if (name === "secret-key") return "";
      return "";
    });

    await expect(run()).rejects.toThrow(S3AuthException);
    expect(mockSetFailed).toHaveBeenCalledWith(new S3AuthException().message);
  });

  it("should set failed status if an error occurs", async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === "access-key") return "test-access-key";
      if (name === "secret-key") return "test-secret-key";
      throw new Error("Input error");
    });

    await expect(run()).rejects.toThrow();

    expect(mockSetFailed).toHaveBeenCalledWith(
      "Error checking cache: Input error",
    );
  });

  it("should set CACHE_HIT to true if cache exists", async () => {
    mockCheckObjectExists.mockResolvedValue(true);

    await run();

    expect(mockInitializeS3Client).toHaveBeenCalledWith({
      accessKey: "test-access-key",
      secretKey: "test-secret-key",
      endpoint: undefined,
      region: undefined,
    });
    expect(core.setOutput).toHaveBeenCalledWith("cache-hit", true);
    expect(core.exportVariable).toHaveBeenCalledWith("CACHE_HIT", true);
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  it("should set CACHE_HIT to false if cache does not exist", async () => {
    mockCheckObjectExists.mockResolvedValue(false);

    await run();

    expect(core.setOutput).toHaveBeenCalledWith("cache-hit", false);
    expect(core.exportVariable).toHaveBeenCalledWith("CACHE_HIT", false);
    expect(mockInfo).toHaveBeenCalledWith(
      "🚀 Cache not found: s3://bucket/path/to/cache.",
    );
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  it("should include all projects with sha regardless of changes value", async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === "access-key") return "test-access-key";
      if (name === "secret-key") return "test-secret-key";
      if (name === "storage-path") return "gs://abc-123/github-integration";
      if (name === "affected") {
        return JSON.stringify({
          "project-ui": {
            changes: false ,
            sha: "38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
          },
          "project-api": {
            changes: false ,
            sha: "38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
          }
        });
      }
      return "";
    });

    mockCheckObjectExists.mockResolvedValue(true);

    await run();

    // should include all projects with sha, regardless of changes value
    expect(core.setOutput).toHaveBeenCalledWith("cache", {
      "project-api": {
        "cache-hit": true,
        "path": "gs://abc-123/github-integration/pr-123-project-api-38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
      },
      "project-ui": {
        "cache-hit": true,
        "path": "gs://abc-123/github-integration/pr-123-project-ui-38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
      },
    });
  });

  it("should check cache existence for each key in buildCache when cacheKeyPath is not provided", async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === "access-key") return "test-access-key";
      if (name === "secret-key") return "test-secret-key";
      if (name === "storage-path") return "gs://abc-123/github-integration";
      if (name === "affected") {
        return JSON.stringify({
          "project-ui": {
            changes: true ,
            sha: "38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
          },
          "project-api": {
            changes: false ,
            sha: "38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
          }
        });
      }
      if (name === "additional-keys") {
        return JSON.stringify({ "project-ui": ["lint", "build", "e2e"] });
      }
      return "";
    });

    mockCheckObjectExists.mockResolvedValue(true);

    await run();

    expect(mockCheckObjectExists).toHaveBeenCalledWith('gs://abc-123/github-integration/pr-123-project-ui-38aabc2d6ae9866f3c1d601cba956bb935c02cf5');
    expect(mockCheckObjectExists).toHaveBeenCalledWith('gs://abc-123/github-integration/pr-123-project-ui-lint-38aabc2d6ae9866f3c1d601cba956bb935c02cf5');
    expect(mockCheckObjectExists).toHaveBeenCalledWith('gs://abc-123/github-integration/pr-123-project-ui-build-38aabc2d6ae9866f3c1d601cba956bb935c02cf5');
    expect(mockCheckObjectExists).toHaveBeenCalledWith('gs://abc-123/github-integration/pr-123-project-ui-e2e-38aabc2d6ae9866f3c1d601cba956bb935c02cf5');
    expect(mockCheckObjectExists).toHaveBeenCalledWith('gs://abc-123/github-integration/pr-123-project-api-38aabc2d6ae9866f3c1d601cba956bb935c02cf5');
    expect(core.setOutput).toHaveBeenCalledWith("cache", {
      "project-api": {
        "cache-hit": true,
        "path":
          "gs://abc-123/github-integration/pr-123-project-api-38aabc2d6ae9866f3c1d601cba956bb935c02cf5",
      },
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

  it("should handle cache miss for each key in buildCache when cacheKeyPath is not provided", async () => {
    mockGetInput.mockImplementation((name: string) => {
      if (name === "access-key") return "test-access-key";
      if (name === "secret-key") return "test-secret-key";
      if (name === "storage-path") return "gs://abc-123/github-integration";
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

    mockCheckObjectExists.mockResolvedValue(false);

    await run();

    expect(mockCheckObjectExists).toHaveBeenCalledWith('gs://abc-123/github-integration/pr-123-project-ui-38aabc2d6ae9866f3c1d601cba956bb935c02cf5');
    expect(mockCheckObjectExists).toHaveBeenCalledWith('gs://abc-123/github-integration/pr-123-project-ui-lint-38aabc2d6ae9866f3c1d601cba956bb935c02cf5');
    expect(mockCheckObjectExists).toHaveBeenCalledWith('gs://abc-123/github-integration/pr-123-project-ui-build-38aabc2d6ae9866f3c1d601cba956bb935c02cf5');
    expect(mockCheckObjectExists).toHaveBeenCalledWith('gs://abc-123/github-integration/pr-123-project-ui-e2e-38aabc2d6ae9866f3c1d601cba956bb935c02cf5');
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
      if (name === "access-key") return "test-access-key";
      if (name === "secret-key") return "test-secret-key";
      if (name === "pragma") return JSON.stringify({ "SKIP-CACHE": true });
      if (name === "storage-path") return "gs://abc-123/github-integration";
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

    mockCheckObjectExists.mockResolvedValue(true);

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
      if (name === "access-key") return "test-access-key";
      if (name === "secret-key") return "test-secret-key";
      if (name === "pragma") return JSON.stringify({ ["project-ui-build-cache".toLocaleUpperCase()]: 'skip' });
      if (name === "storage-path") return "gs://abc-123/github-integration";
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

    mockCheckObjectExists.mockResolvedValue(true);

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
      if (name === "access-key") return "test-access-key";
      if (name === "secret-key") return "test-secret-key";
      if (name === "pragma") return JSON.stringify({ "SKIP-CACHE": true, ["project-ui-build-cache".toLocaleUpperCase()]: 'skip' });
      if (name === "storage-path") return "gs://abc-123/github-integration";
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

    mockCheckObjectExists.mockResolvedValue(true);

    await run();

    expect(core.setOutput).toHaveBeenCalledWith("cache", {
      "project-ui": { "cache-hit": false, "path": "gs://abc-123/github-integration/pr-123-project-ui-38aabc2d6ae9866f3c1d601cba956bb935c02cf5" },
      "project-ui-lint": { "cache-hit": false, "path": "gs://abc-123/github-integration/pr-123-project-ui-lint-38aabc2d6ae9866f3c1d601cba956bb935c02cf5" },
      "project-ui-build": { "cache-hit": false, "path": "gs://abc-123/github-integration/pr-123-project-ui-build-38aabc2d6ae9866f3c1d601cba956bb935c02cf5" },
      "project-ui-e2e": { "cache-hit": false, "path": "gs://abc-123/github-integration/pr-123-project-ui-e2e-38aabc2d6ae9866f3c1d601cba956bb935c02cf5" }
    });
  });
});
