start
  = oneOrMoreStatement

oneOrMoreStatement
  = _ first:Statement _ rest:(_ Statement)* _ {
      return [first, ...rest.map(([, stmt]) => stmt)];
    }

Statement
  = key:Key _ value:Expression _ ";" {
      return { type: "STATEMENT", key, value };
    }

Expression
  = base:LogicalExpression except:ExceptClause? {
      if (except) {
        return {
          type: "EXPRESSION_WITH_EXCEPT",
          base: base,
          excludes: except
        };
      }
      return base;
    }

LogicalExpression
  = left:GroupingExpression tail:(_ op:Operator? _ right:GroupingExpression)* {
      let expressions = [left];
      let ops = [];

      for (let i = 0; i < tail.length; i++) {
        const [ , opMaybe, , expr] = tail[i];
        const opStr = opMaybe ? opMaybe : "OR"; // Default operator if none is present
        ops.push(opStr);
        expressions.push(expr);
      }

      function buildExpressionChain(exps, operators) {
        if (exps.length === 1) return exps[0];
        let result = { type: operators[0], values: [exps[0], exps[1]] };
        for (let i = 1; i < operators.length; i++) {
          const o = operators[i];
          const e = exps[i + 1];
          if (o === result.type) {
            result.values.push(e);
          } else {
            result = { type: o, values: [result, e] };
          }
        }
        return result;
      }

      return buildExpressionChain(expressions, ops);
    }

GroupingExpression
  = "!" _ "(" _ e:Expression _ ")" {
      return { type: "NEGATE", exp: e };
    }
  / "(" _ e:Expression _ ")" {
      return e;
    }
  / primary

Operator
  = "and"i { return "AND"; }
  / "or"i  { return "OR"; }

primary
  = val:ValueOfInterest { return val; }
  / "!" _ exp:ValueOfInterest { return { type: "NEGATE", exp }; }

ValueOfInterest
  = SingleQuoteLiteral
  / DoubleQuoteLiteral
  / RegexLiteral
  / Literal

ExceptClause
  = _ "EXCEPT"i _ "(" _ items:ExceptItems _ ")" {
      return items;
    }

ExceptItems
  = head:ValueOfInterest tail:(_ ValueOfInterest)* {
      return [head, ...tail.map(([ , v]) => v)];
    }

SingleQuoteLiteral
  = "'" chars:[^']* "'" ic:OptionalIgnoreCase? s:OptionalLiteralSuffix? {
      return {
        type: "QUOTE_LITERAL",
        value: chars.join(''),
        ...(ic ? { ignoreCase: true } : {}),
        ...(s ? { suffix: s } : {})
      };
    }

DoubleQuoteLiteral
  = '"' chars:[^"]* '"' ic:OptionalIgnoreCase? s:OptionalLiteralSuffix? {
      return {
        type: "QUOTE_LITERAL",
        value: chars.join(''),
        ...(ic ? { ignoreCase: true } : {}),
        ...(s ? { suffix: s } : {})
      };
    }

RegexLiteral
  = "/" pattern:RegexPattern "/" flags:RegexFlags? s:OptionalLiteralSuffix? {
      return {
        type: "REGEX_LITERAL",
        pattern: pattern.join(''),
        ...(flags && flags.length > 0 ? { flags: flags.join('') } : {}),
        ...(s ? { suffix: s } : {})
      };
    }

Literal
  = !("and"i / "or"i / "except"i) chars:[a-zA-Z0-9_\-]+ {
      return { type: "STATEMENT_REF", value: chars.join('') };
    }

Key
  = nestedKey
  / simpleKey

nestedKey
  = "<" name:validKeyName ">" _ ":" {
      return { name: name, path: name };
    }

simpleKey
  = name:validKeyName _ ":" {
      return { name: name };
    }

validKeyName
  = ![0-9\-] first:[a-zA-Z_] rest:[a-zA-Z0-9_\-]* {
      return first + rest.join('');
    }

OptionalIgnoreCase
  = [i] { return true; }

OptionalLiteralSuffix
  = ":" s:[aAcCdDmMrRuU] {
      return s.toUpperCase();
    }

RegexPattern
  = chars:[^/]+ { return chars; }

RegexFlags
  = flags:[a-zA-Z]+ { return flags; }

_ "whitespace or comments"
  = (Whitespace / LineComment / LineCommentAlt / MultilineComment)*

Whitespace
  = [ \t\n\r]+

LineComment
  = "//" [^\n\r]* ("\n" / "\r\n" / "\r" / !.)

LineCommentAlt
  = "#" [^\n\r]* ("\n" / "\r\n" / "\r" / !.)

MultilineComment
  = "/*" (!"*/" .)* "*/"
