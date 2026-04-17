// general parsing helpers
////////////////////////////////////////////////////////////////////////////////
sepList1 = (sep, item) => seq(item, repeat(seq(sep, item)))
commaSepList1 = item => sepList1(',', item)
sepList = (sep, item) => optional(sepList1(sep, item))
commaSepList = item => sepList(',', item)

// BSV-specific helpers
////////////////////////////////////////////////////////////////////////////////
ctxtBeginEndStmt = ($, item) =>
  seq('begin', optional(seq(':', $._bsv_identifier)),
    repeat(item), 'end',
    optional(seq(':', $._bsv_identifier)))

ctxtIf = ($, item) =>
  prec.right(seq('if', '(', $.bsv_condPredicate, ')', item,
    optional(seq('else', item))))

ctxtCase = ($, item) =>
  seq('case', '(', $.bsv_expression, ')',
    repeat(seq(commaSepList1($.bsv_expression), ':', item)),
    optional(seq('default', optional(':'), item)),
    'endcase')

ctxtCaseMatches = ($, item) =>
  seq('case', '(', $.bsv_expression, ')', 'matches',
    repeat(seq($.bsv_pattern, repeat(seq('&&&', $.bsv_expression)),
      ':', item)),
    optional(seq('default', optional(':'), item)),
    'endcase')

ctxtWhile = ($, item) =>
  seq('while', '(', $.bsv_expression, ')', item)

ctxtFor = ($, item) =>
  seq('for', '(', forInit($), ';', forTest($), ';', forIncr($), ')', item)

forInit = ($) => choice(forOldInit($), forNewInit($))

forOldInit = ($) =>
  commaSepList1(seq($._bsv_identifier, choice('=', '<='),
    $.bsv_expression))

forNewInit = ($) =>
  seq($.bsv_type, $._bsv_identifier, '=', $.bsv_expression,
    repeat(seq(',', optional($.bsv_type),
      $._bsv_identifier, '=', $.bsv_expression)))

forTest = ($) => $.bsv_expression
forIncr = ($) => commaSepList1(seq($._bsv_identifier, choice('=', '<='),
  $.bsv_expression))

// BSV grammar
////////////////////////////////////////////////////////////////////////////////
module.exports = grammar({
  name: 'BluespecSystemVerilog',

  word: $ => $._bsv_word,

  // Ambiguities that cannot be resolved by ordinary precedence/associativity
  // (GLR conflicts). Tree-sitter forks the parser and picks the successful
  // parse at parse time.
  conflicts: $ => [
    // Bit-width prefix of a sized literal vs. an unsized decimal literal.
    [$.bsv_bitWidth, $.bsv_unsizedIntLiteral],
    // `exprPrimary . id` is a field select; `exprPrimary . id ( ... )` is a
    // method call. Common prefix forces a fork until we see '('.
    [$.bsv_fieldSelect, $.bsv_methodCall],
    // `typeIde` vs. `typeConcreteIde` both start with an uppercase identifier.
    [$.bsv_typeIde, $.bsv_typeConcreteIde],
    // regWrite (`lhs <= expr ;`) vs. a binaryExpr using `<=` as comparison
    // followed by `;` as a callStmt.
    [$.bsv_regWrite, $.bsv_binaryExpr],
    // varAssign (`lhs = expr ;`) starts like an exprPrimary.
    [$.bsv_lValue, $.bsv_exprPrimary],
    // struct field init `id : expr` vs. ternary `expr ? expr : expr` inside
    // a struct literal context.
    [$.bsv_memberBind, $.bsv_exprPrimary],
    // moduleInst (`Type id <- moduleApp ;`) vs. varDeclDo (`type id <- expr ;`)
    [$.bsv_moduleInst, $.bsv_varDeclDo],
    // struct/tagged union type-concrete-ide position overlaps plain identifier expr
    [$.bsv_structExpr, $.bsv_typeConcreteIde],
    [$.bsv_exprPrimary, $.bsv_typeConcreteIde],
    [$.bsv_interfaceExpr, $.bsv_typeConcreteIde],
    // `begin ... end` in a moduleStmt context can also start a beginEndExpr
    // (an expression primary). Both contain varDecl/varAssign.
    [$.bsv_moduleStmt, $.bsv_expressionStmt],
    [$.bsv_actionStmt, $.bsv_expressionStmt],
    [$.bsv_functionBodyStmt, $.bsv_expressionStmt],
    // action/actionvalue blocks appear both as statements and as
    // exprPrimary values.
    [$.bsv_actionStmt, $.bsv_exprPrimary],
    [$.bsv_moduleStmt, $.bsv_exprPrimary],
    [$.bsv_functionBodyStmt, $.bsv_exprPrimary],
    [$.bsv_expressionStmt, $.bsv_exprPrimary],
    // seq/par FSM stmts appear as both fsmStmts and exprPrimary values.
    [$.bsv_fsmStmt, $.bsv_exprPrimary],
    // condPredicate's `&&&` separator causes shift/reduce.
    [$.bsv_condPredicate],
    // case-stmt vs case-expr (both start with `case (expr)`).
    [$.bsv_moduleStmt, $.bsv_caseExpr],
    [$.bsv_actionStmt, $.bsv_caseExpr],
    [$.bsv_expressionStmt, $.bsv_caseExpr],
    [$.bsv_functionBodyStmt, $.bsv_caseExpr],
    [$.bsv_moduleStmt, $.bsv_expressionStmt, $.bsv_caseExpr],
    [$.bsv_actionStmt, $.bsv_expressionStmt, $.bsv_caseExpr],
    [$.bsv_functionBodyStmt, $.bsv_expressionStmt, $.bsv_caseExpr],
    // exprPrimary ';' is a callStmt or part of a caseExpr branch expression.
    [$.bsv_callStmt, $.bsv_expression],
    // `( expr )` is both exprPrimary and the LHS of parenthesized regWrite
    [$.bsv_regWrite, $.bsv_exprPrimary],
    // expression inside `if (...)` could be completed here or extended with `&&&`
    [$.bsv_exprOrCondPattern, $.bsv_fsmStmt],
    // moduleApp overlaps function-call-of-identifier as exprPrimary
    [$.bsv_moduleApp, $.bsv_exprPrimary],
    // fsmStmt wraps actionStmt; control-flow actionStmts collide with fsmStmts
    [$.bsv_actionStmt, $.bsv_fsmStmt],
    // caseMatches branch uses `&&&` between pattern and guard, same token as
    // condPredicate's separator, triggering shift/reduce.
    [$.bsv_exprOrCondPattern],
  ],

  rules: {
    // outter-most bsv package
    bsv_package: $ => choice(
      seq('package', field('name', $.bsv_packageIde), ';',
        repeat(choice($.bsv_exportDecl, $.bsv_importDecl)),
        repeat($.bsv_packageStmt),
        'endpackage', optional(seq(':', $.bsv_packageIde))),
      seq(repeat(choice($.bsv_exportDecl, $.bsv_importDecl)),
        repeat($.bsv_packageStmt)
      )
    ),

    bsv_packageIde: $ => $._bsv_Identifier,

    // exports
    bsv_exportDecl: $ => seq('export', commaSepList1($.bsv_exportItem), ';'),
    bsv_exportItem: $ => choice(seq($._bsv_identifier, optional('(..)')),
      seq($._bsv_Identifier, optional('(..)')),
      seq($.bsv_packageIde, '::', '*')),

    // imports
    bsv_importDecl: $ => seq('import', commaSepList1($.bsv_importItem), ';'),
    bsv_importItem: $ => seq($.bsv_packageIde, '::', '*'),

    // package statements
    bsv_packageStmt: $ => choice(
      $.bsv_moduleDef,
      $.bsv_interfaceDecl,
      $.bsv_typeDef,
      $.bsv_varDecl,
      $.bsv_varAssign,
      $.bsv_functionDef,
      $.bsv_typeclassDef,
      $.bsv_typeclassInstanceDef,
      $.bsv_externModuleImport,
      $.bsv_externCImport
    ),

    // import "BDPI" — C function imported into BSV
    bsv_externCImport: $ => seq(
      'import', '"BDPI"',
      optional(seq($._bsv_identifier, '=')),
      $.bsv_functionProto
    ),

    // variable declaration
    bsv_topVarDecl: $ =>
      seq($.bsv_typeConcrete, commaSepList1($.bsv_varInit), ';'),
    bsv_varDecl: $ => choice(
      seq($.bsv_type, commaSepList1($.bsv_varInit), ';'),
      // `let x = expr;` — type inferred declaration
      seq('let', $._bsv_identifier, '=', $.bsv_expression, ';')
    ),
    bsv_varInit: $ =>
      seq($._bsv_identifier, optional($.bsv_arrayDims),
        optional(seq('=', $.bsv_expression))),
    bsv_arrayDims: $ => repeat1(seq('[', $.bsv_expression, ']')),

    // varDeclDo: declare + actionvalue bind — `type id <- expr ;`
    // varDo   : bind to already-declared lvalue — `lvalue <- expr ;`
    // Also: `let id <- expr ;` (type-inferred varDeclDo)
    bsv_varDeclDo: $ => choice(
      seq($.bsv_type, $._bsv_identifier, '<-', $.bsv_expression, ';'),
      seq('let', $._bsv_identifier, '<-', $.bsv_expression, ';'),
      // `match pattern <- expr ;` — pattern-matching actionvalue bind.
      seq('match', $.bsv_pattern, '<-', $.bsv_expression, ';')
    ),
    bsv_varDo: $ => seq($.bsv_lValue, '<-', $.bsv_expression, ';'),

    // variable assignment
    bsv_varAssign: $ => choice(
      seq($.bsv_lValue, '=', $.bsv_expression, ';'),
      // `match pattern = expr ;` — pattern-matching binding
      seq('match', $.bsv_pattern, '=', $.bsv_expression, ';')
    ),
    bsv_lValue: $ => choice($._bsv_identifier,
      seq($.bsv_lValue, '.', $._bsv_identifier),
      seq($.bsv_lValue, '[', $.bsv_expression, ']'),
      seq($.bsv_lValue, '[', $.bsv_expression,
        ':', $.bsv_expression, ']'),
    ),

    // register write: `lhs <= expr ;`
    bsv_regWrite: $ => choice(
      seq($.bsv_lValue, '<=', $.bsv_expression, ';'),
      seq('(', $.bsv_expression, ')', '<=', $.bsv_expression, ';')
    ),

    // user-defined types
    bsv_typeDef: $ => choice($.bsv_typedefSynonym,
      $.bsv_typedefEnum,
      $.bsv_typedefStruct,
      $.bsv_typedefTaggedUnion),
    bsv_derives: $ =>
      seq('deriving', '(', commaSepList1($.bsv_typeclassIde), ')'),
    bsv_typedefSynonym: $ =>
      seq('typedef', $.bsv_type,
        $.bsv_typeConcreteIde, optional($.bsv_typeFormals), ';'),
    bsv_typeFormals: $ =>
      seq('#', '(',
        commaSepList1(seq(optional('numeric'), 'type', $.bsv_typeVarIde)),
        ')'),
    bsv_typedefEnum: $ =>
      seq('typedef', 'enum', '{',
        commaSepList1($.bsv_typedefEnumElement),
        '}', $._bsv_Identifier, optional($.bsv_derives), ';'),
    bsv_typedefEnumElement: $ =>
      choice(seq($._bsv_Identifier, optional(seq('=', $.bsv_intLiteral))),
        seq($._bsv_Identifier, '[', $.bsv_intLiteral, ']',
          optional(seq('=', $.bsv_intLiteral))),
        seq($._bsv_Identifier, '[', $.bsv_intLiteral,
          ':', $.bsv_intLiteral, ']',
          optional(seq('=', $.bsv_intLiteral)))
      ),
    bsv_typedefStruct: $ =>
      seq('typedef', 'struct', '{',
        repeat($.bsv_structMember), '}',
        $.bsv_typeConcreteIde, optional($.bsv_typeFormals),
        optional($.bsv_derives), ';'),
    bsv_typedefTaggedUnion: $ =>
      seq('typedef', 'union', 'tagged', '{',
        repeat($.bsv_unionMember), '}',
        $.bsv_typeConcreteIde, optional($.bsv_typeFormals),
        optional($.bsv_derives), ';'),
    bsv_structMember: $ => choice(seq($.bsv_type, $._bsv_identifier, ';'),
      seq($.bsv_subStruct, $._bsv_identifier, ';'),
      seq($.bsv_subUnion, $._bsv_identifier, ';'),
      seq('void', $._bsv_identifier, ';'),
    ),
    bsv_unionMember: $ =>
      choice(seq($.bsv_type, $._bsv_Identifier, ';'),
        seq($.bsv_subStruct, $._bsv_Identifier, ';'),
        seq($.bsv_subUnion, $._bsv_Identifier, ';'),
        seq('void', $._bsv_Identifier, ';'),
      ),
    bsv_subStruct: $ =>
      seq('struct', '{', repeat($.bsv_structMember), '}'),
    bsv_subUnion: $ =>
      seq('union', 'tagged', '{', repeat($.bsv_unionMember), '}'),

    // extern module imports (import "BVI" ...)
    bsv_externModuleImport: $ => seq('import', '"BVI"',
      optional(seq(choice($._bsv_identifier, $._bsv_Identifier), '=')),
      $.bsv_moduleProto,
      repeat($.bsv_importBVIStmt),
      'endmodule',
      optional(seq(':', $._bsv_identifier))
    ),
    // Permissive BVI body — interface/method/rule/port/parameter/path lines
    // are all tokens that end with `;`. Treat anything up to `;` generously.
    bsv_importBVIStmt: $ => choice(
      seq('parameter', $._bsv_identifier, '=', $.bsv_expression, ';'),
      seq('port', $._bsv_identifier,
        optional(seq('clocked_by', '(', $.bsv_expression, ')')),
        optional(seq('reset_by', '(', $.bsv_expression, ')')),
        '=', $.bsv_expression, ';'),
      seq('default_clock', optional($._bsv_identifier),
        optional(seq('(', optional($.bsv_expression), ')')),
        optional(seq('=', $.bsv_expression)), ';'),
      seq('default_reset', optional($._bsv_identifier),
        optional(seq('(', optional($.bsv_expression), ')')),
        optional(seq('=', $.bsv_expression)), ';'),
      seq('input_clock', optional($._bsv_identifier),
        optional(seq('(', optional($.bsv_expression), ')')),
        '=', $.bsv_expression, ';'),
      seq('output_clock', $._bsv_identifier,
        '(', optional($.bsv_expression), ')', ';'),
      seq('input_reset', optional($._bsv_identifier),
        optional(seq('(', optional($.bsv_expression), ')')),
        optional(seq('clocked_by', '(', $.bsv_expression, ')')),
        '=', $.bsv_expression, ';'),
      seq('output_reset', $._bsv_identifier,
        '(', optional($.bsv_expression), ')',
        optional(seq('clocked_by', '(', $.bsv_expression, ')')), ';'),
      seq('ancestor', '(', $.bsv_expression, ',', $.bsv_expression, ')', ';'),
      seq('same_family', '(', $.bsv_expression, ',', $.bsv_expression, ')', ';'),
      seq('path', '(', $.bsv_expression, ',', $.bsv_expression, ')', ';'),
      seq('schedule', $.bsv_schedulingAnnotation, ';'),
      // BVI method-port mapping: method [ResultPort] name [(args)] [enable(..)] [ready(..)] [clocked_by(..)] [reset_by(..)] ;
      $.bsv_bviMethod,
      // BVI interface alias: interface Type name = expr ;
      prec(2, seq('interface', $.bsv_type, $._bsv_identifier,
        optional(seq('=', $.bsv_expression)), ';')),
      $.bsv_moduleStmt
    ),
    bsv_bviMethod: $ => prec(2, seq('method',
      optional(choice($._bsv_identifier, $._bsv_Identifier)),
      $._bsv_identifier,
      optional(seq('(', commaSepList(seq(
        optional($.bsv_attributeInstances),
        choice($._bsv_identifier, $._bsv_Identifier))), ')')),
      repeat(choice(
        seq('enable', '(',
          optional($.bsv_attributeInstances),
          choice($._bsv_identifier, $._bsv_Identifier), ')'),
        seq('ready', '(',
          optional($.bsv_attributeInstances),
          choice($._bsv_identifier, $._bsv_Identifier), ')'),
        seq('clocked_by', '(', $.bsv_expression, ')'),
        seq('reset_by', '(', $.bsv_expression, ')')
      )), ';')),
    bsv_schedulingAnnotation: $ => seq(
      choice(
        seq('(', commaSepList1($._bsv_identifier), ')'),
        $._bsv_identifier
      ),
      choice('CF', 'SB', 'SBR', 'C'),
      choice(
        seq('(', commaSepList1($._bsv_identifier), ')'),
        $._bsv_identifier
      )
    ),

    // module definition
    bsv_moduleDef: $ => seq(optional($.bsv_attributeInstances),
      $.bsv_moduleProto,
      repeat($.bsv_moduleStmt),
      'endmodule', optional(seq(':', $._bsv_identifier))),
    bsv_moduleProto: $ => seq('module',
      optional(seq('[', $.bsv_type, ']')),
      $._bsv_identifier,
      optional($.bsv_moduleFormalParams),
      '(', optional($.bsv_moduleFormalArgs), ')',
      optional($.bsv_provisos),
      ';'),
    bsv_moduleFormalParams: $ =>
      seq('#', '(', commaSepList1($.bsv_moduleFormalParam), ')'),
    bsv_moduleFormalParam: $ => choice(
      seq(optional($.bsv_attributeInstances),
        optional('parameter'),
        $.bsv_type, $._bsv_identifier),
      // function-typed parameter: `function Type name (args)`
      seq(optional($.bsv_attributeInstances),
        'function', $.bsv_type, $._bsv_identifier,
        '(', commaSepList($.bsv_functionFormal), ')')
    ),
    bsv_moduleFormalArgs: $ =>
      choice(seq(optional($.bsv_attributeInstances), $.bsv_type),
        commaSepList1(seq(optional($.bsv_attributeInstances),
          $.bsv_type, $._bsv_identifier))),

    // module statements
    bsv_moduleStmt: $ => choice(
      $.bsv_moduleInst,
      $.bsv_methodDef,
      $.bsv_subinterfaceDef,
      $.bsv_rule,
      $.bsv_varDo,
      $.bsv_varDeclDo,
      $.bsv_regWrite,
      $.bsv_callStmt,
      $.bsv_returnStmt,
      $.bsv_varDecl,
      $.bsv_varAssign,
      $.bsv_functionDef,
      $.bsv_moduleDef,
      ctxtBeginEndStmt($, $.bsv_moduleStmt),
      ctxtIf($, $.bsv_moduleStmt),
      ctxtCase($, $.bsv_moduleStmt),
      ctxtCaseMatches($, $.bsv_moduleStmt),
      ctxtFor($, $.bsv_moduleStmt),
      ctxtWhile($, $.bsv_moduleStmt)
    ),

    // rules within a module
    bsv_rule: $ => seq(
      optional($.bsv_attributeInstances),
      'rule',
      $._bsv_identifier,
      optional($.bsv_ruleCond),
      ';',
      repeat($.bsv_actionStmt),
      'endrule',
      optional(seq(':', $._bsv_identifier))
    ),
    bsv_ruleCond: $ => seq('(', $.bsv_condPredicate, ')'),

    // short form module instantiation: `Type id [arrayDims] <- moduleApp ;`
    bsv_moduleInst: $ => seq(
      optional($.bsv_attributeInstances),
      $.bsv_type,
      $._bsv_identifier,
      optional($.bsv_arrayDims),
      '<-',
      $.bsv_moduleApp,
      ';'
    ),

    bsv_moduleApp: $ => seq(
      $._bsv_identifier,
      '(',
      optional(commaSepList($.bsv_moduleActualParamArg)),
      ')',
    ),

    bsv_moduleActualParamArg: $ => choice(
      $.bsv_expression,
      seq('clocked_by', $.bsv_expression),
      seq('reset_by', $.bsv_expression)
    ),

    // Body form: `interface Type name; ... endinterface`
    // Assign form: `interface [Type] name = expr;`
    // Factored through a common prefix `interface optional(type) identifier`
    // then branching on `;` vs `=`.
    bsv_subinterfaceDef: $ => seq(
      'interface',
      optional($.bsv_type),
      $._bsv_identifier,
      choice(
        seq(';',
          repeat($.bsv_interfaceStmt),
          'endinterface',
          optional(seq(':', $._bsv_identifier))),
        seq('=', $.bsv_expression, ';')
      )
    ),

    bsv_interfaceStmt: $ => choice(
      $.bsv_methodDef,
      $.bsv_subinterfaceDef,
      $.bsv_expressionStmt
    ),

    // Statements allowed in expression-like contexts (begin/end, interface
    // expr, function body, etc.).
    bsv_expressionStmt: $ => choice(
      $.bsv_varDecl,
      $.bsv_varAssign,
      $.bsv_varDeclDo,
      $.bsv_varDo,
      $.bsv_callStmt,
      $.bsv_functionDef,
      $.bsv_moduleDef,
      ctxtBeginEndStmt($, $.bsv_expressionStmt),
      ctxtIf($, $.bsv_expressionStmt),
      ctxtCase($, $.bsv_expressionStmt),
      ctxtCaseMatches($, $.bsv_expressionStmt),
      ctxtFor($, $.bsv_expressionStmt),
      ctxtWhile($, $.bsv_expressionStmt)
    ),

    // method definition
    bsv_methodDef: $ => choice(
      // Full-body form
      seq(
        'method',
        optional($.bsv_type),
        $._bsv_identifier,
        optional(seq('(', optional($.bsv_methodFormals), ')')),
        optional($.bsv_implicitCond), ';',
        repeat($.bsv_actionStmt),
        'endmethod',
        optional(seq(':', $._bsv_identifier))
      ),
      // Assignment form: `method ... = expr ;`
      seq(
        'method',
        optional($.bsv_type),
        $._bsv_identifier,
        optional(seq('(', optional($.bsv_methodFormals), ')')),
        optional($.bsv_implicitCond), '=',
        $.bsv_expression, ';'
      )
    ),
    bsv_methodFormals: $ => commaSepList1($.bsv_methodFormal),
    bsv_methodFormal: $ => seq(optional($.bsv_type), $._bsv_identifier),
    bsv_implicitCond: $ => seq('if', '(', $.bsv_condPredicate, ')'),
    bsv_condPredicate: $ => prec.left(seq(
      $.bsv_exprOrCondPattern,
      repeat(prec.left(seq('&&&', $.bsv_exprOrCondPattern)))
    )),
    bsv_exprOrCondPattern: $ => choice(
      $.bsv_expression,
      seq($.bsv_expression, 'matches', $.bsv_pattern)
    ),

    // function definition
    bsv_functionDef: $ => choice(
      seq(optional($.bsv_attributeInstances),
        $.bsv_functionProto,
        $.bsv_functionBody,
        'endfunction', optional(seq(':', $._bsv_identifier))),
      // Definition by assignment
      seq(optional($.bsv_attributeInstances),
        $.bsv_functionProtoAssign, '=',
        $.bsv_expression, ';')
    ),
    bsv_functionProto: $ =>
      seq('function', optional($.bsv_type), $._bsv_identifier,
        optional(seq('(', commaSepList($.bsv_functionFormal), ')')),
        optional($.bsv_provisos), ';'),
    bsv_functionProtoAssign: $ =>
      seq('function', optional($.bsv_type), $._bsv_identifier,
        optional(seq('(', commaSepList($.bsv_functionFormal), ')')),
        optional($.bsv_provisos)),
    bsv_functionFormal: $ => seq(optional($.bsv_type), $._bsv_identifier),
    bsv_functionBody: $ => choice(
      $.bsv_actionBlock,
      $.bsv_actionValueBlock,
      repeat1($.bsv_functionBodyStmt)
    ),
    bsv_functionBodyStmt: $ => choice(
      $.bsv_returnStmt,
      $.bsv_varDecl,
      $.bsv_varAssign,
      $.bsv_varDeclDo,
      $.bsv_varDo,
      $.bsv_callStmt,
      $.bsv_functionDef,
      $.bsv_moduleDef,
      ctxtBeginEndStmt($, $.bsv_functionBodyStmt),
      ctxtIf($, $.bsv_functionBodyStmt),
      ctxtCase($, $.bsv_functionBodyStmt),
      ctxtCaseMatches($, $.bsv_functionBodyStmt),
      ctxtFor($, $.bsv_functionBodyStmt),
      ctxtWhile($, $.bsv_functionBodyStmt)
    ),
    bsv_returnStmt: $ => seq('return', $.bsv_expression, ';'),

    // typeclass declaration
    bsv_typeclassDef: $ =>
      seq('typeclass', $.bsv_typeclassIde, $.bsv_typeFormals,
        optional($.bsv_provisos), optional($.bsv_typedepends), ';',
        repeat($.bsv_overloadedDef),
        'endtypeclass', optional(seq(':', $.bsv_typeclassIde))),
    bsv_typeclassIde: $ => $._bsv_Identifier,
    bsv_typedepends: $ =>
      seq('dependencies', '(', commaSepList1($.bsv_typedepend), ')'),
    bsv_typedepend: $ => seq($.bsv_typelist, 'determines', $.bsv_typelist),
    bsv_typelist: $ =>
      choice($.bsv_typeVarIde, seq('(', commaSepList1($.bsv_typeVarIde), ')')),
    bsv_overloadedDef: $ =>
      choice($.bsv_functionProto, $.bsv_moduleProto, $.bsv_varDecl),
    bsv_typeclassInstanceDef: $ =>
      seq('instance', $.bsv_typeclassIde,
        '#', '(', commaSepList1($.bsv_type), ')',
        optional($.bsv_provisos), ';',
        repeat(choice($.bsv_varAssign, $.bsv_functionDef, $.bsv_moduleDef)),
        'endinstance', optional(seq(':', $.bsv_typeclassIde))),

    // expressions
    bsv_expression: $ => choice(
      $.bsv_condExpr,
      $.bsv_unaryExpr,
      $.bsv_binaryExpr,
      $.bsv_exprPrimary
    ),

    bsv_exprPrimary: $ => choice(
      $._bsv_identifier,
      $._bsv_Identifier,
      $.bsv_macroRef,
      $.bsv_intLiteral,
      $.bsv_realLiteral,
      $.bsv_stringLiteral,
      '?',
      $.bsv_bitConcat,
      $.bsv_bitSelect,
      $.bsv_functionCall,
      $.bsv_methodCall,
      $.bsv_fieldSelect,
      $.bsv_valueOfExpr,
      $.bsv_typeAssertion,
      $.bsv_beginEndExpr,
      $.bsv_actionBlock,
      $.bsv_actionValueBlock,
      $.bsv_structExpr,
      $.bsv_taggedUnionExpr,
      $.bsv_interfaceExpr,
      $.bsv_rulesExpr,
      $.bsv_seqFsmStmt,
      $.bsv_parFsmStmt,
      $.bsv_caseExpr,
      seq('(', $.bsv_expression, ')')
    ),

    // case expression — returns a value. Supports both plain and `matches`.
    bsv_caseExpr: $ => choice(
      seq('case', '(', $.bsv_expression, ')',
        repeat(seq(commaSepList1($.bsv_expression),
          ':', $.bsv_expression, ';')),
        optional(seq('default', optional(':'),
          $.bsv_expression, ';')),
        'endcase'),
      seq('case', '(', $.bsv_expression, ')', 'matches',
        repeat(seq($.bsv_pattern,
          repeat(seq('&&&', $.bsv_expression)),
          ':', $.bsv_expression, ';')),
        optional(seq('default', optional(':'),
          $.bsv_expression, ';')),
        'endcase')
    ),

    // Conditional (ternary) — lowest precedence
    bsv_condExpr: $ =>
      prec.right(2, seq($.bsv_condPredicate, '?',
        $.bsv_expression, ':',
        $.bsv_expression)),

    // Unary operators — highest prefix precedence
    bsv_unaryExpr: $ =>
      prec(15, seq($.bsv_unop, $.bsv_expression)),

    // Binary operators tiered by precedence (matches BSV reference §10.3)
    bsv_binaryExpr: $ => choice(
      prec.left(14, seq($.bsv_expression, choice('*', '/', '%'),
        $.bsv_expression)),
      prec.left(13, seq($.bsv_expression, choice('+', '-'),
        $.bsv_expression)),
      prec.left(12, seq($.bsv_expression, choice('<<', '>>'),
        $.bsv_expression)),
      prec.left(11, seq($.bsv_expression, choice('<=', '>=', '<', '>'),
        $.bsv_expression)),
      prec.left(10, seq($.bsv_expression, choice('==', '!='),
        $.bsv_expression)),
      prec.left(9, seq($.bsv_expression, '&', $.bsv_expression)),
      prec.left(8, seq($.bsv_expression, choice('^', '^~', '~^'),
        $.bsv_expression)),
      prec.left(7, seq($.bsv_expression, '|', $.bsv_expression)),
      prec.left(6, seq($.bsv_expression, '&&', $.bsv_expression)),
      prec.left(5, seq($.bsv_expression, '||', $.bsv_expression))
    ),

    bsv_unop: $ =>
      choice('+', '-', '!', '~', '&', '~&', '|', '~|', '^', '^~', '~^'),

    // Postfix exprPrimary operations — left-associative, high precedence
    bsv_functionCall: $ => prec.left(20, seq(
      $.bsv_exprPrimary, '(',
      optional(commaSepList1(choice(
        $.bsv_expression,
        seq('clocked_by', $.bsv_expression),
        seq('reset_by', $.bsv_expression)
      ))), ')'
    )),
    bsv_methodCall: $ => prec.left(20, seq(
      $.bsv_exprPrimary, '.',
      choice($._bsv_identifier, $._bsv_Identifier),
      '(', optional(commaSepList1($.bsv_expression)), ')'
    )),
    bsv_fieldSelect: $ => prec.left(19, seq(
      $.bsv_exprPrimary, '.',
      choice($._bsv_identifier, $._bsv_Identifier)
    )),
    bsv_bitSelect: $ => prec.left(20, seq(
      $.bsv_exprPrimary, '[', $.bsv_expression,
      optional(seq(':', $.bsv_expression)), ']'
    )),
    bsv_bitConcat: $ => seq('{', commaSepList1($.bsv_expression), '}'),

    // A statement that is an expression followed by `;`. Must be an
    // exprPrimary (no binops) — this avoids collision with regWrite/varAssign
    // which use `<=`/`=` at statement level.
    bsv_callStmt: $ => seq($.bsv_exprPrimary, ';'),

    // valueOf(type) / valueof(type)
    bsv_valueOfExpr: $ => seq(choice('valueOf', 'valueof'),
      '(', $.bsv_type, ')'),

    // Type assertion: `type ' bitConcat` or `type ' ( expr )`
    bsv_typeAssertion: $ => prec(1, seq(
      $.bsv_type, "'",
      choice($.bsv_bitConcat, seq('(', $.bsv_expression, ')'))
    )),

    // Struct literal: `TypeName { field : expr, ... }`
    bsv_structExpr: $ =>
      seq($.bsv_typeConcreteIde, '{', commaSepList($.bsv_memberBind), '}'),
    bsv_memberBind: $ => seq($._bsv_identifier, ':', $.bsv_expression),

    // Tagged union literal: `tagged Tag {...}` or `tagged Tag exprPrimary`
    bsv_taggedUnionExpr: $ => prec.right(seq(
      'tagged', $._bsv_Identifier,
      optional(choice(
        seq('{', commaSepList($.bsv_memberBind), '}'),
        prec.right($.bsv_exprPrimary)
      ))
    )),

    // begin/end expression block — yields a value
    bsv_beginEndExpr: $ => prec.right(seq(
      'begin', optional(seq(':', $._bsv_identifier)),
      repeat($.bsv_expressionStmt),
      $.bsv_expression,
      'end', optional(seq(':', $._bsv_identifier))
    )),

    // action / endaction block
    bsv_actionBlock: $ =>
      prec.right(seq('action', optional(seq(':', $._bsv_identifier)),
        repeat($.bsv_actionStmt),
        'endaction', optional(seq(':', $._bsv_identifier)))),
    bsv_actionStmt: $ => choice(
      $.bsv_regWrite,
      $.bsv_varDo,
      $.bsv_varDeclDo,
      $.bsv_callStmt,
      $.bsv_actionBlock,
      // An actionvalue block can appear as the body of a value method —
      // accept it here without a trailing `;` so the `endactionvalue`
      // keyword terminates the stmt.
      $.bsv_actionValueBlock,
      $.bsv_varDecl,
      $.bsv_varAssign,
      $.bsv_functionDef,
      $.bsv_moduleDef,
      $.bsv_returnStmt,
      ctxtBeginEndStmt($, $.bsv_actionStmt),
      ctxtIf($, $.bsv_actionStmt),
      ctxtCase($, $.bsv_actionStmt),
      ctxtCaseMatches($, $.bsv_actionStmt),
      ctxtFor($, $.bsv_actionStmt),
      ctxtWhile($, $.bsv_actionStmt)
    ),

    // actionvalue / endactionvalue block — action + return value
    bsv_actionValueBlock: $ =>
      prec.right(seq('actionvalue', optional(seq(':', $._bsv_identifier)),
        repeat($.bsv_actionStmt),
        'endactionvalue', optional(seq(':', $._bsv_identifier)))),

    // First-class interface expression — `;` after the type is optional in
    // practice (though the BNF requires it).
    bsv_interfaceExpr: $ => prec.right(seq(
      'interface', $._bsv_Identifier, optional(';'),
      repeat($.bsv_interfaceStmt),
      'endinterface', optional(seq(':', $._bsv_Identifier))
    )),

    // rules ... endrules expression
    bsv_rulesExpr: $ => prec.right(seq(
      optional($.bsv_attributeInstances),
      'rules', optional(seq(':', $._bsv_identifier)),
      repeat(choice($.bsv_rule, $.bsv_expressionStmt)),
      'endrules', optional(seq(':', $._bsv_identifier))
    )),

    // FSM sublanguage: seq/par/endseq/endpar blocks
    bsv_seqFsmStmt: $ => seq('seq',
      repeat($.bsv_fsmStmt),
      'endseq'),
    bsv_parFsmStmt: $ => seq('par',
      repeat($.bsv_fsmStmt),
      'endpar'),
    bsv_fsmStmt: $ => choice(
      $.bsv_seqFsmStmt,
      $.bsv_parFsmStmt,
      $.bsv_actionStmt,
      prec.right(seq('if', '(', $.bsv_expression, ')', $.bsv_fsmStmt,
        optional(seq('else', $.bsv_fsmStmt)))),
      seq('while', '(', $.bsv_expression, ')', $.bsv_fsmStmt),
      seq('for', '(', forInit($), ';', forTest($), ';', forIncr($), ')',
        $.bsv_fsmStmt),
      seq('repeat', '(', $.bsv_expression, ')', $.bsv_fsmStmt),
      seq('return', ';'),
      seq('break', ';'),
      seq('continue', ';')
    ),

    // interfaces
    bsv_interfaceDecl: $ =>
      seq(optional($.bsv_attributeInstances), 'interface',
        $.bsv_typeConcreteIde, optional($.bsv_typeFormals), ';',
        repeat($.bsv_interfaceMemberDecl),
        'endinterface',
        optional(seq(':', $.bsv_typeConcreteIde))),
    bsv_interfaceMemberDecl: $ =>
      choice($.bsv_methodProto, $.bsv_subinterfaceDecl),
    bsv_methodProto: $ =>
      choice(
        seq(optional($.bsv_attributeInstances), 'method',
          $.bsv_type, $._bsv_identifier,
          '(', commaSepList($.bsv_methodProtoFormal), ')', ';'),
        seq(optional($.bsv_attributeInstances), 'method',
          $.bsv_type, $._bsv_identifier, ';'),
      ),
    bsv_methodProtoFormal: $ =>
      seq(optional($.bsv_attributeInstances), $.bsv_type, $._bsv_identifier),
    bsv_subinterfaceDecl: $ =>
      seq(optional($.bsv_attributeInstances), 'interface',
        $.bsv_type, $._bsv_identifier, ';'),

    // types
    bsv_type: $ =>
      choice(seq($.bsv_typeIde,
        optional(seq('#', '(', commaSepList1($.bsv_type), ')'))),
        $.bsv_typeNat,
        $.bsv_macroRef,
        seq('bit', '[', $.bsv_typeNat, ':', $.bsv_typeNat, ']')),
    bsv_typeConcrete: $ =>
      choice(seq($.bsv_typeConcreteIde,
        optional(seq('#', '(',
          commaSepList1($.bsv_typeConcrete), ')'))),
        $.bsv_typeNat,
        $.bsv_macroRef,
        seq('bit', '[', $.bsv_typeNat, ':', $.bsv_typeNat, ']')),
    // typeVarIde is usually a lowercase identifier; BSV also uses bare `_`
    // as an anonymous type variable in provisos.
    bsv_typeVarIde: $ => choice($._bsv_identifier, '_'),
    bsv_typeConcreteIde: $ => seq(
      optional(seq($.bsv_packageIde, '::')),
      $._bsv_Identifier
    ),
    bsv_typeIde: $ => choice($.bsv_typeConcreteIde, $.bsv_typeVarIde),
    bsv_typeNat: $ => /[0-9]+/,
    // Backtick macro reference (preprocessor macro expansion point).
    // Can appear inline as a type parameter, numeric, or expression.
    bsv_macroRef: $ => token(seq('`', /[a-zA-Z_][a-zA-Z0-9_]*/)),

    // pattern matching
    bsv_pattern: $ => choice(seq('.', $._bsv_identifier),
      '.*',
      // `._` — anonymous/"don't care" binding in a structured pattern
      seq('.', '_'),
      $.bsv_constantPattern,
      $.bsv_taggedUnionPattern,
      $.bsv_structPattern,
      $.bsv_tuplePattern,
      // Parenthesized pattern — BSV allows `(pattern)` to group/disambiguate.
      seq('(', $.bsv_pattern, ')')),
    bsv_constantPattern: $ => choice($.bsv_intLiteral,
      $.bsv_realLiteral,
      $.bsv_stringLiteral,
      $._bsv_Identifier),
    bsv_taggedUnionPattern: $ =>
      prec.right(seq('tagged', $._bsv_Identifier, optional($.bsv_pattern))),
    bsv_structPattern: $ =>
      seq($._bsv_Identifier, '{',
        commaSepList1(seq($._bsv_identifier, ':', $.bsv_pattern)),
        '}'),
    bsv_tuplePattern: $ => seq('{', commaSepList1($.bsv_pattern), '}'),

    // provisos
    bsv_provisos: $ => seq('provisos', '(', commaSepList1($.bsv_proviso), ')'),
    bsv_proviso: $ =>
      seq($.bsv_typeclassIde, '#', '(', commaSepList1($.bsv_type), ')'),

    // attributes, guiding the compiler
    bsv_attributeInstances: $ => repeat1($.bsv_attributeInstance),
    bsv_attributeInstance: $ => seq('(*', commaSepList1($.bsv_attrSpec), '*)'),
    bsv_attrSpec: $ => seq($.bsv_attrName, optional(seq('=', $.bsv_expression))),
    bsv_attrName: $ => choice($._bsv_identifier, $._bsv_Identifier),

    // integer literals
    bsv_intLiteral: $ => choice("'0",
      "'1",
      $.bsv_sizedIntLiteral,
      $.bsv_unsizedIntLiteral),
    bsv_sizedIntLiteral: $ => seq($.bsv_bitWidth, $.bsv_baseLiteral),
    bsv_unsizedIntLiteral: $ =>
      choice(seq(optional($.bsv_sign), $.bsv_baseLiteral),
        seq(optional($.bsv_sign), /[0-9]+/)),
    bsv_baseLiteral: $ =>
      choice(seq(/'[dD]/, /[0-9_]*/),
        seq(/'[hH]/, /[0-9a-fA-F_]*/),
        seq(/'[oO]/, /[0-7_]*/),
        seq(/'[bB]/, /[01_]*/)
      ),
    bsv_decNum: $ => /[0-9][0-9_]*/,
    bsv_bitWidth: $ => /[0-9]+/,
    bsv_sign: $ => /[\+\-]/,

    // real literals
    bsv_realLiteral: $ => choice(/[0-9][0-9_]*\.[0-9_]*/,
      /[0-9][0-9_]*(\.[0-9_]*)?[eE][\+\-]?[0-9_]*/),

    // string literals
    bsv_stringLiteral: $ => /\"([^"\\\n]|\\.)*\"/,

    // identifiers
    _bsv_identifier: $ => /[$_]*[a-z][a-zA-Z0-9$_]*/,
    _bsv_Identifier: $ => /[$_]*[A-Z][a-zA-Z0-9$_]*/,
    // A unified "word" regex used only by the `word:` property below so that
    // tree-sitter can treat string-literal keywords as preferring over the
    // identifier token when both match. Not used as a rule anywhere else.
    _bsv_word: $ => /[$_]*[a-zA-Z][a-zA-Z0-9$_]*/,

    // comments
    _bsv_line_comment: $ => seq('//', /.*/),
    _bsv_block_comment: $ => seq('/*', repeat(choice(/[^*]/, /\*[^\/]/)), '*/'),

    // compiler directives: `ifdef`, `define`, `include`, etc.
    // Treat as whitespace-like for parsing purposes — the preprocessor
    // expands them elsewhere. The full line (up to newline) is consumed.
    // Only matches known directive keywords so that inline macro refs
    // like `FOO remain available as bsv_macroRef.
    _bsv_compiler_directive: $ =>
      token(prec(10, seq('`', choice(
        'ifdef', 'ifndef', 'elsif', 'else', 'endif',
        'define', 'undef', 'undefineall',
        'include', 'line', 'resetall', 'timescale',
        'pragma', 'default_nettype', 'celldefine', 'endcelldefine',
        'nounconnected_drive', 'unconnected_drive'
      ), /[^\n]*/))),
  },
  extras: $ => [
    /\s/,
    $._bsv_line_comment,
    $._bsv_block_comment,
    $._bsv_compiler_directive,
  ]
});
