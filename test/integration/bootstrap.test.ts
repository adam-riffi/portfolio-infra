import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:54322/postgres";
// The bootstrap creates roles and schemas: never against anything but a local database.
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) {
  throw new Error(
    "Refusing to run the bootstrap tests outside a local database",
  );
}
const client = new pg.Client({ connectionString: url });
const bootstrap = readFileSync(
  new URL("../../supabase/bootstrap.sql", import.meta.url),
  "utf8",
);
const query = async (text: string) => (await client.query(text)).rows;

/** Read-write app roles and their schema (DESIGN.md §8). */
const WRITERS: Record<string, string> = {
  dash_app: "dash",
  wf_app: "wf",
  traces_app: "traces",
  rag_app: "rag",
  oauth_app: "oauth",
};
const SCHEMAS = ["dash", "dash_demo", "wf", "traces", "rag", "oauth"];
const ROLES = [...Object.keys(WRITERS), "dash_reader"];
const list = (names: string[]) => names.map((n) => `'${n}'`).join(", ");

/** Runs `run` as `role` in a transaction that is always rolled back. */
async function as<T>(role: string, run: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    await client.query(`set local role ${role}`);
    return await run();
  } finally {
    await client.query("rollback");
  }
}

beforeAll(async () => {
  await client.connect();
  // Twice: the script must be safe to re-run in the SQL editor.
  await client.query(bootstrap);
  await client.query(bootstrap);
  // As in the hosted project, postgres is not a superuser: it holds ADMIN on the roles it
  // created but may not SET ROLE to them. The test session grants itself that, the bootstrap
  // does not.
  for (const role of ROLES) {
    await client.query(
      `grant ${role} to current_user with set true, inherit false`,
    );
  }
});

afterAll(() => client.end());

describe("bootstrap.sql", () => {
  it("creates every app schema, login role and extension", async () => {
    const schemas = await query(
      `select nspname from pg_namespace where nspname in (${list(SCHEMAS)})`,
    );
    expect(schemas.map((s) => s.nspname).sort()).toEqual([...SCHEMAS].sort());
    const roles = await query(
      `select rolname, rolcanlogin from pg_roles where rolname in (${list(ROLES)})`,
    );
    expect(roles.map((r) => [r.rolname, r.rolcanlogin]).sort()).toEqual(
      ROLES.map((r) => [r, true]).sort(),
    );
    const extensions = await query("select extname from pg_extension");
    expect(extensions.map((e) => e.extname)).toEqual(
      expect.arrayContaining(["pg_cron", "pg_net", "vector"]),
    );
  });

  it("refuses to run as anyone but postgres", async () => {
    await expect(as("dash_app", () => client.query(bootstrap))).rejects.toThrow(
      "Run bootstrap.sql as postgres",
    );
  });

  it.each(Object.entries(WRITERS))(
    "%s creates, writes and reads tables in %s",
    async (role, schema) => {
      const rows = await as(role, async () => {
        await query(
          `create table ${schema}.probe (id serial primary key, v int)`,
        );
        await query(`insert into ${schema}.probe (v) values (1)`);
        return query(`select v from ${schema}.probe`);
      });
      expect(rows.map((r) => r.v)).toEqual([1]);
    },
  );

  const foreign = ROLES.flatMap((role) =>
    SCHEMAS.filter(
      (schema) =>
        WRITERS[role] !== schema &&
        !(role === "dash_reader" && schema === "dash_demo"),
    ).map((schema) => [role, schema]),
  );

  it.each(foreign)("%s cannot use %s", async (role, schema) => {
    await expect(
      as(role, () => query(`select 1 from ${schema}.anything`)),
    ).rejects.toThrow(`permission denied for schema ${schema}`);
    await expect(
      as(role, () => query(`create table ${schema}.intruder (id int)`)),
    ).rejects.toThrow(`permission denied for schema ${schema}`);
  });

  it("lets app roles use the tables and sequences that migrations create as postgres", async () => {
    await query("drop table if exists dash.migrated, dash_demo.migrated");
    await query("create table dash.migrated (id serial primary key, v int)");
    await query("create table dash_demo.migrated (id int)");
    await query("insert into dash_demo.migrated values (7)");
    const written = await as("dash_app", () =>
      query("insert into dash.migrated (v) values (1) returning id"),
    );
    expect(written).toHaveLength(1);
    const read = await as("dash_reader", () =>
      query("select id from dash_demo.migrated"),
    );
    expect(read.map((r) => r.id)).toEqual([7]);
  });

  it("keeps dash_reader read-only on dash_demo", async () => {
    await query("create table if not exists dash_demo.migrated (id int)");
    await expect(
      as("dash_reader", () =>
        query("insert into dash_demo.migrated values (2)"),
      ),
    ).rejects.toThrow("permission denied for table migrated");
    await expect(
      as("dash_reader", () =>
        query("create table dash_demo.intruder (id int)"),
      ),
    ).rejects.toThrow("permission denied for schema dash_demo");
  });

  it("keeps a migration's revoke when the bootstrap runs again", async () => {
    // Migration history tables are created as postgres; apps revoke their role's access.
    await query("create table if not exists dash.history (id int)");
    await query("revoke all on dash.history from dash_app");
    await client.query(bootstrap);
    await expect(
      as("dash_app", () => query("select id from dash.history")),
    ).rejects.toThrow("permission denied for table history");
  });

  it("lets rag_app use vector types in its own schema", async () => {
    const rows = await as("rag_app", async () => {
      await query("create table rag.embeddings (e rag.vector(3))");
      await query("insert into rag.embeddings values ('[1,2,3]')");
      return query(
        "select e operator(rag.<->) '[1,2,4]'::rag.vector as d from rag.embeddings",
      );
    });
    expect(Number(rows[0]?.d)).toBe(1);
  });

  it("lets wf_app call pg_net", async () => {
    const [grant] = await query(`select
      has_schema_privilege('wf_app', 'net', 'usage') as usage,
      bool_and(has_function_privilege('wf_app', p.oid, 'execute')) as execute
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'net'`);
    expect(grant).toEqual({ usage: true, execute: true });
  });

  it.each(["anon", "authenticated", "service_role"])(
    "keeps the Data API role %s out of every app schema",
    async (role) => {
      for (const schema of SCHEMAS) {
        await expect(
          as(role, () => query(`select 1 from ${schema}.anything`)),
        ).rejects.toThrow(`permission denied for schema ${schema}`);
      }
    },
  );
});
