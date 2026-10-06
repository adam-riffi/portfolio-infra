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
const bootstrap = sql("bootstrap.sql");
const client = new pg.Client({ connectionString: url });

beforeAll(async () => {
  await client.connect();
  // Make this file independently runnable; bootstrap itself is idempotent.
  await client.query(bootstrap);
  for (const role of ["anon", "authenticated"])
    await client.query(
      `grant ${role} to current_user with set true, inherit false`,
    );
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
    const { rows } = await client.query(`select p.prosecdef, p.provolatile,
      p.proconfig, coalesce(array_agg(r.rolname order by r.rolname)
        filter (where a.privilege_type = 'EXECUTE'), '{}'::text[])
        as execute_grantees
      from pg_proc p
      left join lateral aclexplode(p.proacl) a on true
      left join pg_roles r on r.oid = a.grantee
      where p.oid = 'public.portfolio_health()'::regprocedure
      group by p.oid`);
    expect(rows).toEqual([
      {
        prosecdef: false,
        provolatile: "s",
        proconfig: ['search_path=""'],
        execute_grantees: ["anon", "authenticated"],
      },
    ]);
  });

  it("creates one private trace bucket and restores privacy on re-run", async () => {
    await client.query("begin");
    try {
      // The CI image correctly reserves storage's managed owner role. Exercise
      // the exact upsert in a transaction-scoped schema owned by local postgres.
      expect(storage).toContain(
        "insert into storage.buckets (id, name, public)",
      );
      await client.query("create schema settings_fixture");
      await client.query(`create table settings_fixture.buckets (
        id text primary key,
        name text not null,
        public boolean not null default false
      )`);
      const fixture = storage.replaceAll(
        "storage.buckets",
        "settings_fixture.buckets",
      );
      await client.query(fixture);
      await client.query(`update settings_fixture.buckets set public = true
        where id = 'trace-payloads'`);
      await client.query(fixture);
      const { rows } = await client.query(`select id, name, public
        from settings_fixture.buckets where id = 'trace-payloads'`);
      expect(rows).toEqual([
        { id: "trace-payloads", name: "trace-payloads", public: false },
      ]);
    } finally {
      await client.query("rollback");
    }
  });
});
