start
  = oneOrMoreStatement

oneOrMoreStatement
  = _ first:Statement _ rest:(_ Statement)* _ {
      return [first, ...rest.map(([_, stmt]) => stmt)];
    }

Statement
  = key:Key _ value:oneOrMorePrimary _ ";" {
      return { type: "STATEMENT", key, value };
    }

oneOrMorePrimary
  = first:primary rest:(_ primary)* {
      return [first, ...rest.map(([_, expr]) => expr)];
    }

primary
  = val:ValueOfInterest { return val; }
  / "!" _ exp:ValueOfInterest { return { type: "INVERSE", exp }; }

ValueOfInterest
  = SingleQuoteLiteral
  / DoubleQuoteLiteral
  / Literal

SingleQuoteLiteral
  = "'" chars:[^']* "'" { return { type: "QUOTE_LITERAL", value: chars.join('') }; }

DoubleQuoteLiteral
  = '"' chars:[^"]* '"' { return { type: "QUOTE_LITERAL", value: chars.join('') }; }

Literal
  = chars:[a-zA-Z0-9_\-]+ { return { type: "STATEMENT_REF", value: chars.join('') }; }

Key
  = bracketedKey
  / nestedKey
  / simpleKey

bracketedKey
  = "[" name:validKeyName "](" path:[^)]* ")" ":" {
      return { name: name, path: path.join('') };
    }

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
  = (Whitespace / LineComment / MultilineComment)*

Whitespace
  = [ \t\n\r]+

LineComment
  = "//" [^\n\r]* ("\n" / "\r\n" / "\r" / !.)

LineCommentAlt
  = "#" [^\n\r]* ("\n" / "\r\n" / "\r" / !.)

MultilineComment
  = "/*" (!"*/" .)* "*/"