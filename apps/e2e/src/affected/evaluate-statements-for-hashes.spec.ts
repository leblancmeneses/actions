import { evaluateStatementForHashes } from '../../../affected/src/evaluateStatementsForHashes';
import { parse } from '../../../affected/src/parser';
import { AST } from '../../../affected/src/parser.types';
import { execSync } from 'child_process';
import crypto from 'crypto';

jest.mock('child_process', () => ({
  execSync: jest.fn()
}));


describe('evaluate-statements-for-hashes.spec', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return the correct hash for markdown files', async () => {
    const files = [
      "docs/readme.md",
      "src/index.js",
      "src/guide.md"
    ];

    (execSync as jest.Mock).mockImplementation((command: string) => {
      if (command === 'git ls-files') {
        return files.join('\n');
      }
      if (command.startsWith('git hash-object')) {
        const match = command.match(/git hash-object\s+"([^"]+)"/);
        if(!match) {
          throw new Error(`Unexpected command: ${command}`);
        }

        return match[1];
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const statements = parse(`
      <markdown>: '**/*.md';
    `, undefined) as AST;

    const result = await evaluateStatementForHashes(statements);
    const hash = crypto.createHash('sha1')
                       .update(files.filter(f => f.endsWith('.md')).sort().join('\n') + '\n')
                       .digest('hex');

    expect(result).toHaveProperty('markdown', hash);
    expect(typeof result.markdown).toBe('string');
    expect(result.markdown).toHaveLength(40);
  });

  it('should return the correct hash for dependency of files', async () => {

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

    // Mock the repo files returned by `git ls-files`
    // We return a mix of .md and other files.
    (execSync as jest.Mock).mockImplementation((command: string) => {
      if (command === 'git ls-files') {
        return files.join('\n');
      }
      if (command.startsWith('git hash-object')) {
        const match = command.match(/git hash-object\s+"([^"]+)"/);
        if(!match) {
          throw new Error(`Unexpected command: ${command}`);
        }

        return match[1];
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const statements = parse(`
      markdown: '**/*.md';
      yaml: '**/*.yaml' OR '**/*.yml';
      <expression>: ('./apps/affected/**' './dist/apps/affected/**') EXCEPT(markdown);
    `, undefined) as AST;


    const result = await evaluateStatementForHashes(statements);
    const matchedFiles = files.filter(f => (f.startsWith('apps/affected/') || f.startsWith('dist/apps/affected/')) && !f.endsWith('.md')).sort();
    const hash = crypto.createHash('sha1')
                       .update(matchedFiles.join('\n') + '\n')
                       .digest('hex');

    expect(result).toHaveProperty('expression', hash);
    expect(typeof result.expression).toBe('string');
    expect(result.expression).toHaveLength(40);
  });
});
