jest.mock("@actions/core");
jest.mock("@actions/github");
jest.mock('child_process', () => {
  const originalModule = jest.requireActual('child_process');
  return {
    ...originalModule,
    execSync: jest.fn(),
  };
});
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
/* eslint-disable @nx/enforce-module-boundaries */
import * as affectedMain from "@affected/main"; // Import everything
import * as github from '@actions/github';
import { run } from "@affected/main";
import * as core from "@actions/core";
import * as fs from 'fs';
import * as cp from 'child_process';



describe("changes.spec", () => {
  const gitMockResponses = {
    'git log base1 --oneline --pretty=format:"%H" -n 1 -- "./affected"': () => 'sha1',
    'git log head1 --oneline --pretty=format:"%H" -n 1 -- "./affected"': () => 'sha2',
    'git log base1 --oneline --pretty=format:"%H" -n 1 -- "./apps/affected"': () => 'sha1',
    'git log head1 --oneline --pretty=format:"%H" -n 1 -- "./apps/affected"': () => 'sha2',
    'git log base1 --oneline --pretty=format:"%H" -n 1 -- "./apps/version-autopilot"': () => 'sha3',
    'git log base1 --oneline --pretty=format:"%H" -n 1 -- "./apps/pragma"': () => 'sha4',
    'git diff --name-status base1 head1': () => `
M\t.github/workflows/ci.yml
M\tapps/affected/src/main.ts
`.trim(),
  };

  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    delete github.context.eventName;
    delete github.context.payload;
    delete process.env.BASE_REF;
    delete process.env.BASE_SHA;
    delete process.env.HEAD_SHA;

    github.context.eventName = 'pull_request';
    process.env.BASE_REF='develop';
    process.env.BASE_SHA='base1';
    process.env.HEAD_SHA='head1';
    github.context.payload = {
      pull_request: {
        number: 100,
      }
    };
  });

  test("should evaluate base expression", async () => {
    // Arrange
    jest.spyOn(core, "getInput").mockImplementation((inputName: string) => {
      if (inputName === "rules") return `
          <affected>: './apps/affected/**' './dist/apps/affected/**';
        `;
      return "";
    });

    const execSyncResponses = {
      ...gitMockResponses,
    };

    jest.spyOn(cp, 'execSync')
      .mockImplementation((inputName) => {
        if (execSyncResponses[inputName]) {
          return execSyncResponses[inputName]();
        }
        throw new Error(`Unexpected input: ${inputName}`);
      });

    // Act
    await run();

    // Assert
    expect(core.setOutput).toHaveBeenCalledWith("affected_changes", {
      "affected": true
    });
  });


  test("should evaluate base expression with except not matching", async () => {
    // Arrange
    jest.spyOn(core, "getInput").mockImplementation((inputName: string) => {
      if (inputName === "rules") return `
          <affected>: ('./apps/affected/**' OR './dist/apps/affected/**') EXCEPT('**/*.md');
        `;
      return "";
    });

    const execSyncResponses = {
      ...gitMockResponses,
    };

    jest.spyOn(cp, 'execSync')
      .mockImplementation((inputName) => {
        if (execSyncResponses[inputName]) {
          return execSyncResponses[inputName]();
        }
        throw new Error(`Unexpected input: ${inputName}`);
      });

    jest.spyOn(fs, "existsSync").mockImplementation(() => true);
    jest.spyOn(fs, "lstatSync").mockImplementation(() => ({
      isDirectory: () => true,
    }) as fs.Stats);

    // Act
    await run();

    // Assert
    expect(core.setOutput).toHaveBeenCalledWith("affected_changes", {
      "affected": true
    });
  });

  test("should evaluate base expression with except matching", async () => {
    // Arrange
    jest.spyOn(core, "getInput").mockImplementation((inputName: string) => {
      if (inputName === "rules") return `
          <affected>: './apps/affected/**' './dist/apps/affected/**' !'**/*.yml';
        `;
      return "";
    });

    const execSyncResponses = {
      ...gitMockResponses,
    };

    jest.spyOn(cp, 'execSync')
      .mockImplementation((inputName) => {
        if (execSyncResponses[inputName]) {
          return execSyncResponses[inputName]();
        }
        throw new Error(`Unexpected input: ${inputName}`);
      });

    // Act
    await run();

    // Assert
    expect(core.setOutput).toHaveBeenCalledWith("affected_changes", {
      "affected": true
    });
  });

  test("should evaluate base expression with except excluding all as composite and comments", async () => {
    // Arrange
    jest.spyOn(core, "getInput").mockImplementation((inputName: string) => {
      if (inputName === "rules") return `
          typescript: '**/*.ts'; // match all typescript files
          yaml: '**/*.yml'; ## match all non yaml files
          notYaml: !'**/*.yml'; ## match all non yaml files
          <affected>: ('./apps/affected/**' OR './dist/apps/affected/**') EXCEPT (yaml typescript);
        `;
      return "";
    });

    const execSyncResponses = {
      ...gitMockResponses,
    };

    jest.spyOn(cp, 'execSync')
      .mockImplementation((inputName) => {
        if (execSyncResponses[inputName]) {
          return execSyncResponses[inputName]();
        }
        throw new Error(`Unexpected input: ${inputName}`);
      });

    // Act
    await run();

    // Assert
    expect(core.setOutput).toHaveBeenCalledWith("affected_changes", {
      "typescript": true,
      "yaml": true,
      "notYaml": true,
      "affected": false
    });
  });
});
