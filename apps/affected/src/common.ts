import fs from 'fs';
import path from 'path';
import { getChangedFiles, writeChangedFiles } from './changedFiles';
import { evaluateStatementsForChanges } from './evaluateStatementsForChanges';
import { allGitFiles, evaluateStatementsForHashes } from './evaluateStatementsForHashes';
import { parse } from './parser';
import { AST } from './parser.types';

export interface ImageContext {
  event: string;
  pull_request_number: number;
}

export const getRules = (rulesInput: string, rulesFile: string) => {
  if (rulesInput && rulesFile) {
    throw new Error("Only one of 'rules' or 'rules-file' can be specified. Please use either one.");
  }

  if (!rulesInput && !rulesFile) {
    throw new Error("You must specify either 'rules' or 'rules-file'.");
  }

  let rules = '';
  if (rulesInput) {
    rules = rulesInput;
  } else {
    const rulesFilePath = path.resolve(rulesFile);
    if (!fs.existsSync(rulesFilePath)) {
      throw new Error(`The specified rules-file does not exist: ${rulesFilePath}`);
    }

    rules = fs.readFileSync(rulesFilePath, 'utf8');
  }
  return rules;
};



export const getImageName = (appTarget: string, sha: string, truncateSha1Size = 0, imageTagRegistry = '', imageTagPrefix = '', imageTagSuffix = '', imageContext?: ImageContext) => {
  let sha1 = sha;
  if (isNaN(truncateSha1Size) || truncateSha1Size === 0) {
    sha1 = sha;
  } else if (truncateSha1Size > 0) {
    sha1 = sha.slice(0, truncateSha1Size);
  } else {
    sha1 = sha.slice(truncateSha1Size);
  }

  const imageName1 = `${appTarget}:${imageTagPrefix}${sha1}${imageTagSuffix}`;

  let imageName2 = `${appTarget}:latest`;
  if (imageContext && imageContext.event === 'pull_request') {
    imageName2 = `${appTarget}:pr-${imageContext.pull_request_number}`;
  }

  return [imageName1, imageName2].map((imageName) => `${imageTagRegistry || ''}${imageName}`);
}

export const processRules = async (
  log: (message: string) => void,
  rulesInput: string,
  truncateSha1Size: number,
  imageTagRegistry: string,
  imageTagPrefix: string,
  imageTagSuffix: string,
  changedFilesOutputFile?: string,
  imageContext?: ImageContext) => {
  const affectedImageTags: Record<string, string[]> = {};
  const affectedShas: Record<string, string> = {};
  const affectedChanges: Record<string, boolean> = {};

  if (rulesInput) {
    const statements = parse(rulesInput, undefined) as AST;

    if (!Array.isArray(statements)) {
      throw new Error('Rules must be an array of statements');
    }

    const changedFiles = await getChangedFiles();
    log(`Changed Files: ${changedFiles.join('\n')}`);
    if (changedFilesOutputFile) {
      await writeChangedFiles(changedFilesOutputFile, changedFiles);
    }

    const { changes } = evaluateStatementsForChanges(statements, changedFiles);
    for (const [key, value] of Object.entries(changes)) {
      affectedChanges[key] = value;
    }

    const allFiles = await allGitFiles();
    log(`All Git Files: ${allFiles.join('\n')}`);
    const commitSha = await evaluateStatementsForHashes(statements, allFiles);

    for (const statement of statements) {
      if (statement.type !== 'STATEMENT') continue;

      const { key } = statement;
      if (key.path) {
        affectedShas[key.name] = commitSha[key.name];

        const imageName = getImageName(key.name, commitSha[key.name], truncateSha1Size, imageTagRegistry, imageTagPrefix, imageTagSuffix, imageContext);
        affectedImageTags[key.name] = imageName;

        log(`Key: ${key.name}, Path: ${key.path}, Commit SHA: ${commitSha}, Image: ${imageName}`);
      }
    }
  }

  return {
    shas: affectedShas,
    changes: affectedChanges,
    recommended_imagetags: affectedImageTags,
  };
};