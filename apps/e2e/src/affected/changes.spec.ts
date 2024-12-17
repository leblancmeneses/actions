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



describe("changes.spec", () => {
    const files = `.editorconfig
    .eslintignore
    .eslintrc.json
    .github/example-output.png
    .github/workflows/ci.yml
    .gitignore
    .husky/pre-commit
    .nvmrc
    .prettierignore
    .prettierrc
    .vscode/extensions.json
    LICENSE
    README.md
    apps/affected/.eslintrc.json
    apps/affected/action.yml
    apps/affected/jest.config.ts
    apps/affected/project.json
    apps/affected/src/changedFiles.ts
    apps/affected/src/evaluateStatementsForChanges.ts
    apps/affected/src/main.ts
    apps/affected/src/parser.peggy
    apps/affected/src/parser.ts
    apps/affected/src/parser.types.ts
    apps/affected/tsconfig.app.json
    apps/affected/tsconfig.json
    apps/affected/tsconfig.spec.json
    apps/e2e/.eslintrc.json
    apps/e2e/jest.config.ts
    apps/e2e/project.json
    apps/e2e/src/affected/TODO.md
    apps/e2e/src/affected/affected.spec.ts
    apps/e2e/src/affected/changed-files.spec.ts
    apps/e2e/src/affected/changes.spec.ts
    apps/e2e/src/affected/evaluate-statements-for-changes.spec.ts
    apps/e2e/src/affected/parser.spec.ts
    apps/e2e/src/pragma/pragma.spec.ts
    apps/e2e/src/test-setup.ts
    apps/e2e/src/version-autopilot/version-autopilot.spec.ts
    apps/e2e/tsconfig.json
    apps/e2e/tsconfig.spec.json
    apps/pragma/.eslintrc.json
    apps/pragma/action.yml
    apps/pragma/jest.config.ts
    apps/pragma/project.json
    apps/pragma/src/main.ts
    apps/pragma/tsconfig.app.json
    apps/pragma/tsconfig.json
    apps/pragma/tsconfig.spec.json
    apps/version-autopilot/.eslintrc.json
    apps/version-autopilot/action.yml
    apps/version-autopilot/jest.config.ts
    apps/version-autopilot/project.json
    apps/version-autopilot/src/main.ts
    apps/version-autopilot/tsconfig.app.json
    apps/version-autopilot/tsconfig.json
    apps/version-autopilot/tsconfig.spec.json
    dist/apps/affected/action.yml
    dist/apps/affected/main.js
    dist/apps/pragma/action.yml
    dist/apps/pragma/main.js
    dist/apps/version-autopilot/action.yml
    dist/apps/version-autopilot/main.js
    docs/graphics/repository-open-graph-template.png
    jest.config.ts
    jest.preset.js
    nx.json
    package.json
    pnpm-lock.yaml
    tsconfig.base.json`.split('\n').map(f => f.trim()).filter(Boolean);

  const gitMockResponses = {
    'git diff --name-status base1 head1': () => `
M\t.github/workflows/ci.yml
M\tapps/affected/src/main.ts
`.trim(),
    'git ls-files': () => files.join('\n'),
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
      ...gitMockResponses
    };

    jest.spyOn(cp, 'execSync')
      .mockImplementation((command) => {
        if (command.startsWith('git hash-object')) {
          const match = command.match(/git hash-object\s+"([^"]+)"/);
          if(!match) {
            throw new Error(`Unexpected command: ${command}`);
          }

          return match[1];
        }
        if (execSyncResponses[command]) {
          return execSyncResponses[command]();
        }
        throw new Error(`Unexpected input: ${command}`);
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
      .mockImplementation((command) => {
        if (command.startsWith('git hash-object')) {
          const match = command.match(/git hash-object\s+"([^"]+)"/);
          if(!match) {
            throw new Error(`Unexpected command: ${command}`);
          }

          return match[1];
        }
        if (execSyncResponses[command]) {
          return execSyncResponses[command]();
        }
        throw new Error(`Unexpected input: ${command}`);
      });

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
      .mockImplementation((command) => {
        if (command.startsWith('git hash-object')) {
          const match = command.match(/git hash-object\s+"([^"]+)"/);
          if(!match) {
            throw new Error(`Unexpected command: ${command}`);
          }

          return match[1];
        }
        if (execSyncResponses[command]) {
          return execSyncResponses[command]();
        }
        throw new Error(`Unexpected input: ${command}`);
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
      .mockImplementation((command) => {
        if (command.startsWith('git hash-object')) {
          const match = command.match(/git hash-object\s+"([^"]+)"/);
          if(!match) {
            throw new Error(`Unexpected command: ${command}`);
          }

          return match[1];
        }
        if (execSyncResponses[command]) {
          return execSyncResponses[command]();
        }
        throw new Error(`Unexpected input: ${command}`);
      });

    // Act
    await run();

    // Assert
    expect(core.setOutput).toHaveBeenCalledWith("affected_changes", {
      "typescript": true,
      "yaml": true,
      "notYaml": false,
      "affected": false
    });
  });
});
