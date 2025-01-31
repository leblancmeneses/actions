jest.mock("@actions/core");
jest.mock("@actions/exec");

import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { run } from "./main";

describe("run", () => {
  const mockGetInput = core.getInput as jest.MockedFunction<typeof core.getInput>;
  const mockExec = exec.exec as jest.MockedFunction<typeof exec.exec>;
  const mockSetFailed = core.setFailed as jest.MockedFunction<typeof core.setFailed>;
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
      if (command === "gcloud" && args?.includes("--version")) {
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
      if (command === "gcloud" && args?.includes("--version")) {
        return 0;
      }
      throw new Error("Command failed");
    });

    await run();

    expect(core.setOutput).toHaveBeenCalledWith("cache-hit", "false");
    expect(core.exportVariable).toHaveBeenCalledWith("CACHE_HIT", "false");
    expect(mockInfo).toHaveBeenCalledWith("🚀 Cache not found: path/to/cache, proceeding with build.");
    expect(mockSetFailed).not.toHaveBeenCalled();
  });

  it("should set failed status if an error occurs", async () => {
    mockGetInput.mockImplementation(() => {
      throw new Error("Input error");
    });

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith("Error checking cache: Input error");
  });
});