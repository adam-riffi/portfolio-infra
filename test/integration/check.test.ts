import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:54322/postgres";
// The report runs after the bootstrap: never against anything but a local database.
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) {
  throw new Error(
    "Refusing to run the privilege report tests outside a local database",
  );
}
const client = new pg.Client({ connectionString: url });
const file = (name: string) =>
  readFileSync(new URL(`../../supabase/${name}`, import.meta.url), "utf8");

const WRITERS: Record<string, string> = {
  dash_app: "dash",
  wf_app: "wf",
  traces_app: "traces",
  rag_app: "rag",
  oauth_app: "oauth",
};
const SCHEMAS = ["dash", "dash_demo", "wf", "traces", "rag", "oauth"];
const ROLES = [
  ...Object.keys(WRITERS),
  "dash_reader",
  "anon",
  "authenticated",
  "service_role",
];

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
  await client.connect();
  await client.query(file("bootstrap.sql"));
  // A table created by postgres in every schema, the way migrations create them.
  for (const schema of SCHEMAS) {
    await client.query(
      `create table if not exists ${schema}.check_probe (id int)`,
    );
  }
});

afterAll(() => client.end());

describe("check.sql", () => {
  it("reports the full role by schema privilege matrix", async () => {
    const { rows } = await client.query(file("check.sql"));
    const key = (r: { role: string; schema: string }) =>
      `${r.role}.${r.schema}`;
    const want = ROLES.flatMap((role) =>
      SCHEMAS.map((schema) => expected(role, schema)),
    );
    expect(rows).toHaveLength(54);
    expect([...rows].sort((a, b) => key(a).localeCompare(key(b)))).toEqual(
      want.sort((a, b) => key(a).localeCompare(key(b))),
    );
  });
});
