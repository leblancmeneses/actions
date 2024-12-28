jest.mock("@actions/core");
jest.mock("@actions/github");
jest.mock('child_process', () => {
  const originalModule = jest.requireActual('child_process');
  return {
    ...originalModule,
    execSync: jest.fn(),
  };
});
import * as github from '@actions/github';
import { run } from "./main";
import * as core from "@actions/core";
import * as cp from 'child_process';



describe("main.spec", () => {
    const lines = `
    100644 6e87a003da89defd554080af5af93600cc9f91fe 0	.editorconfig
    100644 b512c09d476623ff4bf8d0d63c29b784925dbdf8 0	.eslintignore
    100644 822e9263c5d69e5543a77e907109fdb9a85c6e0e 0	.eslintrc.json
    100644 b575344d425c02b5a4a317de179afd54f526e45e 0	.github/affected.rules
    100644 1d4d8ceaf15ce63dcffbb76715324f05b61f1e57 0	.github/example-output.png
    100644 9685eb78974072ec24e089645cfbeb5462c026e0 0	.github/workflows/ci.yml
    100644 f7ed8851bd89e0bcfd5e7ae56380b2197a679130 0	.gitignore
    100644 2d706193b6a321d0caf4c7b76a132db83c1596d4 0	.husky/pre-commit
    100644 df9385826faa24a3ccd7a934df5154f75d36c45e 0	.nvmrc
    100644 d155fdbd59dca5c7dcb10d30705bc6a3779356c2 0	.prettierignore
    100644 544138be45652abc7bc3873341deacd3f4f90c61 0	.prettierrc
    100644 97e81d494caffc0f2219e8defd89ad513a6aa5fc 0	.vscode/extensions.json
    100644 38f87363a079baa2ff9e4d5403734fd3ccf20277 0	LICENSE
    100644 ec713028e9713bfff9fa4a7a50ebc8105f9945f1 0	README.md
    100644 5417732b97539c85ef73905bca64bdf4d6761745 0	apps/affected/.eslintrc.json
    100644 f88c5fd906f34b2d089d50d20f8d294ef11255f4 0	apps/affected/Dockerfile
    100644 f0b5218eca8a4ff9b2b94a6adb4983f6d2b71a77 0	apps/affected/action.yml
    100644 e67d2202efb4a2248e406bd90b239e2fec2815d5 0	apps/affected/jest.config.ts
    100644 488330c71f3e63eb46e69352d49a1d44a5165b70 0	apps/affected/project.json
    100644 8ac45fd1d9b65b2602a6680f293bae73c945f657 0	apps/affected/src/affected.spec.ts
    100644 3cdcab334cabf77ab9aae3cd3cb538ff8759d95e 0	apps/affected/src/changedFiles.spec.ts
    100644 e763fea20d191e5c38e91847a358cba1b6cdc348 0	apps/affected/src/changedFiles.ts
    100644 4140a6331ba6b9f404e97f75892514e2a3818439 0	apps/affected/src/common.ts
    100644 6349c3f73446f9eba20f251594d696462be6d318 0	apps/affected/src/constants.ts
    100644 c2e1315d5cb42ee7ec92e2f709196610d44c887e 0	apps/affected/src/evaluateStatementsForChanges.spec.ts
    100644 4db87043415efac62953d78ad90aad65dfb4e2a3 0	apps/affected/src/evaluateStatementsForChanges.ts
    100644 cdcf13822018e26054a95a0b335a20d5d2d6437d 0	apps/affected/src/evaluateStatementsForHashes.spec.ts
    100644 3f27c0181dc7aaf6d1b7df6c16671400e1987e05 0	apps/affected/src/evaluateStatementsForHashes.ts
    100644 c73b38cf684f9a23fe4c5a99836620c6049a520d 0	apps/affected/src/main.cli.ts
    100644 08a524e204bac6cad022cd4ec1df21ac0bd6dbdc 0	apps/affected/src/main.spec.ts
    100644 d1b127e58ddbc7f57fc36c62e128ed332ff7754a 0	apps/affected/src/main.ts
    100644 7ee6bab4986105df7345daaa5cfd62cbdc846b0d 0	apps/affected/src/parser.peggy
    100644 4e8ea887d98f5ec5e6b85ff242dc8b567cb1637c 0	apps/affected/src/parser.spec.ts
    100644 dd9ac1ddd3e763f1dbe19295315edfa366226ab8 0	apps/affected/src/parser.ts
    100644 14d5a83180bef7776a197ba06f5850aa5ce9f822 0	apps/affected/src/parser.types.ts
    100644 f5e2e0859a9b07e1e4f9dc6c0616ac01028038a0 0	apps/affected/tsconfig.app.json
    100644 360719cd04868d827039e21332a6051c414f7082 0	apps/affected/tsconfig.json
    100644 9b2a121d114b68dcdb5b834ebca032814b499a74 0	apps/affected/tsconfig.spec.json
    100644 9d9c0db55bb1e91c5f2e7b64a02bc6bf69fc7cb5 0	apps/pragma/.eslintrc.json
    100644 b141161cb709c68ff78486322f54ddefda876a72 0	apps/pragma/action.yml
    100644 6e3858686fc76f3cc4faa604e12fb715a391a0dc 0	apps/pragma/jest.config.ts
    100644 4cff78a4ab86d77c7d06d1aeabb41c0bebe6b0e6 0	apps/pragma/project.json
    100644 44544f2386a6d2ae22211097abdd43388a51c2e3 0	apps/pragma/src/main.spec.ts
    100644 36a8c876c8d7bd20b532baa4a8f748193653aac8 0	apps/pragma/src/main.ts
    100644 f5e2e0859a9b07e1e4f9dc6c0616ac01028038a0 0	apps/pragma/tsconfig.app.json
    100644 c1e2dd4e8be6f4fe3dca35d044fd912ff41b1c18 0	apps/pragma/tsconfig.json
    100644 9b2a121d114b68dcdb5b834ebca032814b499a74 0	apps/pragma/tsconfig.spec.json
    100644 9d9c0db55bb1e91c5f2e7b64a02bc6bf69fc7cb5 0	apps/version-autopilot/.eslintrc.json
    100644 10c6db2f72036f9e6343a7399e0627ac92e64a73 0	apps/version-autopilot/action.yml
    100644 ee845f6fb5ea265c6cdbab784a291ea4fcffc5d9 0	apps/version-autopilot/jest.config.ts
    100644 90e056e3e1dc08c501b629b5fa8ca7ce70f76d53 0	apps/version-autopilot/project.json
    100644 6d61219fc23515ed580abfe41bb0e1e7adc418ec 0	apps/version-autopilot/src/main.spec.ts
    100644 7d981d9538d14b38ca72e0f47a01606462192452 0	apps/version-autopilot/src/main.ts
    100644 f5e2e0859a9b07e1e4f9dc6c0616ac01028038a0 0	apps/version-autopilot/tsconfig.app.json
    100644 c1e2dd4e8be6f4fe3dca35d044fd912ff41b1c18 0	apps/version-autopilot/tsconfig.json
    100644 9b2a121d114b68dcdb5b834ebca032814b499a74 0	apps/version-autopilot/tsconfig.spec.json
    100644 21244d9735d7875622e2e10a8713f45ca269acbd 0	dist/apps/affected/cli/main.cli.js
    100644 37106d4859b32285460979f0a247bc5d8b919a38 0	dist/apps/affected/main/main.js
    100644 f9944794384728bc985c4a92a8bdd65355203474 0	dist/apps/pragma/main.js
    100644 dbaf05e66b96a5c81dd992b4da54d04e3a5e9d0e 0	dist/apps/version-autopilot/main.js
    100644 cce9369228d4b0c00912bf5d9c5e544813d3fdaf 0	docs/graphics/repository-open-graph-template.png
    100644 6b3f2d6e243a4a152bab0349ecb8c2e7c307f582 0	jest.config.ts
    100644 f078ddcec1e89a1e122d2d64501a73d1a8a484d4 0	jest.preset.js
    100644 959e4ad5163ec0451f1689317bba2790593a8c91 0	nx.json
    100644 2b87ad61a5d5dc3620c832dc28e10fa6bc6d7a7f 0	package.json
    100644 34fd5a4b3730ea943d6382a890a91b9315785202 0	pnpm-lock.yaml
    100644 7b9200cfd01c4970a31b08d0ae4e591de88bb42a 0	tsconfig.base.json
    `.split('\n').map(f => f.trim()).filter(Boolean)
    .map((line) => {
      const [mode, hash, stage, ...fileParts] = line.split(/\s+/);
      const file = fileParts.join('');
      return { mode, hash, stage, file };
    });

  const gitMockResponses = {
    'git diff --name-status base1 head1': () => `
M\t.github/workflows/ci.yml
M\tapps/affected/src/main.ts
`.trim(),
    'git ls-files -s': () => lines.map(x => x.file).join('\n'),
  };

  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(jest.fn());
    jest.spyOn(console, 'error').mockImplementation(jest.fn());
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    delete github.context.eventName;
    delete github.context.payload;
    delete process.env.BASE_SHA;
    delete process.env.HEAD_SHA;

    github.context.eventName = 'pull_request';
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
