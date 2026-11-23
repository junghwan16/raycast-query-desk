type Token = { value: string; depth: number };

// Inspect statement boundaries while ignoring literals and ordinary SQL comments.
function scan(sql: string, engine: "mysql" | "athena"): Token[] {
  const tokens: Token[] = [];
  let depth = 0;
  let cursor = 0;
  while (cursor < sql.length) {
    const rest = sql.slice(cursor);
    const whitespace = /^\s+/.exec(rest);
    if (whitespace) {
      cursor += whitespace[0].length;
      continue;
    }
    if (
      /^--(?:\s|$)/.test(rest) ||
      (engine === "athena" && rest.startsWith("--")) ||
      (engine === "mysql" && rest.startsWith("#"))
    ) {
      const end = rest.search(/[\r\n]/);
      cursor += end < 0 ? rest.length : end;
      continue;
    }
    if (rest.startsWith("/*")) {
      if (/^\/\*(?:!|M!|\+)/i.test(rest))
        throw new Error(
          "Executable SQL comments and optimizer hints are unsupported.",
        );
      const end = rest.indexOf("*/", 2);
      if (end < 0) throw new Error("An SQL comment is unclosed.");
      cursor += end + 2;
      continue;
    }
    const character = sql[cursor];
    if (character === "'" || character === '"' || character === "`") {
      let end = cursor + 1;
      while (end < sql.length) {
        if (engine === "mysql" && sql[end] === "\\" && character !== "`") {
          throw new Error(
            "Use doubled quotes instead of backslash escapes in MySQL strings.",
          );
        }
        if (sql[end] === character) {
          if (sql[end + 1] !== character) break;
          end++;
        }
        end++;
      }
      if (end >= sql.length)
        throw new Error("An SQL string or quoted identifier is unclosed.");
      tokens.push({ value: "<quoted>", depth });
      cursor = end + 1;
      continue;
    }
    const word = /^[a-z_$][a-z0-9_$]*/i.exec(rest);
    if (word) {
      tokens.push({ value: word[0].toUpperCase(), depth });
      cursor += word[0].length;
      continue;
    }
    if (character === ")") depth--;
    if (depth < 0) throw new Error("SQL parentheses are unbalanced.");
    tokens.push({ value: character, depth });
    if (character === "(") depth++;
    cursor++;
  }
  if (depth !== 0) throw new Error("SQL parentheses are unbalanced.");
  return tokens;
}

export function validateReadQuery(sql: string, engine: "mysql" | "athena") {
  const query = sql.trim();
  const tokens = scan(query, engine);
  const terminator = tokens.findIndex(({ value }) => value === ";");
  if (
    terminator >= 0 &&
    (terminator !== tokens.length - 1 || tokens[terminator].depth !== 0)
  ) {
    throw new Error("Run one read-only query at a time.");
  }

  const topLevel = tokens.filter(({ depth }) => depth === 0);
  const entry = topLevel[0]?.value;
  const statement =
    entry === "WITH"
      ? topLevel.find(({ value }) =>
          /^(SELECT|INSERT|UPDATE|DELETE|MERGE|REPLACE|CREATE|UNLOAD|CALL|TABLE|VALUES)$/.test(
            value,
          ),
        )?.value
      : entry;
  if (statement !== "SELECT")
    throw new Error("Enter one SELECT query, optionally starting with WITH.");
  for (const [index, { value }] of tokens.entries()) {
    if (
      value === "INTO" ||
      (value === "FOR" &&
        /^(UPDATE|SHARE)$/.test(tokens[index + 1]?.value ?? "")) ||
      (value === "LOCK" && tokens[index + 1]?.value === "IN") ||
      (value === ":" && tokens[index + 1]?.value === "=")
    ) {
      throw new Error(
        "Queries that write data, assign variables, or lock rows are unsupported.",
      );
    }
  }
  return query;
}
