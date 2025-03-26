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
  const originalModule = jest.requireActual('fs');
  return {
    ...originalModule,
    existsSync: jest.fn(),
  };
});
import { run } from "./main";
import * as changedFilesModule from './changedFiles';
import * as core from "@actions/core";
import * as cp from 'child_process';
import * as fs from 'fs';
import crypto from 'crypto';
import * as github from '@actions/github';


describe("affected.spec", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    jest.restoreAllMocks();
    github.context.eventName = 'push';
  });
  afterEach(() => {
    jest.restoreAllMocks();
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

    jest.spyOn(fs, 'existsSync')
      .mockImplementation((command: string) => {
        return !command.includes('deleted');
      });

    jest.spyOn(core, "setOutput").mockImplementation(jest.fn());

    const lines = [
      "100644 a 0\tproject-api/file1.js",
      "100644 b 0\tproject-api/README.md",
      "100644 c 0\tdatabases/project/0001-change-script.sql",
      "100644 d 0\tdatabases/project/0002-change-script.sql",
      "100644 e 0\tproject-ui/file1.ts",
    ];
    const files = lines.map((line) => {
      const [mode, hash, stage, ...fileParts] = line.split(/\s+/);
      const file = fileParts.join('');
      return { mode, hash, stage, file };
    });

    const execSyncResponses = {
      'git diff --name-status HEAD~1 HEAD': () => [
        "project-ui/file1.ts",
        "project-api/README.md",
      ].map(f => `M\t${f}`).join('\n'),
      'git ls-files -s': () => lines.join('\n'),
    };

    jest.spyOn(cp, 'execSync')
      .mockImplementation((command: string) => {
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
      required: false,
    });


    function getHash(folder: string) {
      const matchedFiles = [...files.filter(f => (f.file.startsWith(folder)) && !f.file.endsWith('.md'))].sort((a, b) => a.file.localeCompare(b.file)).map(x => x.hash);
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
    const lines = [
      "100644 a 0\tproject-api/file1.ts",
      "100644 a 0\tproject-api/deleted.ts",
      "100644 a 0\tproject-ui/file1.ts",
    ];
    const files = lines.map((line) => {
      const [mode, hash, stage, ...fileParts] = line.split(/\s+/);
      const file = fileParts.join('');
      return { mode, hash, stage, file };
    });

    function getHash(folder: string) {
      const matchedFiles = [...files.filter(f => f.file.startsWith(folder))].filter(x=>!x.file.includes('deleted')).sort((a, b) => a.file.localeCompare(b.file)).map(x => x.hash);
      return crypto.createHash('sha1')
        .update(matchedFiles.join('\n') + '\n')
        .digest('hex');
    }

    beforeEach(() => {
      jest.spyOn(core, "setOutput").mockImplementation(jest.fn());

      const execSyncResponses = {
        'git diff --name-status HEAD~1 HEAD': () => files.map(f => `${f.file.includes('deleted')? 'D':'M'}\t${f}`).join('\n'),
        'git ls-files -s': () => lines.join('\n'),
      };

      jest.spyOn(fs, 'existsSync')
        .mockImplementation((command: string) => {
          return !command.includes('deleted');
        });

      jest.spyOn(cp, 'execSync')
        .mockImplementation((command: string) => {
          if (command.startsWith('git diff --name-status')) {
            return files.map(f => `${f.file.includes('deleted')? 'D':'M'}\t${f}`).join('\n');
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
        if (inputName === "recommended-imagetags-tag-format") return `prefix-{sha}`;
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
        if (inputName === "recommended-imagetags-tag-format") return `{sha}-suffix`;
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
        if (inputName === "recommended-imagetags-tag-format") return `{sha|7}`;
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
        if (inputName === "recommended-imagetags-tag-format") return `{sha|-7}`;
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

    test("should generate tags with keep first seven chars of sha1 with prefix and suffix", async () => {
      // Arrange
      jest.spyOn(core, "getInput").mockImplementation((inputName: string) => {
        if (inputName === "rules") return `
            <project-api>: 'project-api/**/*.ts';
          `;
        if (inputName === "recommended-imagetags-tag-format") return `prefix-{sha|7}-suffix`;
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

    test("should generate tags to multiple registries when using comma separator", async () => {
      // Arrange
      jest.spyOn(core, "getInput").mockImplementation((inputName: string) => {
        if (inputName === "rules") return `
            <project-api>: 'project-api/**/*.ts';
          `;
        if (inputName === "recommended-imagetags-tag-format") return `prefix-{sha|7}-suffix`;
        if (inputName === "recommended-imagetags-registry") return `registry.cool/,registry.dev/`;
        return "";
      });

      // Act
      await run();

      // Assert
      expect(core.setOutput).toHaveBeenCalledWith("affected_recommended_imagetags", {
        "project-api": [
          "registry.cool/project-api:prefix-" + getHash('project-api/').slice(0, 7) + '-suffix',
          "registry.dev/project-api:prefix-" + getHash('project-api/').slice(0, 7) + '-suffix',
          "registry.cool/project-api:latest",
          "registry.dev/project-api:latest",
        ],
      });
    });

    test("should generate tags to multiple registries when using json string", async () => {
      // Arrange
      jest.spyOn(core, "getInput").mockImplementation((inputName: string) => {
        if (inputName === "rules") return `
            <project-api>: 'project-api/**/*.ts';
          `;
        if (inputName === "recommended-imagetags-tag-format") return `prefix-{sha|7}-suffix`;
        if (inputName === "recommended-imagetags-registry") return `["registry.cool/","registry.dev/"]`;
        return "";
      });

      // Act
      await run();

      // Assert
      expect(core.setOutput).toHaveBeenCalledWith("affected_recommended_imagetags", {
        "project-api": [
          "registry.cool/project-api:prefix-" + getHash('project-api/').slice(0, 7) + '-suffix',
          "registry.dev/project-api:prefix-" + getHash('project-api/').slice(0, 7) + '-suffix',
          "registry.cool/project-api:latest",
          "registry.dev/project-api:latest",
        ],
      });
    });
  });


  describe('changed-files-output-file', () => {
    const lines = [
      "100644 a 0\tproject-api/file1.ts",
      "100644 b 0\tproject-ui/file1.ts",
    ];
    const files = lines.map((line) => {
      const [mode, hash, stage, ...fileParts] = line.split(/\s+/);
      const file = fileParts.join('');
      return { mode, hash, stage, file };
    });


    beforeEach(() => {
      jest.spyOn(core, "setOutput").mockImplementation(jest.fn());

      const execSyncResponses = {
        'git diff --name-status HEAD~1 HEAD': () => files.map(f => `M\t${f.file}`).join('\n'),
        'git ls-files -s': () => lines.join('\n'),
      };

      jest.spyOn(cp, 'execSync')
        .mockImplementation((command: string) => {
          if (command.startsWith('git diff --name-status')) {
            return files.map(f => `M\t${f.file}`).join('\n');
          }

          if (execSyncResponses[command]) {
            return execSyncResponses[command]();
          }
          throw new Error(`Unexpected input: ${command}`);
        });
    });

    test("should not generate an output file", async () => {
      // Arrange
      jest.spyOn(core, "getInput").mockImplementation((inputName: string) => {
        if (inputName === "rules") return `
            <project-api>: 'project-api/**/*.ts';
          `;
        return "";
      });
      let fileWritten = false;
      jest.spyOn(changedFilesModule, 'writeChangedFiles').mockImplementation(async () => {
        fileWritten = true;
      });

      // Act
      await run();

      // Assert
      expect(fileWritten).toBe(false);
      expect(changedFilesModule.writeChangedFiles).not.toHaveBeenCalled();
    });

    test("should generate an output file", async () => {
      // Arrange
      jest.spyOn(core, "getInput").mockImplementation((inputName: string) => {
        if (inputName === "rules") return `
            <project-api>: 'project-api/**/*.ts';
          `;
        if (inputName === "changed-files-output-file") return 'abc.txt';
        return "";
      });
      let fileWritten = false;
      jest.spyOn(changedFilesModule, 'writeChangedFiles').mockImplementation(async () => {
        fileWritten = true;
      });

      // Act
      await run();

      // Assert
      expect(fileWritten).toBe(true);
      const fileWrittenContent = files.map(f => ({ file: f.file, status: changedFilesModule.ChangeStatus.Modified }));
      expect(changedFilesModule.writeChangedFiles).toHaveBeenCalledWith('abc.txt', fileWrittenContent);
    });
  });


  describe('rules', () => {
    const lines = [
      "100644 a 0\tproject-api/file1.ts",
      "100644 a 0\tproject-ui/file1.ts",
    ];

    const files = lines.map((line) => {
      const [mode, hash, stage, ...fileParts] = line.split(/\s+/);
      const file = fileParts.join('');
      return { mode, hash, stage, file };
    });

    beforeEach(() => {
      jest.spyOn(core, "setOutput").mockImplementation(jest.fn());

      const execSyncResponses = {
        'git diff --name-status HEAD~1 HEAD': () => files.map(f => `M\t${f}`).join('\n'),
        'git ls-files -s': () => lines.join('\n'),
      };

      jest.spyOn(cp, 'execSync')
        .mockImplementation((command: string) => {
          if (command.startsWith('git diff --name-status')) {
            return files.map(f => `M\t${f}`).join('\n');
          }

          if (execSyncResponses[command]) {
            return execSyncResponses[command]();
          }
          throw new Error(`Unexpected input: ${command}`);
        });
    });

    test("should require either rules or rules-file", async () => {
      // Arrange
      jest.spyOn(core, "getInput").mockImplementation(() => {
        return "";
      });
      const mockSetFailed = jest.spyOn(core, 'setFailed').mockImplementation(jest.fn());
      const errorMessage = "You must specify either 'rules' or 'rules-file'.";
      // Act
      await expect(run()).rejects.toThrow(errorMessage);

      // Assert
      expect(mockSetFailed).toHaveBeenCalledWith(errorMessage);
    });

    test("should enforce exclusivity between rules and rules-file", async () => {
      // Arrange
      jest.spyOn(core, "getInput").mockImplementation((inputName) => {
        if (inputName === "rules") return "some rules";
        if (inputName === "rules-file") return "path/to/rules-file";
        return "";
      });
      const mockSetFailed = jest.spyOn(core, "setFailed").mockImplementation(jest.fn());
      const errorMessage = "Only one of 'rules' or 'rules-file' can be specified. Please use either one.";

      // Act
      await expect(run()).rejects.toThrow(errorMessage);

      // Assert
      expect(mockSetFailed).toHaveBeenCalledWith(errorMessage);
    });
  });
});