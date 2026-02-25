import type { Agent } from "@/types/agent";
import { get_openai_client } from "@/lib/openai";
import path from "path";
import initSqlJs from "sql.js";

function get_sql_js_dist(): string {
  return path.join(process.cwd(), "node_modules/sql.js/dist");
}

const SCHEMA_DESCRIPTION = `
Tables:
- users: id (INTEGER), name (TEXT), email (TEXT), created_at (TEXT ISO date)
- orders: id (INTEGER), user_id (INTEGER), amount (REAL), status (TEXT: 'pending'|'completed'|'cancelled'), created_at (TEXT)
- products: id (INTEGER), name (TEXT), price (REAL)
- order_items: order_id (INTEGER), product_id (INTEGER), quantity (INTEGER). Links orders to products; join to products for product names.
`.trim();

async function get_db() {
  const SQL = await initSqlJs({
    locateFile: (file: string) => path.join(get_sql_js_dist(), file),
  });
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, created_at TEXT);
    INSERT INTO users VALUES (1, 'Alice', 'alice@example.com', '2024-01-15');
    INSERT INTO users VALUES (2, 'Bob', 'bob@example.com', '2024-02-01');
    INSERT INTO users VALUES (3, 'Carol', 'carol@example.com', '2024-02-10');
    CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER, amount REAL, status TEXT, created_at TEXT);
    INSERT INTO orders VALUES (1, 1, 99.50, 'completed', '2024-02-01');
    INSERT INTO orders VALUES (2, 1, 25.00, 'pending', '2024-02-20');
    INSERT INTO orders VALUES (3, 2, 150.00, 'completed', '2024-02-05');
    INSERT INTO orders VALUES (4, 3, 49.99, 'cancelled', '2024-02-12');
    CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL);
    INSERT INTO products VALUES (1, 'Widget', 29.99);
    INSERT INTO products VALUES (2, 'Gadget', 49.99);
    INSERT INTO products VALUES (3, 'Gizmo', 19.99);
    CREATE TABLE order_items (order_id INTEGER, product_id INTEGER, quantity INTEGER);
    INSERT INTO order_items VALUES (1, 1, 1);
    INSERT INTO order_items VALUES (1, 2, 1);
    INSERT INTO order_items VALUES (1, 3, 1);
    INSERT INTO order_items VALUES (2, 3, 1);
    INSERT INTO order_items VALUES (3, 1, 2);
    INSERT INTO order_items VALUES (3, 2, 1);
    INSERT INTO order_items VALUES (3, 3, 1);
    INSERT INTO order_items VALUES (4, 2, 1);
  `);
  return db;
}

function exec_to_rows(
  db: { exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }> },
  sql: string
): Record<string, unknown>[] {
  const results = db.exec(sql);
  if (results.length === 0) return [];
  const { columns, values } = results[0];
  return values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => (obj[col] = row[i]));
    return obj;
  });
}

export const sql_agent: Agent<
  { query: string },
  { sql: string; results: Record<string, unknown>[] }
> = {
  name: "SQL query agent",
  purpose:
    "Takes a natural language question, generates a SQLite-compatible SQL query, executes it against a sample database (users, orders, products, order_items), and returns the SQL and result rows.",
  args: [
    {
      name: "query",
      format: "string",
      purpose: "Human-language question about the data (e.g. 'How many orders are pending?').",
    },
  ],
  output_schema: {
    sql: { description: "The generated SQL query that was executed.", type: "string" },
    results: { description: "Array of rows returned by the query.", type: "array of objects" },
  },
  execute: async ({ query }) => {
    const openai = get_openai_client();
    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        {
          role: "system",
          content: `You are a SQL expert. Given the following schema, generate exactly one SQLite SQL statement (no markdown, no explanation). Only SELECT is allowed.\n\n${SCHEMA_DESCRIPTION}`,
        },
        { role: "user", content: query },
      ],
      temperature: 0,
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const sql = raw.replace(/^```\w*\n?|\n?```$/g, "").trim();
    const db = await get_db();
    try {
      const results = exec_to_rows(db, sql);
      db.close();
      return { sql, results };
    } catch (err) {
      db.close();
      throw new Error(`SQL execution failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
