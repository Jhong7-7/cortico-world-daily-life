import { pathToFileURL } from 'node:url';
import os from 'node:os';
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const base = 'D:/dsh workplace/patches/daily-life-community/cortico-world-daily-life/src/index.js';
const mod = await import(pathToFileURL(base).href);
const tmp = mkdtempSync(`${os.tmpdir()}/dailylife-c-`);
let fail = 0;
const check = (name, cond, extra = '') => {
  if (!cond) fail++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};
const W = (cfg = {}) => mod.definition.create({ cfg: { enabled: true, ...cfg }, botDir: tmp, dataDir: tmp });

const d = mod.definition.defaults();
check('默认工作区 subdir', d.workspaceSubdir === 'life', d.workspaceSubdir);
check('默认不删原始文件', d.deleteRawAfterReview === false);
check('默认每天 1 条', d.maxSharesPerDay === 1);
check('默认 5 段全开', mod.SLOT_KEYS.every((k) => d[`${k}Enabled`] === true));

// 时段 + 开关
const w = W();
check('五段', w.slotDefs().length === 5);
check('关掉深夜', W({ nightEnabled: false }).slotDefs().length === 4);
check('时段可改', W({ morning: '06:30-10:30' }).slotDefs()[0].from === '06:30');
check('跨天判定', W().inSlot(30, W().slotDefs()[4]) === true);

// 语言
const en = W({ locale: 'en' });
check('英文标签', en.slotDefs()[0].label === 'Morning', en.slotDefs()[0].label);
check('英文行程', en.scheduleText({ md: '10-28' }, en.pick()).includes("Today's schedule"));
check('中文行程', w.scheduleText({ md: '10-28' }, w.pick()).includes('今日行程'));

// 自定义池子
const pools = join(tmp, 'my-pools.json');
writeFileSync(pools, JSON.stringify({ slots: [{ key: 'morning', options: ['浇花'], seeds: ['水壶响了'] }] }), 'utf8');
const custom = W({ poolsFile: pools });
check('自定义选项生效', custom.slotDefs()[0].options[0] === '浇花');
check('未覆盖的段沿用默认', custom.slotDefs()[1].options.length > 0);
check('坏路径回退', W({ poolsFile: join(tmp, 'nope.json') }).slotDefs()[0].options.length === 4);

// 分享：上限 / 冷却 / 关掉
const today = new Date().toISOString().slice(0, 10);
const cap = W({ maxSharesPerDay: 1 });
cap.state.shares = [{ date: today, ts: new Date().toISOString() }];
cap.state.lastShareTs = new Date().toISOString();
check('超上限封顶为低', cap.score({ impact: 1, relevance: 1, emotion: -1 }).includes('（低）'));
check('关分享封顶为低', W({ allowShare: false }).score({ impact: 1, relevance: 1, emotion: -1 }).includes('（低）'));

const rec = W({ shareCooldownMinutes: 0 });
const n0 = rec.state.shares.length;
const out = rec.score({ impact: 0.8, relevance: 0.8, emotion: -0.6, sent: true });
check('sent 记录', rec.state.shares.length === n0 + 1, out.split('\n')[2]);

// 权重
const heavy = W({ wImpact: 0.0, wRelevance: 0.0, wSwing: 0.0, wEnergy: 0.0, wAffinity: 0.0 });
check('权重全 0 得 0 分', heavy.score({ impact: 1, relevance: 1, emotion: -1 }).includes('0.00'));

// 月末
check('默认归档文案', W({}).reviewText({ ym: '2026-10' }).includes('archive/'));
check('开启后删除文案', W({ deleteRawAfterReview: true }).reviewText({ ym: '2026-10' }).includes('直接删掉'));

// 子目录 + 状态文件
const sub = W({});
sub.writeSchedule('10-28', sub.pick());
check('写入 workspace/life', existsSync(join(tmp, 'workspace', 'life', 'schedule.md')));
sub.save();
check('状态在 data/daily-life', existsSync(join(tmp, 'daily-life', 'state.json')));

// 投放
const injTmp = mkdtempSync(join(os.tmpdir(), 'daily-life-inj-'));
const injEvents = [];
const injHost = { pushEvent: async (e) => injEvents.push({ type: e.type, text: e.text }), store: { range: async () => [] } };
const wi = mod.definition.create({
  cfg: { enabled: true, timezone: 'Asia/Shanghai', inject: '一盆小多肉\n楼下搬来新邻居' },
  botDir: injTmp, dataDir: injTmp,
});
await wi.start(injHost);
wi.timer && clearInterval(wi.timer);
await new Promise((r) => setTimeout(r, 50));
await wi.tick();
const inj = injEvents.filter((e) => e.type === 'daily-life.inject');
check('投放一次', inj.length === 1, `${inj.length}`);
check('多行合并', inj[0].text.includes('小多肉') && inj[0].text.includes('新邻居'));
await wi.tick();
check('不重复投放', injEvents.filter((e) => e.type === 'daily-life.inject').length === 1);
writeFileSync(join(injTmp, 'config.json'), JSON.stringify({
  worlds: { 'daily-life': { enabled: true, inject: '一盆小多肉\n楼下搬来新邻居\n今天降温了' } },
}), 'utf8');
await wi.tick();
const inj2 = injEvents.filter((e) => e.type === 'daily-life.inject');
check('新增行再投放', inj2.length === 2 && inj2[1].text.includes('降温') && !inj2[1].text.includes('小多肉'));

// 地点
const placeTmp = mkdtempSync(join(os.tmpdir(), 'daily-life-places-'));
const wp = mod.definition.create({ cfg: { enabled: true, timezone: 'Asia/Shanghai' }, botDir: placeTmp, dataDir: placeTmp });
wp.ensureWorldFile();
check('设定文件含地点节', readFileSync(join(placeTmp, 'workspace', 'life', 'my-side.md'), 'utf8').includes('我去过的地方'));
const places = wp.readPlaces();
check('读出 3 个地点', places.length === 3, places.map((x) => x.name).join('/'));
const realRandom = Math.random;
Math.random = () => 0.001;
const outPicks = wp.pick();
Math.random = realRandom;
check('四个时段出门（深夜除外）', outPicks.filter((p) => p.out).length === 4, outPicks.map((p) => `${p.key}:${p.out ? 'out' : 'in'}`).join(' '));
check('出门地点不是房间', outPicks.filter((p) => p.out).every((p) => p.place !== places[0].name));
check('经历文案含地点', wp.experienceText({ ym: '2026-10' }, wp.slotDefs()[0], outPicks).includes('你现在在：'));

// 配置组
const ui = w.webUi();
const group = ui.config?.[0];
const keys = Object.keys(group.schema.properties).map((p) => p.replace('worlds.daily-life.', ''));
const missing = keys.filter((k) => !(k in d));
check('owner', group.owner === 'world:daily-life');
check('字段 33 个', keys.length === 33, `${keys.length}`);
check('全部有默认值', missing.length === 0, missing.join(','));

console.log(fail === 0 ? 'ALL OK' : `FAILED ${fail}`);
process.exit(fail === 0 ? 0 : 1);


