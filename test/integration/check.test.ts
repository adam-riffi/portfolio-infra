import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:54322/postgres";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) {
  throw new Error(
    "Refusing to run the bootstrap tests outside a local database",
  );
}
const sql = postgres(url, { max: 1, onnotice: () => {} });
const file = (name: string) =>
  fileURLToPath(new URL(`../../supabase/${name}`, import.meta.url));

const WRITERS: Record<string, string> = {
  dash_app: "dash",
  wf_app: "wf",
  traces_app: "traces",
  rag_app: "rag",
  oauth_app: "oauth",
};
const SCHEMAS = ["dash", "dash_demo", "wf", "traces", "rag", "oauth"];
const ROLES = [...Object.keys(WRITERS), "dash_reader", "anon", "authenticated"];

/** What check.sql must report for one role on one schema. */
function expected(role: string, schema: string) {
  const writer = WRITERS[role] === schema;
  const reader = writer || (role === "dash_reader" && schema === "dash_demo");
  return {
    role,
    schema,
    usage: reader,
    create: writer,
    tables_read: reader,
    tables_write: writer,
    future_read: reader,
    future_write: writer,
  };
}

beforeAll(async () => {
  await sql.file(file("bootstrap.sql"));
  // A table created by postgres in every schema, the way migrations create them.
  for (const schema of SCHEMAS) {
    await sql.unsafe(
      `create table if not exists ${schema}.check_probe (id int)`,
    );
  }
});

afterAll(() => sql.end());

describe("check.sql", () => {
  it("reports the full role by schema privilege matrix", async () => {
    const rows = await sql.file<{ role: string; schema: string }[]>(
      file("check.sql"),
    );
    const expectedRows = ROLES.flatMap((role) =>
      SCHEMAS.map((schema) => expected(role, schema)),
    );
    const key = (r: { role: string; schema: string }) =>
      `${r.role}.${r.schema}`;
    expect([...rows].sort((a, b) => key(a).localeCompare(key(b)))).toEqual(
      expectedRows.sort((a, b) => key(a).localeCompare(key(b))),
    );
  });
});
