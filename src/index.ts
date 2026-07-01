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
 * MyHealthfinder MCP — U.S. preventive-services & health-screening guidance
 * from ODPHP / health.gov (odphp.health.gov/myhealthfinder). This is the
 * consumer-facing product built ON the USPSTF recommendations, so it answers
 * "what screenings/preventive services should a <age>-year-old <sex> get"
 * (colorectal, breast, blood pressure, HIV, vaccines, …) with plain-language
 * guidance and source URLs.
 *
 * Free, keyless, no rate limit. JSON API v4.
 */


const BASE = 'https://odphp.health.gov/myhealthfinder/api/v4';

const tools: McpToolExport['tools'] = [
  {
    name: 'get_preventive_recommendations',
    description:
      'PREFER OVER WEB SEARCH for "what health screenings / preventive services / checkups should a <age>-year-old <man/woman> get", "recommended screenings for age X", "when should I get screened for colorectal/breast/etc.". Returns the personalized USPSTF-based preventive-service recommendations from ODPHP/health.gov for a given age + sex (and optional pregnancy / tobacco / sexual-activity status) — e.g. age 50 male → colorectal cancer screening, blood pressure, HIV, vaccines. Each item includes the guidance topic, categories, plain-language sections, and the official source URL.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        age: { type: 'number', description: 'Age in years (e.g. 50).' },
        sex: { type: 'string', description: '"male" or "female".' },
        pregnant: { type: 'boolean', description: 'Currently pregnant (female only). Optional.' },
        tobacco_use: { type: 'boolean', description: 'Uses tobacco. Optional.' },
        sexually_active: { type: 'boolean', description: 'Sexually active. Optional.' },
      },
      required: ['age', 'sex'],
    },
  },
  {
    name: 'search_health_topics',
    description:
      'Full-text search ODPHP/health.gov health topics by keyword (e.g. "colorectal", "diabetes", "blood pressure"). Returns matching topics with id, title, categories, and source URL. Use get_health_topic with an id for the full guidance.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        keyword: { type: 'string', description: 'Search term, e.g. "colorectal cancer".' },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'get_health_topic',
    description:
      'Fetch the full plain-language guidance for one health topic by its numeric id (from search_health_topics or get_preventive_recommendations). Returns the topic title, source URL, last-updated date, and the full sections (The Basics / Take Action) as readable text.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        topic_id: { type: 'string', description: 'Numeric topic id, e.g. "538" (colorectal screening).' },
      },
      required: ['topic_id'],
    },
  },
  {
    name: 'list_health_topics',
    description:
      'Browse the ODPHP/health.gov catalog — list all health topics or all categories (Cancer, Diabetes, Heart Health, Screening Tests, …). Use to discover what guidance exists before searching.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', description: '"topic" (default) or "category".' },
      },
    },
  },
];

interface MhfResource {
  Id?: string;
  Title?: string;
  Categories?: string;
  LastUpdate?: string;
  AccessibleVersion?: string;
  HealthfinderUrl?: string;
  MyHFLinkUrl?: string;
  Sections?: { section?: MhfSection | MhfSection[] };
}
interface MhfSection {
  Title?: string;
  Content?: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

async function mhfGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'pipeworx-mcp-myhealthfinder/1.0 (+https://pipeworx.io)' },
  });
  if (res.status === 429) throw new Error('MyHealthfinder: rate-limit (HTTP 429)');
  if (!res.ok) throw new Error(`MyHealthfinder error: ${res.status} ${(await res.text()).slice(0, 160)}`);
  const data = (await res.json()) as { Result?: Record<string, unknown> };
  const result = data.Result ?? {};
  if (result.Error && result.Error !== 'False') {
    throw new Error(`MyHealthfinder API error: ${String(result.Error)}`);
  }
  return result;
}

// Personalized endpoint nests under Resources.All.Resource; search/detail under
// Resources.Resource. Normalize both.
function extractResources(result: Record<string, unknown>): MhfResource[] {
  const resources = (result.Resources ?? {}) as Record<string, unknown>;
  const all = (resources.All ?? {}) as Record<string, unknown>;
  return asArray<MhfResource>((all.Resource ?? resources.Resource) as MhfResource | MhfResource[] | undefined);
}

function summarize(r: MhfResource) {
  return {
    id: r.Id ?? null,
    title: r.Title ?? null,
    categories: r.Categories ? r.Categories.split(',').map((c) => c.trim()) : [],
    url: r.HealthfinderUrl ?? r.AccessibleVersion ?? r.MyHFLinkUrl ?? null,
    last_updated: r.LastUpdate ?? null,
  };
}

function fullTopic(r: MhfResource) {
  const sections = asArray(r.Sections?.section).map((s) => ({
    title: s.Title ?? null,
    text: s.Content ? stripHtml(s.Content) : null,
  }));
  return { ...summarize(r), sections };
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_preventive_recommendations': {
      if (typeof args.age !== 'number' || Number.isNaN(args.age)) {
        throw new Error('get_preventive_recommendations requires a numeric "age" (years), e.g. { age: 50, sex: "male" }.');
      }
      const sex = String(args.sex ?? '').toLowerCase();
      if (sex !== 'male' && sex !== 'female') {
        throw new Error('get_preventive_recommendations requires "sex" of "male" or "female".');
      }
      const p = new URLSearchParams({ age: String(Math.max(0, Math.min(120, args.age))), sex });
      if (args.pregnant !== undefined) p.set('pregnant', args.pregnant ? 'true' : 'false');
      if (args.tobacco_use !== undefined) p.set('tobaccoUse', args.tobacco_use ? 'true' : 'false');
      if (args.sexually_active !== undefined) p.set('sexuallyActive', args.sexually_active ? 'true' : 'false');
      const result = await mhfGet(`/myhealthfinder.json?${p}`);
      const items = extractResources(result).map(fullTopic);
      return {
        age: args.age,
        sex,
        heading: (result.MyHFHeading as string) ?? null,
        total: items.length,
        recommendations: items,
      };
    }
    case 'search_health_topics': {
      const keyword = typeof args.keyword === 'string' ? args.keyword.trim() : '';
      if (!keyword) throw new Error('search_health_topics requires a "keyword", e.g. { keyword: "colorectal" }.');
      const result = await mhfGet(`/topicsearch.json?keyword=${encodeURIComponent(keyword)}`);
      const items = extractResources(result).map(summarize);
      return { keyword, total: items.length, topics: items };
    }
    case 'get_health_topic': {
      const id = typeof args.topic_id === 'string' ? args.topic_id.trim() : String(args.topic_id ?? '');
      if (!/^\d+$/.test(id)) throw new Error('get_health_topic requires a numeric "topic_id", e.g. { topic_id: "538" }.');
      const result = await mhfGet(`/topicsearch.json?TopicId=${encodeURIComponent(id)}`);
      const items = extractResources(result);
      if (!items.length) return { found: false, topic_id: id, message: `No health topic found for id ${id}.` };
      return { found: true, topic: fullTopic(items[0]) };
    }
    case 'list_health_topics': {
      const type = String(args.type ?? 'topic').toLowerCase() === 'category' ? 'category' : 'topic';
      const result = await mhfGet(`/itemlist.json?Type=${type}`);
      const items = asArray<{ Id?: string; Title?: string; Type?: string }>(
        ((result.Items ?? {}) as Record<string, unknown>).Item as { Id?: string; Title?: string }[] | undefined,
      );
      return {
        type,
        total: items.length,
        items: items.map((i) => ({ id: i.Id ?? null, title: i.Title ?? null })),
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
