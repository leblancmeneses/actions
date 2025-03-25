// node dist/apps/affected/cli/main.cli.js calculate --rules-file ./.github/affected.rules --verbose
// node dist/apps/affected/cli/main.cli.js calculate --rules-file ./.github/affected.rules

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { processRules, getRules, mapResultToOutput, parseRegistryInput } from './common';

import * as packageJson from '../../../package.json';

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
  .help()
  .argv;
