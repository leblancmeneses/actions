import { parse } from '../../../affected/src/parser';
import { AST, Expression, Statement } from '../../../affected/src/parser.types';

function stmt(name: string, value: Expression, path?: string): Statement {
  const key = path ? { name, path } : { name };
  return {
    type: 'STATEMENT',
    key,
    value
  };
}

function quote(value: string, suffix?: string): Expression {
  return {
    type: 'QUOTE_LITERAL',
    value,
    ...(suffix ? { suffix } : {})
  };
}

// Helper for AND, OR, EXCLUDE, and STATEMENT_REF
function and(...values: Expression[]): Expression {
  return { type: 'AND', values };
}

function or(...values: Expression[]): Expression {
  return { type: 'OR', values };
}

function not(exp: Expression): Expression {
  return { type: 'EXCLUDE', exp };
}

function ref(name: string): Expression {
  return { type: 'STATEMENT_REF', value: name };
}

describe('Parser AST tests', () => {
  describe('parenthesis handling', () => {
    const expression = or(
      quote('lib1/**', 'A'),
      and(
        quote('lib2/**'),
        quote('lib3/**')
      )
    );
    it('should parse mixed1_0 correctly', () => {
      const rulesInput = `mixed1_0: 'lib1/**'a  ('lib2/**'  AND 'lib3/**');`;
      const ast = parse(rulesInput, undefined) as AST;

      expect(ast).toEqual([
        stmt('mixed1_0', expression)
      ]);
    });

    it('should parse mixed1_1 correctly', () => {
      const rulesInput = `mixed1_1: ('lib1/**'a)  ('lib2/**'  AND 'lib3/**');`;
      const ast = parse(rulesInput, undefined) as AST;

      expect(ast).toEqual([
        stmt('mixed1_1', expression)
      ]);
    });
  });


  describe('statementref and expression negation', () => {
    it('should parse expression1 correctly', () => {
      const rulesInput = `expression1: ('lib1/**'a)  ('lib2/**'  AND !'lib3/**') !mixed1_0;`;
      const ast = parse(rulesInput, undefined) as AST;

      expect(ast).toEqual([
        stmt('expression1', or(
          quote('lib1/**', 'A'),
          and(
            quote('lib2/**'),
            not(quote('lib3/**'))
          ),
          not(ref('mixed1_0'))
        ))
      ]);
    });

    it('should parse expression2 correctly', () => {
      const rulesInput = `expression2: ('lib1/**'a)  !('lib2/**'  AND !'lib3/**') !mixed1_1;`;
      const ast = parse(rulesInput, undefined) as AST;

      expect(ast).toEqual([
        stmt('expression2', or(
          quote('lib1/**', 'A'),
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


  describe('equivalency', () => {
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