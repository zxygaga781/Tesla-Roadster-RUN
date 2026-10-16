# 特斯拉能飞

作者：家里空调 16 ℃

游戏前端是无依赖的静态像素风网页，排行榜使用独立在线后台。银白色 Roadster 火箭起跳，越过城市道路上的汽车。支持电脑和手机浏览器。电脑使用键盘或鼠标；手机仅展示游戏区域，支持点击赛道和底部起跳、下压按钮，横竖屏均可玩。

## 本地运行

在本目录运行 `python3 -m http.server 8916 --directory dist`，访问 `http://localhost:8916`。使用 HTTP 服务打开，因为游戏使用原生 ES modules。

运行逻辑测试：`node --test tests/*.test.mjs`。不需要安装 npm 依赖，不需要构建。发布目录为 `dist/`。

## 操作

- 空格 / ↑ / 点击赛道：起跳。
- ↓：空中快速落地，地面压低车身躲避低空无人机。
- P / Esc：暂停、继续；R：重新开始。
- 右上角按钮：音效、暂停和全屏。

开场圆弧坡道爬升、白色气流推进，随后自动前进、随机障碍、逐渐加速、三秒起步保护、碰撞结束、每 100 分提示、每 700 分切换短暂夜间。切出窗口自动暂停。最高分、音效偏好与匿名玩家标识保存在当前浏览器。在线每局成绩记录在 Cloudflare D1；每位玩家按最高分上榜，同分并列。一局结束显示本局与其他玩家最高分比较的排名。

## 代码与来源

- `dist/core.js`：独立的 60 Hz 固定步长游戏逻辑。
- `dist/renderer.js`：Canvas 像素车辆、城市视差背景和推进动画。
- `dist/app.js`：键盘与鼠标、暂停、保存、音效和界面。
- `tests/core.test.mjs`：物理、碰撞、刷新率一致性、障碍、计分和昼夜逻辑测试。

跳跃重力、初速、加速度、速度上限、计分换算和随机障碍间隔公式参考 [wayou/t-rex-runner](https://github.com/wayou/t-rex-runner/blob/gh-pages/index.js) 提取的 Chromium 小恐龙代码。原始文件标有 `Copyright (c) 2014 The Chromium Authors`。保留两份原始 BSD 许可于发布目录。

角色和场景绘制为本项目的新代码；按车辆外形调整角色、障碍轮廓和碰撞框，无人机对应原作翼龙。采用固定步长兼容高刷新率屏幕，短按松手在达到最小跳高后收束，避免很快松手被误判为长跳。上述为适配改动，不宣称与 Chromium 每一帧表现完全一致。

车辆以 [Tesla Roadster](https://www.tesla.com/roadster) 的火箭版主题进行像素艺术演绎，不是官方产品素材或真实性能模拟。独立同人作品，与 Tesla、Google、SpaceX 无隶属或合作关系。

车型参考：Tesla 2026 年 10 月 15 日发布会官方画面，经 Engadget 现场报道截图核对，演示车为白色车身和深色座舱，喷流为白色气雾。https://www.engadget.com/img/gallery/tesla-roadster-launch-live-blog/liveblog/firefox8u6m9x5bwk-jpg.jpg

## 排行榜后台

`backend/worker.js` 是 Cloudflare Pages Function，`backend/migrations/` 保存 D1 数据库结构。

- `POST /runs` 开始一局；`POST /scores` 提交成绩；`GET /leaderboard` 获取前十名。
- 后台记录匿名玩家、每局开始/结束时间、分数和个人最高分。玩家使用随机标识，无需注册；清除浏览器数据或换设备会成为新玩家。
- 同一局重试不会重复计分。包含分数范围、时间上限和频率校验；这是休闲小游戏排行榜，不提供比赛级防作弊。
- 账号所有者可在 Cloudflare 控制台的 D1 数据库中查询 `players`（最高分）与 `runs`（每局记录）。未结束的局分数为 NULL。
- 本地开发使用 Node.js 22.13+ 和 pnpm；在 `backend/` 执行 `pnpm install`，然后 `pnpm exec wrangler d1 migrations apply tesla-can-fly-scores --local`、`pnpm dev`。
- 后台部署：`pnpm exec wrangler d1 migrations apply tesla-can-fly-scores --remote`，然后 `pnpm run deploy`。前端接口地址位于 `dist/leaderboard.js`。GitHub Pages 自动发布前端，后台改动单独部署。

线上排行榜接口：`https://tesla-can-fly-scores.pages.dev`。游戏继续通过 GitHub Pages 发布。
