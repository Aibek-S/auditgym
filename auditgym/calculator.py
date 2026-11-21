"""Safe decimal calculator for the `calculator` action (D-52).

Grammar (no names, no functions, no exponent operator, no code):
    expr   := term (("+" | "-") term)*
    term   := factor (("*" | "/") factor)*
    factor := ("-" | "+") factor | NUMBER | "(" expr ")"
    NUMBER := digits ["." digits]
Hand-written recursive descent over `Decimal`; Python `eval`/`ast` is never used.
"""

from __future__ import annotations

from decimal import Context, Decimal, DivisionByZero, InvalidOperation, Overflow

MAX_CHARS = 200
MAX_DIGITS = 30
MAX_DEPTH = 20
_CTX = Context(prec=34, Emax=999, Emin=-999, traps=[DivisionByZero, InvalidOperation, Overflow])


class CalcError(ValueError):
    pass


def _tokens(text: str) -> list[str]:
    out, i = [], 0
    while i < len(text):
        ch = text[i]
        if ch.isspace():
            i += 1
        elif ch in "+-*/()":
            out.append(ch)
            i += 1
        elif ch.isdigit() or ch == ".":
            j = i
            while j < len(text) and (text[j].isdigit() or text[j] == "."):
                j += 1
            number = text[i:j]
            if number.count(".") > 1 or number.strip(".") == "" or number.startswith(".") or number.endswith("."):
                raise CalcError("bad number")
            if len(number.replace(".", "")) > MAX_DIGITS:
                raise CalcError("number too long")
            out.append(number)
            i = j
        else:
            raise CalcError("only numbers, + - * / and parentheses are allowed")
    return out


class _Parser:
    def __init__(self, tokens: list[str]):
        self.t, self.i, self.depth = tokens, 0, 0

    def peek(self):
        return self.t[self.i] if self.i < len(self.t) else None

    def take(self):
        tok = self.peek()
        if tok is None:
            raise CalcError("unexpected end of expression")
        self.i += 1
        return tok

    def expr(self) -> Decimal:
        value = self.term()
        while self.peek() in ("+", "-"):
            op = self.take()
            rhs = self.term()
            value = _CTX.add(value, rhs) if op == "+" else _CTX.subtract(value, rhs)
        return value

    def term(self) -> Decimal:
        value = self.factor()
        while self.peek() in ("*", "/"):
            op = self.take()
            rhs = self.factor()
            value = _CTX.multiply(value, rhs) if op == "*" else _CTX.divide(value, rhs)
        return value

    def factor(self) -> Decimal:
        self.depth += 1
        if self.depth > MAX_DEPTH:
            raise CalcError("expression nested too deeply")
        try:
            tok = self.take()
            if tok in ("-", "+"):
                value = self.factor()
                return _CTX.minus(value) if tok == "-" else value
            if tok == "(":
                value = self.expr()
                if self.take() != ")":
                    raise CalcError("missing )")
                return value
            if tok[0].isdigit():
                return Decimal(tok)
            raise CalcError(f"unexpected {tok!r}")
        finally:
            self.depth -= 1


def evaluate(expression) -> str:
    if not isinstance(expression, str) or not expression.strip():
        raise CalcError("expression must be a non-empty string")
    if len(expression) > MAX_CHARS:
        raise CalcError(f"expression longer than {MAX_CHARS} characters")
    parser = _Parser(_tokens(expression))
    try:
        value = parser.expr()
    except (DivisionByZero, InvalidOperation, Overflow):
        raise CalcError("arithmetic error (division by zero or overflow)") from None
    if parser.peek() is not None:
        raise CalcError(f"unexpected {parser.peek()!r}")
    text = format(value.normalize(_CTX), "f")
    return "0" if text in ("-0", "") else text
