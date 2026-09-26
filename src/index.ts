interface McpToolDefinition {
  name: string;
  description: string;
  /** Human-facing one-liner (fleet #1967). Optional; consumers fall back to
   *  description. Kept in step with shared/src/types.ts — scripts/lib/
   *  check-inlined-types.mjs reports drift at publish time. */
  summary?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    anyOf?: Array<{ required: string[] }>;
    oneOf?: Array<{ required: string[] }>;
    allOf?: Array<{ required: string[] }>;
  };
  outputSchema?: Record<string, unknown>;
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Was this failure OUR OWN web service? — the other half of `internal-db-class.ts`.
 *
 * fleet #1089 pulled failures from our own Postgres out of `upstream_down` by
 * keying on the SQLSTATE inside PostgREST's four-key error envelope. That
 * covered the majority and structurally could not cover the rest: the rest
 * never reach Postgres, so they carry no SQLSTATE. What was left, measured over
 * the 24h to 2026-09-02T15:00Z (fleet #1096):
 *
 *     5  pipeworx-catalog  get_pack_tools     Pipeworx catalog error: 522 — error code: 522
 *     3  fleet             fleet_list_open …  upstream_down: Fleet task queue did not respond within 25s
 *
 * 521/522/523/526 are Cloudflare saying its edge could not reach an ORIGIN, and
 * in both of those rows the origin is ours — `gateway.pipeworx.io` for the
 * catalog pack (it self-fetches when the gateway hasn't injected a manifest),
 * our own Supabase for fleet. There is no third party anywhere in either call.
 * Same defect as #1089: our own outage filed under `upstream_down`, the one
 * class that means "the source is unreachable and there is nothing for us to
 * fix", which is why the problem-tools triage skips it.
 *
 * WHY NOT A WORDING RULE. The obvious fix is to match `fleet db error:` and
 * `Pipeworx catalog error:` in classifyToolError. Each is emitted from exactly
 * one site today, so it would work today. It would also rot the first time
 * somebody rewords a label — silently, and in the direction of hiding our own
 * outage, which is worse than the bug being fixed. Every prose rule in
 * error-class.ts has needed widening as packs invented new wording (#409/#450/
 * #584); that history is most of that file's comment budget.
 *
 * WHAT THIS KEYS ON INSTEAD: **the host the call actually reached.** A URL's
 * hostname is a fact about the call, not a guess about its prose. Two
 * consequences that a pack-level flag could not give us, and the reason the
 * flag was rejected:
 *
 *   - It describes the CALL, not the pack. `govcon-intel` fans out to our own
 *     Supabase AND to genuine third parties; `court-listener` holds our cache
 *     in Supabase and fetches courtlistener.com. An `internallyHosted: true` on
 *     either pack would relabel a real third-party outage as ours — inventing
 *     work, which is the same class of error in the opposite direction.
 *   - It covers every future internal pack for free, instead of one declared
 *     slug at a time.
 *
 * WHY IT SURVIVES A REWORD. The marker below is not matched as a literal by two
 * separate files. `markInternalOrigin()` writes it and `internalHostMetricsClass()`
 * reads it, both from the single exported `INTERNAL_ORIGIN_MARKER` constant in
 * this module — so changing the wording changes both sides in the same edit and
 * cannot desynchronise them. The pack's own label (`fleet db error:`,
 * `Pipeworx catalog error:`) is not read at all: reword it freely, the class is
 * unaffected. That is the property `stripClassPrefix` lacked when it drifted
 * from its own classifier three times and needed a CI gate to hold them
 * together.
 *
 * WHERE THE 5xx TEST LIVES. `markInternalOrigin` is called from the places that
 * hold the real `Response` — `httpError`/`httpErrorMessage` and the timeout
 * branch of `fetchWithTimeout` in `shared/src/http.ts` — so "is this an
 * availability failure" is decided from the actual status code, never re-derived
 * by scraping a number out of a sentence. A 404 from our own registry for a slug
 * that does not exist is a caller's bad argument and is deliberately NOT marked.
 */

/**
 * OUR OWN web service was unreachable — not an upstream, and never `upstream_down`.
 *
 * ONE value, not three, unlike `internal_db_*`. That split existed because a
 * slow query, an exhausted pool and an unknown SQLSTATE have different owners
 * and different fixes. Here there is only one story to tell — an origin we run
 * did not answer the edge — and one owner. A bucket with no distinct owner per
 * value is decoration; #724 is what happens when a class holds several
 * situations, and inventing sub-values ahead of a reason to act on them
 * differently is the same mistake with the sign flipped.
 *
 * METRICS ONLY, exactly like PLATFORM_KEY_ERROR_CLASS and the internal_db
 * values. `classifyToolError` still answers `upstream_down` for the retry and
 * hint paths, which only care whether retrying or a sibling tool might work —
 * and it might. Nothing a caller sees or is charged changes here.
 *
 * READ SIDE: this value is in BROKEN_TOOL_CLASSES, FAULT_CLASSES and
 * ALL_ERROR_CLASSES in `workers/registry-api/src/index.ts`. All three, or it
 * lands on no dashboard — fleet #721 is the warning, where the #719 split
 * worked on the write side and was invisible for weeks.
 */
const INTERNAL_SERVICE_UNREACHABLE_CLASS = 'internal_service_unreachable';

/**
 * The token that carries "this origin is ours" from the call site to the
 * classifier.
 *
 * Appended to the error message rather than attached to the Error object,
 * because the object does not survive the trip: 275 packs return `{ error:
 * string }` instead of throwing, the gateway reads `observedError` as a string,
 * and the fleet pack rebuilds its error from a captured status + body across a
 * retry loop. A property on an Error would be dropped by every one of those
 * paths and the class would work in tests and vanish in production.
 *
 * WORDING IS LOAD-BEARING, same rule as labelAge's note in authority.ts. This
 * string is appended to a pack's thrown Error message (shared/src/http.ts),
 * and a thrown Error's message is exactly what the gateway hands back to the
 * caller as `content[0].text` when nothing rewrites it (workers/gateway/src
 * catches the throw and sets `rawResult.message = stripClassPrefix(error)`,
 * which does not touch this suffix) — so the original wording,
 * " [pipeworx-hosted origin — our own service, not a third party]", was not a
 * theoretical leak: it shipped live on pipeworx-catalog's 522s, 7 times in 6
 * hours on 2026-09-02 (see tests/golden-internal-service.test.ts), verbatim
 * naming Pipeworx as the host. check:hosting-claims never caught it because it
 * did not scan shared/ at all (task #2009). Reworded to describe the
 * OBSERVATION (the origin did not answer) without a claim about who runs it —
 * the identical fix labelAge got: drop the possessive, keep the fact.
 */
const INTERNAL_ORIGIN_MARKER = ' [origin did not respond — retry before concluding the named source is down]';

/**
 * Supabase's data plane for a project is `<ref>.supabase.co`, where the ref is
 * exactly twenty lowercase letters (ours is `pqauisounztsgdgfkhke`).
 *
 * Matching the shape rather than listing the ref keeps this correct when we add
 * a project — `supabaseEnv` on a pack entry already points some packs at a
 * second one — while still excluding `status.supabase.co`, which is Supabase's
 * own status page and emphatically not our database. Verified 2026-09-02 by
 * `grep -rhoE '[a-z0-9-]+\.supabase\.(co|in)' mcps shared workers scripts`: the
 * only real project ref anywhere in the tree is ours, the rest are doc
 * placeholders (`abc`, `xyz`, `example`) which this pattern also excludes. Same
 * finding internal-db-class.ts relies on for the PostgREST envelope being ours
 * by construction.
 */
const SUPABASE_PROJECT_HOST = /^[a-z]{20}\.supabase\.(co|in)$/;

/**
 * Is this a host WE run?
 *
 * Deliberately NOT including `*.workers.dev`: plenty of third-party APIs are
 * hosted on workers.dev, so the suffix says where something runs and not who
 * owns it. Every internal call we actually make goes to a `pipeworx.io`
 * hostname or to our Supabase project, both of which are ownership facts.
 *
 * `workers/gateway/src/provenance.ts`'s `OUR_HOSTS` answers the same
 * question and DOES include `workers.dev` — a documented divergence
 * (task #2051), not a bug to converge. That list decides what a response may
 * cite as a data SOURCE, where a false negative (citing our own worker as an
 * external source) is the hosting-disclosure leak this whole file exists to
 * prevent, so it errs broad. This one decides who gets BLAMED for a 5xx in
 * outage metrics read by on-call, where a false positive (crediting our own
 * infra with a third party's outage) hides the real failure, so it errs
 * narrow. Same suffix, opposite direction, because they are never called for
 * the same reason.
 *
 * Returns false on anything unparseable rather than throwing — this runs inside
 * an error path, and an error path that can itself throw turns a diagnosable
 * failure into a mystery.
 */
function isPipeworxOrigin(url: string | URL | undefined | null): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url instanceof URL ? url.href : url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === 'pipeworx.io' || host.endsWith('.pipeworx.io')) return true;
  return SUPABASE_PROJECT_HOST.test(host);
}

/**
 * Append the marker when this failure was OUR origin failing to answer.
 *
 * `status` is the HTTP status when there is one, and omitted for a timeout —
 * where there is no response at all, and "the origin did not answer" is the
 * whole observation. Statuses below 500 are left alone: a 404 from our own
 * registry for a slug that does not exist is the caller's argument, not our
 * outage, and marking it would put ordinary 404s on the incident dashboard.
 *
 * Idempotent, so a message that is wrapped and re-marked on the way up (the
 * fleet pack's retry loop re-throws through two layers) carries the marker once.
 */
function markInternalOrigin(
  message: string,
  url: string | URL | undefined | null,
  status?: number,
): string {
  if (status !== undefined && status < 500) return message;
  if (!isPipeworxOrigin(url)) return message;
  if (message.includes(INTERNAL_ORIGIN_MARKER)) return message;
  return message + INTERNAL_ORIGIN_MARKER;
}

/**
 * Which blob4 value a failure from our own web services books as, or undefined
 * if this is not one.
 *
 * Ordered AFTER `internalDbMetricsClass` at the call site: a PostgREST envelope
 * from our own Supabase is a strictly more specific statement about the same
 * row (which of our services, and why), and the two cannot disagree about
 * whether the failure is ours.
 */
function internalHostMetricsClass(error: string): string | undefined {
  return error.includes(INTERNAL_ORIGIN_MARKER) ? INTERNAL_SERVICE_UNREACHABLE_CLASS : undefined;
}


/**
 * One place to turn a failed `fetch` into an error a caller can act on.
 *
 * Nearly every pack was written the same way:
 *
 *     if (!res.ok) throw new Error(`Unsplash: ${res.status}`);
 *
 * which discards the response body — and the body is usually where the upstream
 * says what was actually wrong ("**symbol** not found: GBP", "parameter `year`
 * out of range", "unknown taxonomy id"). The caller gets a number, cannot
 * self-correct, and retries the same broken call. A 2026-07-31 sweep found this
 * shape in 481 of 1,400 packs, 47 of them PLATFORM-keyed.
 *
 * It also hides bugs one level down. Two of the first three packs audited had a
 * second defect that only existed because of this line: unsplash's rate-limit
 * branch sat BELOW a catch-all and was unreachable, and bea-gov parsed
 * `BEAAPI.Error.APIErrorDescription` below a `!res.ok` throw that made the
 * parsing dead code for every non-200.
 *
 * DELIBERATELY NOT A CLASSIFIER. It does not add `user_error:` /
 * `upstream_down:` prefixes. Those decide which tier a failure lands in, and the
 * `error` tier is what the daily problem-tools list is built from — it means
 * "Pipeworx has a defect". A 400 is genuinely ambiguous: often a caller's bad
 * argument, but sometimes a query WE built wrong (ted-eu comma-joined its CPV
 * values into something TED rejected, and that bug was found only because it sat
 * in `error`). Blanket-classifying 400s as caller mistakes would have hidden it.
 * A pack that KNOWS which it is should keep saying so explicitly; this helper is
 * for the 481 that say nothing at all.
 */

/** Longest upstream explanation we'll pass through. Enough for a real message,
 *  short enough that an HTML page or a stack trace can't swamp the error. */

const MAX_DETAIL = 300;

/**
 * Default bound for `fetchWithTimeout` when a pack doesn't state its own.
 *
 * 25s mirrors the number `epo-ops` landed on after measuring the real failure:
 * a degraded upstream that doesn't error, it just never answers, and a Worker
 * sits in `await fetch()` until ITS OWN execution budget kills the request —
 * which can take minutes, not seconds (epo_ops_search_patents measured 4-8
 * MINUTE hangs before this existed). 25s is short enough that a caller gets a
 * fast, actionable error instead of holding the connection, and long enough
 * that it doesn't false-trip on a merely-slow-but-alive upstream.
 */
const DEFAULT_FETCH_TIMEOUT_MS = 25_000;

/**
 * Read the body of a failed response and fold it into a throwable Error.
 *
 * Usage — note the `await`, which is the one thing that makes this a mechanical
 * change rather than a drop-in:
 *
 *     if (!res.ok) throw await httpError(res, 'Unsplash');
 *
 * Safe to call on any non-ok response: a body that is missing, empty, unreadable
 * or HTML degrades to exactly the old `Name: 404` string rather than throwing
 * something new from inside the error path.
 */
async function httpError(res: Response, name: string): Promise<Error> {
  return new Error(await httpErrorMessage(res, name));
}

/** The message text without constructing an Error — for packs that need to wrap
 *  it in their own envelope or add an explicit classification prefix. */
async function httpErrorMessage(res: Response, name: string): Promise<string> {
  // The one place a 5xx from a host WE run gets stamped as ours. `res.url` is
  // the URL the fetch actually resolved to (after redirects), so this is a fact
  // about the call rather than a guess from the `name` the pack passed in —
  // reword that label freely, the class does not move. See
  // internal-host-class.ts; no-op for every third-party upstream, which is why
  // this touches 481 packs' error text and changes none of it.
  return markInternalOrigin(
    `${name}: ${res.status}${detailSuffix(await readDetail(res))}`,
    res.url,
    res.status,
  );
}

/**
 * Just the upstream's own explanation — no name, no status.
 *
 * For a pack that has already said both in its own sentence. epo-ops reads
 * `EPO rejected this search as too large (HTTP 413) — ${httpErrorMessage(…)}`,
 * which rendered as `… (HTTP 413) — EPO: 413.` once the XML detail was being
 * dropped: the upstream named twice, the status twice, and the one thing EPO
 * actually said ("Not enough characters before truncation character") nowhere
 * (fleet #712). Returns '' when the body carries nothing readable, so a caller
 * can fall back to its own wording.
 */
async function upstreamDetail(res: Response): Promise<string> {
  return readDetail(res);
}

/**
 * Read a SUCCESSFUL response as JSON, failing loudly when it isn't JSON.
 *
 * `httpError` above only ever runs on `!res.ok`, which leaves the nastier half
 * of the problem unhandled: an upstream that answers **HTTP 200 with an HTML
 * page**. A bot wall, a login redirect, a maintenance interstitial and a CDN
 * error page are all 200s, so `res.ok` is true, and `res.json()` then throws
 * `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
 *
 * That string is the problem. It names no upstream, carries no status, and
 * reads like a parser bug in Pipeworx — so it lands in the `error` tier, which
 * means "we have a defect", and the caller is told nothing they can act on.
 * data.govt.nz sat dead behind an Imperva challenge this way and every
 * status-code health check we own reported it green (7889a845). A zero-length
 * body has the same shape: `Unexpected end of JSON input`, seen this week on
 * uk-gazette (83% of external calls) and census.
 *
 * UNLIKE `httpError`, this one DOES classify, and the asymmetry is deliberate.
 * A 400 is genuinely ambiguous — often the caller's bad argument, sometimes a
 * query we built wrong — so blanket-classifying it would hide our own bugs.
 * There is no such ambiguity here: **no argument a caller can pass makes a JSON
 * API return an HTML page.** It is always the upstream, so `upstream_down:` is
 * a statement of fact rather than a guess, and it keeps these out of the
 * problem-tools list where they crowd out real defects.
 *
 *     const data = await parseJson<Feed>(res, 'UK Gazette');
 *
 * Call it only after the `!res.ok` check — on a failed response you want
 * `httpError`, which mines the body for the upstream's own explanation.
 */
async function parseJson<T>(res: Response, name: string): Promise<T> {
  let raw: string;
  try {
    raw = await res.text();
  } catch {
    throw new Error(
      `upstream_down: ${name} returned a body that could not be read (HTTP ${res.status}). ` +
        'The connection most likely dropped mid-response; retrying is reasonable.',
    );
  }

  const type = res.headers.get('content-type') ?? 'no content-type';

  if (!raw.trim()) {
    throw new Error(
      `upstream_down: ${name} answered HTTP ${res.status} with an EMPTY body where JSON was expected (${type}). ` +
        'Nothing about the request can cause this — it is an upstream fault, and the same call may well work on retry.',
    );
  }

  // Checked before parsing rather than in the catch, because knowing it is
  // markup is what turns "we failed to parse something" into "they served a
  // web page" — the second is diagnosable, the first is not.
  const head = raw.slice(0, 200).trimStart().toLowerCase();
  if (head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<?xml')) {
    const kind = head.startsWith('<?xml') ? 'an XML document' : 'an HTML page';
    // The summary, not the source. Pasting the first 120 characters of a web
    // page handed the agent `<!DOCTYPE html><html lang="en"…` — the same leak
    // this branch exists to describe (fleet #712).
    throw new Error(
      `upstream_down: ${name} answered HTTP ${res.status} with ${kind} instead of JSON (${type}). ` +
        'That is typically a bot wall, a login redirect or a maintenance page — it is returned as a SUCCESS, ' +
        `so status-code health checks read it as fine. No argument change will get past it. ` +
        `The page says: ${summarizeErrorBody(raw) || 'nothing readable'}`,
    );
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(
      `upstream_down: ${name} answered HTTP ${res.status} with a body that is not valid JSON (${type}). ` +
        `It begins: ${stripMarkup(raw).slice(0, 120) || '(unreadable)'}`,
    );
  }
}

/**
 * `fetch`, but bounded — the fix for a systemic gap found 2026-08-30: a grep
 * audit of every pack's `mcps/*\/src/index.ts` found 1,339 of ~1,500 call
 * `fetch()` with NO timeout guard anywhere in the file. Two of those
 * (epo-ops, statcan) were confirmed live-hanging for 4-8 minutes before this
 * existed — every unguarded call carries the same risk, just unconfirmed.
 *
 * Mirrors the `epoFetch` wrapper `mcps/epo-ops/src/index.ts` shipped first:
 * bound the request with `AbortSignal.timeout`, and on a timeout/abort throw
 * an `upstream_down:` error that names the upstream and the bound rather than
 * letting the raw `TimeoutError`/`AbortError` (which names neither) propagate.
 * `upstream_down:` is deliberate, same reasoning as `parseJson` above — no
 * argument a caller passes can make an upstream hang, so it is always the
 * upstream's fault, and marking it that way keeps a slow API off the
 * problem-tools list where it would crowd out our own defects.
 *
 * Usage — a mechanical swap for a bare `fetch(url, init)`:
 *
 *     const res = await fetchWithTimeout(url, init, 'Some API');
 *
 * Pass `timeoutMs` as a fourth argument to override the default for a pack
 * with a known-slower upstream; the label should be the same short name you'd
 * pass to `httpError`/`httpErrorMessage` for that call.
 */
async function fetchWithTimeout(
  url: string | URL,
  init: RequestInit = {},
  name: string,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      // States the OBSERVATION (no response in N seconds), not a diagnosis.
      // "appears to be degraded" is an inference about the vendor that we have
      // not checked, and it is wrong in a way that misdirects whoever reads it:
      // a timeout from a Worker can equally mean OUR egress is blocked.
      //
      // Measured today (2026-09-01, fleet #1047): every call to
      // mainnet.base.org failed from the x402 facilitator while the identical
      // request from a laptop returned 200. Base was entirely healthy; the
      // public RPC refuses Cloudflare Worker egress. Had this message fired
      // there it would have blamed Base by name, and the next person would have
      // waited for a vendor outage to clear that did not exist.
      // A timeout has no status to test — there is no response at all — so
      // `markInternalOrigin` is called without one: an origin we run that never
      // answered is an availability failure by definition. This is the half of
      // fleet #1096 with neither a SQLSTATE nor a status code to key on.
      throw new Error(
        markInternalOrigin(
          `upstream_down: ${name} did not respond within ${timeoutMs / 1000}s. ` +
            `That can be ${name} being slow or down, or this environment being unable to reach it ` +
            `(some hosts refuse datacenter/Worker egress) — retry shortly, and check reachability ` +
            `from elsewhere before concluding ${name} is down.`,
          url,
        ),
      );
    }
    // Fleet #2382. Everything that isn't a timeout/abort here is a genuine
    // NETWORK-LEVEL failure — DNS resolution, connection refused, TLS handshake,
    // Cloudflare's own "Network connection lost." — meaning `fetch()` itself
    // threw and no HTTP response of any kind was ever received. Until this fix
    // that raw exception was rethrown VERBATIM: a bare `TypeError: fetch failed`
    // (or the Workers-runtime equivalent) names no upstream, carries no class
    // token, and reads exactly like a defect in OUR code — because it says
    // nothing about the call at all. It landed in `error`, the tier that means
    // "Pipeworx has a defect", for every one of the (at the time of writing)
    // ~470 packs that call this helper directly with no wrapper of their own.
    //
    // `dexscreener` hit this independently (fleet #1579) and fixed it with a
    // bespoke per-pack try/catch around `fetchWithTimeout`. That fix is correct
    // but only covers one pack; every other caller of this shared helper still
    // leaked the raw exception. Moving the same fix HERE — the one place that
    // already carries the timeout case — covers every pack that uses
    // `fetchWithTimeout` without a wrapper, for free, and without widening
    // `classifyToolError`'s regex list: the fix is giving the message a proper
    // `upstream_down:` token at the point the two facts (no response was ever
    // received, and which host we were trying to reach) are actually in hand,
    // not teaching the classifier to guess from prose after the fact.
    //
    // Safe on the same grounds as the timeout branch above: no argument a
    // caller passes can make `fetch()` itself throw a connection-level error,
    // so this is always an availability failure, never a caller mistake. Same
    // `markInternalOrigin` treatment — an origin we run that never answered is
    // still ours, not a third party's outage.
    const raw = err instanceof Error ? err.message : String(err);
    throw new Error(
      markInternalOrigin(
        `upstream_down: could not reach ${name} at all (${raw.slice(0, 160)}). ` +
          `No request reached ${name}, so this says NOTHING about whether the arguments you passed ` +
          'are valid — do not re-check them on the strength of this error. Retry shortly.',
        url,
      ),
    );
  }
}

function detailSuffix(detail: string): string {
  return detail ? ` — ${detail}` : '';
}

async function readDetail(res: Response): Promise<string> {
  let raw: string;
  try {
    raw = await res.text();
  } catch {
    // Body already consumed, or the connection died mid-read. The status alone
    // is still worth throwing — never let the error path throw its own error.
    return '';
  }
  return summarizeErrorBody(raw);
}

/**
 * Turn ANY error body — JSON, HTML, XML or plain text — into one short phrase
 * that never contains markup.
 *
 * This used to just drop an HTML or XML body on the floor, on the reasoning
 * that markup crowds out the status. That was half right. Dropping it loses the
 * one sentence a caller could have acted on: an `Access Denied` title, an SDMX
 * `<message:Error>` text, an OPS fault string. A 2026-08-30 support sweep
 * measured 13 of 291 caller-facing error rows carrying a raw page or document
 * verbatim, across 11 packs, and in every one of them the useful content —
 * "Access Denied", "Invalid country code", "SCRAPE_TIMEOUT" — was in there,
 * buried in markup the agent had to parse out of a string (fleet #712).
 *
 * So: extract the meaning, discard the markup. The output is passed through
 * `stripMarkup` unconditionally, which is what lets `check:error-body-leak`
 * assert mechanically that no caller-facing message can contain `<?xml`,
 * `<!DOCTYPE` or `<html`.
 */
function summarizeErrorBody(raw: string): string {
  if (!raw || !raw.trim()) return '';

  const head = raw.slice(0, 400).trimStart().toLowerCase();

  // An HTML error page (Cloudflare interstitial, nginx default, a login
  // redirect) says what it is in its <title>, and almost nowhere else.
  if (head.startsWith('<!doctype') || head.startsWith('<html')) {
    const title = htmlTitle(raw);
    return title
      ? `${title} (upstream returned an HTML error page, not an API response)`
      : 'upstream returned an HTML error page, not an API response';
  }

  // XML fault documents — EPO OPS, SDMX (`<message:Error>`), SOAP faults. The
  // human sentence sits in a child element whose tag name says what it is.
  if (head.startsWith('<?xml') || head.startsWith('<')) {
    const fault = xmlFaultText(raw);
    return fault
      ? `${stripMarkup(fault).slice(0, MAX_DETAIL)} (from the upstream's XML error document)`
      : 'upstream returned an XML error document with no readable message';
  }

  // Most JSON error bodies bury one human sentence among ids and echoed request
  // params. Prefer that sentence; fall back to the whole body when the shape is
  // unfamiliar, since an unfamiliar shape is exactly when we can least afford to
  // guess wrong and show nothing.
  const fromJson = messageFromJson(raw);
  return stripMarkup(fromJson ?? raw).slice(0, MAX_DETAIL);
}

/** The `<title>` of an HTML error page, or its first `<h1>` — the two places a
 *  bot wall, a 502 and an "Access Denied" all state what happened. */
function htmlTitle(raw: string): string | null {
  const head = raw.slice(0, 4000);
  for (const re of [/<title[^>]*>([\s\S]*?)<\/title>/i, /<h1[^>]*>([\s\S]*?)<\/h1>/i]) {
    const m = re.exec(head);
    const text = m ? stripMarkup(m[1]) : '';
    if (text) return text.slice(0, 160);
  }
  return null;
}

/** Tag names that carry the explanation in an XML fault document, namespace
 *  prefix optional (`<message:Error>`, `<com:Text>`, `<faultstring>`). */
const XML_FAULT_TAG_RE =
  /<(?:[A-Za-z0-9_.-]+:)?(?:text|message|description|faultstring|reason|detail|title|errormessage|error)\b[^>]*>([^<]{2,400})</i;

function xmlFaultText(raw: string): string | null {
  const head = raw.slice(0, 8000);
  const tagged = XML_FAULT_TAG_RE.exec(head);
  if (tagged && tagged[1].trim()) return tagged[1];

  // Nothing conventionally named — take the longest text node instead. A fault
  // document with one sentence in an oddly named element is still readable;
  // returning nothing at all is not.
  let best = '';
  for (const m of head.matchAll(/>([^<>]{8,400})</g)) {
    const text = m[1].trim();
    if (text.length > best.length) best = text;
  }
  return best || null;
}

/**
 * Remove every tag and stray angle bracket, then collapse whitespace.
 *
 * Applied to everything on the way out, including the JSON and plain-text
 * paths, because an upstream is free to embed markup in a JSON string field —
 * and a leak is a leak regardless of which branch produced it.
 */
function stripMarkup(s: string): string {
  return collapse(decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/[<>]/g, ' '));
}

/** The handful of entities that show up in error-page titles. Decoded AFTER
 *  tags are stripped and BEFORE the angle-bracket sweep, so `&lt;script&gt;`
 *  in a title cannot decode into markup that survives — EMBL-EBI's ChEMBL 500
 *  page renders as `500 Internal Server Error &lt; EMBL-EBI` otherwise. */
function decodeEntities(s: string): string {
  return s
    .replace(/&(?:amp|#0*38);/gi, '&')
    .replace(/&(?:lt|#0*60);/gi, '<')
    .replace(/&(?:gt|#0*62);/gi, '>')
    .replace(/&(?:quot|#0*34);/gi, '"')
    .replace(/&(?:#0*39|apos|#x0*27);/gi, "'")
    .replace(/&nbsp;/gi, ' ');
}

/** The conventional "what went wrong" field, under any of the names upstreams
 *  actually use. Checked in order; first non-empty string wins. */
const MESSAGE_KEYS = [
  'message', 'error_message', 'errorMessage', 'detail', 'details',
  'description', 'error_description', 'reason', 'title', 'fault',
];

function messageFromJson(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return pickMessage(parsed, 0);
}

function pickMessage(node: unknown, depth: number): string | null {
  // Two levels covers `{error: {message}}` and `{errors: [{detail}]}`, the two
  // shapes that account for nearly all of them, without walking a large payload.
  if (depth > 2 || node == null) return null;

  if (typeof node === 'string') return node.trim() || null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = pickMessage(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;

  for (const key of MESSAGE_KEYS) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  // `{error: …}` where error is itself an object or a string — the single most
  // common wrapper, so it is worth descending into by name rather than scanning
  // every key and risking picking up an echoed request parameter.
  for (const key of ['error', 'errors', 'fault', 'Error', 'data']) {
    if (key in obj) {
      const found = pickMessage(obj[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** Errors are read in a single line of log output; newlines and runs of
 *  whitespace make a multi-line body unreadable there. */
function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
/**
 * OWASP MCP — keyless.
 *
 * Open security standards from the OWASP Foundation:
 *  - ASVS 5.0 (Application Security Verification Standard) — 345 testable
 *    requirements across 17 chapters with assurance levels L1/L2/L3. Fetched
 *    live from the official GitHub release JSON; the citable controls layer
 *    (the security analogue to ISO 27002 / EU-law Articles).
 *  - The OWASP Top 10 families — Web 2021, API 2023, Mobile 2024, and the
 *    LLM Applications 2025 list (curated; small, stable, well-known).
 *  - OWASP Cheat Sheet Series — practical guidance, fetched live as Markdown.
 *
 * Pairs with eur-lex (EU law) and the CVE/threat packs (nvd, cisa-kev,
 * mitre-attck, mitre-cwe, epss) for grounded application-security answers.
 */


// Bound every fetch() in this pack to a fixed timeout — an upstream that
// degrades without erroring would otherwise hold the Worker in `await fetch()`
// until its own execution budget kills the request (minutes, not seconds).
// Mirrors the epoFetch / usaspending retryFetch pattern (fleet #685).
async function pwFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  return fetchWithTimeout(url, init ?? {}, 'OWASP');
}

const UA = 'pipeworx-mcp-owasp/1.0 (+https://pipeworx.io)';
const ASVS_URL =
  'https://raw.githubusercontent.com/OWASP/ASVS/master/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.flat.json';
const CHEAT_RAW = 'https://raw.githubusercontent.com/OWASP/CheatSheetSeries/master';

interface AsvsReq {
  chapter_id: string;
  chapter_name: string;
  section_id: string;
  section_name: string;
  req_id: string;
  req_description: string;
  L: string;
}

/** OWASP Top 10 families — curated. Each entry: id, name, one-line summary. */
const TOP10: Record<string, { title: string; year: string; url: string; items: Array<{ id: string; name: string; summary: string }> }> = {
  web: {
    title: 'OWASP Top 10 (Web Application Security Risks)',
    year: '2021',
    url: 'https://owasp.org/Top10/',
    items: [
      { id: 'A01:2021', name: 'Broken Access Control', summary: 'Users act outside their intended permissions (IDOR, missing function-level checks, path traversal).' },
      { id: 'A02:2021', name: 'Cryptographic Failures', summary: 'Weak/absent crypto exposing sensitive data in transit or at rest.' },
      { id: 'A03:2021', name: 'Injection', summary: 'Untrusted data interpreted as a command/query (SQLi, NoSQLi, OS, LDAP); now includes XSS.' },
      { id: 'A04:2021', name: 'Insecure Design', summary: 'Missing or ineffective security controls by design; threat modeling gaps.' },
      { id: 'A05:2021', name: 'Security Misconfiguration', summary: 'Insecure defaults, verbose errors, unpatched configs, missing hardening.' },
      { id: 'A06:2021', name: 'Vulnerable and Outdated Components', summary: 'Using libraries/frameworks with known vulnerabilities.' },
      { id: 'A07:2021', name: 'Identification and Authentication Failures', summary: 'Weak auth, credential stuffing, poor session management.' },
      { id: 'A08:2021', name: 'Software and Data Integrity Failures', summary: 'Unverified updates, insecure deserialization, CI/CD pipeline trust issues.' },
      { id: 'A09:2021', name: 'Security Logging and Monitoring Failures', summary: 'Insufficient logging/alerting to detect and respond to breaches.' },
      { id: 'A10:2021', name: 'Server-Side Request Forgery (SSRF)', summary: 'Server fetches a remote resource without validating the user-supplied URL.' },
    ],
  },
  api: {
    title: 'OWASP API Security Top 10',
    year: '2023',
    url: 'https://owasp.org/API-Security/editions/2023/en/0x11-t10/',
    items: [
      { id: 'API1:2023', name: 'Broken Object Level Authorization', summary: 'Object-level access checks missing (BOLA/IDOR) — the #1 API risk.' },
      { id: 'API2:2023', name: 'Broken Authentication', summary: 'Flawed auth lets attackers assume identities.' },
      { id: 'API3:2023', name: 'Broken Object Property Level Authorization', summary: 'Excessive data exposure / mass assignment at the property level.' },
      { id: 'API4:2023', name: 'Unrestricted Resource Consumption', summary: 'No rate/size limits → DoS and cost overruns.' },
      { id: 'API5:2023', name: 'Broken Function Level Authorization', summary: 'Missing checks on privileged/admin functions.' },
      { id: 'API6:2023', name: 'Unrestricted Access to Sensitive Business Flows', summary: 'Automation abuse of business flows (scalping, spam).' },
      { id: 'API7:2023', name: 'Server Side Request Forgery', summary: 'API fetches a user-supplied URI without validation.' },
      { id: 'API8:2023', name: 'Security Misconfiguration', summary: 'Insecure defaults, missing hardening across the API stack.' },
      { id: 'API9:2023', name: 'Improper Inventory Management', summary: 'Unknown/old API versions and undocumented endpoints.' },
      { id: 'API10:2023', name: 'Unsafe Consumption of APIs', summary: 'Blindly trusting data from third-party APIs.' },
    ],
  },
  llm: {
    title: 'OWASP Top 10 for LLM Applications (GenAI Security)',
    year: '2025',
    url: 'https://genai.owasp.org/llm-top-10/',
    items: [
      { id: 'LLM01:2025', name: 'Prompt Injection', summary: 'Crafted input alters model behavior, bypassing instructions/guardrails (direct & indirect).' },
      { id: 'LLM02:2025', name: 'Sensitive Information Disclosure', summary: 'Model leaks PII, secrets, or proprietary data in outputs.' },
      { id: 'LLM03:2025', name: 'Supply Chain', summary: 'Compromised models, datasets, plugins, or dependencies.' },
      { id: 'LLM04:2025', name: 'Data and Model Poisoning', summary: 'Tampered training/fine-tuning/embedding data biases or backdoors the model.' },
      { id: 'LLM05:2025', name: 'Improper Output Handling', summary: 'Unvalidated model output passed downstream → XSS, SSRF, RCE, SQLi.' },
      { id: 'LLM06:2025', name: 'Excessive Agency', summary: 'Over-permissioned tools/plugins let the model take harmful actions.' },
      { id: 'LLM07:2025', name: 'System Prompt Leakage', summary: 'System prompt exposed, revealing secrets or controls to bypass.' },
      { id: 'LLM08:2025', name: 'Vector and Embedding Weaknesses', summary: 'RAG/embedding flaws enabling injection, data leakage, or poisoning.' },
      { id: 'LLM09:2025', name: 'Misinformation', summary: 'Hallucinated or manipulated content trusted as fact.' },
      { id: 'LLM10:2025', name: 'Unbounded Consumption', summary: 'Unchecked inference (incl. model-extraction/DoW) drives cost and availability risk.' },
    ],
  },
  mobile: {
    title: 'OWASP Mobile Top 10',
    year: '2024',
    url: 'https://owasp.org/www-project-mobile-top-10/',
    items: [
      { id: 'M1:2024', name: 'Improper Credential Usage', summary: 'Hardcoded/poorly handled credentials.' },
      { id: 'M2:2024', name: 'Inadequate Supply Chain Security', summary: 'Compromised SDKs, libraries, and build pipelines.' },
      { id: 'M3:2024', name: 'Insecure Authentication/Authorization', summary: 'Weak auth and missing authorization checks.' },
      { id: 'M4:2024', name: 'Insufficient Input/Output Validation', summary: 'Unvalidated data → injection and corruption.' },
      { id: 'M5:2024', name: 'Insecure Communication', summary: 'Unprotected data in transit (no/weak TLS, no pinning).' },
      { id: 'M6:2024', name: 'Inadequate Privacy Controls', summary: 'Mishandling of PII on device and in transit.' },
      { id: 'M7:2024', name: 'Insufficient Binary Protections', summary: 'App binary lacks anti-tamper/obfuscation against reverse engineering.' },
      { id: 'M8:2024', name: 'Security Misconfiguration', summary: 'Insecure defaults and exposed configuration.' },
      { id: 'M9:2024', name: 'Insecure Data Storage', summary: 'Sensitive data stored unprotected on the device.' },
      { id: 'M10:2024', name: 'Insufficient Cryptography', summary: 'Weak algorithms or poor key management.' },
    ],
  },
};

const tools: McpToolExport['tools'] = [
  {
    name: 'top10',
    description:
      'An OWASP Top 10 list with each category id, name, summary and the canonical URL. Lists: "web" (2021), "api" (2023), "llm" (LLM/GenAI applications 2025), "mobile" (2024). Use for awareness, mapping a finding to a category, or LLM-app threat modeling.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        list: { type: 'string', enum: ['web', 'api', 'llm', 'mobile'], description: 'Which Top 10 (default "web").' },
      },
    },
  },
  {
    name: 'asvs_chapters',
    description:
      'Table of contents for the OWASP ASVS 5.0 (Application Security Verification Standard): the 17 chapters (V1–V17) with names and requirement counts per assurance level. Use to discover which chapter to pull with asvs_requirements.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'asvs_requirements',
    description:
      'Testable security requirements from OWASP ASVS 5.0, each with its verification id (e.g. "V6.2.1"), section, level (L1/L2/L3) and text — the citable controls layer. Filter by chapter, level and/or keyword. Use to ground a control ("what does ASVS require for password storage?").',
    inputSchema: {
      type: 'object' as const,
      properties: {
        chapter: { type: 'string', description: 'Chapter id like "V6" (Authentication). Omit to search all chapters.' },
        level: { type: 'number', enum: [1, 2, 3], description: 'Assurance level: 1 (essential), 2 (standard), 3 (advanced). Returns requirements applicable at or below this level.' },
        query: { type: 'string', description: 'Keyword filter on requirement text, e.g. "password", "TLS", "CSRF".' },
        limit: { type: 'number', description: 'Max requirements to return (default 40, max 100).' },
      },
    },
  },
  {
    name: 'cheat_sheet',
    description:
      'OWASP Cheat Sheet Series — concise, practical defensive guidance. With a topic, returns the matching cheat sheet as Markdown (or candidate matches if ambiguous). Without a topic, lists all available cheat sheets.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        topic: { type: 'string', description: 'Topic or sheet name, e.g. "SQL Injection", "JWT", "password storage". Omit to list all sheets.' },
      },
    },
  },
];

/* ---------- helpers ---------- */

let asvsCache: AsvsReq[] | null = null;

async function getAsvs(): Promise<AsvsReq[]> {
  if (asvsCache) return asvsCache;
  const res = await pwFetch(ASVS_URL, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`OWASP ASVS: ${res.status} fetching the standard.`);
  const json = (await res.json()) as { requirements: AsvsReq[] };
  asvsCache = json.requirements ?? [];
  return asvsCache;
}

let sheetIndexCache: Array<{ name: string; slug: string }> | null = null;

async function getSheetIndex(): Promise<Array<{ name: string; slug: string }>> {
  if (sheetIndexCache) return sheetIndexCache;
  const res = await pwFetch(`${CHEAT_RAW}/Index.md`, { headers: { 'User-Agent': UA, Accept: 'text/plain' } });
  if (!res.ok) throw new Error(`OWASP Cheat Sheets: ${res.status} fetching the index.`);
  const md = await res.text();
  const seen = new Set<string>();
  const out: Array<{ name: string; slug: string }> = [];
  const re = /\[([^\]]+)\]\(cheatsheets\/([A-Za-z0-9_]+_Cheat_Sheet)\.md\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    if (seen.has(m[2])) continue;
    seen.add(m[2]);
    out.push({ name: m[1].trim(), slug: m[2] });
  }
  sheetIndexCache = out;
  return out;
}

/* ---------- dispatch ---------- */

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'top10': {
      const key = String(args.list ?? 'web').toLowerCase();
      const list = TOP10[key];
      if (!list) throw new Error(`Unknown list "${key}". Use one of: web, api, llm, mobile.`);
      return { list: key, ...list, count: list.items.length };
    }

    case 'asvs_chapters': {
      const reqs = await getAsvs();
      const byCh = new Map<string, { chapter: string; name: string; total: number; L1: number; L2: number; L3: number }>();
      for (const r of reqs) {
        const c = byCh.get(r.chapter_id) ?? { chapter: r.chapter_id, name: r.chapter_name, total: 0, L1: 0, L2: 0, L3: 0 };
        c.total++;
        if (r.L === '1') c.L1++;
        else if (r.L === '2') c.L2++;
        else if (r.L === '3') c.L3++;
        byCh.set(r.chapter_id, c);
      }
      const chapters = [...byCh.values()].sort((a, b) => Number(a.chapter.slice(1)) - Number(b.chapter.slice(1)));
      return { standard: 'OWASP ASVS 5.0.0', total_requirements: reqs.length, chapters };
    }

    case 'asvs_requirements': {
      const reqs = await getAsvs();
      const chapter = args.chapter ? String(args.chapter).toUpperCase().replace(/^(?!V)/, 'V') : null;
      const level = args.level ? Number(args.level) : null;
      const query = String(args.query ?? '').trim().toLowerCase();
      const limit = Math.min(Math.max(Number(args.limit) || 40, 1), 100);
      let filtered = reqs;
      if (chapter) filtered = filtered.filter((r) => r.chapter_id === chapter);
      if (level) filtered = filtered.filter((r) => Number(r.L) <= level);
      if (query) filtered = filtered.filter((r) => r.req_description.toLowerCase().includes(query));
      const total = filtered.length;
      return {
        standard: 'OWASP ASVS 5.0.0',
        filters: { chapter, level, query: query || null },
        total_matched: total,
        returned: Math.min(total, limit),
        requirements: filtered.slice(0, limit).map((r) => ({
          req_id: r.req_id,
          level: Number(r.L),
          chapter: `${r.chapter_id} ${r.chapter_name}`,
          section: `${r.section_id} ${r.section_name}`,
          requirement: r.req_description,
          citation: `OWASP ASVS 5.0 ${r.req_id}`,
        })),
      };
    }

    case 'cheat_sheet': {
      const index = await getSheetIndex();
      const topic = String(args.topic ?? '').trim().toLowerCase();
      if (!topic) {
        return { count: index.length, cheat_sheets: index.map((s) => s.name), note: 'Call again with a topic to fetch a sheet as Markdown.' };
      }
      const norm = topic.replace(/[^a-z0-9]+/g, ' ').trim();
      const matches = index.filter((s) => s.name.toLowerCase().includes(norm) || norm.split(' ').every((w) => s.name.toLowerCase().includes(w)));
      if (matches.length === 0) {
        return { topic, found: false, note: 'No matching cheat sheet. Call cheat_sheet with no topic to list all available sheets.' };
      }
      // Prefer an exact-ish single match; otherwise return candidates.
      const exact = matches.find((s) => s.name.toLowerCase() === norm) ?? (matches.length === 1 ? matches[0] : null);
      if (!exact) {
        return { topic, found: true, ambiguous: true, candidates: matches.map((s) => s.name), note: 'Refine the topic to one of these.' };
      }
      const url = `${CHEAT_RAW}/cheatsheets/${exact.slug}.md`;
      const res = await pwFetch(url, { headers: { 'User-Agent': UA, Accept: 'text/plain' } });
      if (!res.ok) throw new Error(`OWASP Cheat Sheets: ${res.status} fetching ${exact.name}.`);
      const markdown = await res.text();
      return {
        name: exact.name,
        source_url: `https://cheatsheetseries.owasp.org/cheatsheets/${exact.slug}.html`,
        markdown,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
