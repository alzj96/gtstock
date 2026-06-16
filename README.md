# 选股研究 · 静态快照

一个**静态展示页**(GitHub Pages),呈现一份基于 **Ground Truth / 比特撞原子** 世界观 + Serenity 卡点 / Aschenbrenner 杠铃框架的美股选股研究清单:每只标的的角色定位(被收割者 / 收割者 / 卖铲人)、距基础模型远近(结构 vs 租金)、护城河耐久度、低位成色、当日 / 当月涨幅,以及可展开的完整研究报告。

> ⚠️ **免责声明**：本页仅为研究记录与框架演示,**不构成任何投资建议、买卖指令或目标价**。数据可能延迟或有误,据此操作风险自负。

## 它是怎么跑的

纯静态,无后端。页面运行时读取:

- `data/watchlist.json` — 关注清单(研究字段,手动快照)
- `data/quotes.json` — 当日 / 当月涨幅,**由 GitHub Action 定时从 Yahoo Finance 自动刷新**(见 `.github/workflows/refresh.yml` + `scripts/fetch-quotes.mjs`)
- `data/reports.enc.json` — 研究报告全文,**AES-256-GCM 加密**。默认上锁;输入正确密码后在浏览器内(Web Crypto)解密展示。明文 `reports.json` 永不发布,无密码无法读取。

涨幅自动更新;清单为手动导出快照。报告加密(密码不入仓库):
`REPORTS_PASSWORD='你的密码' node scripts/encrypt-reports.mjs` 生成 `data/reports.enc.json`。

## 致谢

UI 脱胎自 [JeffPu/ibkr-dashboard](https://github.com/JeffPu/ibkr-dashboard) 的「选股研究」模块。
