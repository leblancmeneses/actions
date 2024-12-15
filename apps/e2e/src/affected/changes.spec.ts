jest.mock("@actions/core");
jest.mock("@actions/github");
jest.mock('child_process', () => {
  const originalModule = jest.requireActual('child_process');
  return {
    ...originalModule,
    execSync: jest.fn(),
  };
});
/* eslint-disable @nx/enforce-module-boundaries */
import * as affectedMain from "@affected/main"; // Import everything
import * as github from '@actions/github';
import { run } from "@affected/main";
import * as core from "@actions/core";
import * as cp from 'child_process';



describe("affected action changes tests", () => {
  const gitMockResponses = {
    'git log base1 --oneline --pretty=format:"%H" -n 1 -- "./apps/affected"': () => 'base1',
    'git log head1 --oneline --pretty=format:"%H" -n 1 -- "./apps/affected"': () => 'sha1',
    'git log base1 --oneline --pretty=format:"%H" -n 1 -- "./apps/version-autopilot"': () => 'sha2',
    'git log base1 --oneline --pretty=format:"%H" -n 1 -- "./apps/pragma"': () => 'sha2',
    'git diff --name-status base1 head1': () => `
M       .github/workflows/ci.yml
M       apps/affected/src/main.ts
`.trim(),
  };

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

  test.only("should evaluate multiple expressions cumulatively", async () => {
    // Arrange
    jest.spyOn(core, "getInput").mockImplementation((inputName: string) => {
      if (inputName === "rules") return `
          <affected>: './apps/affected/**' './dist/apps/affected/**';
        `;
      return "";
    });

    const execSyncResponses = {
      ...gitMockResponses,
      'git diff --name-status base1 head1':  () => `
M\t.github/workflows/ci.yml
M\tapps/affected/src/main.ts
`.trim(),
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


  test("should evaluate multiple expressions cumulatively with exclusion not matching", async () => {
    // Arrange
    jest.spyOn(core, "getInput").mockImplementation((inputName: string) => {
      if (inputName === "rules") return `
          [affected](./apps/affected): './apps/affected/**' './dist/apps/affected/**' !'**/*.md';
        `;
      return "";
    });

    const execSyncResponses = {
      ...gitMockResponses,
      'git diff --name-only --diff-filter=ACMRT base1 head1': () => `
M\t.github/workflows/ci.yml
M\tapps/affected/src/main.ts
`.trim(),
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

  test("should evaluate multiple expressions cumulatively with exclusion matching", async () => {
    // Arrange
    jest.spyOn(core, "getInput").mockImplementation((inputName: string) => {
      if (inputName === "rules") return `
          [affected](./apps/affected): './apps/affected/**' './dist/apps/affected/**' !'**/*.yml';
        `;
      return "";
    });

    const execSyncResponses = {
      ...gitMockResponses,
      'git diff --name-only --diff-filter=ACMRT base1 head1': () => `
M\t.github/workflows/ci.yml
M\tapps/affected/src/main.ts
`.trim(),
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

  test("should evaluate multiple expressions cumulatively with exclusion as composite and comments", async () => {
    // Arrange
    jest.spyOn(core, "getInput").mockImplementation((inputName: string) => {
      if (inputName === "rules") return `
          typescript: '**/*.ts'; // match all typescript files
          ignoreYaml: !'**/*.yml'; ## match all non yaml files
          [affected](./apps/affected): ignoreYaml './apps/affected/**' './dist/apps/affected/**' !typescript; /* the order of exclusion should not matter.*/
        `;
      return "";
    });

    const execSyncResponses = {
      ...gitMockResponses,
      'git diff --name-only --diff-filter=ACMRT base1 head1': () => `
M\t.github/workflows/ci.yml
M\tapps/affected/src/main.ts
`.trim(),
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
      "ignoreYaml": true,
      "affected": false
    });
  });
});
