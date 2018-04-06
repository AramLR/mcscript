const fs = require('fs');
var FALSE = { type: "str", value: '' };
exports.parse = function(input) {
  var PRECEDENCE = {
    "=": 1,
    "||": 2,
    "&&": 3,
    "<": 7, ">": 7, "<=": 7, ">=": 7, "==": 7, "!=": 7,
    "+": 10, "-": 10, "+=": 10, "-=": 10,
    "*": 20, "/": 20, "%": 20, "*=": 20, "/=": 20, "%=": 20,
  };
  return parse_toplevel();
  function is_punc(ch) {
    var tok = input.peek();
    return tok && tok.type == "punc" && (!ch || tok.value == ch) && tok;
  }
  function is_kw(kw) {
    var tok = input.peek();
    return tok && tok.type == "kw" && (!kw || tok.value == kw) && tok;
  }
  function is_op(op) {
    var tok = input.peek();
    return tok && tok.type == "op" && (!op || tok.value == op) && tok;
  }
  function skip_punc(ch) {
    if (is_punc(ch)) input.next();
    else input.croak("Expecting punctuation: \"" + ch + "\"");
  }
  function skip_kw(kw) {
    if (is_kw(kw)) input.next();
    else input.croak("Expecting keyword: \"" + kw + "\"");
  }
  function skip_op(op) {
    if (is_op(op)) input.next();
    else input.croak("Expecting operator: \"" + op + "\"");
  }
  function unexpected() {
    input.croak("Unexpected token: " + JSON.stringify(input.peek()));
  }
  function maybe_binary(left, my_prec) {
    var tok = is_op();
    if(left && left.type == "var" && input.peek().value == "++"){
      input.next()
      return {type: "binary", operator: "+=", left: left, right: {type:'num', value: 1}}
    }
    if(left && left.type == "var" && input.peek().value == "--"){
      input.next()
      return {type: "binary", operator: "-=", left: left, right: {type:'num', value: 1}}
    }
    if(left && left.type == "var" && left.value.slice(-2) === "--"){
      left.value = left.value.substr(0, left.value.length - 2)
      return {type: "binary", operator: "-=", left: left, right: {type:'num', value: 1}}
    }
    if (tok) {
      var his_prec = PRECEDENCE[tok.value];
      if (his_prec > my_prec) {
        input.next()
        return maybe_binary({
          type     : tok.value == "=" ? "assign" : "binary",
          operator : tok.value,
          left     : left,
          right    : maybe_binary(parse_atom(), his_prec)
        }, my_prec);
      }
    }
    return left;
  }
  function delimited(start, stop, separator, parser) {
    var a = [], first = true;
    skip_punc(start);
    while (!input.eof()) {
      if (is_punc(stop)) break;
      if (first) first = false; else skip_punc(separator);
      if (is_punc(stop)) break;
      a.push(parser());
    }
    skip_punc(stop);
    return a;
  }
  function parse_call(func) {
    ret = {
      type: "call",
      func: func,
      args: delimited("(", ")", ",", parse_expression),
    };
    if (is_punc("{")) ret.after = parse_expression();
    return ret
  }
  function parse_varname() {
    var name = input.next();
    if (name.type != "var") input.croak("Expecting variable name");
    return name.value;
  }
  function parse_if() {
    skip_kw("if");
    input.next()
    var cond = parse_key_args()
    input.next()
    if (!is_punc("{")) skip_kw("then");
    var then = parse_expression();
    var ret = {
      type: "if",
      cond: cond,
      then: then,
    };
    if (is_kw("else")) {
      input.next();
      ret.else = parse_expression();
    }
    return ret;
  }
  function parse_while() {
    skip_kw("while");
    input.next()
    var cond = parse_key_args()
    input.next()
    let custom
    if(input.peek().type == "str"){
      custom = input.next()
    }
    if (!is_punc("{")) skip_kw("then");
    var then = parse_expression();
    var ret = {
      type: "while",
      cond: cond,
      then: then,
    };
    if(custom) ret.customName = custom
    return ret;
  }
  function parse_dowhile() {
    skip_kw("do");
    let custom
    if(input.peek().type == "str"){
      custom = input.next()
    }
    if (!is_punc("{")) skip_kw("then");
    var then = parse_expression();
    skip_kw("while");
    input.next()
    var cond = parse_key_args()
    input.next()
    var ret = {
      type: "dowhile",
      cond: cond,
      then: then,
    };
    if(custom) ret.customName = custom
    return ret;
  }
  function parse_forEach() {
    skip_kw("forEach");
    input.next()
    let variable = parse_var(input.peek().value)
    if(!variable.assign) variable.assign = { type: 'assign',operator: '=', left: { type: 'var', value: variable.name }, right: { type: 'num', value: 0 } }
    input.next()
    let cond = parse_key_args()
    input.next()
    let binary = maybe_binary(input.next(),0)
    input.next()
    let custom
    if(input.peek().type == "str"){
      custom = input.next()
    }
    if (!is_punc("{")) skip_kw("then");
    var then = parse_expression();
    var ret = {
      type: "forEach",
      cond: cond,
      var: variable,
      binary: binary,
      then: then,
    };
    if(custom) ret.customName = custom
    return ret;
  }
  function parse_raycast(){
    skip_kw("raycast")
    let res = {type: "raycast", duration: 100, block: "air"}
    if(input.peek().value == "("){
      input.next()
      if(input.peek().type == "num"){
        res.duration = input.next().value
        input.next()
      }
      if(input.peek().type == "str"){
        res.block = input.next().value
        input.next()
      }
      if(input.peek().value == ")") input.next()
    }
    res.end = parse_prog()
    if(input.peek().value == ","){
      input.next()
      res.while = parse_prog()
    }
    return res
  }
  function parse_key_args(){
    let cond = []
    let before = {type: 'op', value: "&&"}
    while(input.peek().value != ")" && input.peek().value != ";"){
      let next = input.next()
      if(next.value == "!"){
        before = next
        continue
      }
      if(next.type == "selector"){
        if(before.type == "binary") before.right.selector = next
        else if(before.type == "var") before.selector = next
        else cond.push(next)
        continue
      }
      if("> < >= <= == != ".indexOf(next.value + " ") > -1){
        cond.splice(cond.indexOf(before),1)
        next = {type: 'binary', left: before, operator: next.value, right: input.next()}
        if(before.op){
            next.op = before.op
            delete next.left.op
        }
        cond.push(next)
      }
      if(before.value == "&&"){
        cond.push(next)
      }
      if(before.value == "||" || before.value == ","){
        next.op = "or"
        cond.push(next)
      }
      if(before.value == "!"){
        next.not = true
        cond.push(next)
      }
      before = next
    }
    return cond
  }
  function parse_keyword(kw) {
    skip_kw(kw);
    input.next()
    var cond = parse_key_args()
    input.next()

    let next = input.peek()
    if(next.value == "{"){}
    else if(next.value == ",") {
      input.next()
      let nest = parse_keyword(input.peek().value)
      let res = {
        type: kw,
        nest: [],
        cond: cond,
        then: nest.then,
      }
      res.nest.push({type: nest.type, cond: nest.cond})
      if(nest.nest) res.nest = res.nest.concat(nest.nest)
      return res
    }
    else skip_kw("then");
    //else skip_kw("then");
    var then = parse_expression();
    var ret = {
      type: kw,
      cond: cond,
      then: then,
    };
    return ret;
  }
  function parse_for() {
    skip_kw("for");
    let args = delimited("(", ")", ",", parse_expression)
    let then = parse_expression();
    var ret = {
      type: "for",
      args: args,
      after: then
    };
    return ret;
  }
  function parse_var(kw){
    skip_kw(kw)
    let name = input.next().value
    let res = {type:"initvar",name:name}
    if(input.peek().type == "selector") res.selector = input.next()
    if(input.peek().type == "var") res.selector = {type: "selector", value: input.next().value}
    let assign = maybe_binary({type:"var",value:name, selector: res.selector},0)
    if(assign.type == "assign") res.assign = assign
    return res
  }
  function parse_bol(kw){
    skip_kw(kw)
    let name = input.next().value
    let res = {type:"initbool",name:name}
    if(input.peek().type == "selector") res.selector = input.next()
    if(input.peek().type == "var") res.selector = {type: "selector", value: input.next().value}
    let assign = maybe_binary({type:"var",value:name, selector: res.selector},0)
    if(assign.type == "assign" && assign.right.type == "bool") res.assign = assign
    else input.croak("Your assignment is not right! Please assign a boolean value.")
    return res
  }
  function parse_const(){
    skip_kw('const')
    let name = input.next().value
    input.next()
    let assign = input.next()
    if(assign.type != "num" && assign.type != "str") input.croak("You have to assign a string or number to a constant!")
    return {
      type: "const",
      value: name,
      assign: assign.value
    }
  }
  function parse_modal() {
    skip_kw("modal");
    return {type: "modal", call: parse_call(input.next().value)};
  }
  function parse_switch(){
    skip_kw("switch")
    let res = {type: "switch", var: {}, cases:[]}
    let variable = delimited("(",")",",",x => input.next())
    res.var = variable[0]
    if(variable[1] && variable[1].type == "selector") res.var.selector = variable[1]
    res.cases = delimited("{","}",",",() => {
      let def = false
      if(input.peek().value == "default") {
        def = true
        skip_kw("default")
      } else skip_kw("case")
      let cond = []
      if(!def && input.peek().type == "op") cond.push(maybe_binary(res.var,0))
      else if(!def && input.peek().type == "num") cond.push({type: "binary", left: res.var, right: input.next(),operator: "=="})
      let then
      if(input.peek().value == "{") then = parse_prog()
      else then = parse_expression()

      if(input.peek().value == ";") skip_punc(";")
      return {type: def ? "default" : "case", cond: cond, then: then}
    })
    return res
  }
  function parse_lambda() {
    return {
      type: "lambda",
      vars: delimited("(", ")", ",", parse_varname),
      body: parse_expression()
    };
  }
  function parse_bool() {
    return {
      type  : "bool",
      value : input.next().value == "true"
    };
  }
  function returnKey(keyword){
    skip_kw(keyword)
    return {type: keyword}
  }
  function maybe_call(expr) {
    expr = expr();
    return is_punc("(") ? parse_call(expr) : expr;
  }
  function parse_atom() {
    return maybe_call(function(){
      if (is_punc("(")) {
        input.next();
        var exp = parse_expression();
        skip_punc(")");
        return exp;
      }
      if (is_punc("{")) return parse_prog();
      if (is_kw("if")) return parse_if();
      if(is_kw("const")) return parse_const()
      if (is_kw("var")|| is_kw("score")) return parse_var(input.peek().value);
      if (is_kw("bool")|| is_kw("tag") || is_kw("boolean")) return parse_bol(input.peek().value);
      if (is_kw("asat") || is_kw("as") || is_kw("at") || is_kw("positioned") || is_kw("align") || is_kw("rotated") || is_kw("anchored") || is_kw("dimension")) return parse_keyword(input.peek().value);
      if (is_kw("for")) return parse_for();
      if (is_kw("forEach")) return parse_forEach();
      if (is_kw("raycast")) return parse_raycast();
      if (is_kw("stop")) return returnKey('stop')
      if (is_kw("continue")) return returnKey('continue')
      if (is_kw("switch")) return parse_switch()
      //if (is_kw("selector")) return returnKey('selector')
      if (is_kw("while")) return parse_while();
      if (is_kw("do")) return parse_dowhile();
      if (is_kw("modal")) return parse_modal();
      if (is_kw("true") || is_kw("false")) return parse_bool();
      var tok = input.next();
      if(tok.type == "comment" || tok.type == "command"){
        return tok
      }
      if(tok.type == "var"){
        if(input.peek().type == "selector"){
          tok.selector = input.next()
        }
        if(input.peek().type == "var"){
          tok.selector = {type: "selector", value: input.next().value}
        }
        return tok
      }
      if (tok.type == "num" || tok.type == "str") return tok
      unexpected();
    });
  }
  function parse_toplevel() {
    var prog = [];
    while (!input.eof()) {
      prog.push(parse_expression());
      if (!input.eof()) skip_punc(";");
    }
    return { type: "prog", prog: prog };
  }
  function parse_prog() {
    var prog = delimited("{", "}", ";", parse_expression);
    if (prog.length == 0) return FALSE;
    if (prog.length == 1) return prog[0];
    return { type: "prog", prog: prog };
  }
  function parse_expression() {
    return maybe_call(function(){
      return maybe_binary(parse_atom(), 0);
    });
  }
}
