/**
 * Invokes a cron route with the right secret, so testing one never means
 * copying `CRON_SECRET` out of an env file by hand.
 *
 * Dev has no scheduler on purpose: a job firing at 08:00 while you are asleep
 * is the opposite of what you want when testing. Run the tick you care about,
 * when you care about it, against whichever fixtures are in place.
 *
 * Usage (the env file decides which secret is sent):
 *   node --env-file=.env.dev scripts/run-cron.mjs recurring-events?lead=1
 *   node --env-file=.env.dev scripts/run-cron.mjs daily-verse-reminders
 *   node --env-file=.env.dev scripts/run-cron.mjs recurring-events --url=https://…
 *
 * Defaults to http://localhost:3000, so `npm run dev` in another terminal is
 * the usual setup. `--url` points it at a deployment instead; note preview
 * deployments answer with a 302 to Vercel SSO until Deployment Protection is
 * turned off for previews.
 *
 * Never point this at production unless you mean it: these routes send real pushes
 * to every registered device.
 */
const args = process.argv.slice(2);
const route = args.find((a) => !a.startsWith('--'));
const urlFlag = args.find((a) => a.startsWith('--url='));

if (!route) {
  console.error(
    'Usage: node --env-file=.env.dev scripts/run-cron.mjs <route>[?query] [--url=BASE]\n' +
      '  e.g. recurring-events?lead=1',
  );
  process.exit(1);
}

const base = (urlFlag ? urlFlag.slice('--url='.length) : 'http://localhost:3000').replace(/\/$/, '');
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error('CRON_SECRET is not set — pass --env-file=.env.dev (or .env for production).');
  process.exit(1);
}

const target = `${base}/api/cron/${route}`;
console.log(`POST ${target}`);
console.log(`project: ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '(unknown)'}\n`);

const res = await fetch(target, {
  method: 'POST',
  headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
});

const body = await res.text();
if (res.status === 302 || res.status === 307) {
  console.error(`HTTP ${res.status} -> ${res.headers.get('location')}`);
  console.error('Deployment Protection is on for this deployment; disable it for previews.');
  process.exitCode = 1;
} else if (!res.ok) {
  console.error(`HTTP ${res.status}`);
  console.error(body.slice(0, 400));
  if (res.status === 401) {
    console.error('\n401 means the secret sent does not match the one that deployment holds.');
  }
  process.exitCode = 1;
} else {
  try {
    const json = JSON.parse(body);
    const { errors, ...summary } = json;
    console.log(JSON.stringify(summary, null, 2));
    if (Array.isArray(errors) && errors.length) {
      console.log(`\nerrors (${errors.length}):`);
      for (const e of errors.slice(0, 10)) console.log('  ', JSON.stringify(e));
    }
  } catch {
    console.log(body.slice(0, 600));
  }
}
