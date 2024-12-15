import { evaluateStatements } from '../../../affected/src/evaluateStatements';
import { ChangeStatus, mapGitStatusCode } from "../../../affected/src/changedFiles";
import { parse } from '../../../affected/src/parser';
import { AST } from '../../../affected/src/parser.types';

describe('evaluate-statements.spec', () => {
  describe('exclusion expressions', () => {
    describe('positive tests', () => {
      it('should evaluate exclusion', () => {
        const statements = parse(`
          <expression>: !'**/*.md';
        `, undefined) as AST;
        const { changes, netFiles } = evaluateStatements(statements, [
          { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
        ]);
        expect(changes.expression).toBe(true);
        expect(netFiles).toEqual({
          expression: [{ file: 'lib1/foo.js', status: ChangeStatus.Added }],
        });
      });

      it('should evaluate when level1 has exclusion operator', () => {
        const statements = parse(`
          <markdown>: !'**/*.md';
          <expression>: markdown;
        `, undefined) as AST;
        const { changes, netFiles } = evaluateStatements(statements, [
          { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
        ]);
        expect(changes.markdown).toBe(true);
        expect(changes.expression).toBe(true);
        expect(netFiles).toEqual({
          markdown: [{ file: 'lib1/foo.js', status: ChangeStatus.Added }],
          expression: [{ file: 'lib1/foo.js', status: ChangeStatus.Added }],
        });
      });

      it('should evaluate when level0 has exclusion operator', () => {
        const statements = parse(`
          markdown: '**/*.md';
          <expression>: !markdown;
        `, undefined) as AST;
        const { changes, netFiles } = evaluateStatements(statements, [
          { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
        ]);
        expect(changes.expression).toBe(true);
        expect(netFiles).toEqual({
          expression: [{ file: 'lib1/foo.js', status: ChangeStatus.Added }],
        });
      });

      it('should evaluate when level2 has exclusion operator', () => {
        const statements = parse(`
          level2: !'**/*.md';
          level1: level2;
          <expression>: level1;
        `, undefined) as AST;
        const { changes, netFiles } = evaluateStatements(statements, [
          { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
        ]);
        expect(changes.expression).toBe(true);
        expect(netFiles).toEqual({
          expression: [{ file: 'lib1/foo.js', status: ChangeStatus.Added }],
        });
      });
    });

    describe('negative tests', () => {
      it('should evaluate exclusion', () => {
        const statements = parse(`
          <expression>: !'**/*.md';
        `, undefined) as AST;
        const { changes, netFiles } = evaluateStatements(statements, [
          { file: 'lib1/foo.md', status: mapGitStatusCode('A') },
        ]);
        expect(changes.expression).toBe(false);
        expect(netFiles).toEqual({
          expression: [],
        });
      });

      it('should evaluate when level1 has exclusion operator', () => {
        const statements = parse(`
          markdown: !'**/*.md';
          <expression>: markdown;
        `, undefined) as AST;
        const { changes, netFiles } = evaluateStatements(statements, [
          { file: 'lib1/foo.md', status: mapGitStatusCode('A') },
        ]);
        expect(changes.expression).toBe(false);
        expect(netFiles).toEqual({
          expression: [],
        });
      });

      it('should evaluate when level0 has exclusion operator', () => {
        const statements = parse(`
          markdown: '**/*.md';
          <expression>: !markdown;
        `, undefined) as AST;
        const { changes, netFiles } = evaluateStatements(statements, [
          { file: 'lib1/foo.md', status: mapGitStatusCode('A') },
        ]);
        expect(changes.expression).toBe(false);
        expect(netFiles).toEqual({
          expression: [],
        });
      });

      it('should evaluate when level2 has exclusion operator', () => {
        const statements = parse(`
          level2: !'**/*.md';
          level1: level2;
          <expression>: level1;
        `, undefined) as AST;
        const { changes, netFiles } = evaluateStatements(statements, [
          { file: 'lib1/foo.md', status: mapGitStatusCode('A') },
        ]);
        expect(changes.expression).toBe(false);
        expect(netFiles).toEqual({
          expression: [],
        });
      });
    });
  });


  describe('fundamental expressions', () => {
    it('should evaluate to false', () => {
      const statements = parse(`
        <expression>: '**/*.md';
      `, undefined) as AST;
      const { changes, netFiles } = evaluateStatements(statements, [
        { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
      ]);
      expect(changes.expression).toBe(false);
      expect(netFiles).toEqual({
        expression: [],
      });
    });

    it('should evaluate to true', () => {
      const statements = parse(`
        <expression>: '**/*.md';
      `, undefined) as AST;
      const { changes, netFiles } = evaluateStatements(statements, [
        { file: 'lib1/foo.md', status: mapGitStatusCode('A') },
      ]);
      expect(changes.expression).toBe(true);
      expect(netFiles).toEqual({
        expression: [{ file: 'lib1/foo.md', status: ChangeStatus.Added }],
      });
    });
  });


  describe('boolean expressions', () => {
    const statements = parse(`<expression>: 'lib1/**'a  ('lib2/**' AND 'lib3/**');`, undefined) as AST;
    it('should evaluate OR correctly when lib1 is a match', () => {
      const { changes, netFiles } = evaluateStatements(statements, [
        { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
        { file: 'lib4/foo.js', status: mapGitStatusCode('D') },
      ]);
      expect(changes.expression).toBe(true);
      expect(netFiles).toEqual({
        expression: [{ file: 'lib1/foo.js', status: ChangeStatus.Added }],
      });
    });

    it('should evaluate OR correctly when lib1 is a match but file status is a miss', () => {
      const { changes, netFiles } = evaluateStatements(statements, [
        { file: 'lib1/foo.js', status: mapGitStatusCode('D') },
        { file: 'lib4/foo.js', status: mapGitStatusCode('D') },
      ]);
      expect(changes.expression).toBe(false);
      expect(netFiles).toEqual({
        expression: [],
      });
    });

    it('should evaluate OR correctly when lib2 is a match but missing lib3', () => {
      const { changes, netFiles } = evaluateStatements(statements, [
        { file: 'lib2/foo.js', status: mapGitStatusCode('A') },
        { file: 'lib4/foo.js', status: mapGitStatusCode('D') },
      ]);
      expect(changes.expression).toBe(false);
      expect(netFiles).toEqual({
        expression: [],
      });
    });

    it('should evaluate OR correctly when lib2 AND lib3 is a match', () => {
      const { changes, netFiles } = evaluateStatements(statements, [
        { file: 'lib2/foo.js', status: mapGitStatusCode('D') },
        { file: 'lib3/foo.js', status: mapGitStatusCode('A') },
        { file: 'lib4/foo.js', status: mapGitStatusCode('D') },
      ]);
      expect(changes.expression).toBe(true);
      expect(netFiles).toEqual({
        expression: [
          { file: 'lib2/foo.js', status: ChangeStatus.Deleted },
          { file: 'lib3/foo.js', status: ChangeStatus.Added }],
      });
    });
  });

  describe('statementref expressions', () => {
    it('should evaluate statementref exclude with AND', () => {
      const statements = parse(`
        markdown: '**/*.md'; # match all markdown files
        <expression>: 'lib1/**' AND !markdown;
      `, undefined) as AST;
      const { changes, netFiles } = evaluateStatements(statements, [
        { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
      ]);
      expect(changes.expression).toBe(true);
      expect(netFiles).toEqual({
        expression: [
          { file: 'lib1/foo.js', status: ChangeStatus.Added }]
      });
    });

    it('should evaluate statementref exclude with AND variation', () => {
      const statements = parse(`
        markdown: !'**/*.md'; # match all markdown files
        <expression>: 'lib1/**' AND markdown;
      `, undefined) as AST;
      const { changes, netFiles } = evaluateStatements(statements, [
        { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
      ]);
      expect(changes.expression).toBe(true);
      expect(netFiles).toEqual({
        expression: [
          { file: 'lib1/foo.js', status: ChangeStatus.Added }]
      });
    });

    it('should evaluate statementref exclude with OR', () => {
      const statements = parse(`
        markdown: '**/*.md'; # match all markdown files
        <expression>: 'lib1/**' OR !markdown;
      `, undefined) as AST;
      const { changes, netFiles } = evaluateStatements(statements, [
        { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
      ]);
      expect(changes.expression).toBe(true);
      expect(netFiles).toEqual({
        expression: [
          { file: 'lib1/foo.js', status: ChangeStatus.Added }]
      });
    });
    it('should evaluate statementref exclude with OR with md', () => {
      const statements = parse(`
        markdown: '**/*.md'; # match all markdown files
        <expression>: 'lib1/**' OR !markdown;
      `, undefined) as AST;
      const { changes, netFiles } = evaluateStatements(statements, [
        { file: 'lib1/foo.md', status: mapGitStatusCode('A') },
      ]);
      expect(changes.expression).toBe(true);
      expect(netFiles).toEqual({
        expression: [
          { file: 'lib1/foo.md', status: ChangeStatus.Added }]
      });
    });
    it('should evaluate statementref exclude with OR with md v2', () => {
      const statements = parse(`
        markdown: '**/*.md'; # match all markdown files
        <expression>: 'lib1/**' OR !markdown;
      `, undefined) as AST;
      const { changes, netFiles } = evaluateStatements(statements, [
        { file: 'lib2/foo.md', status: mapGitStatusCode('A') },
      ]);
      expect(changes.expression).toBe(false);
      expect(netFiles).toEqual({
        expression: []
      });
    });
  });

  it('should evaluate exclude with implicit OR correctly', () => {
    const statements = parse(`
      <expression>: 'lib1/**' !'lib1/foo.js'; # left side won.
    `, undefined) as AST;
    const { changes, netFiles } = evaluateStatements(statements, [
      { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
    ]);
    expect(changes.expression).toBe(true);
    expect(netFiles).toEqual({
      expression: [
        { file: 'lib1/foo.js', status: ChangeStatus.Added }]
    });
  });

  it('should evaluate exclude with explicit OR correctly', () => {
    const statements = parse(`
      <expression>: 'lib1/**' OR !'lib1/foo.js'; # left side won.
    `, undefined) as AST;
    const { changes, netFiles } = evaluateStatements(statements, [
      { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
    ]);
    expect(changes.expression).toBe(true);
    expect(netFiles).toEqual({
      expression: [
        { file: 'lib1/foo.js', status: ChangeStatus.Added }]
    });
  });

  it('should evaluate exclude with AND correctly', () => {
    const statements = parse(`
      <expression>: 'lib1/**' AND !'lib1/foo.js'; # right side fails expression.
    `, undefined) as AST;
    const { changes, netFiles } = evaluateStatements(statements, [
      { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
    ]);
    expect(changes.expression).toBe(false);
    expect(netFiles).toEqual({
      expression: []
    });
  });
});
