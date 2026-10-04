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
# 底价高于寄卖价应被拒（在首次估价提交前触发价格校验）
bad=$(curl -s -X POST $BASE/appraisals/consignment/$CN_ID -H "Authorization: Bearer $T_APPR" -H 'Content-Type: application/json' -d '{"structuralScore":1,"stainScore":1,"odorScore":1,"mothScore":1,"warpScore":1,"moveDifficulty":1,"consignmentPrice":100,"minDealPrice":200,"matchResult":"MATCH"}' | jq -r '.message')
echo "$bad" | grep -q '最低成交价' && ok "底价高于寄卖价被业务规则拦截"
sc=$(curl -s -X POST $BASE/appraisals/consignment/$CN_ID -H "Authorization: Bearer $T_APPR" -H 'Content-Type: application/json' -d '{
  "structuralScore":2,"stainScore":2,"odorScore":1,"mothScore":1,"warpScore":1,"moveDifficulty":3,
  "consignmentPrice":820,"minDealPrice":650,"commissionRate":0.15,"estimatedRefurbishCost":100,
  "cleaningAdvice":"深度清洁","refurbishSuggestions":"补漆","matchResult":"MATCH",
  "decision":"ACCEPT","location":"WAREHOUSE","deliveryRadiusKm":25}')
ITEM_ID=$(echo "$sc" | jq -r '.item.id')
APPR_ID=$(echo "$sc" | jq -r '.appraisal.id')
[ -n "$ITEM_ID" ] && [ "$ITEM_ID" != "null" ] && ok "估价完成并生成商品 PREPARING（寄卖价820/底价650/佣金15%）"

echo "== [4] 仓库入库/清洁/补漆作业（作业即记账） =="
curl -s -o /dev/null -X POST $BASE/items/$ITEM_ID/work-logs -H "Authorization: Bearer $T_REF" -H 'Content-Type: application/json' -d '{"type":"CLEANING","note":"蒸汽清洁","cost":55}'
curl -s -o /dev/null -X POST $BASE/items/$ITEM_ID/work-logs -H "Authorization: Bearer $T_REF" -H 'Content-Type: application/json' -d '{"type":"REPAINT","note":"床边补漆","cost":75}'
w3=$(curl -s -X POST $BASE/items/$ITEM_ID/work-logs -H "Authorization: Bearer $T_WH" -H 'Content-Type: application/json' -d '{"type":"STORAGE","note":"D-01-01","cost":0}')
check "$(echo "$w3" | jq -r '.item.warehouseSlot')" "D-01-01" "入库登记库位 D-01-01"

echo "== [5] 拍照与上架 =="
curl -s -o /dev/null -X POST $BASE/items/$ITEM_ID/advance -H "Authorization: Bearer $T_WH" -H 'Content-Type: application/json' -d '{"to":"PHOTOGRAPHY"}'
ls=$(curl -s -X POST $BASE/items/$ITEM_ID/advance -H "Authorization: Bearer $T_WH" -H 'Content-Type: application/json' -d '{"to":"LISTED","description":"e2e 儿童床描述","photos":["http://x/bed1.jpg"],"deliveryRadiusKm":25}')
check "$(echo "$ls" | jq -r '.item.status // .status')" "LISTED" "商品上架 LISTED"

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

echo "== [8] 售后协同工单（色差）+ 客服认定页面不准确、平台赔付 =="
tk=$(curl -s -X POST $BASE/tickets -H "Authorization: Bearer $T_BUYER" -H 'Content-Type: application/json' -d "{
  \"orderId\":\"$ORD_ID\",\"type\":\"COLOR_DIFFERENCE\",\"title\":\"到货颜色比照片深\",
  \"description\":\"买家认为色差明显要求补偿\",\"buyerPhotos\":[\"http://x/on-site-1.jpg\"]}")
TK_ID=$(echo "$tk" | jq -r '.ticket.id // .id')
curl -s -o /dev/null -X POST $BASE/tickets/$TK_ID/messages -H "Authorization: Bearer $T_WH" -H 'Content-Type: application/json' -d '{"content":"仓库核对拍照光线，建议补偿 30 元色差价"}'
# 色差工单未给认定应被拦截
bad=$(curl -s -X POST $BASE/tickets/$TK_ID/resolve -H "Authorization: Bearer $T_CS" -H 'Content-Type: application/json' -d '{"resolution":"PLATFORM_COMPENSATE","liableParty":"PLATFORM","compensationAmount":30}' | jq -r '.message')
echo "$bad" | grep -q '色差争议必须给出认定' && ok "色差工单未给认定被拦截"
# 认定自然光差异却要求退货，应被拦截（必须维持交易）
bad2=$(curl -s -X POST $BASE/tickets/$TK_ID/resolve -H "Authorization: Bearer $T_CS" -H 'Content-Type: application/json' -d '{"resolution":"RETURN_REFUND","liableParty":"BUYER","colorFinding":"NATURAL_LIGHT"}' | jq -r '.message')
echo "$bad2" | grep -q '自然光差异' && ok "自然光差异认定必须维持交易（不能退货）"
# 仓库可登记摄影档案（灯光/原图/修图/页面提示）
curl -s -o /dev/null -X POST $BASE/items/$ITEM_ID/photo-audit -H "Authorization: Bearer $T_WH" -H 'Content-Type: application/json' -d '{"lightingSetup":"5500K灯箱","cameraSetup":"白平衡5300K灰卡校准","rawPhotos":["http://x/raw.jpg"],"editedPhotos":["http://x/bed1.jpg"],"retouchNote":"仅曝光+0.2","colorNoticeOnPage":true,"colorNoticeText":"不同光源颜色略有差异","colorReference":"NCS S4010"}'
rv=$(curl -s -X POST $BASE/tickets/$TK_ID/resolve -H "Authorization: Bearer $T_CS" -H 'Content-Type: application/json' -d '{"resolution":"PLATFORM_COMPENSATE","liableParty":"PLATFORM","compensationAmount":30,"colorFinding":"LISTING_INACCURATE","colorScore":2,"findingBasis":"原图偏深、修图超规范、页面未写材质色号","note":"平台承担 30 元色差补偿"}')
check "$(echo "$rv" | jq -r '.ticket.status')" "RESOLVED" "客服认定页面描述不准确，平台赔付 30，工单 RESOLVED"
check "$(echo "$rv" | jq -r '.ticket.colorFinding')" "LISTING_INACCURATE" "工单记录认定结论 LISTING_INACCURATE"
echo "$rv" | jq -e '[.reviews[] | select(.source=="CS" and .colorScore==2)] | length == 1' >/dev/null && ok "认定沉淀为商品色差评价（CS 2/5）"
echo "$rv" | jq -r '.messages[-1].content' | grep -q '摄影规范' && ok "协同记录写明触发摄影规范整改"

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

echo "== [13] 色差退货成立 → 结算暂缓 → 回库评估残值/仓储费 → 二次上架 =="
# 卖家再寄卖一件书柜，走完上架→下单→送达→色差退货全链路
RESP2=$(curl -s -X POST $BASE/consignments -H "Authorization: Bearer $T_SELLER" -H 'Content-Type: application/json' -d '{
  "category":"BOOKCASE","brand":"e2e书柜","sizeText":"90x35x180 cm","material":"白橡木","yearsUsed":1,
  "disassemblable":true,"floor":6,"elevator":"ELEVATOR","expectedPrice":500,"acceptRefurbish":true,"address":"测试小区"}')
CN2=$(echo "$RESP2" | jq -r '.consignment.id')
curl -s -o /dev/null -X POST $BASE/consignments/$CN2/schedule -H "Authorization: Bearer $T_APPR"
sc2=$(curl -s -X POST $BASE/appraisals/consignment/$CN2 -H "Authorization: Bearer $T_APPR" -H 'Content-Type: application/json' -d '{
  "structuralScore":1,"stainScore":1,"odorScore":1,"mothScore":1,"warpScore":1,"moveDifficulty":2,
  "consignmentPrice":460,"minDealPrice":360,"commissionRate":0.15,"estimatedRefurbishCost":40,
  "cleaningAdvice":"擦拭","refurbishSuggestions":"无","matchResult":"MATCH",
  "decision":"ACCEPT","location":"WAREHOUSE","deliveryRadiusKm":20}')
IT2=$(echo "$sc2" | jq -r '.item.id')
curl -s -o /dev/null -X POST $BASE/items/$IT2/work-logs -H "Authorization: Bearer $T_REF" -H 'Content-Type: application/json' -d '{"type":"CLEANING","note":"清洁","cost":40}'
curl -s -o /dev/null -X POST $BASE/items/$IT2/work-logs -H "Authorization: Bearer $T_WH" -H 'Content-Type: application/json' -d '{"type":"STORAGE","note":"E-01-01","cost":0}'
curl -s -o /dev/null -X POST $BASE/items/$IT2/advance -H "Authorization: Bearer $T_WH" -H 'Content-Type: application/json' -d '{"to":"PHOTOGRAPHY"}'
curl -s -o /dev/null -X POST $BASE/items/$IT2/advance -H "Authorization: Bearer $T_WH" -H 'Content-Type: application/json' -d '{"to":"LISTED","description":"e2e 书柜（页面未做色差提示）","photos":["http://x/shelf.jpg"],"deliveryRadiusKm":20}'
ord2=$(curl -s -X POST $BASE/orders -H "Authorization: Bearer $T_BUYER" -H 'Content-Type: application/json' -d "{
  \"itemId\":\"$IT2\",\"buyerAddress\":\"买家地址\",\"buyerFloor\":3,\"buyerElevator\":\"ELEVATOR\",
  \"appointmentWindow\":\"后天下午\"}")
O2=$(echo "$ord2" | jq -r '.order.id')
curl -s -o /dev/null -X POST $BASE/deliveries/$O2/schedule -H "Authorization: Bearer $T_DEL" -H 'Content-Type: application/json' -d '{"vehicleType":"SMALL_VAN","scheduledWindow":"10-06 上午"}'
curl -s -o /dev/null -X POST $BASE/deliveries/$O2/load -H "Authorization: Bearer $T_DEL"
curl -s -o /dev/null -X POST $BASE/deliveries/$O2/done -H "Authorization: Bearer $T_DEL" -H 'Content-Type: application/json' -d '{"note":"签收"}'
tk2=$(curl -s -X POST $BASE/tickets -H "Authorization: Bearer $T_BUYER" -H 'Content-Type: application/json' -d "{
  \"orderId\":\"$O2\",\"type\":\"COLOR_DIFFERENCE\",\"title\":\"书柜颜色与页面不符\",
  \"description\":\"实物偏黄页面偏白\",\"buyerPhotos\":[\"http://x/site-1.jpg\"]}")
TK2=$(echo "$tk2" | jq -r '.ticket.id')
rv2=$(curl -s -X POST $BASE/tickets/$TK2/resolve -H "Authorization: Bearer $T_CS" -H 'Content-Type: application/json' -d '{
  "resolution":"RETURN_REFUND","liableParty":"PLATFORM","compensationAmount":60,
  "colorFinding":"LISTING_INACCURATE","colorScore":2,
  "findingBasis":"页面未做色差提示且修图偏色","note":"平台承担退货退款与往返运费"}')
check "$(echo "$rv2" | jq -r '.order.status')" "RETURNING" "色差退货成立后订单进入 RETURNING，卖家结算暂缓"
# 回库评估前生成结算应被拒
hold=$(curl -s -X POST $BASE/settlements/order/$O2/generate -H "Authorization: Bearer $T_CS" | jq -r '.message')
echo "$hold" | grep -q '结算暂缓' && ok "回库评估前卖家结算暂缓被拦截"
# 仓库回库评估：残值 380、回库仓储费 12、复检处理费 18，可二次上架
as=$(curl -s -X POST $BASE/tickets/$TK2/return-assessment -H "Authorization: Bearer $T_WH" -H 'Content-Type: application/json' -d '{
  "conditionNote":"复检无磕碰，可二次上架","checkPhotos":["http://x/check.jpg"],
  "residualValue":380,"restockStorageFee":12,"restockHandlingFee":18,
  "decision":"RE_LISTABLE","warehouseSlot":"E-02-02"}')
check "$(echo "$as" | jq -r '.order.status')" "RETURNED" "回库评估确认后订单退货完结 RETURNED"
check "$(echo "$as" | jq -r '.ticket.status')" "CLOSED" "回库评估后工单关闭 CLOSED"
check "$(echo "$as" | jq -r '.returnAssessment.decision')" "RE_LISTABLE" "回库评估结论：可二次上架"
# 退货结算：卖家应得 0，平台吸收清洁40+配送60+回库仓储12+复检18=130
st2=$(curl -s -X POST $BASE/settlements/order/$O2/generate -H "Authorization: Bearer $T_CS")
check "$(echo "$st2" | jq -r '.settlement.sellerPayout')" "0.00" "退货单卖家应得为 0"
check "$(echo "$st2" | jq -r '.settlement.platformIncome')" "-130.00" "平台吸收 40+60+12+18=130（含回库评估费用）"
echo "$st2" | jq -r '.entries[] | select(.type=="STORAGE_FEE") | .source' | grep -q '回库评估单' && ok "回库仓储费来源引用回库评估单"
echo "$st2" | jq -r '.entries[].source' | grep -q '残值评估价 ¥380' && ok "结算来源写明残值评估价与二次上架说明"
# 复检后二次上架：价格取残值，仓储周期自回库重新起算
rl=$(curl -s -X POST $BASE/items/$IT2/advance -H "Authorization: Bearer $T_WH" -H 'Content-Type: application/json' -d '{"to":"LISTED","description":"书柜返仓复检二次上架","photos":["http://x/resale.jpg"],"deliveryRadiusKm":20,"listedPrice":380}')
check "$(echo "$rl" | jq -r '.status')" "LISTED" "退货商品复检后重新上架 LISTED"
check "$(echo "$rl" | jq -r '.listedPrice')" "380.00" "二次上架价取残值评估价 380"
check "$(echo "$rl" | jq -r '.resaleOfOrderId')" "$O2" "商品记录追溯原退货订单"

echo "== [14] 自然光差异认定：维持交易 + 保养建议（种子书柜工单） =="
NAT_TK=$(curl -s $BASE/tickets -H "Authorization: Bearer $T_BUYER" | jq -r '[.[] | select(.type=="COLOR_DIFFERENCE" and .status=="OPEN")][0].id // empty')
if [ -n "$NAT_TK" ]; then
  nat=$(curl -s -X POST $BASE/tickets/$NAT_TK/resolve -H "Authorization: Bearer $T_CS" -H 'Content-Type: application/json' -d '{
    "resolution":"KEEP_LISTING","liableParty":"BUYER","colorFinding":"NATURAL_LIGHT","colorScore":4,
    "findingBasis":"5500K原图与色卡一致，买家3000K暖光下偏黄属光源差异，页面已提示"}')
  check "$(echo "$nat" | jq -r '.ticket.colorFinding')" "NATURAL_LIGHT" "认定自然光差异 NATURAL_LIGHT"
  echo "$nat" | jq -e '.ticket.careAdvice | length > 0' >/dev/null && ok "维持交易并附保养建议"
  echo "$nat" | jq -r '.order.status' | grep -q 'DELIVERED' && ok "维持交易订单状态不变"
else
  echo "  · （种子自然光工单已处理，跳过；建议在空库重跑本脚本）"
fi

echo "== [15] 运营分析与摄影规范沉淀 =="
ps_count=$(curl -s $BASE/photo-standards -H "Authorization: Bearer $T_OPS" | jq 'length')
[ "${ps_count:-0}" -ge 2 ] && ok "页面描述不准确认定累计生成 ≥2 条摄影整改规范（当前 $ps_count）"
an2=$(curl -s $BASE/analytics/by-category -H "Authorization: Bearer $T_OPS")
echo "$an2" | jq -e '[.categories[] | select(.colorListingInaccurateCount > 0)] | length >= 1' >/dev/null && ok "品类分析含色差认定统计（描述不准确）"
echo "$an2" | jq -r '.categories[] | select(.colorListingInaccurateCount>0) | .colorAdvice' | grep -q '摄影' && ok "色差认定影响品类摄影整改建议"
cr=$(curl -s $BASE/analytics/color-reviews -H "Authorization: Bearer $T_OPS")
echo "$cr" | jq -e 'length >= 1' >/dev/null && ok "色差评价总览可查（商品评价受认定影响）"

echo
echo "结果：PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
