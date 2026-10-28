/**
 * Daily Life — a Cortico World.
 *
 * Three jobs:
 *   1. First wake of the day (or after generateAt): roll a five-slot schedule → <workspace>/schedule.md
 *   2. Each enabled slot: push one event with the plan, a random seed and the world setting,
 *      so the bot writes what just happened
 *   3. Last day of the month: push a review event — forget the unimportant, compress the important
 *
 * Plus one tool, share_score, that turns the urge to share into a 0–1 score (advice, not an order).
 *
 * Zero network, zero API keys, no runtime dependencies. The only cost is the model wake-ups it triggers.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { stringsFor } from './strings.js';

const ID = 'daily-life';
const LABEL = 'Daily Life';

const DEFAULTS = {
  enabled: false,
  /** zh | en */
  locale: 'zh',
  timezone: 'Asia/Shanghai',
  /** Generate the schedule at this time even if the bot has not woken up yet (piggyback, no wake). */
  generateAt: '05:30',
  /** Monthly review trigger, last day of the month. */
  monthlyReviewAt: '23:30',

  morning: '07:00-11:00',
  noon: '11:00-14:00',
  afternoon: '14:00-18:00',
  evening: '18:00-22:00',
  night: '22:00-01:00',

  morningEnabled: true,
  noonEnabled: true,
  afternoonEnabled: true,
  eveningEnabled: true,
  nightEnabled: true,

  /** May specific people appear in an experience? They never become recurring characters. */
  allowPeople: false,

  allowShare: true,
  maxSharesPerDay: 1,
  shareCooldownMinutes: 90,

  wImpact: 0.45,
  wRelevance: 0.20,
  wSwing: 0.15,
  wEnergy: 0.10,
  wAffinity: 0.10,

  sharePenalty: 0.10,
  quietFrom: 22,
  quietTo: 7,
  highThreshold: 0.65,
  midThreshold: 0.35,

  /** Delete the previous month's raw file after review; false keeps it under archive/. */
  deleteRawAfterReview: false,
  /** Workspace subdirectory for the generated files; empty string means the workspace root. */
  workspaceSubdir: 'life',
  /** Optional path to a custom pools JSON (absolute, or relative to the bot directory). */
  poolsFile: '',
  /** Plain-text activity overrides: 「早晨：浇花|煮咖啡」 per line; overrides the pools for that slot. */
  activities: '',
  /** Owner injections: one world event per line; each new line is delivered once. */
  inject: '',
};

const SLOT_KEYS = ['morning', 'noon', 'afternoon', 'evening', 'night'];
const DEFAULT_POOLS = JSON.parse(readFileSync(new URL('./pools.default.json', import.meta.url), 'utf8'));

const PLACES_HEADINGS = ['## 我去过的地方', '## Places I have been'];
const DEFAULT_PLACES = {
  zh: [
    { name: '我的房间', desc: '二楼，朝南' },
    { name: '楼下', desc: '一条街，有便利店' },
    { name: '街角', desc: '小公园，几张长椅' },
  ],
  en: [
    { name: 'my room', desc: 'second floor, facing south' },
    { name: 'downstairs', desc: 'a street with a convenience store' },
    { name: 'the corner', desc: 'a small park with a few benches' },
  ],
};

/** Merge plain-text activity overrides (「早晨：A|B」) into a pools object. */
function applyActivityText(pools, text) {
  const clone = JSON.parse(JSON.stringify(pools));
  const byName = new Map();
  for (const s of clone.slots) {
    byName.set(s.key, s);
    if (s.label) byName.set(s.label, s);
    if (s.label_en) byName.set(s.label_en, s);
  }
  for (const raw of String(text).split(/\r?\n/)) {
    const m = /^[-*\s]*(.+?)[：:]\s*(.+)$/.exec(raw.trim());
    if (!m) continue;
    const head = m[1].trim();
    const out = /(出门|外出|out)/i.test(head);
    const name = head.replace(/[（(]?\s*(出门|外出|out)\s*[）)]?/ig, '').trim();
    const slot = byName.get(name);
    if (!slot) continue;
    const list = m[2].split(/[|｜、,，]/).map((x) => x.trim()).filter(Boolean);
    if (!list.length) continue;
    if (out) slot.outOptions = list; else slot.options = list;
  }
  return clone;
}

function worldFile(locale) {
  const zh = locale !== 'en';
  const body = zh
    ? `# 我这边

- 房间：朝南，一扇窗，窗台上半杯水
- 楼下：一条街，白天有车，晚上很静
- 天气：入秋了，早晚凉
- 隔壁：偶尔有电视声
- 窗台：养了一盆不知道名字的绿植

## 我去过的地方
- 我的房间：二楼，朝南
- 楼下：一条街，有便利店
- 街角：小公园，几张长椅
`
    : `# My side

- Room: facing south, one window, half a glass of water on the sill
- Downstairs: a street, cars by day, quiet at night
- Weather: autumn, chilly mornings and evenings
- Next door: a TV now and then
- Windowsill: a houseplant I never named

## Places I have been
- my room: second floor, facing south
- downstairs: a street with a convenience store
- the corner: a small park with a few benches
`;
  return body;
}

function asText(v) { return typeof v === 'string' ? v.trim() : ''; }
function clamp(n, lo, hi) { const x = Number(n); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : lo; }

function parseHHMM(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(asText(v));
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

function parseRange(v) {
  const m = /^(\d{1,2}:\d{2})\s*[-–~]\s*(\d{1,2}:\d{2})$/.exec(asText(v));
  if (!m) return null;
  const a = parseHHMM(m[1]);
  const b = parseHHMM(m[2]);
  if (a === null || b === null) return null;
  return { from: m[1], to: m[2] };
}

function slotRange(slot) {
  const from = parseHHMM(slot.from) ?? 0;
  let to = parseHHMM(slot.to) ?? 0;
  if (to <= from) to += 1440; // crosses midnight
  return { from, to };
}

function clockParts(now, tz) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const o = {};
  for (const p of fmt.formatToParts(now)) o[p.type] = p.value;
  const y = Number(o.year), m = Number(o.month), d = Number(o.day);
  return {
    date: `${o.year}-${o.month}-${o.day}`,
    md: `${o.month}-${o.day}`,
    ym: `${o.year}-${o.month}`,
    minutes: Number(o.hour) * 60 + Number(o.minute),
    hour: Number(o.hour),
    isLastDay: d === new Date(Date.UTC(y, m, 0)).getUTCDate(),
    startIso: `${o.year}-${o.month}-${o.day}T00:00:00`,
  };
}

function prevMonthKey(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

const SHARE_TOOL = {
  name: 'share_score',
  description:
    'Score the urge to share: pass impact / relevance / emotion, and it mixes in energy, closeness, '
    + "today's share count and quiet hours to return a 0–1 score with a high/medium/low level. "
    + 'The result is advice, not an order — high can still be held in, low can still slip out. '
    + 'After you actually send something, call it again with sent:true so it is remembered.',
  parameters: {
    type: 'object',
    properties: {
      impact: { type: 'number', minimum: 0, maximum: 1, description: 'How much this hit you (0–1)' },
      relevance: { type: 'number', minimum: 0, maximum: 1, description: 'How much they would care / how worth telling (0–1)' },
      emotion: { type: 'number', minimum: -1, maximum: 1, description: 'Direction: negative = bad, positive = good' },
      energy: { type: 'number', minimum: 0, maximum: 1, description: 'Current energy (optional, default 0.5)' },
      affinity: { type: 'number', minimum: 0, maximum: 1, description: 'Closeness (optional, default 0.5)' },
      sent: { type: 'boolean', description: 'Pass true after you actually sent it: the world records the share' },
    },
    required: ['impact', 'relevance', 'emotion'],
  },
  tags: ['internal-state', 'companion'],
};

class DailyLifeWorld {
  constructor(ctx = {}) {
    this.id = ID;
    this.cfg = ctx.cfg ?? { ...DEFAULTS };
    this.botDir = ctx.botDir ?? process.cwd();
    this.dataDir = ctx.dataDir ?? process.cwd();
    this.host = null;
    this.timer = null;
    this.busy = false;
    this.state = { date: '', picks: [], fired: [], lastShareDate: '', lastShareTs: '', lastReview: '', shares: [], history: [], injected: [] };
    this.cfgCache = { mtime: -1, section: null };
    this.load();
  }

  #raw(k) { const v = this.cfg?.[k]; return v === undefined || v === null ? DEFAULTS[k] : v; }

  #stateDir() { return join(this.dataDir, ID); }
  #statePath() { return join(this.#stateDir(), 'state.json'); }
  #legacyStatePath() { return join(this.dataDir, 'state.json'); }

  #wsDir() {
    const sub = asText(this.#get('workspaceSubdir')).replace(/^[\\/]+|[\\/]+$/g, '');
    return sub ? join(this.botDir, 'workspace', sub) : join(this.botDir, 'workspace');
  }
  #ws(name) { return join(this.#wsDir(), name); }
  #rel(name) {
    const sub = asText(this.#get('workspaceSubdir')).replace(/^[\\/]+|[\\/]+$/g, '');
    return sub ? `${sub}/${name}` : name;
  }

  #strings() { return stringsFor(asText(this.#get('locale')) === 'en' ? 'en' : 'zh'); }

  load() {
    const paths = [this.#statePath(), this.#legacyStatePath()];
    for (const p of paths) {
      try {
        const o = JSON.parse(readFileSync(p, 'utf8'));
        if (!o || typeof o !== 'object') continue;
        this.state = {
          date: String(o.date ?? ''),
          picks: Array.isArray(o.picks) ? o.picks : [],
          fired: Array.isArray(o.fired) ? o.fired : [],
          lastShareDate: String(o.lastShareDate ?? ''),
          lastShareTs: String(o.lastShareTs ?? ''),
          lastReview: String(o.lastReview ?? ''),
          shares: Array.isArray(o.shares) ? o.shares.slice(-30) : [],
          history: Array.isArray(o.history) ? o.history.slice(-7) : [],
          injected: Array.isArray(o.injected) ? o.injected.slice(-100) : [],
        };
        return;
      } catch { /* try next */ }
    }
  }

  save() {
    try {
      mkdirSync(this.#stateDir(), { recursive: true });
      writeFileSync(this.#statePath(), `${JSON.stringify(this.state, null, 1)}\n`, 'utf8');
    } catch { /* worst case: an extra roll */ }
  }

  /** config.json is re-read when its mtime changes, so edits do not need a restart. */
  #section() {
    const p = join(this.botDir, 'config.json');
    try {
      const mtime = statSync(p).mtimeMs;
      if (this.cfgCache.mtime === mtime && this.cfgCache.section) return this.cfgCache.section;
      const o = JSON.parse(readFileSync(p, 'utf8'));
      const section = o?.worlds?.[ID] ?? {};
      this.cfgCache = { mtime, section };
      return section;
    } catch { return this.cfgCache.section ?? {}; }
  }

  #get(k) { const v = this.#section()[k]; return v === undefined || v === null ? this.#raw(k) : v; }

  /** Base pools (default or poolsFile) then plain-text activity overrides. */
  #pools() {
    let base = DEFAULT_POOLS;
    const file = asText(this.#get('poolsFile'));
    if (file) {
      try {
        const p = isAbsolute(file) ? file : join(this.botDir, file);
        const raw = JSON.parse(readFileSync(p, 'utf8'));
        if (Array.isArray(raw?.slots)) {
          base = {
            slots: DEFAULT_POOLS.slots.map((d) => {
              const given = raw.slots.find((x) => x && x.key === d.key) ?? {};
              return { ...d, ...given };
            }),
          };
        }
      } catch { /* keep defaults */ }
    }
    const text = asText(this.#get('activities'));
    return text ? applyActivityText(base, text) : base;
  }

  #localized(slot, en) {
    const label = en ? (slot.label_en || slot.label) : slot.label;
    const options = (en ? slot.options_en : slot.options) || slot.options || [];
    const seeds = (en ? slot.seeds_en : slot.seeds) || slot.seeds || [];
    const outOptions = (en ? slot.outOptions_en : slot.outOptions) || slot.outOptions || [];
    return { label, options, seeds, outOptions };
  }

  /** Enabled slots with their configured time ranges. */
  slotDefs() {
    const en = asText(this.#get('locale')) === 'en';
    return this.#pools().slots
      .filter((s) => this.#get(`${s.key}Enabled`) !== false)
      .map((slot) => {
        const r = parseRange(this.#get(slot.key));
        const { label, options, seeds, outOptions } = this.#localized(slot, en);
        return {
          key: slot.key, label, options, seeds, outOptions,
          doorChance: Number(slot.doorChance) || 0,
          from: r?.from ?? slot.from, to: r?.to ?? slot.to,
        };
      });
  }

  #prevPick(key) {
    const last = this.state.history[this.state.history.length - 1];
    return last?.picks?.find((p) => p.key === key)?.activity ?? '';
  }

  pick() {
    const places = this.readPlaces();
    const room = places[0]?.name ?? (asText(this.#get('locale')) === 'en' ? 'my room' : '我的房间');
    const outside = places.slice(1);
    return this.slotDefs().map((slot) => {
      if (outside.length && Math.random() < slot.doorChance) {
        const pool = slot.outOptions.length ? slot.outOptions : [room];
        const activity = pool[Math.floor(Math.random() * pool.length)];
        const place = outside[Math.floor(Math.random() * outside.length)].name;
        return { key: slot.key, label: slot.label, from: slot.from, to: slot.to, activity, place, out: true };
      }
      const options = slot.options.length ? slot.options : ['…'];
      let choice = options[Math.floor(Math.random() * options.length)];
      if (options.length > 1 && choice === this.#prevPick(slot.key)) {
        const rest = options.filter((o) => o !== choice);
        choice = rest[Math.floor(Math.random() * rest.length)];
      }
      return { key: slot.key, label: slot.label, from: slot.from, to: slot.to, activity: choice, place: room };
    });
  }

  ensureWorldFile() {
    try {
      const p = this.#ws('my-side.md');
      const en = asText(this.#get('locale')) === 'en';
      if (!existsSync(p)) {
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, worldFile(en ? 'en' : 'zh'), 'utf8');
        return;
      }
      const raw = readFileSync(p, 'utf8');
      if (!PLACES_HEADINGS.some((h) => raw.includes(h))) {
        const heading = en ? PLACES_HEADINGS[1] : PLACES_HEADINGS[0];
        const list = (en ? DEFAULT_PLACES.en : DEFAULT_PLACES.zh)
          .map((x) => `- ${x.name}：${x.desc}`).join('\n');
        writeFileSync(p, `${raw.replace(/\s*$/, '')}\n\n${heading}\n${list}\n`, 'utf8');
      }
    } catch { /* ignore */ }
  }

  /** Places she has been to; falls back to the locale defaults. */
  readPlaces() {
    const en = asText(this.#get('locale')) === 'en';
    try {
      const raw = readFileSync(this.#ws('my-side.md'), 'utf8');
      const heading = PLACES_HEADINGS.find((h) => raw.includes(h));
      if (!heading) return en ? DEFAULT_PLACES.en : DEFAULT_PLACES.zh;
      const body = raw.slice(raw.indexOf(heading) + heading.length);
      const stop = body.search(/\n##\s/);
      const section = stop < 0 ? body : body.slice(0, stop);
      const list = section.split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.startsWith('-'))
        .map((l) => l.replace(/^-\s*/, ''))
        .map((l) => {
          const m = /^(.+?)[：:]\s*(.*)$/.exec(l);
          return m ? { name: m[1].trim(), desc: m[2].trim() } : { name: l, desc: '' };
        })
        .filter((x) => x.name);
      return list.length ? list : (en ? DEFAULT_PLACES.en : DEFAULT_PLACES.zh);
    } catch { return en ? DEFAULT_PLACES.en : DEFAULT_PLACES.zh; }
  }

  readWorldSetting() {
    try {
      const raw = readFileSync(this.#ws('my-side.md'), 'utf8');
      const cut = PLACES_HEADINGS.map((h) => raw.indexOf(h)).filter((i) => i >= 0);
      const head = cut.length ? raw.slice(0, Math.min(...cut)) : raw;
      const body = head.replace(/^#[^\n]*\n/, '').replace(/\n+/g, '; ').replace(/^[;\s]+/, '').trim();
      return body.slice(0, 240);
    } catch { return '(no setting written yet)'; }
  }

  writeSchedule(md, picks) {
    const t = this.#strings();
    const lines = picks.map((p) => `- **${p.label}** ${p.from}–${p.to} | ${p.activity}${p.out ? ` (${p.place})` : ''}`).join('\n');
    const body = `${t.scheduleHeader(md)}\n\n${lines}\n\n${t.scheduleFooter}\n`;
    try {
      const p = this.#ws('schedule.md');
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, body, 'utf8');
    } catch { /* ignore */ }
  }

  async hasBeenAwakeToday(startIso) {
    const store = this.host?.store;
    if (!store?.range) return false;
    try {
      const events = await store.range({ origin: 'external', fromTs: startIso });
      return Array.isArray(events) && events.length > 0;
    } catch { return false; }
  }

  inSlot(minutes, slot) {
    const { from, to } = slotRange(slot);
    const m = minutes < from - 60 ? minutes + 1440 : minutes;
    return m >= from && m < to;
  }

  async push(type, text, trigger) {
    const host = this.host;
    if (!host?.pushEvent) return;
    await host.pushEvent({
      type,
      ts: new Date().toISOString(),
      source: this.id,
      origin: 'internal',
      senderKey: this.id,
      text,
    }, { trigger });
  }

  scheduleText(now, picks) {
    const t = this.#strings();
    const lines = picks.map((p) => `${p.label} ${p.from}–${p.to} | ${p.activity}${p.out ? ` (${p.place})` : ''}`).join('\n');
    return `${t.scheduleHeader(now.md)}\n${lines}\n${t.scheduleFooter}`;
  }

  experienceText(now, slot, picks) {
    const t = this.#strings();
    const picked = picks.find((p) => p.key === slot.key);
    const place = picked?.place ?? (asText(this.#get('locale')) === 'en' ? 'my room' : '我的房间');
    const pool = this.#get('allowPeople') === true ? [...t.directions, t.directionPeople] : t.directions;
    const direction = pool[Math.floor(Math.random() * pool.length)];
    const file = this.#rel(`experiences-${now.ym}.md`);
    const people = this.#get('allowPeople') === true ? t.expPeopleOn : t.expPeopleOff;
    const share = this.#get('allowShare') === false ? t.expShareOff : t.expShareOn;
    return [
      t.expTitle(slot.label, slot.from, slot.to),
      t.expPlace(place),
      t.expDirection(direction),
      t.expWorld(this.readWorldSetting()),
      t.expAsk,
      t.expWrite(file),
      t.expPlaceRule(place),
      t.expDirectionRule(direction),
      people,
      share,
    ].join('\n');
  }

  injectText(lines) {
    const t = this.#strings();
    return [t.injectTitle, ...lines.map((l) => `- ${l}`), t.injectHint].join('\n');
  }

  reviewText(now) {
    const t = this.#strings();
    const prev = prevMonthKey(now.ym);
    const cur = this.#rel(`experiences-${now.ym}.md`);
    const prevPath = this.#rel(`experiences-${prev}.md`);
    const third = this.#get('deleteRawAfterReview') === false ? t.reviewArchive(prevPath) : t.reviewDelete(prevPath);
    return [
      t.reviewTitle(now.ym),
      t.reviewRead(cur),
      t.reviewStep1,
      t.reviewStep2(this.#rel('experiences-digest.md')),
      third,
      t.reviewNote,
    ].join('\n');
  }

  score(args = {}) {
    const t = this.#strings();
    const impact = clamp(args.impact, 0, 1);
    const relevance = clamp(args.relevance, 0, 1);
    const emotion = clamp(args.emotion, -1, 1);
    const energy = clamp(args.energy ?? 0.5, 0, 1);
    const affinity = clamp(args.affinity ?? 0.5, 0, 1);

    const swing = Math.abs(emotion - 0.1);
    const w = (k, d) => { const v = Number(this.#get(k)); return Number.isFinite(v) ? clamp(v, 0, 2) : d; };
    const parts = [
      [t.fImpact, w('wImpact', 0.45), impact],
      [t.fRelevance, w('wRelevance', 0.20), relevance],
      [t.fSwing, w('wSwing', 0.15), swing],
      [t.fEnergy, w('wEnergy', 0.10), energy],
      [t.fAffinity, w('wAffinity', 0.10), affinity],
    ];
    let s = parts.reduce((acc, [, weight, v]) => acc + weight * v, 0);

    const tz = asText(this.#get('timezone')) || DEFAULTS.timezone;
    const now = clockParts(new Date(), tz);
    const penalty = Number(this.#get('sharePenalty')) || 0;
    const sharedToday = this.state.lastShareDate === now.date;
    if (sharedToday) s -= penalty;

    const quietFrom = Number(this.#get('quietFrom')) || 0;
    const quietTo = Number(this.#get('quietTo')) || 0;
    const quiet = now.hour >= quietFrom || now.hour < quietTo;
    const high = Number(this.#get('highThreshold')) || 0.65;
    const mid = Number(this.#get('midThreshold')) || 0.35;

    const allowShare = this.#get('allowShare') !== false;
    const maxRaw = Number(this.#get('maxSharesPerDay'));
    const maxPerDay = Number.isFinite(maxRaw) ? Math.max(0, maxRaw) : 1;
    const coolRaw = Number(this.#get('shareCooldownMinutes'));
    const coolMin = Number.isFinite(coolRaw) ? Math.max(0, coolRaw) : 90;

    const sharesToday = this.state.shares.filter((x) => x.date === now.date).length;
    const lastMs = this.state.lastShareTs ? Date.parse(this.state.lastShareTs) : NaN;
    const sinceLastMin = Number.isFinite(lastMs) ? (Date.now() - lastMs) / 60000 : Infinity;

    const caps = [];
    if (!allowShare) caps.push(t.capShareOff);
    if (maxPerDay > 0 && sharesToday >= maxPerDay) caps.push(t.capMax(sharesToday, maxPerDay));
    if (coolMin > 0 && sinceLastMin < coolMin) caps.push(t.capCooldown(Math.round(sinceLastMin), coolMin));
    if (quiet) caps.push(t.capQuiet);
    if (caps.length) s = Math.min(s, mid - 0.01);

    const level = s >= high ? t.levelHigh : s >= mid ? t.levelMid : t.levelLow;
    const advice = level === t.levelHigh ? t.advHigh : level === t.levelMid ? t.advMid : t.advLow;

    if (args.sent === true) {
      const ts = new Date().toISOString();
      this.state.shares = [...this.state.shares, { date: now.date, ts }].slice(-30);
      this.state.lastShareDate = now.date;
      this.state.lastShareTs = ts;
      this.save();
    }
    const notes = [];
    if (sharedToday) notes.push(t.noteShared(penalty));
    notes.push(...caps);
    if (args.sent === true) notes.push(t.recorded(this.state.shares.filter((x) => x.date === now.date).length));

    const detail = parts.map(([name, weight, v]) => `${name} ${weight}×${v.toFixed(2)}=${(weight * v).toFixed(3)}`).join(', ');
    const count = maxPerDay > 0 ? t.countMax(sharesToday, maxPerDay) : t.countUnlimited;
    const hint = args.sent === true ? t.recorded(sharesToday + 1) : t.hintRecord;

    return `${t.shareHead(s.toFixed(2), level)} | ${t.advise}${advice}\n`
      + `${t.detail}${detail}${notes.length ? `\n${t.extra}${notes.join('; ')}` : ''}\n`
      + `${count}; ${hint}\n${t.footer}`;
  }

  /** 0-based slot index list that should fire today. */
  async tick() {
    if (this.busy) return;
    if (this.#get('enabled') === false) return;
    const tz = asText(this.#get('timezone')) || DEFAULTS.timezone;
    const now = clockParts(new Date(), tz);
    const st = this.state;

    this.busy = true;
    try {
      if (st.date !== now.date) {
        const awake = await this.hasBeenAwakeToday(now.startIso);
        const genAt = parseHHMM(this.#get('generateAt')) ?? 330;
        if (awake || now.minutes >= genAt) {
          st.date = now.date;
          st.picks = this.pick();
          st.fired = [];
          st.history = [...st.history, { date: now.date, picks: st.picks }].slice(-7);
          this.save();
          this.ensureWorldFile();
          this.writeSchedule(now.md, st.picks);
          await this.push('daily-life.schedule', this.scheduleText(now, st.picks), awake ? 'debounce' : 'piggyback');
        }
      }

      if (st.date === now.date) {
        for (const slot of this.slotDefs()) {
          if (st.fired.includes(slot.key)) continue;
          if (!this.inSlot(now.minutes, slot)) continue;
          st.fired.push(slot.key);
          this.save();
          await this.push('daily-life.experience', this.experienceText(now, slot, st.picks), 'debounce');
          break;
        }
      }

      // Owner injections: one line each, delivered once, merged into a single event.
      const fresh = asText(this.#get('inject'))
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((line) => !st.injected.includes(line))
        .slice(0, 10);
      if (fresh.length) {
        st.injected = [...st.injected, ...fresh].slice(-100);
        this.save();
        await this.push('daily-life.inject', this.injectText(fresh), 'debounce');
      }

      const reviewAt = parseHHMM(this.#get('monthlyReviewAt')) ?? 1410;
      if (now.isLastDay && now.minutes >= reviewAt && st.lastReview !== now.ym) {
        st.lastReview = now.ym;
        this.save();
        await this.push('daily-life.monthly-review', this.reviewText(now), 'debounce');
      }
    } finally {
      this.busy = false;
    }
  }

  async start(host) {
    this.host = host;
    this.ensureWorldFile();
    void this.tick().catch(() => {});
    this.timer = setInterval(() => { void this.tick().catch(() => {}); }, 60_000);
    this.timer.unref?.();
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.host = null;
  }

  tools() {
    return [{ ...SHARE_TOOL, handler: async (args) => this.score(args) }];
  }

  /** WebUI config group: every knob lives here. */
  webUi() {
    const P = 'worlds.daily-life.';
    const num = (title, desc, step = 0.05) => ({
      type: 'number', title, description: desc, minimum: 0, maximum: 1, multipleOf: step, 'x-hot': true,
    });
    const str = (title, desc) => ({ type: 'string', title, description: desc, 'x-hot': true });
    const int = (title, desc, max) => ({
      type: 'integer', title, description: desc, minimum: 0, maximum: max, 'x-hot': true,
    });
    const bool = (title, desc) => ({ type: 'boolean', title, description: desc, 'x-hot': true });

    return {
      config: [{
        id: 'world:daily-life',
        owner: 'world:daily-life',
        schema: {
          type: 'object',
          title: 'Daily Life',
          description: 'A schedule per day, an experience per slot, one review per month. Changes apply without a restart.',
          properties: {
            [`${P}enabled`]: bool('Enabled', 'Turn the whole world on or off.'),
            [`${P}locale`]: str('Locale', "zh or en — the language of the events it pushes."),
            [`${P}timezone`]: str('Timezone', 'IANA name, e.g. Asia/Shanghai.'),
            [`${P}generateAt`]: str('Schedule fallback time', 'If the bot has not woken up by then, the schedule is generated anyway (no wake). HH:MM.'),
            [`${P}monthlyReviewAt`]: str('Monthly review time', 'Trigger time on the last day of the month. HH:MM.'),

            [`${P}morning`]: str('Morning range', 'HH:MM-HH:MM.'),
            [`${P}noon`]: str('Noon range', 'HH:MM-HH:MM.'),
            [`${P}afternoon`]: str('Afternoon range', 'HH:MM-HH:MM.'),
            [`${P}evening`]: str('Evening range', 'HH:MM-HH:MM.'),
            [`${P}night`]: str('Late-night range', 'HH:MM-HH:MM; may cross midnight, e.g. 22:00-01:00.'),

            [`${P}morningEnabled`]: bool('Morning slot on', 'Disable to skip this slot entirely.'),
            [`${P}noonEnabled`]: bool('Noon slot on', 'Disable to skip this slot entirely.'),
            [`${P}afternoonEnabled`]: bool('Afternoon slot on', 'Disable to skip this slot entirely.'),
            [`${P}eveningEnabled`]: bool('Evening slot on', 'Disable to skip this slot entirely.'),
            [`${P}nightEnabled`]: bool('Late-night slot on', 'Disable to skip this slot entirely.'),

            [`${P}allowPeople`]: bool('Allow specific people', 'On: one-off people may appear. Off: sounds or faceless passers-by only. Neither becomes recurring.'),
            [`${P}allowShare`]: bool('Allow proactive sharing', 'Off: it only records experiences and never messages the user.'),
            [`${P}maxSharesPerDay`]: int('Max shares per day', '0 = unlimited. Over the limit the urge is capped at low.', 10),
            [`${P}shareCooldownMinutes`]: int('Share cooldown', 'Minimum minutes between two shares. 0 = no cooldown.', 720),

            [`${P}wImpact`]: num('Weight: impact on the bot', 'How much the event hit the bot.'),
            [`${P}wRelevance`]: num('Weight: relevance to the user', 'Whether the user would care / it is worth telling.'),
            [`${P}wSwing`]: num('Weight: emotional swing', 'How far the mood moved from baseline.'),
            [`${P}wEnergy`]: num('Weight: energy', 'The more energy, the more likely to share.'),
            [`${P}wAffinity`]: num('Weight: closeness', 'The closer, the more likely to share.'),

            [`${P}sharePenalty`]: num('Penalty when already shared', 'Subtracted when the bot already shared today.'),
            [`${P}quietFrom`]: int('Quiet from (hour)', 'From this hour the urge is capped at low.', 23),
            [`${P}quietTo`]: int('Quiet until (hour)', 'Until this hour the urge is capped at low.', 23),
            [`${P}highThreshold`]: num('High threshold', 'At or above this the bot "wants to say it".'),
            [`${P}midThreshold`]: num('Medium threshold', 'Below this the bot "does not want to say it".'),

            [`${P}deleteRawAfterReview`]: bool('Delete raw logs after review', 'Off: move the previous month into archive/ instead of deleting.'),
            [`${P}workspaceSubdir`]: { type: 'string', title: 'Workspace subdirectory', description: 'Where the generated files go, e.g. life. Empty = workspace root.', 'x-hot': false },
            [`${P}activities`]: {
              type: 'string', title: 'Activity options (plain text)', 'x-hot': true,
              description: 'One slot per line: 「早晨：浇花|煮咖啡」. Add (出门)/(out) for the going-out list. Separators: | 、 ,',
            },
            [`${P}poolsFile`]: { type: 'string', title: 'Custom pools file', description: 'Optional path to a pools JSON (absolute, or relative to the bot directory).', 'x-hot': false },
            [`${P}inject`]: {
              type: 'string', title: 'Put something into her world', 'x-hot': true,
              description: 'One entry per line, e.g. "bought her a small succulent". Each new line is delivered once as a world event; old lines can stay or be deleted.',
            },
          },
        },
      }],
    };
  }

  envPromptVars() { return null; }
}

export const definition = {
  id: ID,
  label: LABEL,
  defaults: () => ({ ...DEFAULTS }),
  create: (ctx) => new DailyLifeWorld(ctx),
  describe: {
    tools: [{
      name: SHARE_TOOL.name,
      description: SHARE_TOOL.description,
      parameters: SHARE_TOOL.parameters,
      tags: SHARE_TOOL.tags,
      summary: {
        zh: '把影响、相关、情绪算成 0–1 的分享欲分数和档位；结果只是建议。',
        en: 'Turn impact/relevance/emotion into a 0–1 urge score with a level; the result is advice.',
      },
    }],
    events: [
      {
        type: 'daily-life.schedule',
        description: { zh: '当天第一次醒来时：一份随机生成的当日行程。', en: 'First wake: a randomly generated schedule for today.' },
      },
      {
        type: 'daily-life.experience',
        description: { zh: '时段开始：带着行程、偶然和世界设定，让 bot 写一段刚发生的经历。', en: 'Slot start: write what just happened, with the plan, a seed and the world setting.' },
      },
      {
        type: 'daily-life.monthly-review',
        description: { zh: '每月最后一天：整理经历，忘掉不重要的，压缩重要的。', en: 'Month end: review, forget the unimportant, compress the important.' },
      },
      {
        type: 'daily-life.inject',
        description: { zh: '主人往她的世界里投放了新东西（买东西、天气变化、新邻居等）。', en: 'The owner put something new into her world (a gift, weather, a new neighbour).' },
      },
    ],
  },
};

export { DEFAULTS, SLOT_KEYS };
export default definition;
