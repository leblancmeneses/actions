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
    'git log 151e51530cd03e7cc60ca28582e990bca14cc90e --oneline --pretty=format:"%H" -n 1 -- "./apps/affected"': () => '151e51530cd03e7cc60ca28582e990bca14cc90e',
    'git log 632865e4315146beae430ce80f8a52fc7f4355e6 --oneline --pretty=format:"%H" -n 1 -- "./apps/affected"': () => 'cde29f8c5001e95a5380a007954183eb7d07a7b3',
    'git log 151e51530cd03e7cc60ca28582e990bca14cc90e --oneline --pretty=format:"%H" -n 1 -- "./apps/version-autopilot"': () => 'eb878e9d30254e35e6ff41b236116daf07fdfadd',
    'git log 151e51530cd03e7cc60ca28582e990bca14cc90e --oneline --pretty=format:"%H" -n 1 -- "./apps/pragma"': () => 'eb878e9d30254e35e6ff41b236116daf07fdfadd',
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
    process.env.BASE_SHA='151e51530cd03e7cc60ca28582e990bca14cc90e';
    process.env.HEAD_SHA='632865e4315146beae430ce80f8a52fc7f4355e6';
    github.context.payload = {
      pull_request: {
        number: 100,
      }
    };
  });

  test("should evaluate multiple expressions cumulatively", async () => {
    // Arrange
    jest.spyOn(core, "getInput").mockImplementation((inputName: string) => {
      if (inputName === "rules") return `
          [affected](./apps/affected): './apps/affected/**' './dist/apps/affected/**';
        `;
      return "";
    });

    const execSyncResponses = {
      ...gitMockResponses,
      'git diff --name-only --diff-filter=ACMRT 151e51530cd03e7cc60ca28582e990bca14cc90e 632865e4315146beae430ce80f8a52fc7f4355e6': () => [
          '.github/workflows/ci.yml',
          'apps/affected/src/main.ts'
      ].join('\n'),
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
      'git diff --name-only --diff-filter=ACMRT 151e51530cd03e7cc60ca28582e990bca14cc90e 632865e4315146beae430ce80f8a52fc7f4355e6': () => [
          '.github/workflows/ci.yml',
          'apps/affected/src/main.ts'
      ].join('\n'),
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
      'git diff --name-only --diff-filter=ACMRT 151e51530cd03e7cc60ca28582e990bca14cc90e 632865e4315146beae430ce80f8a52fc7f4355e6': () => [
          '.github/workflows/ci.yml',
          'apps/affected/src/main.ts'
      ].join('\n'),
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
      'git diff --name-only --diff-filter=ACMRT 151e51530cd03e7cc60ca28582e990bca14cc90e 632865e4315146beae430ce80f8a52fc7f4355e6': () => [
          '.github/workflows/ci.yml',
          'apps/affected/src/main.ts'
      ].join('\n'),
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
