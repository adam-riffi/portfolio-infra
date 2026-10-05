import { fileURLToPath } from "node:url";
import postgres from "postgres";
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
const sql = postgres(url, { max: 1, onnotice: () => {} });
const bootstrap = fileURLToPath(
  new URL("../../supabase/bootstrap.sql", import.meta.url),
);

/** Read-write app roles and their schema (DESIGN.md §8). */
const WRITERS = {
  dash_app: "dash",
  wf_app: "wf",
  traces_app: "traces",
  rag_app: "rag",
  oauth_app: "oauth",
} as const;
const SCHEMAS = ["dash", "dash_demo", "wf", "traces", "rag", "oauth"];
const ROLES = [...Object.keys(WRITERS), "dash_reader"];

class Rollback extends Error {}

/** Runs `query` as `role` in a transaction that is always rolled back. */
async function as<T>(
  role: string,
  query: (tx: postgres.TransactionSql) => Promise<T>,
) {
  let result: T | undefined;
  await sql
    .begin(async (tx) => {
      await tx.unsafe(`set local role ${role}`);
      result = await query(tx);
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
  return result as T;
}

beforeAll(async () => {
  // Twice: the script must be safe to re-run in the SQL editor.
  await sql.file(bootstrap);
  await sql.file(bootstrap);
  // As in the hosted project, postgres is not a superuser: it holds ADMIN on the roles it
  // created but may not SET ROLE to them. The test session grants itself that, the bootstrap
  // does not.
  for (const role of ROLES) {
    await sql.unsafe(
      `grant ${role} to current_user with set true, inherit false`,
    );
  }
});

afterAll(() => sql.end());

describe("bootstrap.sql", () => {
  it("creates every app schema, login role and extension", async () => {
    const schemas =
      await sql`select nspname from pg_namespace where nspname = any(${SCHEMAS})`;
    expect(schemas.map((s) => s.nspname).sort()).toEqual([...SCHEMAS].sort());
    const roles =
      await sql`select rolname, rolcanlogin from pg_roles where rolname = any(${ROLES})`;
    expect(roles.map((r) => [r.rolname, r.rolcanlogin]).sort()).toEqual(
      ROLES.map((r) => [r, true]).sort(),
    );
    const extensions = await sql`select extname from pg_extension`;
    expect(extensions.map((e) => e.extname)).toEqual(
      expect.arrayContaining(["pg_cron", "pg_net", "vector"]),
    );
  });

  it.each(Object.entries(WRITERS))(
    "%s creates, writes and reads tables in %s",
    async (role, schema) => {
      const rows = await as(role, async (tx) => {
        await tx.unsafe(`create table ${schema}.probe (id int)`);
        await tx.unsafe(`insert into ${schema}.probe values (1)`);
        return tx.unsafe(`select id from ${schema}.probe`);
      });
      expect(rows.map((r) => r.id)).toEqual([1]);
    },
  );

  const foreign = ROLES.flatMap((role) =>
    SCHEMAS.filter(
      (schema) =>
        WRITERS[role as keyof typeof WRITERS] !== schema &&
        !(role === "dash_reader" && schema === "dash_demo"),
    ).map((schema) => [role, schema]),
  );

  it.each(foreign)("%s cannot use %s", async (role, schema) => {
    await expect(
      as(role, (tx) => tx.unsafe(`select 1 from ${schema}.anything`)),
    ).rejects.toThrow(`permission denied for schema ${schema}`);
    await expect(
      as(role, (tx) => tx.unsafe(`create table ${schema}.intruder (id int)`)),
    ).rejects.toThrow(`permission denied for schema ${schema}`);
  });

  it("lets app roles use the tables that migrations create as postgres", async () => {
    await sql`create table if not exists dash.migrated (id int)`;
    await sql`create table if not exists dash_demo.migrated (id int)`;
    await sql`truncate dash_demo.migrated`;
    await sql`insert into dash_demo.migrated values (7)`;
    const written = await as("dash_app", async (tx) => {
      await tx`insert into dash.migrated values (1)`;
      return tx`select id from dash.migrated`;
    });
    expect(written.map((r) => r.id)).toEqual([1]);
    const read = await as(
      "dash_reader",
      (tx) => tx`select id from dash_demo.migrated`,
    );
    expect(read.map((r) => r.id)).toEqual([7]);
  });

  it("keeps dash_reader read-only on dash_demo", async () => {
    await sql`create table if not exists dash_demo.migrated (id int)`;
    await expect(
      as("dash_reader", (tx) => tx`insert into dash_demo.migrated values (2)`),
    ).rejects.toThrow("permission denied for table migrated");
    await expect(
      as("dash_reader", (tx) =>
        tx.unsafe("create table dash_demo.intruder (id int)"),
      ),
    ).rejects.toThrow("permission denied for schema dash_demo");
  });

  it.each(["anon", "authenticated"])(
    "keeps the Data API role %s out of every app schema",
    async (role) => {
      for (const schema of SCHEMAS) {
        await expect(
          as(role, (tx) => tx.unsafe(`select 1 from ${schema}.anything`)),
        ).rejects.toThrow(`permission denied for schema ${schema}`);
      }
    },
  );
});
