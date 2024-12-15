jest.mock("@actions/core");
jest.mock("@actions/github");
jest.mock('fs', () => {
  const originalFs = jest.requireActual('fs'); // Preserve the original fs
  return {
    ...originalFs, // Spread original fs methods
    existsSync: jest.fn(() => true), // Mock existsSync
    lstatSync: jest.fn(() => ({
      isDirectory: () => true, // Mock isDirectory to return true
    })),
    promises: {
      access: jest.fn(), // Mock specific promises methods as needed
      readFile: jest.fn(), // Example for readFile if used
      writeFile: jest.fn(), // Example for writeFile if used
    },
  };
});
jest.mock('child_process', () => {
  const originalModule = jest.requireActual('child_process');
  return {
    ...originalModule,
    execSync: jest.fn(),
  };
});
/* eslint-disable @nx/enforce-module-boundaries */
import * as affectedMain from "@affected/main"; // Import everything
import { run } from "@affected/main";
import * as core from "@actions/core";
import * as fs from 'fs';
import * as cp from 'child_process';



describe("affected.spec", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  test("should parse valid YAML and set outputs", async () => {
    // Arrange
    const mockSetFailed = jest.spyOn(core, 'setFailed').mockImplementation(jest.fn());

    jest.spyOn(core, "getInput").mockImplementation((inputName: string) => {
      if (inputName === "rules") return `
          <project-ui>: 'project-ui/**';
          <project-api>: 'project-api/**';
          [project-dbmigrations](./databases/project): './databases/project/**';
          project-e2e: 'e2e/**' project-ui project-api project-dbmigrations !'**/*.md';
        `;
      return "";
    });

    jest.spyOn(core, "setOutput").mockImplementation(jest.fn());

    const execSyncResponses = {
      'git diff --name-status HEAD~1 HEAD':  () => `
M\tproject-ui/file1.js
M\tproject-api/readme.md
`.trim(),
    };

    jest.spyOn(cp, 'execSync')
      .mockImplementation((inputName) => {
        if (execSyncResponses[inputName]) {
          return execSyncResponses[inputName]();
        }
        throw new Error(`Unexpected input: ${inputName}`);
      });


    jest.spyOn(affectedMain, "getCommitHash").mockImplementation((path: string, hasChanges: boolean) => `sha-${path}-${hasChanges}`);
    jest.spyOn(affectedMain, "getDevOrProdPrefixImageName").mockImplementation((hasChanges: boolean, commitSha: string, appTarget: string, path: string) => [`imagetag1-${appTarget}-${hasChanges}`, `imagetag2-${appTarget}-${hasChanges}`]);

    jest.spyOn(fs, "existsSync").mockImplementation(() => true);
    jest.spyOn(fs, "lstatSync").mockImplementation(() => ({
      isDirectory: () => true,
    }) as fs.Stats);

    // Act
    await run();

    // Assert
    expect(mockSetFailed).not.toHaveBeenCalled();
    expect(core.getInput).toHaveBeenCalledWith("rules", {
      required: true,
    });

    expect(core.setOutput).toHaveBeenCalledWith("affected", {
      changes: {"project-api": true, "project-dbmigrations": false, "project-e2e": true, "project-ui": true},
      shas: {
        'project-api': 'sha-project-api-true',
        "project-dbmigrations": "sha-./databases/project-false",
        'project-ui': 'sha-project-ui-true',
      },
      recommended_imagetags: {
        'project-api': ['imagetag1-project-api-true','imagetag2-project-api-true'],
        "project-dbmigrations": ["imagetag1-project-dbmigrations-false", "imagetag2-project-dbmigrations-false"],
        'project-ui': ['imagetag1-project-ui-true','imagetag2-project-ui-true'],
      },
    });
    expect(core.info).toHaveBeenCalled();
  });

  it('should fail with "Invalid directory" when key.path is invalid', async () => {
    jest.spyOn(core, 'getInput')
      .mockImplementation((inputName) => {
        switch (inputName) {
          case 'rules':
            return `
              [key](./invalid/path): './databases/project/**';
            `;
          case 'verbose':
            return 'false';
          case 'gitflow-production-branch':
            return '';
          default:
            return '';
        }
      });

    const execSyncResponses = {
      'git diff --name-status HEAD~1 HEAD':  () => `
M\tproject-ui/file1.js
M\tproject-api/readme.md
`.trim(),
    };

    jest.spyOn(cp, 'execSync')
      .mockImplementation((inputName) => {
        if (execSyncResponses[inputName]) {
          return execSyncResponses[inputName]();
        }
        throw new Error(`Unexpected input: ${inputName}`);
      });

    jest.spyOn(fs, "existsSync").mockImplementation(() => false);
    jest.spyOn(fs, "lstatSync").mockImplementation(() => ({
      isDirectory: () => false,
    }) as fs.Stats);

    // Spy on core.setFailed
    const setFailedSpy = jest.spyOn(core, 'setFailed');

    // Run the function
    await run();

    // Assertions
    expect(setFailedSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid directory: ./invalid/path'));
  });
});