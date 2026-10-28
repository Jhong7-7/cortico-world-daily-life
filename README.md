# 每日生活（Daily Life）— Coopanion World

让 bot 有自己的日子：每天一份随机行程，按时段写一段经历，月末整理一次。

*A Cortico World that gives the bot a life of its own: a random daily schedule, one written experience per slot, and a monthly review. Zero network, zero API keys.*

- 每天第一次醒来时，随机抽一份五段式行程，写进工作区；
- 每个时段开始时，带着「行程 + 一个随机偶然 + 世界设定」推它一次，让它写下刚发生的事；
- 这些经历会进工作区、进记忆；月底压缩一次，忘掉不重要的；
- 想分享的时候，用 `share_score` 算一下该不该说——**算出来的是建议，不是命令**。

## 用途

Cortico 的 bot 默认是「被叫醒才说话」：没人找它，它就停在原地。这个 World 补的是**它自己的日子**——有行程、有时段、有遇到的事，聊天时不再只有「回应」，还有「我今天……」

- **给角色一条生活线**：每天五段行程（早晨/中午/下午/晚上/深夜），不是随机报时，而是「今天它打算怎么过」
- **给对话加由头**：每段经历里带一个偶然（窗外、楼下、隔壁），这些就是它主动开口的素材
- **给记忆一个来源**：经历写进工作区并记进记忆，月末压缩一次——忘掉不重要的，留下重要的
- **给设定一个锚**：`my-side.md` 是它的固定世界（房间、窗、楼下），经历只能从这里长出来，不会今天海边明天沙漠
- **让「想分享」有依据**：分享欲按影响、相关性、情绪、精力、关系算出来，而不是掷骰子

**适合**：想要角色有自己的作息与日常、希望它主动分享生活片段的部署。

**不适合**：只想要一个问答助手的部署；不接受「它有自己的事」这种设定的部署。

**和别的 World 的关系**：它不替代 `life`（生活状态）、`selftalk`（自主发言）、`clock`（时间）。
`life` 管状态与主动搭话，`selftalk` 管安静时的自说自话，这个 World 管「每天过什么日子」。三者可以同时开，也可以只开这一个。

## 工作原理

World 是一个 60 秒一次的定时器，检查四件事：

1. **行程**：当天还没有行程，且（它今天醒过 或 已经过了 `generateAt`）→ 从每段的选项池里各抽一个，写 `schedule.md`，推一条 `daily-life.schedule` 事件。
   - 醒着时用 `debounce` 投递（不额外叫醒）；没醒时用 `piggyback`（等它自己醒）
2. **经历**：当前时间落在某个**已启用**时段内，且这个时段今天还没触发过 → 推一条 `daily-life.experience` 事件，正文带上行程、世界设定、一个随机偶然、写法和分享规则。
3. **月末整理**：每月最后一天过 `monthlyReviewAt` → 推一条 `daily-life.monthly-review`，让它删掉不重要的、压缩重要的，并处理上个月的原始文件。
4. **分享**：它自己调 `share_score`，把影响/相关/情绪交给世界，世界结合精力、关系、今日已发条数、冷却与静默时段算出 0–1 的分数。

事件只是提示，**写不写、发不发都由 bot 自己决定**。

工具回执示例：

```
分享欲 0.81（高）| 建议：可以说，但也可以忍住
明细：影响 0.45×0.90=0.405, 相关 0.20×0.80=0.160, 情绪波动 0.15×0.80=0.120, 精力 0.10×0.60=0.060, 关系温度 0.10×0.60=0.060
今天已分享 0/1 条；发出去之后带 sent:true 再调一次，我才能记住
（这是建议，不是命令。想发就发，不想发也正常。）
```

## 配置

WebUI → 设置 → **Daily Life**（group id `world:daily-life`）。**改完不用重启**，下一次 60 秒检查就生效；时段格式写错会退回内置默认值。

| 配置键 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `enabled` | 开关 | `false` | 总开关 |
| `locale` | 字符串 | `zh` | `zh` / `en`，决定事件语言 |
| `timezone` | 字符串 | `Asia/Shanghai` | IANA 名称 |
| `generateAt` | 字符串 | `05:30` | 行程兜底生成时刻（不会叫醒） |
| `monthlyReviewAt` | 字符串 | `23:30` | 月末整理时刻 |
| `morning` / `noon` / `afternoon` / `evening` / `night` | 字符串 | `07:00-11:00` / `11:00-14:00` / `14:00-18:00` / `18:00-22:00` / `22:00-01:00` | 时段范围，`HH:MM-HH:MM`；深夜可跨天 |
| `morningEnabled` … `nightEnabled` | 开关 | 全 `true` | 单独关掉某个时段 |
| `allowPeople` | 开关 | `false` | 经历里能否出现具体的人（只一次性，不常驻） |
| `allowShare` | 开关 | `true` | 关掉后只记录、不主动发 |
| `maxSharesPerDay` | 整数 0–10 | `1` | 每天最多分享几条，`0` = 不限 |
| `shareCooldownMinutes` | 整数 0–720 | `90` | 两条分享的最小间隔，`0` = 不设 |
| `wImpact` | 数字 0–1 | `0.45` | 权重·对 bot 的影响 |
| `wRelevance` | 数字 0–1 | `0.20` | 权重·对用户的相关性 |
| `wSwing` | 数字 0–1 | `0.15` | 权重·情绪波动 |
| `wEnergy` | 数字 0–1 | `0.10` | 权重·精力 |
| `wAffinity` | 数字 0–1 | `0.10` | 权重·关系温度 |
| `sharePenalty` | 数字 0–1 | `0.10` | 当天已分享过时扣的分 |
| `quietFrom` / `quietTo` | 整数 0–23 | `22` / `7` | 静默时段，分享欲硬封顶为低 |
| `highThreshold` / `midThreshold` | 数字 0–1 | `0.65` / `0.35` | 三档阈值 |
| `deleteRawAfterReview` | 开关 | `false` | 开：删掉上个月原始文件；关：移进 `archive/` |
| `workspaceSubdir` | 字符串 | `life` | 文件放 `workspace/<子目录>/`，留空 = 根目录 |
| `poolsFile` | 字符串 | 空 | 自定义池子 JSON 的路径（绝对路径或相对 bot 目录） |
| `inject` | 字符串 | 空 | 手动投放：每行一条世界事件，新增的行投放一次（不重复） |

权重**不要求加起来等于 1**，算的是原样加权和；某个权重设成 0 就表示完全忽略该因素。

## 投放点什么（主人的干预）

想往它的世界里放点东西——买了个物件、楼下搬来新邻居、今天降温了——不用写脚本，直接在面板的 **Put something into her world**（`inject`）里写，**每行一条**：

```
楼下搬来了一户新邻居
主人给我买了一盆小多肉
今天降温，窗玻璃上结了雾
```

保存后，下一次 60 秒检查会把**没投放过的新行**合并成一条事件推给它：

```
【主人往你的世界里放了点什么】
- 楼下搬来了一户新邻居
- 主人给我买了一盆小多肉

这是他从外面放进来的。你可以决定它们怎么进你的日子：
- 想记住就把变化写进 my-side.md（一次只添一样）
- 想说话就跟他说一句，不想说也正常
```

要点：

- **不会重复**：已投放的行记在 state 里，旧行留着也没关系；想清理直接删掉
- **合并成一条**：一次写多行也是一条事件，不刷屏
- **由它决定**：写不写进设定、要不要回你，都不强制

## 地点：她会出门

她的世界不止一间房。设定文件 `my-side.md` 里有一节「我去过的地方」：

```markdown
## 我去过的地方
- 我的房间：二楼，朝南
- 楼下：一条街，有便利店
- 街角：小公园，几张长椅
```

- 行程会按概率**出门**（默认：早晨 10% / 中午 15% / 下午 25% / 晚上 25% / 深夜 0%）
- 出门时活动从 `outOptions` 里抽，地点从「房间以外的地方」里抽
- 经历事件会带上「你现在在：街角」，并要求它只在这一带写
- **想解锁新地方**：让它自己把新地方写进这一节，或者用 `inject` 投放一句「今天带你去了超市」

概率和出门活动都在 `pools.default.json`（或你自己的 `poolsFile`）里，每段有 `doorChance` 和 `outOptions` / `outOptions_en`。

## 经历怎么写：只给时间、地点和方向

每段经历的事件里，**不再替它决定"做什么"**。它只收到三样：

```
【下午 · 14:00–18:00】
你在：街角
这次注意：物件
```

- **时间**：哪个时段
- **地点**：它现在在哪（房间 / 楼下 / 街角 …）
- **方向**：六个随机方向之一——声音 / 物件 / 身体 / 天气 / 念头 / 远处的动静
  （打开 `Allow specific people` 后多一个"路人"）

方向只花两个 token，但能把它从"今天又发呆"里拉出来：同一地点，注意声音和注意身体，写出来完全不同。

行程表仍然每天生成一次（用来回答"你在干嘛"），但**不再塞进每段经历**——这是 0.3.0 相比 0.2.x 省下来的上下文。

## 自定义池子

默认池子在 `src/pools.default.json`，覆盖它不用改包：把 `poolsFile` 指向你自己的 JSON，按 `key` 合并（没写的字段沿用默认）。

```json
{
  "slots": [
    { "key": "morning", "options": ["浇花", "煮咖啡"], "seeds": ["水壶响了", "楼下在扫地"] }
  ]
}
```

字段：`key`、`label`/`label_en`、`from`/`to`、`options`/`options_en`、`seeds`/`seeds_en`。

## 安装到本机的 Coopanion

1. 把本目录复制到 `<Coopanion>/data/extensions/local/cortico-world-daily-life`
2. 在 `data/extensions/package.json` 的 `dependencies` 里加：
   ```json
   "cortico-world-daily-life": "link:D:/path/to/data/extensions/local/cortico-world-daily-life"
   ```
3. 在 `data/extensions/node_modules/` 下建一个指向它的目录链接（Windows 用 `mklink /J`，或用 pnpm 重新安装）
4. 在 bot 的 `config.json` 里加（或直接重启后在面板里改）：
   ```json
   "worlds": {
     "daily-life": { "enabled": true, "timezone": "Asia/Shanghai" }
   }
   ```
5. 重启核心（`POST /api/run/restart`），确认启动日志里有 `World 已启动: daily-life`

## 卸载

1. 面板里关掉 `enabled`，或把 `config.json` 里的 `worlds.daily-life` 删掉
2. 删掉 `data/extensions/node_modules/cortico-world-daily-life` 链接、`data/extensions/local/` 里的目录，以及 `package.json` 里的那条依赖
3. 想一并清掉数据：删 `workspace/<子目录>/`（`schedule.md`、`my-side.md`、`experiences-*.md`）和 `data/daily-life/`

卸载不会自动删任何文件——**留下还是清掉由你决定**。

## 注意

- **它会唤醒 bot**：每天行程 1 次 + 每个启用的时段 1 次（默认 5 次）+ 每月整理 1 次。这些唤醒会产生模型调用，这是唯一成本。
- **经历是生成的，不是事实**：它写的是自己这边的日子。被认真追问时，回答口径应由人格文件决定，本 World 不替它编造用户的现实。
- **不做决定**：`share_score` 只给分数和档位；发不发、写不写都由 bot 自己判断。
- **不联网、不调模型**：没有 API key、没有遥测，所有数据都在本机。

## 已知限制

- 跨天时段（如 22:00–01:00）在 00:00 之后不会补触发；如果 bot 整晚离线，这一段经历会缺失
- 月末整理依赖 bot 自己读写文件；本 World 不代它删除或压缩
- 状态文件是 `data/daily-life/state.json`，不支持多部署共享
- 行程一旦生成本日不再变化；改时段只影响还没触发的时段

## 开发

```bash
node test/run.mjs     # 纯函数与配置组测试
```

发布前建议在 Cortico 仓库跑 `pnpm describe:extension` 与 `pnpm check:extension`，确认 `describe.json` 与默认值一致。

## 版本

`0.3.0`

## 许可

MIT
