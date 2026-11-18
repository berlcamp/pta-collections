#!/usr/bin/env python3
"""PreToolUse guard: the Supabase MCP may READ production, never change it.

Schema and data changes are made by hand, as migration files run in the
Supabase SQL Editor (see CLAUDE.md). execute_sql serves reads too, so it is
not denied outright; instead any statement that could write, change
structure, escape a transaction, or call a function (a SECURITY DEFINER RPC
writes behind a SELECT) is refused here.
"""
import json
import re
import sys

payload = json.load(sys.stdin)
sql = str((payload.get("tool_input") or {}).get("query", ""))

# Strip comments and string literals so a keyword inside them is not judged,
# and one hidden inside them cannot slip past.
body = re.sub(r"--[^\n]*", " ", sql)
body = re.sub(r"/\*.*?\*/", " ", body, flags=re.S)
body = re.sub(r"\$([A-Za-z_]*)\$.*?\$\1\$", " '' ", body, flags=re.S)
body = re.sub(r"'(?:''|[^'])*'", "''", body)
low = body.lower()

WRITE = re.compile(
    r"\b(insert|update|delete|merge|upsert|truncate|drop|alter|create|replace|"
    r"grant|revoke|comment\s+on|security\s+label|copy|call|do|execute|prepare|"
    r"vacuum|analyze|cluster|reindex|refresh|lock|listen|notify|discard|"
    r"begin|start\s+transaction|commit|rollback|savepoint|release|end|abort|"
    r"set|reset|import|load|reassign|nextval|setval|set_config|"
    r"pg_terminate_backend|pg_cancel_backend|pg_reload_conf|dblink\w*|lo_\w+|"
    r"pg_(?:read|write)_\w+)\b"
)
SELECT_INTO = re.compile(r"\bselect\b[^;]*\binto\b")
# Any schema-qualified function call in an app schema: pta.foo(...) etc.
APP_FN = re.compile(r"\b(pta|public|auth|storage|extensions)\s*\.\s*\w+\s*\(")
FOR_UPDATE = re.compile(r"\bfor\s+(no\s+key\s+)?(update|share)\b")

hit = (WRITE.search(low) or SELECT_INTO.search(low)
       or APP_FN.search(low) or FOR_UPDATE.search(low))

if hit:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": (
                f"Supabase MCP is read-only for production (matched "
                f"'{hit.group(0).strip()}'). Write the change as a migration "
                f"file in supabase/migrations/ for the user to run in the SQL "
                f"Editor."
            ),
        }
    }))
sys.exit(0)
