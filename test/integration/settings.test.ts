import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:54322/postgres";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) {
  throw new Error("Refusing to run settings tests outside a local database");
}
const sql = (name: string) =>
  readFileSync(new URL(`../../supabase/${name}`, import.meta.url), "utf8");
const health = sql("health.sql");
const storage = sql("storage.sql");
const client = new pg.Client({ connectionString: url });

beforeAll(async () => {
  await client.connect();
  // The Postgres-only service has no Storage API migrations. These are the three
  // documented bucket fields this configuration touches; hosted Storage owns the rest.
  await client.query("create schema if not exists storage");
  await client.query(`create table if not exists storage.buckets (
    id text primary key, name text not null, public boolean not null default false
  )`);
  await client.query(health);
  await client.query(health);
});

afterAll(() => client.end());

describe("shared project settings", () => {
  it.each(["anon", "authenticated"])(
    "lets %s execute the database health probe without access to app data",
    async (role) => {
      await client.query("begin");
      try {
        await client.query(`set local role ${role}`);
        const { rows } = await client.query(
          "select public.portfolio_health() as health",
        );
        expect(rows).toEqual([{ health: "ok" }]);
        const denied = await client.query(`select nspname from pg_namespace
          where nspname in ('dash','dash_demo','wf','traces','rag','oauth')
            and has_schema_privilege(current_user, oid, 'usage')`);
        expect(denied.rows).toEqual([]);
      } finally {
        await client.query("rollback");
      }
    },
  );

  it("keeps the health function invoker-safe with a fixed search path", async () => {
    const { rows } = await client.query(`select prosecdef, provolatile, proconfig,
      exists (select from aclexplode(proacl) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_execute
      from pg_proc where oid = 'public.portfolio_health()'::regprocedure`);
    expect(rows).toEqual([
      {
        prosecdef: false,
        provolatile: "s",
        proconfig: ['search_path=""'],
        public_execute: false,
      },
    ]);
  });

  it("creates one private trace bucket and restores privacy on re-run", async () => {
    await client.query("begin");
    try {
      await client.query(storage);
      await client.query(`update storage.buckets set public = true
        where id = 'trace-payloads'`);
      await client.query(storage);
      const { rows } = await client.query(`select id, name, public
        from storage.buckets where id = 'trace-payloads'`);
      expect(rows).toEqual([
        { id: "trace-payloads", name: "trace-payloads", public: false },
      ]);
    } finally {
      await client.query("rollback");
    }
  });
});
