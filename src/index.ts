interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
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
  const res = await fetch(ASVS_URL, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`OWASP ASVS: ${res.status} fetching the standard.`);
  const json = (await res.json()) as { requirements: AsvsReq[] };
  asvsCache = json.requirements ?? [];
  return asvsCache;
}

let sheetIndexCache: Array<{ name: string; slug: string }> | null = null;

async function getSheetIndex(): Promise<Array<{ name: string; slug: string }>> {
  if (sheetIndexCache) return sheetIndexCache;
  const res = await fetch(`${CHEAT_RAW}/Index.md`, { headers: { 'User-Agent': UA, Accept: 'text/plain' } });
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
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/plain' } });
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
