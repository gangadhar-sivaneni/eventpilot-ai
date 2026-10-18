// Applies the real migration to PGlite (Postgres in WASM) with a minimal Supabase auth stub, then checks RLS
// with two accounts. Runs offline in CI: npm run test:db. The live check against Supabase is worker/tests/test_rls.py.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../migrations/20261018000000_init.sql", import.meta.url), "utf8");
const db = new PGlite();

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text,
    raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
  -- Supabase's default privileges: API roles get everything, RLS decides
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);
await db.exec(migration);
console.log("migration applied OK");

const A = "00000000-0000-0000-0000-00000000000a", B = "00000000-0000-0000-0000-00000000000b";
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${A}', 'a@example.com', '{"full_name":"User A"}'), ('${B}', 'b@example.com', '{}')`);
// worker (superuser here = secret key) seeds catalogue
await db.exec(`insert into public.events (source_id, url, title, fee_status) values (2, 'https://e.com/1', 'Event One', 'unknown');
  insert into public.event_alerts (user_id, event_id, alert_type, message) values ('${B}', 1, 'new_event', 'for B');`);

let pass = 0, fail = 0;
async function as(uid, sql) {
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);
                 select set_config('request.jwt.claims', '{"sub":"${uid}"}', false);`);
  try { return { rows: (await db.query(sql)).rows }; } catch (e) { return { error: e.message }; } finally { await db.exec("reset role"); }
}
function check(name, ok, detail) { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : "  -> " + JSON.stringify(detail)}`); }

let r;
r = await as(A, "select user_id, full_name from profiles"); check("signup trigger + A sees only own profile", r.rows?.length === 1 && r.rows[0].full_name === "User A", r);
r = await as(A, `select * from user_preferences`); check("A has default preferences", r.rows?.length === 1, r);
r = await as(A, `update profiles set full_name = 'hacked' where user_id = '${B}' returning *`); check("A cannot update B profile", r.rows?.length === 0, r);
r = await as(A, `update profiles set full_name = 'Asha', city = 'Hyderabad' where user_id = '${A}' returning full_name`); check("A updates own profile", r.rows?.[0]?.full_name === "Asha", r);
r = await as(A, `update profiles set email = 'x@evil.com' where user_id = '${A}'`); check("A cannot change own email", !!r.error, r);
r = await as(A, `update profiles set phone = 'abc' where user_id = '${A}'`); check("phone check constraint", !!r.error, r);
r = await as(A, `insert into profiles (user_id, email) values ('${A}', 'z@z.com')`); check("A cannot insert profiles", !!r.error, r);
r = await as(A, `insert into registration_answers (question, answer) values ('Why join?', 'Learn') returning user_id`); check("A adds own answer (user_id defaults)", r.rows?.[0]?.user_id === A, r);
r = await as(A, `insert into registration_answers (user_id, question, answer) values ('${B}', 'Inject?', 'x')`); check("A cannot insert answer as B", !!r.error, r);
r = await as(B, `select * from registration_answers`); check("B cannot read A answers", r.rows?.length === 0, r);
r = await as(A, `select * from events`); check("events readable", r.rows?.length === 1, r);
r = await as(A, `insert into events (source_id, url, title) values (2, 'https://evil.com', 'Fake')`); check("A cannot write events", !!r.error, r);
r = await as(A, `update events set title = 'x' returning *`); check("A cannot update events", !r.rows?.length, r);
r = await as(A, `select * from event_sources`); check("event_sources admin-only", r.rows?.length === 0, r);
r = await as(A, `insert into automation_jobs (kind) values ('discovery')`); check("A cannot enqueue jobs", !!r.error, r);
r = await as(A, `select * from event_alerts`); check("A cannot see B alerts", r.rows?.length === 0, r);
r = await as(B, `update event_alerts set read_at = now() returning id`); check("B marks own alert read", r.rows?.length === 1, r);
r = await as(B, `update event_alerts set message = 'x'`); check("B cannot edit alert message", !!r.error, r);
r = await as(A, `insert into registrations (event_id) values (1) returning status, user_id`); check("A starts registration", r.rows?.[0]?.status === "not_started" && r.rows[0].user_id === A, r);
r = await as(A, `insert into registrations (event_id, status) values (1, 'confirmed')`); check("A cannot insert with status", !!r.error, r);
r = await as(A, `update registrations set status = 'confirmed'`); check("A cannot set status", !!r.error, r);
r = await as(A, `update registrations set evidence = 'fake'`); check("A cannot forge evidence", !!r.error, r);
r = await as(A, `update registrations set approved_at = now(), proposed_answers = '[]', unresolved_fields = '[]' returning id`); check("A approves own registration", r.rows?.length === 1, r);
r = await as(B, `update registrations set approved_at = now() returning id`); check("B cannot approve A registration", r.rows?.length === 0, r);
r = await as(A, `insert into registrations (event_id) values (1)`); check("duplicate registration blocked", /duplicate|unique/i.test(r.error ?? ""), r);
await db.exec(`update registrations set status = 'submitted'`);
r = await as(A, `delete from registrations returning id`); check("A cannot delete submitted registration", r.rows?.length === 0, r);
r = await as(A, `select * from audit_logs`); check("audit readable (own only)", Array.isArray(r.rows), r);

await db.exec(`insert into automation_jobs (kind, scope) values ('discovery', 'devpost')`);
try { await db.exec(`insert into automation_jobs (kind, scope) values ('discovery', 'devpost')`); check("job lock", false, "second running job allowed"); }
catch { check("one running job per kind+scope", true); }
try { await db.exec(`insert into events (source_id, url, title, fee_status, fee_amount) values (2, 'https://e.com/2', 'Free one', 'free', 50)`); check("free with amount rejected", false, "allowed"); }
catch { check("free event cannot have a fee amount", true); }

r = await as(A, `select delete_my_account()`); check("A deletes own account", !r.error, r);
const left = await db.query(`select (select count(*) from auth.users where id = '${A}') u, (select count(*) from profiles where user_id = '${A}') p, (select count(*) from registrations) r`);
check("delete cascades profile + registrations", left.rows[0].u === 0 && left.rows[0].p === 0 && left.rows[0].r === 0, left.rows);
r = await as(B, `select * from profiles`); check("B unaffected", r.rows?.length === 1, r);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
