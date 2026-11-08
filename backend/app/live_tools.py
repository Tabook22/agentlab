"""Small allowlisted tools: no shell, file access, or arbitrary network requests."""
import ast
import math
import operator
from .provider import LiveError


def calculate(expression):
    if len(expression)>250:
        raise LiveError('Calculation expression is too long.')
    try:
        tree=ast.parse(expression,mode='eval')
        if len(list(ast.walk(tree)))>60:
            raise ValueError()
        def visit(node):
            if isinstance(node,ast.Constant) and type(node.value) in (int,float):
                value=node.value
            elif isinstance(node,ast.UnaryOp) and isinstance(node.op,(ast.USub,ast.UAdd)):
                value=(-1 if isinstance(node.op,ast.USub) else 1)*visit(node.operand)
            elif isinstance(node,ast.BinOp) and type(node.op) in (ast.Add,ast.Sub,ast.Mult,ast.Div,ast.Mod):
                op={ast.Add:operator.add,ast.Sub:operator.sub,ast.Mult:operator.mul,ast.Div:operator.truediv,ast.Mod:operator.mod}[type(node.op)]
                value=op(visit(node.left),visit(node.right))
            else:
                raise ValueError()
            if not math.isfinite(value) or abs(value)>1e12:
                raise ValueError()
            return value
        return visit(tree.body)
    except (SyntaxError,ValueError,TypeError,ZeroDivisionError,OverflowError,RecursionError):
        raise LiveError('Only bounded numeric arithmetic (+, -, *, /, %) is allowed.') from None


def execute_action(proposal,allowed,context):
    if proposal.action not in allowed:
        raise LiveError('The worker requested a tool outside its permissions.')
    if proposal.action=='calculate':
        return {'label':'Calculated result','expression':proposal.argument,'result':calculate(proposal.argument),'accepted':False}
    if proposal.action=='inspect_context':
        return {'label':'Scoped context inspection','content':context,'accepted':False}
    if proposal.action!='write_text':
        raise LiveError('This tool requires the asynchronous research executor.')
    text=proposal.argument.strip()
    if not text:
        raise LiveError('The text artifact is empty.')
    return {'label':'Worker text artifact','content':text,'accepted':False}
