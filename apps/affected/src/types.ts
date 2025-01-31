export interface AffectedResult {
  shas: Record<string, string> ,
  changes: Record<string, boolean>,
  recommended_imagetags:  Record<string, string[]>,
}

export type AffectedOutput = Record<string, {changes: boolean, sha: string, recommended_imagetags: string[]}>;
