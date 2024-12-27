// node dist/apps/affected/cli/main.cli.js calculate --rules-file ./.github/affected.rules --verbose 
// node dist/apps/affected/cli/main.cli.js calculate --rules-file ./.github/affected.rules
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { processRules, getRules } from './common';

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
        .option('truncate-sha1-size', { type: 'number', default: 0, describe: 'SHA1 truncation size' })
        .option('image-tag-prefix', { type: 'string', default: '', describe: 'Image tag prefix' })
        .option('image-tag-suffix', { type: 'string', default: '', describe: 'Image tag suffix' })
        .option('image-tag-registry', { type: 'string', default: '', describe: 'Image tag registry' })
        .option('changed-files-output-file', { type: 'string', describe: 'Path to write changed files', demandOption: false });
    },
    async (argv) => {
      try {
        const rules = getRules(argv.rules as string, argv['rules-file'] as string);
        const affectedOutput = await processRules(
          log.bind(null, argv.verbose as boolean),
          rules,
          argv['truncate-sha1-size'] as number,
          argv['image-tag-registry'] as string,
          argv['image-tag-prefix'] as string,
          argv['image-tag-suffix'] as string,
          argv['changed-files-output-file'] as string | undefined
        );
        console.info(`${JSON.stringify(affectedOutput, null, 2)}`);
      } catch (error) {
        console.error(error.message);
        process.exit(1);
      }
    }
  )
  .help()
  .argv;
