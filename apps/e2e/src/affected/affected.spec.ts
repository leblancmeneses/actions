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
import { run } from "@affected/main";
import * as core from "@actions/core";
import * as cp from 'child_process';
import crypto from 'crypto';



describe("affected.spec", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    delete process.env.BASE_REF;
    process.env.BASE_REF = 'dev';
  });

  test("should parse valid YAML and set outputs", async () => {
    // Arrange
    const mockSetFailed = jest.spyOn(core, 'setFailed').mockImplementation(jest.fn());

    jest.spyOn(core, "getInput").mockImplementation((inputName: string) => {
      if (inputName === "rules") return `
          <project-ui>: 'project-ui/**' EXCEPT('**/*.md');
          <project-api>: 'project-api/**' EXCEPT('**/*.md');
          <project-dbmigrations>: 'databases/project/**' EXCEPT('**/*.md');
          project-e2e: ('e2e/**' project-ui project-api project-dbmigrations) EXCEPT('**/*.md');
        `;
      return "";
    });

    jest.spyOn(core, "setOutput").mockImplementation(jest.fn());

    const files = [
      "project-api/file1.js",
      "project-api/README.md",
      "databases/project/0001-change-script.sql",
      "databases/project/0002-change-script.sql",
      "project-ui/file1.ts",
    ];

    const execSyncResponses = {
      'git diff --name-status HEAD~1 HEAD': () => [
      "project-ui/file1.ts",
      "project-api/README.md",
    ].map(f => `M\t${f}`).join('\n'),
      'git ls-files': () => files.join('\n'),
    };

    jest.spyOn(cp, 'execSync')
      .mockImplementation((command: string) => {
        if (command.startsWith('git hash-object')) {
          const match = command.match(/git hash-object\s+"([^"]+)"/);
          if (!match) {
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
    expect(mockSetFailed).not.toHaveBeenCalled();
    expect(core.getInput).toHaveBeenCalledWith("rules", {
      required: true,
    });


    function getHash(folder: string) {
      const matchedFiles = [...files.filter(f => (f.startsWith(folder)) && !f.endsWith('.md'))].sort();
      return crypto.createHash('sha1')
        .update(matchedFiles.join('\n') + '\n')
        .digest('hex');
    }

    expect(core.setOutput).toHaveBeenCalledWith("affected_changes", { "project-api": false, "project-dbmigrations": false, "project-e2e": true, "project-ui": true });
    expect(core.setOutput).toHaveBeenCalledWith("affected_shas", {
      'project-api': getHash('project-api/'),
      'project-dbmigrations': getHash('databases/project/'),
      'project-ui': getHash('project-ui/'),
    });
    expect(core.setOutput).toHaveBeenCalledWith("affected_recommended_imagetags", {
      "project-ui": [
        "project-ui:dev-" + getHash('project-ui/'),
        "project-ui:latest",
      ],
      "project-api": [
        "project-api:dev-" + getHash('project-api/'),
        "project-api:latest",
      ],
      "project-dbmigrations": [
        "project-dbmigrations:dev-" + getHash('databases/project/'),
        "project-dbmigrations:latest",
      ],
    });
    expect(core.info).toHaveBeenCalled();
  });
});