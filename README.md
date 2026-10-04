# 邻栖 · 城市二手家具寄卖估价上架配送与售后平台

围绕**一件家具**打通完整链路：居民寄卖申请 → 估价师上门验真报价 → 清洁/补漆/入仓/拍照/上架（
含拍摄灯光/原图/修图记录与色差提示的**摄影档案**）→
买家下单 → 配送排班（楼层/电梯/拆装/车辆/旧家具搬出）→ 异常协同工单（卖家反悔、估价与实物不符、
翻新超支、**到货色差**、沙发进不了电梯、途中磕碰、退货）→ 逐项有来源的结算 → 品类运营分析、
**摄影规范整改**与卖家风险画像。

色差争议处理：买家提交现场照片 → 客服核对拍摄灯光、原图、修图记录、买家现场照片与页面描述：
**页面描述不准确** → 平台承担退换或补偿，认定沉淀为商品色差评价并生成摄影整改规范；
**属自然光差异且页面已提示** → 维持交易并提供保养建议。退货成立时订单进入"退货中"、**卖家结算暂缓**，
家具回库后由仓库重新评估**残值、回库仓储费与是否可二次上架**，确认后退货完结、结算解除暂缓，
可二次上架的商品按残值重新售卖、仓储周期自回库日重新起算。

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
| 仓库管理 | `cangguan` | `cangguan123` | 入库库位、拍照、**摄影档案（灯光/原图/修图/色差提示）**、上架描述、**退货回库残值/仓储费评估、二次上架** |
| 翻新师 | `fanxin` | `fanxin123` | 清洁/补漆/维修作业登记（费用入结算） |
| 配送 | `peisong` | `peisong123` | 排班、车辆、装车、送达、失败原因登记 |
| 客服 | `kefu` | `kefu123` | 协同工单六方留言、客服裁定、生成结算单 |
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
6. **买家**在订单页发起"色差/磕碰/退货"工单（可附现场照片链接）；**仓库、配送、客服**依次进入同一工单留言协同；
   **客服 `kefu`** 裁定处理结论（维持/降价/卖家或平台赔付/退货退款/重新上架/终止寄卖），
   订单、商品、寄卖单状态随之联动。
7. **色差争议专项（书柜 `OD2026000003`）**：买家 `zhangmai` 的"我的订单/售后"里有一张处理中的书柜色差工单，
   工单页集中展示证据链——①拍摄灯光设备、②修图记录、③原图、④页面修图后照片、⑤买家现场照片、⑥页面描述。
   - 认定**自然光差异且页面已提示** → 只能"维持交易"，客服给出颜色一致性评分与保养建议，订单继续履约；
   - 种子中餐边柜工单 `OD2026000004` 已认定**页面描述不准确**（修图超规范+描述失真），平台承担退货：
     客服结算页可见订单"退货回库评估中·结算暂缓"；用**仓库 `cangguan`** 进入工单点"退货回库评估"，
     填写残值、回库仓储费、复检处理费与能否二次上架 → 订单退货完结、工单关闭；客服再生成结算单，
     卖家应得为 0，回库仓储/复检费由平台吸收且来源引用评估单；仓库在"翻新上架"里把商品按残值重新上架
     （仓储周期自回库日重新起算，商品记录追溯原订单）。
   - 不准确认定会自动生成**摄影整改规范**（运营分析页可查），并写入商品色差评价（买家市场卡片可见评分）。
8. **客服**在"结算管理"对已送达订单生成结算单：成交价、佣金、翻新费、仓储费（按在仓天数）、
   配送费、售后赔付、卖家应得逐项列出**来源说明**；退货单展示平台吸收的成本（含回库评估费用）。
9. **运营 `ops`**：查看六品类成交周期、翻新投入占比、退货原因、**色差争议认定（描述不准确/自然光差异）
   与色差评分**、配送失败率、摄影规范列表、色差评价总览和"适合入仓寄卖 / 建议同城自提"渠道建议；
   查看卖家风险画像排序。
10. 用 **`linfan`** 再提交一件寄卖，确认申请自动带上"严格验真"；卖家在约估价后反悔，
    画像中反悔次数与风险分立即变化。

## 五、自动化验证

后端附端到端接口脚本（需要先启动后端与空库/种子库）：

```bash
cd backend
bash e2e-test.sh
```

覆盖：鉴权与角色拦截 → 申请（画像联动）→ 底价校验与六项验真估价 → 作业记账 →
上架 → 下单与配送费计价 → 排班/装车/送达 → 色差证据链与客服认定（含认定校验、评价沉淀、
摄影规范生成）→ 结算金额与来源 → 品类分析与渠道建议 → 严格验真触发 → 反悔计入画像 →
**色差退货结算暂缓 → 回库评估残值/仓储费/二次上架 → 退货结算来源 → 自然光差异维持交易 →
色差分析与摄影规范**，共 45 项断言。

## 六、实际执行过的验证（本工作区）

- `cd backend && npx tsc --noEmit` 编译通过；`cd frontend && npm run build`（tsc 类型检查 + vite 打包）通过。
- 本地 PostgreSQL 15 独立实例（`initdb` 自建、端口 5433）上启动后端，建表与演示种子（含 3 个色差案例）成功写入。
- `bash backend/e2e-test.sh` 结果：**PASS=45 FAIL=0**（空库从头跑通申请→估价→上架→下单→配送→
  色差认定→结算暂缓→回库评估→二次上架→分析全链路）。
- 另用 HTTP 手工验证：种子书柜色差工单"缺认定被拦截 / 自然光认定强制维持交易 / 不准确认定退货后
  回库评估 / 退货结算平台吸收回库费用 / 运营色差统计与摄影规范"均符合预期。
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
- **色差争议处理**：
  - 客服必须给出认定：`LISTING_INACCURATE`（页面描述/照片不准确）或 `NATURAL_LIGHT`（自然光差异）；
    前者只能走平台补偿/补差/退货退款，责任归平台；后者只能维持交易并附保养建议。
  - 认定写入工单（颜色一致性 1-5 分 + 依据 + 保养建议），同时沉淀为商品色差官方评价并更新商品色差均分；
    页面不准确时自动生成按品类/材质适用的**摄影整改规范**（色卡校准、双光源原图、修图幅度 ≤±5%、页面必带色差提示）。
  - 证据链：摄影档案（灯光/设备/原图/修图记录/页面色差提示）+ 买家现场照片 + 页面描述，统一在工单页核对。
- **退货回库评估与结算暂缓**：退货裁定后订单为 `RETURNING`，此时结算被拦截（卖家结算暂缓）；
  家具回库后仓库登记成色、残值、回库仓储费、复检处理费与结论（可二次上架/报废），订单转 `RETURNED`、工单关闭；
  回库费用进入退货结算来源并由平台吸收；可二次上架的商品按残值重新售卖，
  二次销售仓储费自回库日重新起算，商品保留原退货订单追溯。
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
- `GET /items`（买家仅见在售）、`GET /items/:id`（含摄影档案与色差评价）、
  `POST /items/:id/work-logs`（清洁/补漆/维修/拍照/文案/入库）、`POST /items/:id/advance`（状态推进/上架）、
  `POST /items/:id/photo-audit`（仓库登记拍摄灯光/原图/修图/色差提示）、
  `POST /items/:id/reviews`（买家色差一致性 1-5 分评价）
- `POST /orders`（买家下单，含配送费试算）、`GET /orders`、`GET /orders/:id`、`POST /orders/:id/cancel`
- `GET /deliveries/queue`、`POST /deliveries/:orderId/schedule|load|done|fail`
- `POST /tickets`（任意相关方发起异常，可带买家现场照片）、`GET /tickets`、`GET /tickets/:id`（
  含摄影档案、回库评估单、色差评价）、`POST /tickets/:id/messages`（六方协同留言）、
  `POST /tickets/:id/resolve`（客服裁定；色差工单须带认定 `colorFinding`/`colorScore`/保养建议）、
  `POST /tickets/:id/return-assessment`（仓库回库评估：残值/回库仓储费/复检费/二次上架）
- `GET /photo-standards`、`POST /photo-standards`（色差认定沉淀的摄影规范）
- `GET /settlements`、`GET /settlements/order/:orderId`、`POST /settlements/order/:orderId/generate`
  （退货回库评估完成前或有处理中工单时拦截，卖家结算暂缓）
- `GET /analytics/by-category`（品类指标、色差认定统计与渠道建议）、
  `GET /analytics/photo-standards`、`GET /analytics/color-reviews`、
  `GET /analytics/seller-profiles`、`GET /analytics/seller-profiles/:sellerId`

## 九、目录结构

```
.
├── docker-compose.yml          # db + backend + frontend 一键启动
├── backend/                    # NestJS + TypeORM + PostgreSQL
│   ├── Dockerfile
│   ├── src/
│   │   ├── entities/           # 核心表（工单含色差认定；摄影档案/摄影规范/色差评价/回库评估）
│   │   ├── auth/               # JWT + 角色守卫
│   │   ├── risk/               # 卖家风险画像（全局服务）
│   │   ├── consignments/ appraisals/ items/ orders/
│   │   ├── deliveries/ tickets/ settlements/ analytics/ seeder/
│   │   └── main.ts
│   └── e2e-test.sh             # 45 项端到端断言（含色差证据链与回库评估全流程）
└── frontend/                   # React + Vite
    ├── Dockerfile  nginx.conf
    └── src/views/              # 登录 + 7 类角色工作台
```
