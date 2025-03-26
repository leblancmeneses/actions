// node dist/apps/affected/cli/main.cli.js calculate --rules-file ./.github/affected.rules --verbose
// node dist/apps/affected/cli/main.cli.js calculate --rules-file ./.github/affected.rules

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { processRules, getRules, mapResultToOutput, parseRegistryInput } from './common';
import { parse } from './parser';

import * as packageJson from '../../../package.json';
import { AST } from './parser.types';
import { execSync } from 'child_process';
import { ChangeStatus } from './changedFiles';
import { evaluateStatementsForChanges } from './evaluateStatementsForChanges';
import { reduceAST } from './ls';

export const log = (verbose: boolean, message: string) => {
  if (verbose) {
    console.log(message);
  }
};

yargs(hideBin(process.argv))
  .scriptName("main.cli.js") // Optional: Set a custom script name for the help output
  .usage('$0 <command> [options]')
  .version(packageJson.version)
  .command(
    'calculate',
    'Calculate affected targets',
    (yargs) => {
      yargs
        .option('rules', { type: 'string', describe: 'Rules as a string', demandOption: false })
        .option('rules-file', { type: 'string', describe: 'Path to rules file', demandOption: false })
        .option('verbose', { type: 'boolean', default: false, describe: 'Verbose logging' })
        .option('image-tag-format', { type: 'string', default: '', describe: 'Image tag format' })
        .option('image-tag-format-whenchanged', { type: 'string', default: '', describe: 'Image tag format when changed' })
        .option('image-tag-remove-target', { type: 'string', default: '', describe: 'Image tag format' })
        .option('image-tag-registry', { type: 'string', default: '', describe: 'Image tag registry' })
        .option('changed-files-output-file', { type: 'string', describe: 'Path to write changed files', demandOption: false });
    },
    async (argv) => {
      try {
        const rules = getRules(argv.rules as string, argv['rules-file'] as string);
        const affectedOutput = await processRules(
          log.bind(null, argv.verbose as boolean),
          rules,
          parseRegistryInput(argv['image-tag-registry'] as string),
          argv['image-tag-format'] as string,
          argv['image-tag-format-whenchanged'] as string,
          argv['image-tag-remove-target'] === 'true',
          argv['changed-files-output-file'] as string | undefined
        );
        console.info(`${JSON.stringify(mapResultToOutput(affectedOutput), null, 2)}`);
      } catch (error) {
        console.error(error.message);
        process.exit(1);
      }
    }
  )
  .command(
    'ls',
    'List details for a specific rule name',
    (yargs) => {
        yargs
        .option('rules', { type: 'string', describe: 'Rules as a string', demandOption: false })
        .option('rules-file', { type: 'string', describe: 'Path to rules file', demandOption: false })
        .option('rule-name', {
          describe: 'The name of the rule to inspect',
          type: 'string',
          array: true,
          demandOption: true
        });
    },
    async (argv) => {
      try {
        const rules = getRules(argv.rules as string, argv['rules-file'] as string);

        const ruleStatements = parse(rules, undefined) as AST;

        if (!Array.isArray(ruleStatements)) {
          throw new Error("Rules must be an array of statements");
        }

        const ruleNames = argv['rule-name'] as string[];
        const reducedRuleStatements = reduceAST(ruleStatements, ruleNames);

        // Get a list of all tracked files from Git
        const output = execSync('git ls-files -s', { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });

        // Extract file paths from each line (4-part output: mode, hash, stage, path)
        const allFiles = output
          .split('\n')
          .map(line => line.trim().split(/\s+/)[3])
          .filter(Boolean).map(file => ({ file, status: ChangeStatus.Unknown }));

        process.env['KEEP_ALL_RULE_MATCHES'] = 'true';
        for(const ruleName of ruleNames) {
          const { netFiles } = evaluateStatementsForChanges(reducedRuleStatements, allFiles);
          if (!netFiles[ruleName]) {
            console.error(`Rule '${ruleName}' not found.`);
            process.exit(1);
          }
          console.info(`Rule: ${ruleName}`);
          console.info(`Net Files: ${JSON.stringify(netFiles[ruleName].map(x => x.file), null, 2)}`);
        }
      } catch (err) {
        console.error(err.message);
        process.exit(1);
      }
    }
  )
  .help()
  .argv;
