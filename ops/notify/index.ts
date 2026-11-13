// The notification sender for Message in a bottle. Runs inside the Bottle Supabase project.
//
//   { do: "bottle", auth, thread }   a member just added a bottle: tell the other members' phones
//   { do: "bottle", auth, thread, k: "l" }   the same, for a lantern lit for someone: the phones are told it is a lantern
//   { do: "lit", auth }              a phone just lit its lantern: send it a first notification, as proof
//   { do: "watch" }                  called every hour from inside the database: tell the owner if phones reported problems
//   { do: "key" }                    the public key browsers need to subscribe
//
// It never sees a note. A notification carries only the number of the conversation; the phone
// that receives it looks up, in its own memory, who that conversation is with.
// The private signing key is made here on first use and kept in a table nothing outside can read.

import { newVapid, send } from "./webpush.js";

const URL_ = Deno.env.get("SUPABASE_URL") ?? "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Who is sending, for the push services. Apple is known to refuse some web addresses here and is happy with a mail address.
// This is the project's public no-reply address on GitHub, the same one its commits carry.
const ABOUT = "mailto:msaco13@users.noreply.github.com";
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, apikey, authorization",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { ...cors, "content-type": "application/json" } });

async function rpc(fn: string, args: unknown) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: KEY, authorization: "Bearer " + KEY },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${fn} ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

let cached: { jwk: JsonWebKey; pub: string } | null = null;
async function vapid() {
  if (cached) return cached;
  let v = await rpc("vapid_init", { p_value: null });
  if (!v) v = await rpc("vapid_init", { p_value: await newVapid() });
  cached = v;
  return v;
}

type Sub = { endpoint: string; p256dh: string; auth: string };
// patient: the subscription may be seconds old, and a push service can call a brand-new one "gone" until it catches up.
async function tell(subs: Sub[], data: unknown, patient = false) {
  if (!subs || !subs.length) return { sent: 0, gone: 0, failed: 0, codes: [] as number[] };
  const v = await vapid();
  const list = subs.slice(0, 20);
  const once = (s: Sub) => send(s, data, v, ABOUT).catch(() => 0);
  const codes = await Promise.all(list.map(once));
  // A push service can hiccup. Anything that was not a clear yes or a clear "gone" gets one more try.
  for (let turn = 0; turn < (patient ? 3 : 1); turn++) {
    const again = codes.map((c, i) => (c === 0 || c === 429 || c >= 500 || (patient && (c === 404 || c === 410)) ? i : -1)).filter((i) => i >= 0);
    if (!again.length) break;
    await new Promise((r) => setTimeout(r, patient ? 2000 : 700));
    const second = await Promise.all(again.map((i) => once(list[i])));
    again.forEach((i, k) => { codes[i] = second[k]; });
  }
  const gone = list.filter((_, i) => codes[i] === 404 || codes[i] === 410).map((s) => s.endpoint);
  if (gone.length) await rpc("push_gone", { p_endpoints: gone }).catch(() => {});
  return { sent: codes.filter((c) => c >= 200 && c < 300).length, gone: gone.length, failed: codes.filter((c) => !(c >= 200 && c < 300) && c !== 404 && c !== 410).length, codes };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "post only" }, 405);
  try {
    const b = await req.json().catch(() => ({}));
    const ok = (s: unknown) => typeof s === "string" && /^[A-Za-z0-9_-]{22}$/.test(s);
    if (b.do === "key") return json({ key: (await vapid()).pub });
    if (b.do === "bottle" && ok(b.auth) && ok(b.thread)) {
      const subs = await rpc("push_plan", { p_auth: b.auth, p_thread: b.thread });
      const r = await tell(subs, b.k === "l" ? { t: b.thread, k: "l" } : { t: b.thread });
      return json({ sent: r.sent, failed: r.failed });
    }
    if (b.do === "lit" && ok(b.auth)) {
      const subs = await rpc("push_self", { p_auth: b.auth });
      const r = await tell(subs, { kind: "lit" }, true);
      return json({ sent: r.sent, failed: r.failed, codes: r.codes });
    }
    if (b.do === "watch") {
      const plan = await rpc("watch_plan", {});
      const r = await tell(plan.subs, { kind: "watch", text: `${plan.problems} problems on people's phones in the last day.` });
      return json({ problems: plan.problems, sent: r.sent });
    }
    return json({ error: "what?" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e).slice(0, 200) }, 500);
  }
});
