# 邻栖 · 城市二手家具寄卖估价上架配送与售后平台

围绕**一件家具**打通完整链路：居民寄卖申请 → 估价师上门验真报价 → 清洁/补漆/入仓/拍照/上架 →
买家下单 → 配送排班（楼层/电梯/拆装/车辆/旧家具搬出）→ 异常协同工单（卖家反悔、估价与实物不符、
翻新超支、**到货色差**、沙发进不了电梯、途中磕碰、退货）→ 逐项有来源的结算 → 品类运营分析、
**摄影规范整改**与卖家风险画像。

**色差售后争议专项**：买家收货认为颜色与页面照片不符时，客服在协同工单中调取
拍摄灯光、未修原图、修图记录、页面颜色描述与色差提示，比对买家现场照片与现场光线后裁定——
页面描述不准确 → 平台承担退换或补偿，商品差评并进入摄影规范整改；
自然光差异且页面已提示 → 维持交易并提供保养建议。退货成立后家具回库复检残值、
核算返程仓储费、判定能否二次上架，**卖家结算暂缓至复检与重新处理结论确认**。

技术栈：**React 18 + Vite + TypeScript**（前端）· **NestJS 10 + TypeORM**（后端）· **PostgreSQL 15**。

---

## 一、一键启动（Docker Compose，推荐）

需要 Docker 20.10+ 与 Docker Compose v2。

```bash
docker compose up --build
```

启动后：

| 服务 | 地址 | 说明 |
| --- | --- | --- |
| 前端（Nginx 托管） | http://localhost:8080 | 全部业务页面 |
| 后端 API | http://localhost:3000/api | NestJS，仅后端调试时直接访问 |
| PostgreSQL | localhost:5432 | 库名/用户/密码：furniture / postgres / postgres |

首次启动后端会**自动建表并写入演示数据**（约 5~10 秒，等待 API 日志出现
`Furniture consignment API listening`）。清空数据重来：

```bash
docker compose down -v   # -v 删除数据卷
docker compose up --build
```

> 本项目为全栈应用（含完整前端业务页面），按任务约定不单独提供 Swagger UI；
> 后端 REST 接口可通过前端各角色页面操作验证，接口清单见文末附录。

## 二、本地开发启动（不用 Docker）

前置：Node.js 20+、一个可连接的 PostgreSQL 15。

### 1. 准备数据库

```bash
createdb -U postgres furniture
# 或：psql -U postgres -c "CREATE DATABASE furniture;"
```

### 2. 后端（端口 3000）

```bash
cd backend
npm install
# 按实际情况修改 backend/.env（DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME）
npm run dev          # 开发模式（ts-node）
# 或
npm run build && npm start
```

后端启动时自动建表（TypeORM synchronize）并在空库上写入演示种子数据。
若不需要种子，设置环境变量 `SEED_ON_BOOT=false`。

### 3. 前端（端口 5173）

```bash
cd frontend
npm install
npm run dev
```

Vite 已配置 `/api` 代理到 `http://127.0.0.1:3000`（可用环境变量 `VITE_API_TARGET` 覆盖）。
打开 http://localhost:5173 即可。

前端生产构建：`npm run build`（产物在 `frontend/dist`，容器中由 Nginx 托管）。

---

## 三、测试账号

| 角色 | 账号 | 密码 | 能做什么 |
| --- | --- | --- | --- |
| 卖家（信用良好） | `wangjiayi` | `seller123` | 提交寄卖、查看验真等级/估价、反悔、看自己的结算 |
| 卖家（高风险） | `linfan` | `seller123` | 有 1 次反悔 + 1 次描述不符，新寄卖自动触发**严格验真** |
| 卖家 | `liujing` | `seller123` | 有一单已成交结算的办公椅 |
| 买家 | `zhangmai` | `buyer123` | 逛市场、下单（含电梯/楼层/旧家具搬出计价）、发起售后 |
| 买家 | `sunmai` | `buyer123` | 有一单"沙发进不了电梯"退货工单 |
| 估价师 | `gujia` | `gujia123` | 上门预约、六项验真打分、寄卖价/底价/佣金、相符度、入仓/自提 |
| 仓库管理 | `cangguan` | `cangguan123` | 入库库位、拍照档案（灯光/原图/修图/色差提示）、上架描述、退货回库残值复检、摄影整改重拍、二次上架 |
| 翻新师 | `fanxin` | `fanxin123` | 清洁/补漆/维修作业登记（费用入结算） |
| 配送 | `peisong` | `peisong123` | 排班、车辆、装车、送达、失败原因登记 |
| 客服 | `kefu` | `kefu123` | 协同工单六方留言、色差取证核对与裁定（描述不准退换/补偿 vs 自然光差异维持+保养建议）、生成结算单（暂缓单拦截） |
| 运营 | `ops` | `ops123` | 品类分析看板、卖家风险画像、结算查看 |
| 管理员 | `admin` | `admin123` | 与运营/客服同等权限 |

登录页也提供"一键填充"按钮。买家/卖家还可在登录页自助注册（接口
`POST /api/auth/register`，仅开放 SELLER/BUYER 两种身份）。

## 四、推荐验证路径（业务主线）

1. **卖家 `wangjiayi` 登录**：顶部显示信用画像（风险分 0、常规验真）；可提交一件沙发寄卖。
2. 切换 **估价师 `gujia`**：待办队列里高风险卖家 `linfan` 的申请带"⚠ 严格验真"并置顶；
   对新申请逐项打分（结构/污渍/异味/虫蛀/变形/搬运难度），填写寄卖价、底价、佣金率、
   清洁翻新建议，选择"相符/轻微不符/严重不符"，决定入仓或留卖家家中、配送半径。
3. **翻新师 `fanxin` / 仓库 `cangguan`**：登记清洁、补漆费用 → 清洁完成 → 拍照 →
   填写上架描述/库位/配送范围 → 上架。
4. **买家 `zhangmai`**：市场下单，选择无电梯楼层、旧家具搬出，实时看到配送费计价；
   订单锁定商品。
5. **配送 `peisong`**：按楼层/拆装/车辆/旧家具搬出/预约时间排班 → 装车 → 送达；
   也可对种子中的大沙发尝试"配送失败 → 进不了电梯"。
6. **买家**在订单页发起"色差/磕碰/退货"工单；**仓库、配送、客服**依次进入同一工单留言协同；
   **客服 `kefu`** 裁定处理结论（维持/降价/卖家或平台赔付/退货退款/重新上架/终止寄卖），
   订单、商品、寄卖单状态随之联动。
7. **色差争议验证（书柜，种子内置两条）**：
   - 买家 `zhangmai` 的订单 `OD2026000003`：实物颜色比页面深 → 客服核对拍摄档案
     （暖光 3200K、修图降饱和、未挂色差提示）后裁定**页面描述不准确** → 平台退货退款 + 60 元搬运补偿，
     商品差评、进入摄影规范整改，订单显示**卖家结算暂缓**。用仓库 `cangguan` 在"退货取回中"
     登记回库复检（残值 500、额外仓储费 30、可二次上架）→ 完成"摄影整改重拍" →
     客服在工单确认"退货返仓重新上架"，商品重新 LISTED；随后结算管理可生成退货结算单
     （卖家应得 0、平台吸收成本、残值与额外仓储费均有来源）。
   - 买家 `sunmai` 的订单 `OD2026000004`：晚上暖光下觉得书柜偏黄 → 页面为自然光无修图且**已提示色差**，
     客服裁定**自然光差异**，维持交易并发送保养建议；结算不暂缓。
   - 运营 `ops` 看板可见各品类色差争议分类统计、差评数与"摄影规范整改队列"。
8. **客服**在"结算管理"对已送达订单生成结算单：成交价、佣金、翻新费、仓储费（按在仓天数）、
   配送费、售后赔付、退货回库残值逐项列出**来源说明**；退货单展示平台吸收的成本。
9. **运营 `ops`**：查看六品类成交周期、翻新投入占比、退货原因（含色差）、配送失败率与
   "适合入仓寄卖 / 建议同城自提"渠道建议；查看卖家风险画像排序与摄影规范整改队列。
10. 用 **`linfan`** 再提交一件寄卖，确认申请自动带上"严格验真"；卖家在约估价后反悔，
    画像中反悔次数与风险分立即变化。

## 五、自动化验证

后端附端到端接口脚本（需要先启动后端与空库/种子库）：

```bash
cd backend
bash e2e-test.sh
```

覆盖：鉴权与角色拦截 → 申请（画像联动）→ 六项验真估价（含底价校验）→ 作业记账 →
上架（拍摄档案/色差提示规范拦截）→ 下单与配送费计价 → 排班/装车/送达 → 工单协同与客服裁定 →
结算金额与来源 → 品类分析与渠道建议 → 严格验真触发 → 反悔计入画像 →
**色差完整链路（描述不准退货→结算暂缓→回库残值复检→摄影整改→二次上架→退货结算来源 /
自然光差异维持不暂缓）**，共 39 项断言。

## 六、实际执行过的验证（本工作区）

- `cd backend && npx tsc` 编译通过；`cd frontend && npm run build`（tsc 类型检查 + vite 打包）通过。
- 本机 PostgreSQL 15 临时实例（端口 5433）上启动后端，建表与演示种子（含 2 条书柜色差样例）成功写入。
- `bash backend/e2e-test.sh` 结果：**PASS=39 FAIL=0**。
- Vite dev server 返回 200，经其 `/api` 代理登录接口返回有效 JWT。
- Docker 守护进程在当前沙箱不可用，镜像未在本机实际构建；`docker-compose.yml`
  与两个 Dockerfile 已按标准 node:22-alpine / nginx:1.27-alpine 多阶段构建编写，
  请在有 Docker 的环境执行 `docker compose up --build` 验证。

## 七、核心业务规则

- **验真等级**：风险分 = 反悔×3 + 描述不符×2 + 售后争议×1 − 成交×0.5；≥4 分或描述不符 ≥2 次
  → 新寄卖自动 STRICT（估价师工作台置顶，逐项核对）。
- **价格**：最低成交价（底价）不可高于寄卖价；买家出价低于底价无法下单。
- **配送费**：基础 ¥60；无电梯/楼梯房 `（楼层−1)×¥15`；旧家具搬出 +¥80；配送半径 0km（同城自提）免配送费。
- **仓储费**：在仓商品按 ¥3/天，从入库时间计至结算日；留卖家家中不收仓储费。
- **结算**：
  - 正常成交：卖家应得 = 成交价 − 佣金（估价单费率）− 清洁翻新费（作业记录）− 仓储费 − 卖家责任赔付；
    平台净收入 = 佣金 + 配送费 − 平台责任赔付。
  - 退货：买家全额退款，卖家应得为 0，已发生的翻新/仓储/配送成本由平台吸收（工单另有约定从其约定）。
- **色差争议裁定**：
  - 客服必须先选裁定原因：`LISTING_INACCURATE` 页面描述不准确（照片/修图失真或缺色差提示）
    → 责任方为平台/共担，平台承担退换或补偿，不可维持原交易；商品记差评、摄影规范置为待整改，
    重拍改描述前不可二次上架。
  - `NATURAL_VARIATION` 自然光/灯光差异：仅当页面已做色差提示时成立，只能维持交易，
    且必须随附保养/摆放建议；结算不暂缓。
  - `MIXED` 部分属实：可补偿/降价，视情况要求补充色差提示与对比图。
- **退货回库与结算暂缓**：退货裁定成立 → 订单与商品进入 RETURNING，订单 `settlementHold=true`，
  结算接口拒绝生成；仓库回库复检（残值、返程/复检仓储费、可否二次上架）→ 商品 RETURNED、
  订单解除暂缓；可二次上架且摄影整改完成后客服确认 RE_LIST 重新 LISTED；
  不可上架则残值处置冲抵平台损失。退货结算中额外仓储费与残值均逐项列来源。
- **摄影规范**：上架必须登记拍摄灯光、修图记录并勾选色差提示，否则拦截；
  色差成立的商品自动进入整改队列，运营看板按品类统计色差争议、差评与待整改数。
- **渠道建议**：品类配送失败率 ≥25% 或电梯/楼道受阻占失败多数 → 建议同城自提为主；
  成交周期 ≤7 天、翻新占均价比 ≤12%、退货率 ≤15% → 适合入仓寄卖。

## 八、接口清单（附录）

所有接口前缀 `/api`，除 `auth/login`、`auth/register` 外均需 `Authorization: Bearer <token>`，
并按角色授权。

- `POST /auth/login`、`POST /auth/register`、`GET /auth/me`
- `POST /consignments`（卖家提交）、`GET /consignments`、`GET /consignments/:id`、
  `POST /consignments/:id/schedule`（估价师预约）、`POST /consignments/:id/cancel`（卖家反悔）
- `GET /appraisals/queue/pending`、`POST /appraisals/consignment/:id`（验真报价，接受则生成商品）、
  `GET /appraisals/consignment/:id`
- `GET /items`（买家仅见在售）、`GET /items/:id`、
  `POST /items/:id/work-logs`（清洁/补漆/维修/拍照/文案/入库/整改重拍/回库复检）、
  `POST /items/:id/advance`（状态推进/上架，需拍摄档案与色差提示）、
  `POST /items/:id/return-inspection`（回库残值/额外仓储费/可否二次上架，解除暂缓）、
  `POST /items/:id/photo-remedy`（摄影规范整改：重拍/原图/修图记录/色差提示/修正描述）
- `POST /orders`（买家下单，含配送费试算）、`GET /orders`、`GET /orders/:id`、`POST /orders/:id/cancel`
- `GET /deliveries/queue`、`POST /deliveries/:orderId/schedule|load|done|fail`
- `POST /tickets`（任意相关方发起异常；色差工单可带 buyerPhotos/buyerLighting/buyerSceneNote）、
  `GET /tickets`、`GET /tickets/:id`、
  `POST /tickets/:id/messages`（六方协同留言）、
  `POST /tickets/:id/color-evidence`（色差：补充买家现场照片/光线/说明）、
  `POST /tickets/:id/resolve`（客服裁定；色差需带 colorFinding、维持交易需 careAdvice、
  描述不准可带 photoRemedyNote；退货成立自动暂缓卖家结算）
- `GET /settlements`、`GET /settlements/order/:orderId`、`POST /settlements/order/:orderId/generate`
  （暂缓订单返回 400；退货结算含残值与返程仓储费来源）
- `GET /analytics/by-category`（品类指标、色差争议分类、差评/待整改统计与渠道建议）、
  `GET /analytics/photo-remedy-queue`（摄影整改/退货回库队列）、
  `GET /analytics/seller-profiles`、`GET /analytics/seller-profiles/:sellerId`

## 九、目录结构

```
.
├── docker-compose.yml          # db + backend + frontend 一键启动
├── backend/                    # NestJS + TypeORM + PostgreSQL
│   ├── Dockerfile
│   ├── src/
│   │   ├── entities/           # 10 张核心表
│   │   ├── auth/               # JWT + 角色守卫
│   │   ├── risk/               # 卖家风险画像（全局服务）
│   │   ├── consignments/ appraisals/ items/ orders/
│   │   ├── deliveries/ tickets/ settlements/ analytics/ seeder/
│   │   └── main.ts
│   └── e2e-test.sh             # 20 项端到端断言
└── frontend/                   # React + Vite
    ├── Dockerfile  nginx.conf
    └── src/views/              # 登录 + 7 类角色工作台
```
