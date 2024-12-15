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
  = LogicalExpression

LogicalExpression
  = left:GroupingExpression tail:(_ op:Operator? _ right:GroupingExpression)* {
      let expressions = [left];
      let ops = [];

      for (let i = 0; i < tail.length; i++) {
        const [ , opMaybe, , expr] = tail[i];
        const opStr = opMaybe ? opMaybe : "OR"; // Default operator if none
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
  = "!" _ "(" _ e:LogicalExpression _ ")" {
      return { type: "EXCLUDE", exp: e };
    }
  / "(" _ e:LogicalExpression _ ")" { return e; }
  / primary

Operator
  = "and"i { return "AND"; }
  / "or"i { return "OR"; }


primary
  = val:ValueOfInterest { return val; }
  / "!" _ exp:ValueOfInterest { return { type: "EXCLUDE", exp }; }

ValueOfInterest
  = SingleQuoteLiteral
  / DoubleQuoteLiteral
  / Literal

SingleQuoteLiteral
  = "'" chars:[^']* "'" suffix:[aAcCdDmMrRuU]? {
      return {
        type: "QUOTE_LITERAL",
        value: chars.join(''),
        ...(suffix ? {suffix: suffix.toUpperCase()}: {})
      };
    }

DoubleQuoteLiteral
  = '"' chars:[^"]* '"' suffix:[aAcCdDmMrRuU]? {
      return {
        type: "QUOTE_LITERAL",
        value: chars.join(''),
        ...(suffix ? {suffix: suffix.toUpperCase()}: {})
      };
    }

Literal
  = !("and"i / "or"i) chars:[a-zA-Z0-9_\-]+ {
      return { type: "STATEMENT_REF", value: chars.join('') };
    }

Key
  = nestedKey
  / simpleKey


nestedKey
  = "<" name:validKeyName ">" ":" {
      return { name: name, path: name };
    }

simpleKey
  = name:validKeyName ":" {
      return { name: name };
    }

validKeyName
  = ![0-9\-] first:[a-zA-Z_] rest:[a-zA-Z0-9_\-]* {
      return first + rest.join('');
    }

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