jest.mock("@actions/core");
jest.mock("@actions/github");
jest.mock('child_process', () => {
  const originalModule = jest.requireActual('child_process');
  return {
    ...originalModule,
    execSync: jest.fn(),
  };
});
import { run } from "../../../affected/src/main";
import * as core from "@actions/core";
import * as cp from 'child_process';
import crypto from 'crypto';
import * as github from '@actions/github';



describe("affected.spec", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    github.context.eventName = 'push';
  });

  test("should parse valid YAML and set outputs", async () => {
    // Arrange
    const mockSetFailed = jest.spyOn(core, 'setFailed').mockImplementation(jest.fn());

    jest.spyOn(core, "getInput").mockImplementation((inputName: string) => {
      if (inputName === "rules") return `
            peggy-parser: 'apps/affected/src/parser.peggy';
            peggy-parser-checkIf-incomplete: peggy-parser AND (!'apps/affected/src/parser.ts' OR !'apps/e2e/src/affected/parser.spec.ts');
              # peggy was updated but not the generated parser file or its tests.

            markdown: '**/*.md';

            ui-core: 'libs/ui-core/**';
            third-party-deprecated: 'libs/third-party-deprecated/**';
            ui-libs: ui-core third-party-deprecated;

            <project-ui>: ui-libs 'project-ui/**' EXCEPT (markdown '**/*.spec.ts');
            <project-api>: 'project-api/**' EXCEPT ('**/README.md');
            <project-dbmigrations>: './databases/project/**';

            project-e2e: ('e2e/**' project-ui project-api project-dbmigrations) EXCEPT (markdown);

            project-ui-run-lint: 'milagro-api/**/*.ts';
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

        if (command.startsWith('git diff --name-status')) {
          return [
            "project-ui/file1.ts",
            "project-api/README.md",
          ].map(f => `M\t${f}`).join('\n');
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

    expect(core.setOutput).toHaveBeenCalledWith("affected_changes", {
      "markdown": true,
      "peggy-parser": false,
      "peggy-parser-checkIf-incomplete": false,
      "project-api": false,
      "project-dbmigrations": false,
      "project-e2e": true,
      "project-ui": true,
      "project-ui-run-lint": false,
      "third-party-deprecated": false,
      "ui-core": false,
      "ui-libs": false
    });
    expect(core.setOutput).toHaveBeenCalledWith("affected_shas", {
      'project-api': getHash('project-api/'),
      'project-dbmigrations': getHash('databases/project/'),
      'project-ui': getHash('project-ui/'),
    });
    expect(core.setOutput).toHaveBeenCalledWith("affected_recommended_imagetags", {
      "project-ui": [
        "project-ui:" + getHash('project-ui/'),
        "project-ui:latest",
      ],
      "project-api": [
        "project-api:" + getHash('project-api/'),
        "project-api:latest",
      ],
      "project-dbmigrations": [
        "project-dbmigrations:" + getHash('databases/project/'),
        "project-dbmigrations:latest",
      ],
    });
    expect(core.info).toHaveBeenCalled();
  });


  describe('recommended_imagetags', () => {
    const files = [
      "project-api/file1.ts",
      "project-ui/file1.ts",
    ];

    function getHash(folder: string) {
      const matchedFiles = [...files.filter(f => f.startsWith(folder))].sort();
      return crypto.createHash('sha1')
        .update(matchedFiles.join('\n') + '\n')
        .digest('hex');
    }

    beforeEach(() => {
      jest.spyOn(core, "setOutput").mockImplementation(jest.fn());

      const execSyncResponses = {
        'git diff --name-status HEAD~1 HEAD': () => files.map(f => `M\t${f}`).join('\n'),
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

          if (command.startsWith('git diff --name-status')) {
            return files.map(f => `M\t${f}`).join('\n');
          }

          if (execSyncResponses[command]) {
            return execSyncResponses[command]();
          }
          throw new Error(`Unexpected input: ${command}`);
        });
    });

    test("should generate tags with prefix", async () => {
      // Arrange
      jest.spyOn(core, "getInput").mockImplementation((inputName: string) => {
        if (inputName === "rules") return `
            <project-api>: 'project-api/**/*.ts';
          `;
        if (inputName === "recommended-imagetags-tag-prefix") return `prefix-`;
        return "";
      });

      // Act
      await run();

      // Assert
      expect(core.setOutput).toHaveBeenCalledWith("affected_recommended_imagetags", {
        "project-api": [
          "project-api:prefix-" + getHash('project-api/'),
          "project-api:latest",
        ],
      });
    });

    test("should generate tags with suffix", async () => {
      // Arrange
      jest.spyOn(core, "getInput").mockImplementation((inputName: string) => {
        if (inputName === "rules") return `
            <project-api>: 'project-api/**/*.ts';
          `;
        if (inputName === "recommended-imagetags-tag-suffix") return `-suffix`;
        return "";
      });

      // Act
      await run();

      // Assert
      expect(core.setOutput).toHaveBeenCalledWith("affected_recommended_imagetags", {
        "project-api": [
          "project-api:" + getHash('project-api/') + '-suffix',
          "project-api:latest",
        ],
      });
    });

    test("should generate tags with keep first seven chars of sha1", async () => {
      // Arrange
      jest.spyOn(core, "getInput").mockImplementation((inputName: string) => {
        if (inputName === "rules") return `
            <project-api>: 'project-api/**/*.ts';
          `;
        if (inputName === "recommended-imagetags-tag-truncate-size") return `7`;
        if (inputName === "recommended-imagetags-registry") return `registry.cool/`;
        return "";
      });

      // Act
      await run();

      // Assert
      expect(core.setOutput).toHaveBeenCalledWith("affected_recommended_imagetags", {
        "project-api": [
          "registry.cool/project-api:" + getHash('project-api/').slice(0, 7),
          "registry.cool/project-api:latest",
        ],
      });
    });

    test("should generate tags with keep last seven chars of sha1", async () => {
      // Arrange
      jest.spyOn(core, "getInput").mockImplementation((inputName: string) => {
        if (inputName === "rules") return `
            <project-api>: 'project-api/**/*.ts';
          `;
        if (inputName === "recommended-imagetags-tag-truncate-size") return `-7`;
        return "";
      });

      // Act
      await run();

      // Assert
      expect(core.setOutput).toHaveBeenCalledWith("affected_recommended_imagetags", {
        "project-api": [
          "project-api:" + getHash('project-api/').slice(-7),
          "project-api:latest",
        ],
      });
    });

    test("should generate tags with keep first seven chars of sha1", async () => {
      // Arrange
      jest.spyOn(core, "getInput").mockImplementation((inputName: string) => {
        if (inputName === "rules") return `
            <project-api>: 'project-api/**/*.ts';
          `;
        if (inputName === "recommended-imagetags-tag-prefix") return `prefix-`;
        if (inputName === "recommended-imagetags-tag-suffix") return `-suffix`;
        if (inputName === "recommended-imagetags-tag-truncate-size") return `7`;
        if (inputName === "recommended-imagetags-registry") return `registry.cool/`;
        return "";
      });

      // Act
      await run();

      // Assert
      expect(core.setOutput).toHaveBeenCalledWith("affected_recommended_imagetags", {
        "project-api": [
          "registry.cool/project-api:prefix-" + getHash('project-api/').slice(0, 7) + '-suffix',
          "registry.cool/project-api:latest",
        ],
      });
    });
  });
});