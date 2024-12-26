import { parse } from './parser';
import { AST, Expression, Statement, ValueOfInterest } from './parser.types';

function stmt(name: string, value: Expression, path?: string): Statement {
  const key = path ? { name, path } : { name };
  return {
    type: 'STATEMENT',
    key,
    value
  };
}

function exprWithExcept(base: Expression, excludes: ValueOfInterest[]): Expression {
  return {
    type: 'EXPRESSION_WITH_EXCEPT',
    base,
    excludes
  };
}

function quote(value: string, ignoreCase?: boolean, suffix?: string): ValueOfInterest {
  return {
    type: 'QUOTE_LITERAL',
    value,
    ...(suffix ? { suffix } : {}),
    ...(ignoreCase ? { ignoreCase: true } : {})
  };
}

function regexLiteral(pattern: string, flags?: string, suffix?: string): ValueOfInterest {
  return {
    type: 'REGEX_LITERAL',
    pattern,
    ...(flags ? { flags } : {}),
    ...(suffix ? { suffix } : {})
  };
}


// Helper for AND, OR, NEGATE, and STATEMENT_REF
function and(...values: Expression[]): Expression {
  return { type: 'AND', values };
}

function or(...values: Expression[]): Expression {
  return { type: 'OR', values };
}

function not(exp: Expression): Expression {
  return { type: 'NEGATE', exp };
}

function ref(name: string): Expression {
  return { type: 'STATEMENT_REF', value: name };
}

describe('parser.spec', () => {

  describe('literal', () => {
    it('should parse single quote literal', () => {
      const rulesInput = `literal: 'readme.md';`;
      const ast = parse(rulesInput, undefined) as AST;

      expect(ast).toEqual([
        stmt('literal', quote('readme.md'))
      ]);
    });
    it('should parse double quote literal', () => {
      const rulesInput = `literal: "readme.md";`;
      const ast = parse(rulesInput, undefined) as AST;

      expect(ast).toEqual([
        stmt('literal', quote('readme.md'))
      ]);
    });

    it('should parse quote literal with ignore casing', () => {
      const rulesInput = `literal: "readme.md"i 'readme.md'i;`;
      const ast = parse(rulesInput, undefined) as AST;

      expect(ast).toEqual([
        stmt('literal', or(quote('readme.md', true), quote('readme.md', true)))
      ]);
    });

    it('should parse quote literal with ignore casing and file status suffix', () => {
      const rulesInput = `literal: "readme.md"i:a 'readme.md'i:d;`;
      const ast = parse(rulesInput, undefined) as AST;

      expect(ast).toEqual([
        stmt('literal', or(quote('readme.md', true, 'A'), quote('readme.md', true, 'D')))
      ]);
    });

    it('should parse quote literal with file status suffix only', () => {
      const rulesInput = `literal: "readme.md":a 'readme.md':d;`;
      const ast = parse(rulesInput, undefined) as AST;

      expect(ast).toEqual([
        stmt('literal', or(quote('readme.md', undefined, 'A'), quote('readme.md', undefined, 'D')))
      ]);
    });
  });

  describe('parenthesis', () => {
    const expression = or(
      quote('lib1/**', undefined, 'A'),
      and(
        quote('lib2/**'),
        quote('lib3/**')
      )
    );
    it('should parse mixed1_0 correctly', () => {
      const rulesInput = `mixed1_0: 'lib1/**':a  ('lib2/**'  AND 'lib3/**');`;
      const ast = parse(rulesInput, undefined) as AST;

      expect(ast).toEqual([
        stmt('mixed1_0', expression)
      ]);
    });

    it('should parse mixed1_1 correctly', () => {
      const rulesInput = `mixed1_1: ('lib1/**':a)  ('lib2/**'  AND 'lib3/**');`;
      const ast = parse(rulesInput, undefined) as AST;

      expect(ast).toEqual([
        stmt('mixed1_1', expression)
      ]);
    });

    it('should parse nested literal with except clause correctly', () => {
      const rulesInput = `expression: ('**/*.*' EXCEPT('file.ts' 'file.spec.ts'));`;
      const ast = parse(rulesInput, undefined) as AST;

      expect(ast).toEqual([
        stmt('expression', exprWithExcept(
          quote('**/*.*'),
          [
            quote('file.ts'),
            quote('file.spec.ts')
          ]
        ))
      ]);
    });
  });

  describe('regex', () => {
    it('should parse basic regex expression', () => {
      const rulesInput = `regex: /readme.md/;`;
      const ast = parse(rulesInput, undefined) as AST;

      expect(ast).toEqual([
        stmt('regex', regexLiteral('readme.md'))
      ]);
    });

    it('should parse regex expression without suffix', () => {
      const rulesInput = `regex: /readme.md/i;`;
      const ast = parse(rulesInput, undefined) as AST;

      expect(ast).toEqual([
        stmt('regex', regexLiteral('readme.md', 'i'))
      ]);
    });
    it('should parse regex expression with suffix', () => {
      const rulesInput = `regex: /readme.md/i:a;`;
      const ast = parse(rulesInput, undefined) as AST;

      expect(ast).toEqual([
        stmt('regex', regexLiteral('readme.md', 'i', 'A'))
      ]);
    });
  });

  describe('statementref and expression negation', () => {
    it('should parse expression1 correctly', () => {
      const rulesInput = `expression1: ('lib1/**':a)  ('lib2/**'  AND !'lib3/**') !mixed1_0;`;
      const ast = parse(rulesInput, undefined) as AST;

      expect(ast).toEqual([
        stmt('expression1', or(
          quote('lib1/**', undefined, 'A'),
          and(
            quote('lib2/**'),
            not(quote('lib3/**'))
          ),
          not(ref('mixed1_0'))
        ))
      ]);
    });

    it('should parse expression2 correctly', () => {
      const rulesInput = `expression2: ('lib1/**':a)  !('lib2/**'  AND !'lib3/**') !mixed1_1;`;
      const ast = parse(rulesInput, undefined) as AST;

      expect(ast).toEqual([
        stmt('expression2', or(
          quote('lib1/**', undefined, 'A'),
          not(
            and(
              quote('lib2/**'),
              not(quote('lib3/**'))
            )
          ),
          not(ref('mixed1_1'))
        ))
      ]);
    });
  });

  describe('expression with except', () => {
    it('should combine EXCEPT with other logical expressions inside parentheses', () => {
      const rulesInput = `
        test_complex_except: (!('**/*.*' EXCEPT('ignored/path.js')) 'another/**');
      `;
      const ast = parse(rulesInput, undefined) as AST;
      expect(ast).toEqual([
        stmt('test_complex_except', or(
          not({
            type: 'EXPRESSION_WITH_EXCEPT',
            base: quote('**/*.*'),
            excludes: [
              { type: 'QUOTE_LITERAL', value: 'ignored/path.js' }
            ]
          }),
          quote('another/**')
        ))
      ]);
    });
  });

  describe('boolean equivalency', () => {
    const equivalency1 = or(quote('lib1/**'), quote('lib2/**'), quote('lib3/**'));
    const equivalency2 = or(and(quote('lib1/**'), quote('lib2/**')), quote('lib3/**'));

    it('should parse equivalency1_0 correctly', () => {
      const rulesInput = `equivalency1_0: 'lib1/**'  'lib2/**'  'lib3/**';`;
      const ast = parse(rulesInput, undefined) as AST;

      expect(ast).toEqual([
        stmt('equivalency1_0', equivalency1)
      ]);
    });

    it('should parse equivalency1_1 correctly', () => {
      const rulesInput = `equivalency1_1: 'lib1/**' OR  'lib2/**' OR 'lib3/**';`;
      const ast = parse(rulesInput, undefined) as AST;

      expect(ast).toEqual([
        stmt('equivalency1_1', equivalency1)
      ]);
    });

    it('should parse equivalency2_0 correctly', () => {
      const rulesInput = `equivalency2_0: ('lib1/**'  AND 'lib2/**')  OR 'lib3/**';`;
      const ast = parse(rulesInput, undefined) as AST;

      expect(ast).toEqual([
        stmt('equivalency2_0', equivalency2)
      ]);
    });

    it('should parse equivalency2_1 correctly', () => {
      const rulesInput = `equivalency2_1: ('lib1/**'  AND 'lib2/**')  'lib3/**';`;
      const ast = parse(rulesInput, undefined) as AST;

      expect(ast).toEqual([
        stmt('equivalency2_1', equivalency2)
      ]);
    });

    it('should parse equivalency2_2 correctly', () => {
      const rulesInput = `equivalency2_2: 'lib1/**'  AND 'lib2/**'  OR 'lib3/**';`;
      const ast = parse(rulesInput, undefined) as AST;

      expect(ast).toEqual([
        stmt('equivalency2_2', equivalency2)
      ]);
    });
  });
});