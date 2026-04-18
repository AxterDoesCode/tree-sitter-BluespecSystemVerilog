; Comments
(bsv_line_comment) @comment
(bsv_block_comment) @comment

; Preprocessor / compiler directives
(bsv_compiler_directive) @keyword.directive
(bsv_cpp_directive) @keyword.directive

; Macro reference: `FOO / `foo(args)
(bsv_macroRef) @constant.macro

; String literals
(bsv_stringLiteral) @string

; Numeric literals
(bsv_intLiteral) @number
(bsv_realLiteral) @number
(bsv_sizedIntLiteral) @number
(bsv_unsizedIntLiteral) @number
(bsv_baseLiteral) @number
(bsv_bitWidth) @number
(bsv_typeNat) @number

; Attributes: (* synthesize *), (* always_ready *), etc.
(bsv_attributeInstance) @attribute
(bsv_attrName) @attribute
"(*" @punctuation.special
"*)" @punctuation.special

; Package / module / interface / rule names — these always match an
; `_bsv_Identifier` or `_bsv_identifier` token inside a visible wrapper.
(bsv_packageIde) @module
(bsv_typeclassIde) @type

; Types
(bsv_typeConcreteIde) @type
(bsv_typeVarIde) @variable.parameter

; Built-in / primitive types — matched by name inside typeConcreteIde.
((bsv_typeConcreteIde) @type.builtin
 (#match? @type.builtin
  "^(Bit|UInt|Int|Bool|Integer|Real|String|Char|Void|Maybe|Tuple[0-9]+|Vector|List|Action|ActionValue|Rules|Reg|Wire|PulseWire|BypassWire|RWire|DWire|CReg|Empty|Clock|Reset|FIFO|FIFOF|SizedFIFO|SizedFIFOF|BypassFIFO|BypassFIFOF|PipelineFIFO|FF|Server|Client|Get|Put|Fmt|Bits|Eq|Ord|Arith|Literal|Bounded|FShow|Add|Mul|Div|Log|Min|Max|TAdd|TSub|TMul|TDiv|TLog|TExp|TMin|TMax)$"))

; Boolean literals (written as bare identifiers in exprPrimary)
((bsv_exprPrimary) @boolean
 (#any-of? @boolean "True" "False"))

; Bare type keywords used in declarations
"bit" @type.builtin
"void" @type.builtin

; BSV keywords — package / module structure
[
  "package"
  "endpackage"
  "import"
  "export"
  "module"
  "endmodule"
  "interface"
  "endinterface"
  "method"
  "endmethod"
  "function"
  "endfunction"
  "rule"
  "endrule"
  "rules"
  "endrules"
  "typedef"
  "typeclass"
  "endtypeclass"
  "instance"
  "endinstance"
] @keyword

; Struct / enum / tagged union
[
  "struct"
  "enum"
  "union"
  "tagged"
  "deriving"
] @keyword

; Action blocks
[
  "action"
  "endaction"
  "actionvalue"
  "endactionvalue"
  "begin"
  "end"
] @keyword

; FSM sublanguage
[
  "seq"
  "endseq"
  "par"
  "endpar"
] @keyword

; Control flow
[
  "if"
  "else"
  "case"
  "endcase"
  "default"
  "for"
  "while"
  "repeat"
  "matches"
  "return"
  "break"
  "continue"
  "let"
  "match"
] @keyword

; Type-related keywords
[
  "type"
  "numeric"
  "provisos"
  "dependencies"
  "valueOf"
  "valueof"
  "determines"
] @keyword

; BVI / clock / reset keywords
[
  "schedule"
  "ancestor"
  "same_family"
  "path"
  "default_clock"
  "default_reset"
  "input_clock"
  "input_reset"
  "output_clock"
  "output_reset"
  "clocked_by"
  "reset_by"
  "enable"
  "ready"
  "port"
  "parameter"
] @keyword

; Scheduling annotations
[
  "SB"
  "SBR"
  "CF"
  "C"
] @keyword

; don't-care expression
"?" @constant.builtin

; Binary / unary operators
[
  "+"
  "-"
  "*"
  "/"
  "%"
  "**"
  "<<"
  ">>"
  "<"
  ">"
  "<="
  ">="
  "=="
  "!="
  "&"
  "|"
  "^"
  "^~"
  "~^"
  "&&"
  "||"
  "!"
  "~"
  "~&"
  "~|"
  "&&&"
] @operator

; Assignment / bind operators
[
  "="
  "<-"
] @operator

; `?` / `:` ternary is matched as operators in condExpr context
(bsv_condExpr "?" @operator)
(bsv_condExpr ":" @operator)

; Punctuation
[
  "("
  ")"
  "{"
  "}"
  "["
  "]"
] @punctuation.bracket

[
  ","
  ";"
  "::"
  "."
  ":"
] @punctuation.delimiter

"'" @punctuation.special

; Struct / tagged union literal — the type head is a constructor
(bsv_structExpr
  (bsv_typeConcreteIde) @constructor)
(bsv_taggedUnionExpr) @constructor

; Tagged union patterns
(bsv_taggedUnionPattern) @constructor

; Struct-member bind / field select / struct declaration member
(bsv_memberIde) @property

; Proviso typeclass name
(bsv_proviso
  (bsv_typeclassIde) @type)

; `deriving (Class1, Class2, ...)` — deriving list members are typeclass names
(bsv_derives
  (bsv_typeclassIde) @type)

; Enum elements — constructor-like constants
(bsv_typedefEnumElement) @constant

; Definition-site names
(bsv_moduleIde) @function
(bsv_methodIde) @function.method
(bsv_functionIde) @function
(bsv_ruleIde) @label
(bsv_interfaceIde) @variable

; Parameters
(bsv_paramIde) @variable.parameter

; Variable declarations / bindings
(bsv_varIde) @variable

; Call sites — a function call's callee that's a bare identifier exprPrimary.
; The outer exprPrimary form covers non-identifier callees (parenthesised,
; package-qualified); the inner form overrides for bare identifiers so the
; more-specific @variable capture doesn't win on the call site.
(bsv_functionCall
  (bsv_exprPrimary) @function.call)
(bsv_functionCall
  (bsv_exprPrimary
    [(bsv_varIde) (bsv_typeConcreteIde)] @function.call))

; BSV system tasks / functions start with `$` — e.g. $display, $finish.
((bsv_functionCall
  (bsv_exprPrimary) @function.builtin)
 (#match? @function.builtin "^\\$"))
((bsv_functionCall
  (bsv_exprPrimary
    (bsv_varIde) @function.builtin))
 (#match? @function.builtin "^\\$"))
