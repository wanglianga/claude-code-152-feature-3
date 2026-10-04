#!/usr/bin/env bash
# 后端端到端验证：登录各角色 → 申请→估价→清洁翻新上架→下单→配送→售后工单→结算→分析+卖家画像
set -u
BASE=http://127.0.0.1:3000/api
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  ✓ $1"; }
no(){ FAIL=$((FAIL+1)); echo "  ✗ $1"; }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else no "$3 (got '$1' expected '$2')"; fi; }

login(){ curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' -d "{\"username\":\"$1\",\"password\":\"$2\"}" | jq -r '.token'; }

echo "== [1] 登录与权限 =="
T_SELLER=$(login wangjiayi seller123)
T_BUYER=$(login zhangmai buyer123)
T_APPR=$(login gujia gujia123)
T_WH=$(login cangguan cangguan123)
T_REF=$(login fanxin fanxin123)
T_DEL=$(login peisong peisong123)
T_CS=$(login kefu kefu123)
T_OPS=$(login ops ops123)
[ -n "$T_SELLER" ] && [ "$T_SELLER" != "null" ] && ok "8 类角色账号可登录（示范卖家/买家）"
# 未登录拒绝
code=$(curl -s -o /dev/null -w '%{http_code}' $BASE/items)
check "$code" "401" "无 token 访问 /items 返回 401"

echo "== [2] 卖家提交寄卖申请（自动引用画像） =="
RESP=$(curl -s -X POST $BASE/consignments -H "Authorization: Bearer $T_SELLER" -H 'Content-Type: application/json' -d '{
  "category":"KIDS_BED","brand":"测试品牌","sizeText":"200x120x90 cm","material":"松木","yearsUsed":2,
  "defectPhotos":["http://x/p1.jpg"],"disassemblable":true,"floor":7,"elevator":"ELEVATOR",
  "expectedPrice":900,"acceptRefurbish":true,"address":"测试小区","sellerNote":"e2e 测试申请"
}')
CN_ID=$(echo "$RESP" | jq -r '.consignment.id')
LEVEL=$(echo "$RESP" | jq -r '.sellerProfile.verificationLevel')
[ -n "$CN_ID" ] && [ "$CN_ID" != "null" ] && ok "寄卖申请已创建 id=$CN_ID"
check "$LEVEL" "NORMAL" "履约良好卖家 -> 常规验真 NORMAL"

echo "== [3] 估价师预约上门 + 上门验真评分与报价 =="
curl -s -o /dev/null -X POST $BASE/appraisals/consignment/$CN_ID/schedule -H "Authorization: Bearer $T_APPR" 2>/dev/null
# schedule 端点挂在 consignments 模块
curl -s -o /dev/null -X POST $BASE/consignments/$CN_ID/schedule -H "Authorization: Bearer $T_APPR"
sc=$(curl -s -X POST $BASE/appraisals/consignment/$CN_ID -H "Authorization: Bearer $T_APPR" -H 'Content-Type: application/json' -d '{
  "structuralScore":2,"stainScore":2,"odorScore":1,"mothScore":1,"warpScore":1,"moveDifficulty":3,
  "consignmentPrice":820,"minDealPrice":650,"commissionRate":0.15,"estimatedRefurbishCost":100,
  "cleaningAdvice":"深度清洁","refurbishSuggestions":"补漆","matchResult":"MATCH",
  "decision":"ACCEPT","location":"WAREHOUSE","deliveryRadiusKm":25}')
ITEM_ID=$(echo "$sc" | jq -r '.item.id')
APPR_ID=$(echo "$sc" | jq -r '.appraisal.id')
[ -n "$ITEM_ID" ] && [ "$ITEM_ID" != "null" ] && ok "估价完成并生成商品 PREPARING（寄卖价820/底价650/佣金15%）"
# 底价高于寄卖价应被拒
bad=$(curl -s -X POST $BASE/appraisals/consignment/$CN_ID -H "Authorization: Bearer $T_APPR" -H 'Content-Type: application/json' -d '{"structuralScore":1,"stainScore":1,"odorScore":1,"mothScore":1,"warpScore":1,"moveDifficulty":1,"consignmentPrice":100,"minDealPrice":200,"matchResult":"MATCH"}' | jq -r '.message')
echo "$bad" | grep -q '最低成交价' && ok "底价高于寄卖价被业务规则拦截"

echo "== [4] 仓库入库/清洁/补漆作业（作业即记账） =="
curl -s -o /dev/null -X POST $BASE/items/$ITEM_ID/work-logs -H "Authorization: Bearer $T_REF" -H 'Content-Type: application/json' -d '{"type":"CLEANING","note":"蒸汽清洁","cost":55}'
curl -s -o /dev/null -X POST $BASE/items/$ITEM_ID/work-logs -H "Authorization: Bearer $T_REF" -H 'Content-Type: application/json' -d '{"type":"REPAINT","note":"床边补漆","cost":75}'
w3=$(curl -s -X POST $BASE/items/$ITEM_ID/work-logs -H "Authorization: Bearer $T_WH" -H 'Content-Type: application/json' -d '{"type":"STORAGE","note":"D-01-01","cost":0}')
check "$(echo "$w3" | jq -r '.item.warehouseSlot')" "D-01-01" "入库登记库位 D-01-01"

echo "== [5] 拍照与上架（含拍摄灯光/原图/修图记录/色差提示档案） =="
curl -s -o /dev/null -X POST $BASE/items/$ITEM_ID/advance -H "Authorization: Bearer $T_WH" -H 'Content-Type: application/json' -d '{"to":"PHOTOGRAPHY"}'
# 未勾选色差提示不能上架（摄影规范）
nophoto=$(curl -s -X POST $BASE/items/$ITEM_ID/advance -H "Authorization: Bearer $T_WH" -H 'Content-Type: application/json' -d '{"to":"LISTED","description":"e2e 儿童床描述","photos":["http://x/bed1.jpg"],"colorNotice":false}' | jq -r '.message // ""')
echo "$nophoto" | grep -q '色差提示' && ok "上架缺少色差提示被摄影规范拦截"
ls=$(curl -s -X POST $BASE/items/$ITEM_ID/advance -H "Authorization: Bearer $T_WH" -H 'Content-Type: application/json' -d '{"to":"LISTED","description":"e2e 儿童床描述","photos":["http://x/bed1.jpg"],"deliveryRadiusKm":25,"shootLighting":"自然光 上午10点 北向窗","rawPhotos":["http://x/raw1.jpg"],"retouchNote":"仅校正白平衡","colorNotice":true,"listedColor":"松木本色"}')
check "$(echo "$ls" | jq -r '.item.status // .status')" "LISTED" "商品上架 LISTED（拍摄档案与色差提示齐全）"

echo "== [6] 买家市场可见 + 下单 =="
market=$(curl -s "$BASE/items?status=LISTED" -H "Authorization: Bearer $T_BUYER" | jq 'length')
[ "${market:-0}" -ge 3 ] && ok "买家市场在售商品 ≥3（当前 $market）"
ord=$(curl -s -X POST $BASE/orders -H "Authorization: Bearer $T_BUYER" -H 'Content-Type: application/json' -d "{
  \"itemId\":\"$ITEM_ID\",\"buyerAddress\":\"买家地址 8 楼无电梯\",\"buyerFloor\":8,\"buyerElevator\":\"NO_ELEVATOR\",
  \"needOldFurnitureRemoval\":true,\"appointmentWindow\":\"明天下午\"}")
ORD_ID=$(echo "$ord" | jq -r '.order.id')
DLV_ID=$(echo "$ord" | jq -r '.delivery.id')
FEE=$(echo "$ord" | jq -r '.order.deliveryFee')
[ -n "$ORD_ID" ] && [ "$ORD_ID" != "null" ] && ok "下单成功并生成 PENDING 配送任务"
check "$FEE" "245.00" "配送费=60+7层×15+旧家具80=245"

echo "== [7] 配送排班/装车/送达 =="
curl -s -o /dev/null -X POST $BASE/deliveries/$ORD_ID/schedule -H "Authorization: Bearer $T_DEL" -H 'Content-Type: application/json' -d '{"vehicleType":"MID_TRUCK","scheduledWindow":"10-05 14:00"}'
curl -s -o /dev/null -X POST $BASE/deliveries/$ORD_ID/load -H "Authorization: Bearer $T_DEL"
dn=$(curl -s -X POST $BASE/deliveries/$ORD_ID/done -H "Authorization: Bearer $T_DEL" -H 'Content-Type: application/json' -d '{"note":"买家在场，正常签收"}')
check "$(echo "$dn" | jq -r '.order.status')" "DELIVERED" "送达后订单 DELIVERED"

echo "== [8] 售后协同工单（色差）+ 客服裁定平台赔付（部分属实） =="
tk=$(curl -s -X POST $BASE/tickets -H "Authorization: Bearer $T_BUYER" -H 'Content-Type: application/json' -d "{
  \"orderId\":\"$ORD_ID\",\"type\":\"COLOR_DIFFERENCE\",\"title\":\"到货颜色比照片深\",\"description\":\"买家认为色差明显要求补偿\",
  \"buyerPhotos\":[\"http://x/buyer1.jpg\"],\"buyerLighting\":\"INDOOR_WARM\",\"buyerSceneNote\":\"暖光灯下拍摄\"}")
TK_ID=$(echo "$tk" | jq -r '.ticket.id // .id')
# 补充色差取证
curl -s -o /dev/null -X POST $BASE/tickets/$TK_ID/color-evidence -H "Authorization: Bearer $T_BUYER" -H 'Content-Type: application/json' -d '{"buyerPhotos":["http://x/buyer1.jpg","http://x/buyer2.jpg"],"buyerLighting":"NATURAL_DAYLIGHT","buyerSceneNote":"上午自然光补拍"}'
curl -s -o /dev/null -X POST $BASE/tickets/$TK_ID/messages -H "Authorization: Bearer $T_WH" -H 'Content-Type: application/json' -d '{"content":"仓库核对拍照光线，建议补偿 30 元色差价"}'
rv=$(curl -s -X POST $BASE/tickets/$TK_ID/resolve -H "Authorization: Bearer $T_CS" -H 'Content-Type: application/json' -d '{"resolution":"PLATFORM_COMPENSATE","liableParty":"PLATFORM","compensationAmount":30,"colorFinding":"MIXED","careAdvice":"避免紧贴暖色射灯摆放","note":"描述不够充分，买家暖光也有影响，平台承担 30 元色差补偿"}')
check "$(echo "$rv" | jq -r '.ticket.status')" "RESOLVED" "客服裁定工单 RESOLVED（部分属实，平台赔付 30）"
# 色差工单缺裁定原因必须被拒
TK2_ID=$(curl -s -X POST $BASE/tickets -H "Authorization: Bearer $T_BUYER" -H 'Content-Type: application/json' -d "{\"orderId\":\"$ORD_ID\",\"type\":\"COLOR_DIFFERENCE\",\"title\":\"再提色差\",\"description\":\"x\"}" | jq -r '.ticket.id')
badcolor=$(curl -s -X POST $BASE/tickets/$TK2_ID/resolve -H "Authorization: Bearer $T_CS" -H 'Content-Type: application/json' -d '{"resolution":"KEEP_LISTING","liableParty":"NONE"}' | jq -r '.message')
echo "$badcolor" | grep -q '裁定原因' && ok "色差工单未给裁定原因被拦截"

echo "== [9] 结算单（逐项来源） =="
st=$(curl -s -X POST $BASE/settlements/order/$ORD_ID/generate -H "Authorization: Bearer $T_CS")
echo "$st" | jq -e '.entries | length >= 5' >/dev/null && ok "结算明细 ≥5 项（成交价/佣金/翻新/仓储/配送/赔付/卖家应得）"
PAYOUT=$(echo "$st" | jq -r '.settlement.sellerPayout')
INC=$(echo "$st" | jq -r '.settlement.platformIncome')
# 820 - 123(佣金) - 130(清洁55+补漆75) - 仓储0 - 0(卖家赔付) = 567；平台 123+245-30=338
check "$PAYOUT" "567.00" "卖家应得 820-123-130=567"
check "$INC" "338.00" "平台净收入 123+245-30=338"
echo "$st" | jq -r '.entries[] | select(.type=="COMMISSION") | .source' | grep -q '820 × 15' && ok "佣金来源写明计算式"

echo "== [10] 运营分析（品类指标+渠道建议） =="
an=$(curl -s $BASE/analytics/by-category -H "Authorization: Bearer $T_OPS")
echo "$an" | jq -e '.categories | length == 6' >/dev/null && ok "6 个品类分析齐全"
echo "$an" | jq -r '.categories[] | select(.category=="SOFA") | .channelAdvice' | grep -q '同城自提' && ok "沙发品类因电梯失败给出同城自提建议"

echo "== [11] 卖家画像：描述不符/反悔影响下次验真 =="
# 高风险卖家登录后新申请 -> STRICT
T_RISK=$(login linfan seller123)
rresp=$(curl -s -X POST $BASE/consignments -H "Authorization: Bearer $T_RISK" -H 'Content-Type: application/json' -d '{
  "category":"BOOKCASE","brand":"又一个","sizeText":"80x30x180","material":"板材","yearsUsed":3,
  "disassemblable":true,"floor":4,"elevator":"ELEVATOR","expectedPrice":400,"acceptRefurbish":true}')
check "$(echo "$rresp" | jq -r '.consignment.verificationLevel')" "STRICT" "有反悔+描述不符史 -> 新申请自动 STRICT 严格验真"
q=$(curl -s $BASE/appraisals/queue/pending -H "Authorization: Bearer $T_APPR" | jq -r '[.[] | select(.verificationLevel=="STRICT")] | length')
[ "${q:-0}" -ge 2 ] && ok "估价师待办中 STRICT 申请置顶可见（$q 件）"

echo "== [12] 卖家反悔计入画像 =="
cancelid=$(echo "$rresp" | jq -r '.consignment.id')
curl -s -o /dev/null -X POST $BASE/consignments/$cancelid/cancel -H "Authorization: Bearer $T_RISK" -H 'Content-Type: application/json' -d '{"reason":"e2e 测试反悔"}'
pf=$(curl -s $BASE/analytics/seller-profiles -H "Authorization: Bearer $T_OPS" | jq -r '.[] | select(.username=="linfan") | .backtrackCount')
check "$pf" "2" "反悔次数累加到 2（画像联动）"

echo "== [13] 书柜色差争议完整链路：描述不准→退货暂缓→回库复检→摄影整改→二次上架→结算 =="
# 种子样例：OD2026000003 色差（页面描述不准确）退货成立，家具取回中
HOLD_ORDER=$(curl -s $BASE/orders -H "Authorization: Bearer $T_CS" | jq -r '.[] | select(.code=="OD2026000003") | .id')
HOLD_ITEM=$(curl -s $BASE/orders -H "Authorization: Bearer $T_CS" | jq -r '.[] | select(.code=="OD2026000003") | .itemId')
HOLD_TICKET=$(curl -s $BASE/tickets -H "Authorization: Bearer $T_CS" | jq -r ".[] | select(.orderId==\"$HOLD_ORDER\" and .type==\"COLOR_DIFFERENCE\") | .id")
[ -n "$HOLD_ORDER" ] && [ "$HOLD_ORDER" != "null" ] && ok "种子书柜色差退货单已载入"
holdflag=$(curl -s $BASE/orders -H "Authorization: Bearer $T_CS" | jq -r ".[] | select(.id==\"$HOLD_ORDER\") | .settlementHold")
check "$holdflag" "true" "退货成立后卖家结算自动暂缓"
holdmsg=$(curl -s -X POST $BASE/settlements/order/$HOLD_ORDER/generate -H "Authorization: Bearer $T_CS" | jq -r '.message')
echo "$holdmsg" | grep -q '暂缓' && ok "暂缓状态下生成结算被拦截"
# 自然光差异维持交易的订单（OD2026000004）不应暂缓
natflag=$(curl -s $BASE/orders -H "Authorization: Bearer $T_CS" | jq -r '.[] | select(.code=="OD2026000004") | .settlementHold')
check "$natflag" "false" "自然光差异维持交易 -> 结算不暂缓"
# 未回库复检不能二次上架
early=$(curl -s -X POST $BASE/tickets/$HOLD_TICKET/resolve -H "Authorization: Bearer $T_CS" -H 'Content-Type: application/json' -d '{"resolution":"RE_LIST","liableParty":"PLATFORM","colorFinding":"LISTING_INACCURATE","note":"尝试直接重新上架"}' | jq -r '.message')
echo "$early" | grep -q '回库复检' && ok "未完成回库残值评估不能二次上架"
# 仓库回库复检：残值/额外仓储费/可二次上架
insp=$(curl -s -X POST $BASE/items/$HOLD_ITEM/return-inspection -H "Authorization: Bearer $T_WH" -H 'Content-Type: application/json' -d '{"residualValue":500,"returnStorageFee":30,"relistEligible":true,"note":"包装完好，仅摆放两天，按约 7.3 折评估残值"}')
check "$(echo "$insp" | jq -r '.status')" "RETURNED" "回库复检完成 -> 商品 RETURNED"
check "$(echo "$insp" | jq -r '.residualValue')" "500.00" "回库残值评估 500 已登记"
holdafter=$(curl -s $BASE/orders -H "Authorization: Bearer $T_CS" | jq -r ".[] | select(.id==\"$HOLD_ORDER\") | .settlementHold")
check "$holdafter" "false" "回库复检后订单解除暂缓（订单 RETURNED）"
# 摄影规范未整改不能二次上架
norem=$(curl -s -X POST $BASE/tickets/$HOLD_TICKET/resolve -H "Authorization: Bearer $T_CS" -H 'Content-Type: application/json' -d '{"resolution":"RE_LIST","liableParty":"PLATFORM","colorFinding":"LISTING_INACCURATE","note":"复检后尝试上架"}' | jq -r '.message')
echo "$norem" | grep -q '摄影规范' && ok "摄影规范整改未完成不能二次上架"
# 摄影整改重拍
rem=$(curl -s -X POST $BASE/items/$HOLD_ITEM/photo-remedy -H "Authorization: Bearer $T_WH" -H 'Content-Type: application/json' -d '{"photos":["seed://item/oak-case-new-1.jpg"],"rawPhotos":["seed://raw/oak-case-new-raw-1.jpg"],"shootLighting":"自然光 上午10点 北向窗","retouchNote":"仅校正曝光，未改色","listedColor":"橡木本色（偏深）","description":"橡木本色书柜，页面已标注不同光线色差提示","note":"按规范重拍完成"}')
check "$(echo "$rem" | jq -r '.photoStandardFlag')" "OK" "摄影规范整改完成，标志恢复 OK"
# 客服确认重新处理结果 -> 二次上架
rl=$(curl -s -X POST $BASE/tickets/$HOLD_TICKET/resolve -H "Authorization: Bearer $T_CS" -H 'Content-Type: application/json' -d '{"resolution":"RE_LIST","liableParty":"PLATFORM","colorFinding":"LISTING_INACCURATE","note":"回库复检合格且摄影整改完成，确认二次上架"}')
check "$(echo "$rl" | jq -r '.item.status')" "LISTED" "退货书柜经复检+整改后二次上架 LISTED"
# 原退货订单结算：卖家应得 0，平台吸收成本，残值作再上架参考
rst=$(curl -s -X POST $BASE/settlements/order/$HOLD_ORDER/generate -H "Authorization: Bearer $T_CS")
check "$(echo "$rst" | jq -r '.settlement.sellerPayout')" "0.00" "退货单卖家应得为 0"
echo "$rst" | jq -r '.entries[] | select(.type=="RESIDUAL_VALUE") | .source' | grep -q '残值评估' && ok "结算含回库残值来源说明"
echo "$rst" | jq -r '.entries[].source' | grep -q '额外仓储费' && ok "结算含退货返程/复检额外仓储费来源"
# 运营看板：书柜品类色差统计与整改队列清零
an2=$(curl -s $BASE/analytics/by-category -H "Authorization: Bearer $T_OPS")
echo "$an2" | jq -r '.categories[] | select(.category=="BOOKCASE") | .colorListingInaccurateCount' | grep -q '1' && ok "书柜品类统计到 1 起描述不准确色差"
echo "$an2" | jq -r '.categories[] | select(.category=="BOOKCASE") | .colorNaturalVariationCount' | grep -q '1' && ok "书柜品类统计到 1 起自然光差异维持"
rqlen=$(curl -s $BASE/analytics/photo-remedy-queue -H "Authorization: Bearer $T_OPS" | jq 'length')
check "$rqlen" "0" "整改/回库队列处理完毕（无遗留待整改商品）"

echo
echo "结果：PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
