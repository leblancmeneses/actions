import { evaluateStatementsForChanges } from '../../../affected/src/evaluateStatementsForChanges';
import { ChangeStatus, mapGitStatusCode } from "../../../affected/src/changedFiles";
import { parse } from '../../../affected/src/parser';
import { AST } from '../../../affected/src/parser.types';

describe('evaluate-statements-for-changes.spec', () => {
  describe('negate expressions', () => {
    describe('positive tests', () => {
      it('should evaluate exclusion', () => {
        const statements = parse(`
          <expression>: !'**/*.md';
        `, undefined) as AST;
        const { changes, netFiles } = evaluateStatementsForChanges(statements, [
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
        const { changes, netFiles } = evaluateStatementsForChanges(statements, [
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
        const { changes, netFiles } = evaluateStatementsForChanges(statements, [
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
        const { changes, netFiles } = evaluateStatementsForChanges(statements, [
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
        const { changes, netFiles } = evaluateStatementsForChanges(statements, [
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
        const { changes, netFiles } = evaluateStatementsForChanges(statements, [
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
        const { changes, netFiles } = evaluateStatementsForChanges(statements, [
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
        const { changes, netFiles } = evaluateStatementsForChanges(statements, [
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
      const { changes, netFiles } = evaluateStatementsForChanges(statements, [
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
      const { changes, netFiles } = evaluateStatementsForChanges(statements, [
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
      const { changes, netFiles } = evaluateStatementsForChanges(statements, [
        { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
        { file: 'lib4/foo.js', status: mapGitStatusCode('D') },
      ]);
      expect(changes.expression).toBe(true);
      expect(netFiles).toEqual({
        expression: [{ file: 'lib1/foo.js', status: ChangeStatus.Added }],
      });
    });

    it('should evaluate OR correctly when lib1 is a match but file status is a miss', () => {
      const { changes, netFiles } = evaluateStatementsForChanges(statements, [
        { file: 'lib1/foo.js', status: mapGitStatusCode('D') },
        { file: 'lib4/foo.js', status: mapGitStatusCode('D') },
      ]);
      expect(changes.expression).toBe(false);
      expect(netFiles).toEqual({
        expression: [],
      });
    });

    it('should evaluate OR correctly when lib2 is a match but missing lib3', () => {
      const { changes, netFiles } = evaluateStatementsForChanges(statements, [
        { file: 'lib2/foo.js', status: mapGitStatusCode('A') },
        { file: 'lib4/foo.js', status: mapGitStatusCode('D') },
      ]);
      expect(changes.expression).toBe(false);
      expect(netFiles).toEqual({
        expression: [],
      });
    });

    it('should evaluate OR correctly when lib2 AND lib3 is a match', () => {
      const { changes, netFiles } = evaluateStatementsForChanges(statements, [
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
      const { changes, netFiles } = evaluateStatementsForChanges(statements, [
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
      const { changes, netFiles } = evaluateStatementsForChanges(statements, [
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
      const { changes, netFiles } = evaluateStatementsForChanges(statements, [
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
      const { changes, netFiles } = evaluateStatementsForChanges(statements, [
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
      const { changes, netFiles } = evaluateStatementsForChanges(statements, [
        { file: 'lib2/foo.md', status: mapGitStatusCode('A') },
      ]);
      expect(changes.expression).toBe(false);
      expect(netFiles).toEqual({
        expression: []
      });
    });
  });


describe('exclude expressions', () => {
  it('should exclude specified patterns', () => {
    const statements = parse(`
      markdown: '**/*.md';
      yaml: '**/*.yaml' OR '**/*.yml';
      <expression>: 'lib1/**' EXCEPT(markdown yaml '**/*.rs' "**/*.py");
    `, undefined) as AST;

    const { changes, netFiles } = evaluateStatementsForChanges(statements, [
      { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
      { file: 'lib1/readme.md', status: mapGitStatusCode('A') },
      { file: 'lib1/config.yaml', status: mapGitStatusCode('A') },
      { file: 'lib1/script.py', status: mapGitStatusCode('A') },
      { file: 'lib1/source.rs', status: mapGitStatusCode('A') },
    ]);

    // 'lib1/**' would normally match all above files
    // But we exclude markdown (which matches readme.md),
    // yaml (which matches config.yaml),
    // '**/*.rs' (matches source.rs),
    // and '**/*.py' (matches script.py),
    // So only foo.js should remain.
    expect(changes.expression).toBe(true);
    expect(netFiles.expression).toEqual([
      { file: 'lib1/foo.js', status: mapGitStatusCode('A') }
    ]);
  });

  it('should return false if all matched files are excluded', () => {
    const statements = parse(`
      markdown: '**/*.md';
      <expression>: 'lib1/**' EXCEPT(markdown);
    `, undefined) as AST;

    const { changes, netFiles } = evaluateStatementsForChanges(statements, [
      { file: 'lib1/readme.md', status: mapGitStatusCode('A') },
    ]);

    // 'lib1/**' matches 'readme.md'
    // exclude 'markdown' also matches 'readme.md'
    // so net matches is empty
    expect(changes.expression).toBe(false);
    expect(netFiles.expression).toEqual([]);
  });
});

  it('should evaluate exclude with implicit OR correctly', () => {
    const statements = parse(`
      <expression>: 'lib1/**' !'lib1/foo.js'; # left side won.
    `, undefined) as AST;
    const { changes, netFiles } = evaluateStatementsForChanges(statements, [
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
    const { changes, netFiles } = evaluateStatementsForChanges(statements, [
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
    const { changes, netFiles } = evaluateStatementsForChanges(statements, [
      { file: 'lib1/foo.js', status: mapGitStatusCode('A') },
    ]);
    expect(changes.expression).toBe(false);
    expect(netFiles).toEqual({
      expression: []
    });
  });
});