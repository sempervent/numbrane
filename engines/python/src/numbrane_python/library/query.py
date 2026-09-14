"""Query language parser and SQL compiler."""

from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class QueryNode:
    """Query AST node."""

    op: str  # 'and', 'or', 'not', 'filter'
    left: Optional["QueryNode"] = None
    right: Optional["QueryNode"] = None
    filter_type: str | None = None  # 'meta', 'metric', 'param', 'tag', 'sketch', 'text'
    field: str | None = None
    operator: str | None = None  # '=', '>', '<', '>=', '<=', '!=', 'between', 'like'
    value: Any = None


class QueryParser:
    """Parser for query language."""

    def __init__(self):
        """Initialize parser."""
        self.tokens = []
        self.pos = 0

    def parse(self, query: str) -> QueryNode:
        """Parse query string into AST.

        Args:
            query: Query string

        Returns:
            Query AST root node
        """
        # Tokenize
        self.tokens = self._tokenize(query)
        self.pos = 0

        # Parse expression
        return self._parse_expression()

    def _tokenize(self, query: str) -> list[str]:
        """Tokenize query string."""
        # Simple tokenizer - handles quoted strings, operators, keywords
        tokens = []
        current = ""
        in_quotes = False
        quote_char = None

        i = 0
        while i < len(query):
            char = query[i]

            if char in ['"', "'"]:
                if not in_quotes:
                    in_quotes = True
                    quote_char = char
                    if current.strip():
                        tokens.append(current.strip())
                        current = ""
                elif char == quote_char:
                    in_quotes = False
                    quote_char = None
                    tokens.append(current)
                    current = ""
                else:
                    current += char
            elif in_quotes:
                current += char
            elif char in ["(", ")", "=", "<", ">", "!"]:
                if current.strip():
                    tokens.append(current.strip())
                    current = ""
                # Handle multi-char operators
                if i + 1 < len(query):
                    two_char = query[i : i + 2]
                    if two_char in ["<=", ">=", "!=", "=="]:
                        tokens.append(two_char)
                        i += 1
                    else:
                        tokens.append(char)
                else:
                    tokens.append(char)
            elif char.isspace():
                if current.strip():
                    tokens.append(current.strip())
                    current = ""
            else:
                current += char

            i += 1

        if current.strip():
            tokens.append(current.strip())

        return tokens

    def _parse_expression(self) -> QueryNode:
        """Parse expression (handles AND/OR)."""
        left = self._parse_term()

        while self.pos < len(self.tokens):
            token = self.tokens[self.pos]
            if token.upper() == "AND":
                self.pos += 1
                right = self._parse_term()
                left = QueryNode(op="and", left=left, right=right)
            elif token.upper() == "OR":
                self.pos += 1
                right = self._parse_term()
                left = QueryNode(op="or", left=left, right=right)
            else:
                break

        return left

    def _parse_term(self) -> QueryNode:
        """Parse term (handles NOT and filters)."""
        if self.pos >= len(self.tokens):
            raise ValueError("Unexpected end of query")

        token = self.tokens[self.pos]

        if token.upper() == "NOT":
            self.pos += 1
            expr = self._parse_term()
            return QueryNode(op="not", left=expr)
        elif token == "(":
            self.pos += 1
            expr = self._parse_expression()
            if self.pos >= len(self.tokens) or self.tokens[self.pos] != ")":
                raise ValueError("Unmatched parenthesis")
            self.pos += 1
            return expr
        else:
            return self._parse_filter()

    def _parse_filter(self) -> QueryNode:
        """Parse a filter expression."""
        if self.pos >= len(self.tokens):
            raise ValueError("Unexpected end of query")

        field_token = self.tokens[self.pos]
        self.pos += 1

        # Parse field type
        if ":" in field_token:
            filter_type, field = field_token.split(":", 1)
        elif field_token.startswith("meta."):
            filter_type = "meta"
            field = field_token[5:]
        elif field_token.startswith("metric."):
            filter_type = "metric"
            field = field_token[7:]
        elif field_token.startswith("param:"):
            filter_type = "param"
            field = field_token[6:]
        else:
            # Default to text search
            filter_type = "text"
            field = field_token

        # Parse operator
        if self.pos >= len(self.tokens):
            raise ValueError("Unexpected end of query")

        op_token = self.tokens[self.pos]
        self.pos += 1

        # Parse value
        if self.pos >= len(self.tokens):
            raise ValueError("Unexpected end of query")

        value_token = self.tokens[self.pos]
        self.pos += 1

        # Handle operators
        if op_token == "=" or op_token == "==":
            operator = "="
            value = self._parse_value(value_token)
        elif op_token in ["<", ">", "<=", ">=", "!="]:
            operator = op_token
            value = self._parse_value(value_token)
        elif op_token.upper() == "BETWEEN":
            # BETWEEN value1..value2
            value1 = self._parse_value(value_token)
            if self.pos >= len(self.tokens) or self.tokens[self.pos] != "..":
                raise ValueError("Expected '..' in BETWEEN clause")
            self.pos += 1
            if self.pos >= len(self.tokens):
                raise ValueError("Unexpected end of query")
            value2 = self._parse_value(self.tokens[self.pos])
            self.pos += 1
            operator = "between"
            value = (value1, value2)
        elif op_token.upper() == "LIKE" or "like" in field_token.lower():
            operator = "like"
            value = value_token.strip("\"'")
        else:
            # Default to equality
            operator = "="
            value = self._parse_value(value_token)

        return QueryNode(
            op="filter",
            filter_type=filter_type,
            field=field,
            operator=operator,
            value=value,
        )

    def _parse_value(self, token: str) -> Any:
        """Parse a value token."""
        # Try numeric
        try:
            if "." in token:
                return float(token)
            else:
                return int(token)
        except ValueError:
            pass

        # String (remove quotes)
        return token.strip("\"'")


class QueryCompiler:
    """Compiles query AST to SQL."""

    def __init__(self, db):
        """Initialize compiler.

        Args:
            db: LibraryDB instance
        """
        self.db = db

    def compile(self, node: QueryNode) -> tuple[str, list[Any]]:
        """Compile query AST to SQL WHERE clause.

        Args:
            node: Query AST root

        Returns:
            Tuple of (WHERE clause, parameters)
        """
        return self._compile_node(node)

    def _compile_node(self, node: QueryNode) -> tuple[str, list[Any]]:
        """Compile a query node."""
        if node.op == "and":
            left_where, left_params = self._compile_node(node.left)
            right_where, right_params = self._compile_node(node.right)
            return f"({left_where} AND {right_where})", left_params + right_params
        elif node.op == "or":
            left_where, left_params = self._compile_node(node.left)
            right_where, right_params = self._compile_node(node.right)
            return f"({left_where} OR {right_where})", left_params + right_params
        elif node.op == "not":
            expr_where, expr_params = self._compile_node(node.left)
            return f"NOT ({expr_where})", expr_params
        elif node.op == "filter":
            return self._compile_filter(node)
        else:
            raise ValueError(f"Unknown node op: {node.op}")

    def _compile_filter(self, node: QueryNode) -> tuple[str, list[Any]]:
        """Compile a filter node."""
        if node.filter_type == "meta":
            # meta.violence > 0.5
            # Access via JSON: JSON_EXTRACT(meta_controls, '$.violence')
            field_path = f"$.{node.field}"
            json_path = f"JSON_EXTRACT(meta_controls, '{field_path}')"
            return self._compile_operator(json_path, node.operator, node.value)
        elif node.filter_type == "metric":
            # metric.symmetry > 0.6
            field_path = f"$.{node.field}"
            json_path = f"JSON_EXTRACT(metrics, '{field_path}')"
            return self._compile_operator(json_path, node.operator, node.value)
        elif node.filter_type == "param":
            # param:field.scale between 0.2..0.5
            field_path = f"$.{node.field.replace('.', '.')}"
            json_path = f"JSON_EXTRACT(resolved_config, '{field_path}')"
            return self._compile_operator(json_path, node.operator, node.value)
        elif node.filter_type == "tag":
            # tag:ritual
            return (
                "EXISTS (SELECT 1 FROM run_tags WHERE run_tags.run_id = runs.run_id AND run_tags.tag = ?)",
                [node.value],
            )
        elif node.filter_type == "sketch":
            # sketch:noodles
            return "sketch_name = ?", [node.value]
        elif node.filter_type == "text":
            # Free text search in notes/title
            search_term = f"%{node.value}%"
            return "(notes LIKE ? OR title LIKE ?)", [search_term, search_term]
        else:
            raise ValueError(f"Unknown filter type: {node.filter_type}")

    def _compile_operator(self, field: str, operator: str, value: Any) -> tuple[str, list[Any]]:
        """Compile operator expression."""
        if operator == "=":
            return f"{field} = ?", [value]
        elif operator == "!=":
            return f"{field} != ?", [value]
        elif operator == ">":
            return f"{field} > ?", [value]
        elif operator == "<":
            return f"{field} < ?", [value]
        elif operator == ">=":
            return f"{field} >= ?", [value]
        elif operator == "<=":
            return f"{field} <= ?", [value]
        elif operator == "between":
            value1, value2 = value
            return f"{field} BETWEEN ? AND ?", [value1, value2]
        elif operator == "like":
            return f"{field} LIKE ?", [f"%{value}%"]
        else:
            raise ValueError(f"Unknown operator: {operator}")


def parse_query(query: str) -> QueryNode:
    """Parse a query string.

    Args:
        query: Query string

    Returns:
        Query AST
    """
    parser = QueryParser()
    return parser.parse(query)


def compile_query(node: QueryNode, db) -> tuple[str, list[Any]]:
    """Compile query AST to SQL.

    Args:
        node: Query AST
        db: LibraryDB instance

    Returns:
        Tuple of (WHERE clause, parameters)
    """
    compiler = QueryCompiler(db)
    return compiler.compile(node)
