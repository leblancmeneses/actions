import { evaluateStatements } from '../../../affected/src/evaluateStatements';
import { mapGitStatusCode } from  "../../../affected/src/changedFiles";
import { parse } from '../../../affected/src/parser';
import { AST } from '../../../affected/src/parser.types';

describe('evaluateStatements', () => {
  describe('exclusion expressions', () => {
    describe('positive tests', () => {
      it('should evaluate exclusion', () => {
        const statements = parse(`
          expression: !'**/*.md';
        `, undefined) as AST;
        const left = evaluateStatements(statements, [
          { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
        ]);
        expect(left.expression).toBe(true);
      });

      it('should evaluate when level1 has exclusion operator', () => {
        const statements = parse(`
          markdown: !'**/*.md';
          expression: markdown;
        `, undefined) as AST;
        const left = evaluateStatements(statements, [
          { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
        ]);
        expect(left.expression).toBe(true);
      });

      it('should evaluate when level0 has exclusion operator', () => {
        const statements = parse(`
          markdown: '**/*.md';
          expression: !markdown;
        `, undefined) as AST;
        const left = evaluateStatements(statements, [
          { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
        ]);
        expect(left.expression).toBe(true);
      });

      it('should evaluate when level2 has exclusion operator', () => {
        const statements = parse(`
          level2: !'**/*.md';
          level1: level2;
          expression: level1;
        `, undefined) as AST;
        const left = evaluateStatements(statements, [
          { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
        ]);
        expect(left.expression).toBe(true);
      });
    });

    describe('negative tests', () => {
      it('should evaluate exclusion', () => {
        const statements = parse(`
          expression: !'**/*.md';
        `, undefined) as AST;
        const left = evaluateStatements(statements, [
          { file: 'lib1/foo.md', status: mapGitStatusCode('A') },
        ]);
        expect(left.expression).toBe(false);
      });

      it('should evaluate when level1 has exclusion operator', () => {
        const statements = parse(`
          markdown: !'**/*.md';
          expression: markdown;
        `, undefined) as AST;
        const left = evaluateStatements(statements, [
          { file: 'lib1/foo.md', status: mapGitStatusCode('A') },
        ]);
        expect(left.expression).toBe(false);
      });

      it('should evaluate when level0 has exclusion operator', () => {
        const statements = parse(`
          markdown: '**/*.md';
          expression: !markdown;
        `, undefined) as AST;
        const left = evaluateStatements(statements, [
          { file: 'lib1/foo.md', status: mapGitStatusCode('A') },
        ]);
        expect(left.expression).toBe(false);
      });

      it('should evaluate when level2 has exclusion operator', () => {
        const statements = parse(`
          level2: !'**/*.md';
          level1: level2;
          expression: level1;
        `, undefined) as AST;
        const left = evaluateStatements(statements, [
          { file: 'lib1/foo.md', status: mapGitStatusCode('A') },
        ]);
        expect(left.expression).toBe(false);
      });
    });
  });


  describe('fundamental expressions', () => {
    it('should evaluate to false', () => {
      const statements = parse(`
        expression: '**/*.md';
      `, undefined) as AST;
      const left = evaluateStatements(statements, [
        { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
      ]);
      expect(left.expression).toBe(false);
    });

    it('should evaluate to true', () => {
      const statements = parse(`
        expression: '**/*.md';
      `, undefined) as AST;
      const left = evaluateStatements(statements, [
        { file: 'lib1/foo.md', status: mapGitStatusCode('A') },
      ]);
      expect(left.expression).toBe(true);
    });
  });


  describe('boolean expressions', () => {
    const statements = parse(`expression: 'lib1/**'a  ('lib2/**' AND 'lib3/**');`, undefined) as AST;
    it('should evaluate OR correctly when lib1 is a match', () => {
      const left = evaluateStatements(statements, [
        { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
        { file: 'lib4/foo.js', status: mapGitStatusCode('D') },
      ]);
      expect(left.expression).toBe(true);
    });

    it('should evaluate OR correctly when lib1 is a match but file status is a miss', () => {
      const left1 = evaluateStatements(statements, [
        { file: 'lib1/foo.js', status: mapGitStatusCode('D') },
        { file: 'lib4/foo.js', status: mapGitStatusCode('D') },
      ]);
      expect(left1.expression).toBe(false);
    });

    it('should evaluate OR correctly when lib2 is a match but missing lib3', () => {
      const right1 = evaluateStatements(statements, [
        { file: 'lib2/foo.js', status: mapGitStatusCode('A') },
        { file: 'lib4/foo.js', status: mapGitStatusCode('D') },
      ]);
      expect(right1.expression).toBe(false);
    });

    it('should evaluate OR correctly when lib2 AND lib3 is a match', () => {
      const right2 = evaluateStatements(statements, [
        { file: 'lib2/foo.js', status: mapGitStatusCode('D') },
        { file: 'lib3/foo.js', status: mapGitStatusCode('A') },
        { file: 'lib4/foo.js', status: mapGitStatusCode('D') },
      ]);
      expect(right2.expression).toBe(true);
    });
  });

  describe('statementref expressions', () => {
    it('should evaluate statementref exclude with AND', () => {
      const statements = parse(`
        markdown: '**/*.md'; # match all markdown files
        expression: 'lib1/**' AND !markdown;
      `, undefined) as AST;
      const left = evaluateStatements(statements, [
        { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
      ]);
      expect(left.expression).toBe(true);
    });

    it('should evaluate statementref exclude with AND variation', () => {
      const statements = parse(`
        markdown: !'**/*.md'; # match all markdown files
        expression: 'lib1/**' AND markdown;
      `, undefined) as AST;
      const left = evaluateStatements(statements, [
        { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
      ]);
      expect(left.expression).toBe(true);
    });

  });

  it('should evaluate exclude with implicit OR correctly', () => {
    const statements = parse(`
      expression: 'lib1/**' !'lib1/foo.js'; # left side won.
    `, undefined) as AST;
    const left = evaluateStatements(statements, [
      { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
    ]);
    expect(left.expression).toBe(true);
  });

  it('should evaluate exclude with explicit OR correctly', () => {
    const statements = parse(`
      expression: 'lib1/**' OR !'lib1/foo.js'; # left side won.
    `, undefined) as AST;
    const left = evaluateStatements(statements, [
      { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
    ]);
    expect(left.expression).toBe(true);
  });

  it('should evaluate exclude with AND correctly', () => {
    const statements = parse(`
      expression: 'lib1/**' AND !'lib1/foo.js'; # right side fails expression.
    `, undefined) as AST;
    const left = evaluateStatements(statements, [
      { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
    ]);
    expect(left.expression).toBe(false);
  });
});
