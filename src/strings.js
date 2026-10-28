/** 文案：zh / en。只有真正出现在事件与工具回执里的字符串在这里。 */

const zh = {
  scheduleHeader: (md) => `【今日行程 · ${md}】`,
  scheduleFooter: '（这是你今天的安排，看一眼记着就行；不用回复，也不用汇报。想看得更细可以去读工作区的日程文件。）',

  expTitle: (label, from, to) => `【${label} · ${from}–${to}】`,
  expActivity: (a) => `今天的行程：${a}`,
  expWorld: (w) => `你这边：${w}`,
  expSeed: (s) => `这次的偶然：${s}`,
  expAsk: '写两三句这个时段发生的事，然后：',
  expWrite: (f) => `- 落进工作区的 \`${f}\`（追加），并用 mem_memory 记一条`,
  expStay: '- 贴着行程和世界设定写，别临时加设定里没有的地方',
  expPeopleOff: '- 不要出现具体的人（邻居、熟人）；最多写声音，或一个看不清的路人',
  expPeopleOn: '- 可以出现具体的人，但只是一次性的，不会变成常驻角色',
  expShareOff: '- 现在分享是关着的：只记着，不要发',
  expShareOn: '- 有想说的，先调 `share_score` 算一下再决定发不发；发了之后带 `sent:true` 再调一次',

  reviewTitle: (ym) => `【月末整理 · ${ym}】`,
  reviewRead: (f) => `读工作区的 \`${f}\`：`,
  reviewStep1: '1. 把影响小、不想留的删掉',
  reviewStep2: (f) => `2. 把重要的压缩成几句，追加到 \`${f}\``,
  reviewDelete: (f) => `3. 如果还有 \`${f}\`，它上个月已经压缩过了，直接删掉（这才是真的忘掉）`,
  reviewArchive: (f) => `3. 如果还有 \`${f}\`，把它移进 \`archive/\`（不删，留作回溯）`,
  reviewNote: '（分享欲分数低于 0.35 的那些，基本都可以忘。）',

  injectTitle: '【主人往你的世界里放了点什么】',
  injectHint: '这是他从外面放进来的。你可以决定它们怎么进你的日子：\n'
    + '- 想记住就把变化写进 `my-side.md`（一次只添一样，别一次改太多）\n'
    + '- 想说话就跟他说一句，不想说也正常',

  shareHead: (s, level) => `分享欲 ${s}（${level}）`,
  advise: '建议：',
  advHigh: '可以说，但也可以忍住',
  advMid: '看当时的氛围，想说就说',
  advLow: '建议只记着，不说',
  detail: '明细：',
  extra: '附加：',
  fImpact: '影响',
  fRelevance: '相关',
  fSwing: '情绪波动',
  fEnergy: '精力',
  fAffinity: '关系温度',
  noteShared: (p) => `今天已经分享过，−${p}`,
  capShareOff: '分享总开关是关的（只记录、不主动发）',
  capMax: (n, max) => `今天已经分享 ${n}/${max} 条`,
  capCooldown: (mins, cool) => `距上次分享只过了 ${mins} 分钟（冷却 ${cool}）`,
  capQuiet: '静默时段，封顶为低',
  countMax: (n, max) => `今天已分享 ${n}/${max} 条`,
  countUnlimited: '今天分享不限条数',
  recorded: (n) => `已记下今天第 ${n} 条分享`,
  hintRecord: '发出去之后带 sent:true 再调一次，我才能记住',
  footer: '（这是建议，不是命令。想发就发，不想发也正常。）',
  levelHigh: '高',
  levelMid: '中',
  levelLow: '低',
  slotLabels: { morning: '早晨', noon: '中午', afternoon: '下午', evening: '晚上', night: '深夜' },
};

const en = {
  scheduleHeader: (md) => `[Today's schedule · ${md}]`,
  scheduleFooter: '(This is your plan for today. Just read it; no reply or report needed. Read the schedule file in your workspace if you want the details.)',

  expTitle: (label, from, to) => `[${label} · ${from}–${to}]`,
  expActivity: (a) => `Today's plan: ${a}`,
  expWorld: (w) => `Your side: ${w}`,
  expSeed: (s) => `The random bit: ${s}`,
  expAsk: 'Write two or three sentences about what happened in this slot, then:',
  expWrite: (f) => `- append it to \`${f}\` in your workspace, and record one line with mem_memory`,
  expStay: '- stay inside the plan and the world setting; do not add places that are not there',
  expPeopleOff: '- do not bring in specific people (neighbours, friends); sounds or a faceless passer-by at most',
  expPeopleOn: '- specific people may appear, but only once; never as a recurring character',
  expShareOff: '- sharing is off right now: just keep it, do not send',
  expShareOn: '- if it makes you want to talk, call `share_score` first and then decide; after sending, call it again with `sent:true`',

  reviewTitle: (ym) => `[Monthly review · ${ym}]`,
  reviewRead: (f) => `Read \`${f}\` in your workspace:`,
  reviewStep1: '1. delete the ones that mattered little and you do not want to keep',
  reviewStep2: (f) => `2. compress the important ones into a few lines and append them to \`${f}\``,
  reviewDelete: (f) => `3. if \`${f}\` is still there, it was compressed last month; delete it (that is what forgetting means)`,
  reviewArchive: (f) => `3. if \`${f}\` is still there, move it into \`archive/\` instead of deleting it`,
  reviewNote: '(Anything scored below 0.35 can usually be forgotten.)',

  injectTitle: '[The owner put something into your world]',
  injectHint: 'It came from outside. You decide how it enters your days:\n'
    + '- if you want to keep it, write the change into `my-side.md` (one thing at a time)\n'
    + '- say something if you feel like it; staying quiet is fine too',

  shareHead: (s, level) => `Urge to share ${s} (${level})`,
  advise: 'Advice: ',
  advHigh: 'you could say it, and you may also hold it in',
  advMid: 'depends on the mood; say it if it fits',
  advLow: 'just keep it, do not send',
  detail: 'Breakdown: ',
  extra: 'Notes: ',
  fImpact: 'impact',
  fRelevance: 'relevance',
  fSwing: 'emotional swing',
  fEnergy: 'energy',
  fAffinity: 'closeness',
  noteShared: (p) => `already shared today, −${p}`,
  capShareOff: 'sharing is switched off (record only)',
  capMax: (n, max) => `already shared ${n}/${max} today`,
  capCooldown: (mins, cool) => `only ${mins} min since the last share (cooldown ${cool})`,
  capQuiet: 'quiet hours: capped at low',
  countMax: (n, max) => `shared today: ${n}/${max}`,
  countUnlimited: 'no daily share limit',
  recorded: (n) => `recorded: share #${n} today`,
  hintRecord: 'call again with sent:true after sending so it is remembered',
  footer: '(This is advice, not an order. Sending or not sending are both fine.)',
  levelHigh: 'high',
  levelMid: 'medium',
  levelLow: 'low',
  slotLabels: { morning: 'Morning', noon: 'Noon', afternoon: 'Afternoon', evening: 'Evening', night: 'Late night' },
};

export const STRINGS = { zh, en };

export function stringsFor(locale) {
  return locale === 'en' ? STRINGS.en : STRINGS.zh;
}
