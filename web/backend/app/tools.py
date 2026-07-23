from __future__ import annotations

import ast
import json
import re
import urllib.parse
from dataclasses import dataclass
from typing import Any

import httpx
from bs4 import BeautifulSoup


class ToolError(RuntimeError):
    pass


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]


def _tool(name: str, description: str, parameters: dict[str, Any]) -> ToolSpec:
    return ToolSpec(name=name, description=description, parameters=parameters)


def list_tool_specs() -> list[ToolSpec]:
    return [
        _tool(
            "web_search",
            "Search the web for a query and return top results.",
            {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "minLength": 1},
                    "max_results": {"type": "integer", "minimum": 1, "maximum": 10, "default": 5},
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        ),
        _tool(
            "http_get",
            "Fetch the text content of a URL via HTTP GET (size-limited).",
            {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "minLength": 1},
                    "max_chars": {"type": "integer", "minimum": 1000, "maximum": 200000, "default": 50000},
                },
                "required": ["url"],
                "additionalProperties": False,
            },
        ),
        _tool(
            "calc",
            "Evaluate a simple arithmetic expression (numbers, + - * / **, parentheses).",
            {
                "type": "object",
                "properties": {"expression": {"type": "string", "minLength": 1, "maxLength": 200}},
                "required": ["expression"],
                "additionalProperties": False,
            },
        ),
    ]


async def run_tool(name: str, args: dict[str, Any]) -> dict[str, Any]:
    if name == "web_search":
        return await _web_search(args)
    if name == "http_get":
        return await _http_get(args)
    if name == "calc":
        return _calc(args)
    raise ToolError(f"Unknown tool: {name}")


async def _web_search(args: dict[str, Any]) -> dict[str, Any]:
    query = str(args.get("query") or "").strip()
    if not query:
        raise ToolError("Missing query")
    max_results = int(args.get("max_results") or 5)
    max_results = max(1, min(10, max_results))

    # DuckDuckGo HTML endpoint (no API key). Best-effort.
    url = "https://duckduckgo.com/html/?" + urllib.parse.urlencode({"q": query})
    headers = {"User-Agent": "CoPaw/0.1 (+https://localhost)"}
    timeout = httpx.Timeout(connect=10.0, read=20.0, write=10.0, pool=10.0)
    async with httpx.AsyncClient(timeout=timeout, headers=headers, follow_redirects=True) as client:
        r = await client.get(url)
        if r.status_code >= 400:
            raise ToolError(f"Search failed: {r.status_code}")
        html = r.text

    soup = BeautifulSoup(html, "html.parser")
    results: list[dict[str, Any]] = []
    for a in soup.select("a.result__a"):
        title = (a.get_text() or "").strip()
        href = (a.get("href") or "").strip()
        if not href:
            continue
        results.append({"title": title, "url": href})
        if len(results) >= max_results:
            break
    return {"query": query, "results": results}


async def _http_get(args: dict[str, Any]) -> dict[str, Any]:
    url = str(args.get("url") or "").strip()
    if not url:
        raise ToolError("Missing url")
    if not re.match(r"^https?://", url, flags=re.I):
        raise ToolError("Only http(s) URLs are allowed")
    max_chars = int(args.get("max_chars") or 50000)
    max_chars = max(1000, min(200000, max_chars))

    headers = {"User-Agent": "CoPaw/0.1"}
    timeout = httpx.Timeout(connect=10.0, read=25.0, write=10.0, pool=10.0)
    async with httpx.AsyncClient(timeout=timeout, headers=headers, follow_redirects=True) as client:
        r = await client.get(url)
        ct = (r.headers.get("content-type") or "").lower()
        text = r.text if "text" in ct or "json" in ct or ct == "" else r.text
    if len(text) > max_chars:
        text = text[:max_chars] + "\n\n[truncated]"
    return {"url": url, "content_type": r.headers.get("content-type"), "text": text}


_ALLOWED_NODES = (
    ast.Expression,
    ast.BinOp,
    ast.UnaryOp,
    ast.Constant,
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.Div,
    ast.Pow,
    ast.USub,
    ast.UAdd,
    ast.Mod,
    ast.FloorDiv,
    ast.Load,
)


def _calc(args: dict[str, Any]) -> dict[str, Any]:
    expr = str(args.get("expression") or "").strip()
    if not expr:
        raise ToolError("Missing expression")
    if len(expr) > 200:
        raise ToolError("Expression too long")
    tree = ast.parse(expr, mode="eval")
    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_NODES):
            raise ToolError("Unsupported expression")
    val = eval(compile(tree, "<calc>", "eval"), {"__builtins__": {}}, {})
    return {"expression": expr, "result": val}


def openai_tools_payload() -> list[dict[str, Any]]:
    tools = []
    for spec in list_tool_specs():
        tools.append(
            {
                "type": "function",
                "function": {
                    "name": spec.name,
                    "description": spec.description,
                    "parameters": spec.parameters,
                },
            }
        )
    return tools


def format_tool_result(tool_name: str, result: dict[str, Any]) -> str:
    return json.dumps({"tool": tool_name, "result": result}, ensure_ascii=False)

