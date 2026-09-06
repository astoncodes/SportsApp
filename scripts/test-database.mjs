import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import postgres from 'postgres';

function validateTarget(ref, connection, appRefs) {
  if (!ref || !/^[a-z0-9]{20}$/.test(ref) || !connection)
    throw new Error(
      'Set SUPABASE_TEST_PROJECT_REF and SUPABASE_TEST_DB_URL for a separate, migrated test project with supabase/tests/fixtures/seed.sql loaded.',
    );
  if (!appRefs.some(Boolean))
    throw new Error(
      'Configure the app project reference before selecting a separate test project.',
    );
  let url;
  try {
    url = new URL(connection);
  } catch {
    throw new Error('Invalid test database connection string.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || appRefs.includes(ref))
    throw new Error('Database tests must target a separate test project, never the app project.');
  if (
    url.hostname !== `db.${ref}.supabase.co` &&
    !(
      url.hostname.endsWith('.pooler.supabase.com') &&
      decodeURIComponent(url.username) === `postgres.${ref}`
    )
  )
    throw new Error(
      'Test connection must identify SUPABASE_TEST_PROJECT_REF in its hostname or pooler username.',
    );
}
function verifyTap(lines) {
  const plan = lines.find((line) => /^1\.\.\d+$/.test(line));
  const results = lines.filter((line) => /^(not )?ok\b/.test(line));
  if (
    !plan ||
    Number(plan.slice(3)) !== results.length ||
    results.some((line) => line.startsWith('not ok'))
  )
    throw new Error('pgTAP assertions failed or the test plan was incomplete.');
  return results.length;
}
if (process.argv.includes('--self-test')) {
  const test = 'abcdefghijklmnopqrst',
    app = 'zyxfymvtijudbenqxzyf';
  assert.throws(() =>
    validateTarget(app, `postgres://postgres:password@db.${app}.supabase.co/postgres`, [app]),
  );
  assert.throws(() =>
    validateTarget(test, `postgres://postgres:password@db.${app}.supabase.co/postgres`, [app]),
  );
  assert.throws(() => validateTarget('', '', [app]));
  validateTarget(test, `postgres://postgres:password@db.${test}.supabase.co/postgres`, [app]);
  assert.equal(verifyTap(['1..2', 'ok 1 - owner', 'ok 2 - outsider']), 2);
  assert.throws(() => verifyTap(['1..2', 'ok 1', 'not ok 2']));
  assert.throws(() => verifyTap(['1..2', 'ok 1']));
  console.log('PASS: test-target isolation and pgTAP result validation.');
} else {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const ref = process.env.SUPABASE_TEST_PROJECT_REF;
  const connection = process.env.SUPABASE_TEST_DB_URL;
  const appRefs = [
    process.env.SUPABASE_PROJECT_REF,
    process.env.EXPO_PUBLIC_SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1],
    existsSync('supabase/.temp/project-ref')
      ? readFileSync('supabase/.temp/project-ref', 'utf8').trim()
      : undefined,
  ];
  validateTarget(ref, connection, appRefs);
  const sql = postgres(connection, {
    max: 1,
    ssl: 'require',
    prepare: false,
    connect_timeout: 15,
    onnotice: () => {},
  });
  try {
    let assertions = 0;
    for (const file of readdirSync('supabase/tests')
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      const results = await sql.unsafe(readFileSync(`supabase/tests/${file}`, 'utf8')).simple();
      const lines = [];
      function collect(value) {
        if (typeof value === 'string') lines.push(...value.split('\n'));
        else if (Array.isArray(value)) value.forEach(collect);
        else if (value && typeof value === 'object') Object.values(value).forEach(collect);
      }
      collect(results);
      try {
        assertions += verifyTap(lines);
      } catch (error) {
        console.error(file, lines.filter((line) => /^(not ok|#)/.test(line)).join('\n'));
        throw error;
      }
      console.log(`PASS: ${file}`);
    }
    console.log(`PASS: ${assertions} database assertions.`);
  } catch (error) {
    console.error(
      'Database checks failed. Verify the isolated test project has migrations and fixtures applied.',
      error.code ?? '',
    );
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}
