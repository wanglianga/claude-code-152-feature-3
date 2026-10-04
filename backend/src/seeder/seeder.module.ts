import { Module, Injectable } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity';
import { SellerProfile } from '../entities/seller-profile.entity';
import { Consignment } from '../entities/consignment.entity';
import { Appraisal } from '../entities/appraisal.entity';
import { Item, ItemWorkLog } from '../entities/item.entity';
import { Order } from '../entities/order.entity';
import { Delivery } from '../entities/delivery.entity';
import { Ticket, TicketMessage } from '../entities/ticket.entity';
import { Settlement, SettlementEntry } from '../entities/settlement.entity';

const hash = (p: string) => bcrypt.hashSync(p, 10);
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000);

/**
 * 演示数据：8 个角色账号 + 一条完整业务链路样例
 * （在售沙发、严格验真卖家、已成交办公椅、退货沙发+电梯受阻）
 */
@Injectable()
export class SeederService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async seed() {
    const existing = await this.ds.getRepository(User).count();
    if (existing > 0) return;

    const m = this.ds.manager;

    const users = await m.save(User, [
      m.create(User, { username: 'admin', passwordHash: hash('admin123'), name: '平台管理员', role: 'ADMIN' }),
      m.create(User, { username: 'ops', passwordHash: hash('ops123'), name: '运营小周', role: 'OPS' }),
      m.create(User, { username: 'kefu', passwordHash: hash('kefu123'), name: '客服小陈', role: 'CS' }),
      m.create(User, { username: 'gujia', passwordHash: hash('gujia123'), name: '估价师老赵', role: 'APPRAISER' }),
      m.create(User, { username: 'cangguan', passwordHash: hash('cangguan123'), name: '仓库管理员阿海', role: 'WAREHOUSE' }),
      m.create(User, { username: 'fanxin', passwordHash: hash('fanxin123'), name: '翻新师傅老吴', role: 'REFURBISHER' }),
      m.create(User, { username: 'peisong', passwordHash: hash('peisong123'), name: '配送队长小马', role: 'DELIVERY' }),
      m.create(User, { username: 'wangjiayi', passwordHash: hash('seller123'), name: '卖家王阿姨', phone: '13800000001', role: 'SELLER' }),
      m.create(User, { username: 'linfan', passwordHash: hash('seller123'), name: '卖家林反悔', phone: '13800000002', role: 'SELLER' }),
      m.create(User, { username: 'liujing', passwordHash: hash('seller123'), name: '卖家刘静', phone: '13800000003', role: 'SELLER' }),
      m.create(User, { username: 'zhangmai', passwordHash: hash('buyer123'), name: '买家张女士', phone: '13900000001', role: 'BUYER' }),
      m.create(User, { username: 'sunmai', passwordHash: hash('buyer123'), name: '买家孙先生', phone: '13900000002', role: 'BUYER' }),
    ]);
    const byName = Object.fromEntries(users.map((u) => [u.username, u]));

    await m.save(SellerProfile, [
      m.create(SellerProfile, {
        sellerId: byName['wangjiayi'].id,
        completedCount: 1, riskScore: '0', verificationLevel: 'NORMAL',
        riskNote: '履约良好，常规验真',
      }),
      m.create(SellerProfile, {
        sellerId: byName['linfan'].id,
        riskNote: '新卖家，暂无历史记录',
      }),
      m.create(SellerProfile, {
        sellerId: byName['liujing'].id,
        completedCount: 1, riskScore: '0', verificationLevel: 'NORMAL',
        riskNote: '常规验真',
      }),
    ]);

    // ---------- 样例 1：王阿姨的三人沙发，在售 ----------
    const sofaConsignment = await m.save(
      m.create(Consignment, {
        code: 'CN202600001',
        sellerId: byName['wangjiayi'].id,
        category: 'SOFA', brand: '顾家家居 KUKA', sizeText: '220x95x85 cm',
        material: '头层牛皮+实木框架', yearsUsed: 3,
        defectPhotos: ['seed://defect/sofa-arm-scratch.jpg'],
        disassemblable: true, floor: 6, elevator: 'ELEVATOR',
        expectedPrice: '1200.00', acceptRefurbish: true,
        address: '和平小区 3 栋 602', status: 'LISTED',
        verificationLevel: 'NORMAL', sellerNote: '扶手有猫抓痕，其余完好',
      }),
    );
    const sofaAppraisal = await m.save(
      m.create(Appraisal, {
        consignmentId: sofaConsignment.id, appraiserId: byName['gujia'].id,
        structuralScore: 2, stainScore: 2, odorScore: 1, mothScore: 1, warpScore: 1,
        moveDifficulty: 3, consignmentPrice: '980.00', minDealPrice: '800.00',
        commissionRate: '0.1500', estimatedRefurbishCost: '120.00',
        cleaningAdvice: '蒸汽深度清洁皮面，猫抓痕补伤膏处理',
        refurbishSuggestions: '扶手补色+打蜡', matchResult: 'MINOR_DIFF',
        matchNote: '猫抓痕比照片略明显，其余与描述一致',
      }),
    );
    const sofaItem = await m.save(
      m.create(Item, {
        consignmentId: sofaConsignment.id, category: 'SOFA',
        title: '顾家家居 三人位真皮沙发 可拆洗',
        description: '头层牛皮，使用 3 年；已完成深度清洁与扶手补色，结构稳固无异味。电梯房，可拆装，配送范围 30km。\n【色差提示】皮革在自然光与暖光下色调略有差异，以实物为准。',
        status: 'LISTED', location: 'WAREHOUSE', warehouseSlot: 'A-03-12',
        deliveryRadiusKm: 30, listedPrice: '980.00', minDealPrice: '800.00',
        cleaningCost: '60.00', refurbishCost: '80.00',
        photos: ['seed://item/sofa-1.jpg', 'seed://item/sofa-2.jpg'],
        shootLighting: '自然光 上午10点 北向窗 + 反光板补光',
        rawPhotos: ['seed://raw/sofa-raw-1.jpg', 'seed://raw/sofa-raw-2.jpg'],
        retouchNote: '仅校正白平衡与曝光，未调整饱和度',
        colorNotice: true, listedColor: '深咖色（暖调牛皮）',
        reviewStatus: 'NEUTRAL', photoStandardFlag: 'OK',
        enteredWarehouseAt: daysAgo(12), listedAt: daysAgo(4),
      }),
    );
    await m.save(ItemWorkLog, [
      m.create(ItemWorkLog, { itemId: sofaItem.id, assigneeId: byName['fanxin'].id, type: 'CLEANING', note: '蒸汽深度清洁', cost: '60.00', createdAt: daysAgo(11) }),
      m.create(ItemWorkLog, { itemId: sofaItem.id, assigneeId: byName['fanxin'].id, type: 'REPAINT', note: '扶手补色打蜡', cost: '80.00', createdAt: daysAgo(10) }),
      m.create(ItemWorkLog, { itemId: sofaItem.id, assigneeId: byName['cangguan'].id, type: 'STORAGE', note: 'A-03-12', cost: '0.00', createdAt: daysAgo(12) }),
      m.create(ItemWorkLog, { itemId: sofaItem.id, assigneeId: byName['cangguan'].id, type: 'PHOTOGRAPHY', note: '棚拍 6 张', cost: '0.00', createdAt: daysAgo(5) }),
      m.create(ItemWorkLog, { itemId: sofaItem.id, assigneeId: byName['cangguan'].id, type: 'LISTING_COPY', note: '上架描述', cost: '0.00', createdAt: daysAgo(4) }),
    ]);

    // ---------- 样例 2：刘静的办公椅，已成交并结算（快速周转标杆） ----------
    const chairConsignment = await m.save(
      m.create(Consignment, {
        code: 'CN202600002', sellerId: byName['liujing'].id,
        category: 'OFFICE_CHAIR', brand: '西昊 SIHOO', sizeText: '65x65x115 cm',
        material: '网布+尼龙脚', yearsUsed: 1, defectPhotos: [],
        disassemblable: true, floor: 3, elevator: 'ELEVATOR',
        expectedPrice: '350.00', acceptRefurbish: false,
        address: '科技园公寓', status: 'LISTED', verificationLevel: 'NORMAL',
      }),
    );
    const chairAppraisal = await m.save(
      m.create(Appraisal, {
        consignmentId: chairConsignment.id, appraiserId: byName['gujia'].id,
        structuralScore: 1, stainScore: 1, odorScore: 1, mothScore: 1, warpScore: 1,
        moveDifficulty: 1, consignmentPrice: '300.00', minDealPrice: '240.00',
        commissionRate: '0.1500', estimatedRefurbishCost: '0',
        cleaningAdvice: '常规擦拭即可', refurbishSuggestions: '无需翻新',
        matchResult: 'MATCH',
      }),
    );
    const chairItem = await m.save(
      m.create(Item, {
        consignmentId: chairConsignment.id, category: 'OFFICE_CHAIR',
        title: '西昊人体工学办公椅 95 新',
        description: '使用一年，气压杆正常，网布无破损。',
        status: 'DELIVERED', location: 'WAREHOUSE', warehouseSlot: 'B-01-05',
        deliveryRadiusKm: 30, listedPrice: '300.00', minDealPrice: '240.00',
        enteredWarehouseAt: daysAgo(20), listedAt: daysAgo(18),
      }),
    );
    const chairOrder = await m.save(
      m.create(Order, {
        code: 'OD2026000001', itemId: chairItem.id,
        consignmentId: chairConsignment.id, buyerId: byName['zhangmai'].id,
        sellerId: byName['liujing'].id, dealPrice: '300.00', deliveryFee: '60.00',
        buyerAddress: '幸福里 2 栋 501', buyerFloor: 5, buyerElevator: 'ELEVATOR',
        status: 'SETTLED', createdAt: daysAgo(16),
      }),
    );
    await m.save(
      m.create(Delivery, {
        orderId: chairOrder.id, teamId: byName['peisong'].id,
        vehicleType: 'SMALL_VAN', needsDisassembly: true,
        pickupFloor: 3, pickupElevator: 'ELEVATOR',
        dropoffFloor: 5, dropoffElevator: 'ELEVATOR',
        scheduledWindow: '2026-09-19 上午', status: 'DONE',
        createdAt: daysAgo(17),
      }),
    );
    const chairSettlement = await m.save(
      m.create(Settlement, {
        orderId: chairOrder.id, consignmentId: chairConsignment.id,
        sellerId: byName['liujing'].id, sellerPayout: '249.00', platformIncome: '105.00',
        createdAt: daysAgo(15),
      }),
    );
    await m.save(SettlementEntry, [
      m.create(SettlementEntry, { settlementId: chairSettlement.id, type: 'DEAL_PRICE', amount: '300.00', source: '订单 OD2026000001 成交价（寄卖价 300 / 底价 240）', sourceRefId: chairOrder.id }),
      m.create(SettlementEntry, { settlementId: chairSettlement.id, type: 'COMMISSION', amount: '45.00', source: '平台佣金 = 300 × 15%（估价师估价单）', sourceRefId: chairAppraisal.id }),
      m.create(SettlementEntry, { settlementId: chairSettlement.id, type: 'STORAGE_FEE', amount: '6.00', source: '库位 B-01-05 存放 2 天 × ¥3/天' }),
      m.create(SettlementEntry, { settlementId: chairSettlement.id, type: 'DELIVERY_FEE', amount: '60.00', source: '基础配送费 ¥60（电梯房）' }),
      m.create(SettlementEntry, { settlementId: chairSettlement.id, type: 'SELLER_PAYOUT', amount: '249.00', source: '卖家应得 = 300 - 45 - 6' }),
    ]);

    // ---------- 样例 3：王阿姨的另一张沙发，退货 + 沙发进不了电梯（售后/失败率样例） ----------
    const sofa2 = await m.save(
      m.create(Consignment, {
        code: 'CN202600003', sellerId: byName['wangjiayi'].id,
        category: 'SOFA', brand: '全友 QUANU', sizeText: '240x100x90 cm',
        material: '布艺', yearsUsed: 4, defectPhotos: [],
        disassemblable: false, floor: 2, elevator: 'NO_ELEVATOR',
        expectedPrice: '900.00', acceptRefurbish: true,
        address: '老街自建房', status: 'LISTED', verificationLevel: 'NORMAL',
      }),
    );
    const appraisal2 = await m.save(
      m.create(Appraisal, {
        consignmentId: sofa2.id, appraiserId: byName['gujia'].id,
        structuralScore: 2, stainScore: 3, odorScore: 2, mothScore: 1, warpScore: 2,
        moveDifficulty: 5, consignmentPrice: '760.00', minDealPrice: '600.00',
        commissionRate: '0.1500', estimatedRefurbishCost: '150.00',
        cleaningAdvice: '布套拆洗', refurbishSuggestions: '海绵轻微塌陷，建议加垫',
        matchResult: 'MATCH',
      }),
    );
    const item2 = await m.save(
      m.create(Item, {
        consignmentId: sofa2.id, category: 'SOFA',
        title: '全友四人位布艺沙发（不可拆装）',
        description: '布套可拆洗，需注意搬运尺寸。',
        status: 'RETURNED', location: 'WAREHOUSE', warehouseSlot: 'A-05-01',
        deliveryRadiusKm: 20, listedPrice: '760.00', minDealPrice: '600.00',
        cleaningCost: '50.00', refurbishCost: '120.00',
        shootLighting: '自然光 上午9点 库房门口', rawPhotos: ['seed://raw/sofa2-raw-1.jpg'],
        retouchNote: '无', colorNotice: true, listedColor: '浅灰色',
        reviewStatus: 'NEUTRAL', photoStandardFlag: 'OK',
        residualValue: '600.00', returnStorageFee: '40.00', relistEligible: true,
        returnInspectionNote: '包装完整无磕碰，布套已重新拆洗，按原价 8 折评估残值，可补充通道尺寸后二次上架',
        returnedAt: daysAgo(3),
        enteredWarehouseAt: daysAgo(9), listedAt: daysAgo(6),
      }),
    );
    const order2 = await m.save(
      m.create(Order, {
        code: 'OD2026000002', itemId: item2.id, consignmentId: sofa2.id,
        buyerId: byName['sunmai'].id, sellerId: byName['wangjiayi'].id,
        dealPrice: '760.00', deliveryFee: '140.00',
        buyerAddress: '梧桐苑 7 栋 902', buyerFloor: 9, buyerElevator: 'ELEVATOR',
        needOldFurnitureRemoval: false, status: 'RETURNED',
        deliveryNote: '轿厢进深仅 1.4m，沙发 2.4m 无法进梯', createdAt: daysAgo(5),
      }),
    );
    await m.save(
      m.create(Delivery, {
        orderId: order2.id, teamId: byName['peisong'].id,
        vehicleType: 'MID_TRUCK', needsDisassembly: false,
        pickupFloor: 2, pickupElevator: 'NO_ELEVATOR',
        dropoffFloor: 9, dropoffElevator: 'ELEVATOR',
        scheduledWindow: '2026-09-30 下午', status: 'FAILED',
        failReason: 'ELEVATOR_TOO_SMALL',
        failNote: '买家小区电梯进深 1.4m，沙发不可拆装，楼梯转角也无法通过',
        createdAt: daysAgo(6),
      }),
    );
    const ticket2 = await m.save(
      m.create(Ticket, {
        consignmentId: sofa2.id, itemId: item2.id, orderId: order2.id,
        type: 'ELEVATOR_BLOCK', createdBy: byName['peisong'].id, creatorRole: 'DELIVERY',
        status: 'RESOLVED', resolution: 'RETURN_REFUND', liableParty: 'SHARED',
        compensationAmount: '60.00',
        title: '沙发进不了买家电梯，买家要求退货',
        description: '现场测量电梯进深 1.4m，商品页未标注最小通道尺寸。买家要求退货并补偿往返搬运费。',
        createdAt: daysAgo(4),
      }),
    );
    await m.save(TicketMessage, [
      m.create(TicketMessage, { ticketId: ticket2.id, authorId: byName['sunmai'].id, authorRole: 'BUYER', authorName: '买家孙先生', content: '电梯确实进不去，申请退款。', createdAt: daysAgo(4) }),
      m.create(TicketMessage, { ticketId: ticket2.id, authorId: byName['peisong'].id, authorRole: 'DELIVERY', authorName: '配送队长小马', content: '已尝试立放、吊绳方案均不可行，建议退货。', createdAt: daysAgo(4) }),
      m.create(TicketMessage, { ticketId: ticket2.id, authorId: byName['kefu'].id, authorRole: 'CS', authorName: '客服小陈', content: '裁定退货退款，平台与卖家共担 60 元搬运补偿，商品返仓重新上架需补充通道尺寸。', createdAt: daysAgo(3) }),
    ]);

    // ---------- 样例 4：高风险卖家林反悔：一次反悔 + 一次描述不符；新申请触发 STRICT ----------
    const cancelledC = await m.save(
      m.create(Consignment, {
        code: 'CN202600004', sellerId: byName['linfan'].id,
        category: 'BOOKCASE', brand: '源氏木语', sizeText: '90x35x200 cm',
        material: '白橡木', yearsUsed: 2, defectPhotos: [],
        disassemblable: true, floor: 4, elevator: 'ELEVATOR',
        expectedPrice: '600.00', acceptRefurbish: true,
        status: 'CANCELLED', verificationLevel: 'NORMAL',
        sellerNote: '[卖家反悔] 家人不同意出售', createdAt: daysAgo(30),
      }),
    );
    const mismatchedC = await m.save(
      m.create(Consignment, {
        code: 'CN202600005', sellerId: byName['linfan'].id,
        category: 'DINING_TABLE', brand: '林氏木业', sizeText: '140x80x75 cm',
        material: '板材贴皮', yearsUsed: 1, defectPhotos: ['seed://defect/table-edge.jpg'],
        disassemblable: true, floor: 5, elevator: 'ELEVATOR',
        expectedPrice: '700.00', acceptRefurbish: true,
        status: 'APPRAISED', verificationLevel: 'STRICT', createdAt: daysAgo(10),
      }),
    );
    await m.save(
      m.create(Appraisal, {
        consignmentId: mismatchedC.id, appraiserId: byName['gujia'].id,
        structuralScore: 4, stainScore: 3, odorScore: 3, mothScore: 2, warpScore: 4,
        moveDifficulty: 3, consignmentPrice: '320.00', minDealPrice: '220.00',
        commissionRate: '0.1800', estimatedRefurbishCost: '260.00',
        cleaningAdvice: '贴面起翘需封边', refurbishSuggestions: '板材变形明显，建议仅同城自提',
        matchResult: 'MISMATCH',
        matchNote: '申报"实木几乎全新"，实测贴面板材且边缘变形、有烟味',
        createdAt: daysAgo(9),
      }),
    );
    await m.save(
      m.create(Item, {
        consignmentId: mismatchedC.id, category: 'DINING_TABLE',
        title: '林氏木业 1.4m 餐桌（需翻新）', description: '',
        status: 'PREPARING', location: 'SELLER_HOME', deliveryRadiusKm: 0,
        listedPrice: '320.00', minDealPrice: '220.00',
      }),
    );
    // 高风险卖家的新申请（估价师工作台可见 STRICT 置顶）
    await m.save(
      m.create(Consignment, {
        code: 'CN202600006', sellerId: byName['linfan'].id,
        category: 'KIDS_BED', brand: '松堡王国', sizeText: '200x120x90 cm',
        material: '松木', yearsUsed: 2, defectPhotos: [],
        disassemblable: true, floor: 5, elevator: 'ELEVATOR',
        expectedPrice: '800.00', acceptRefurbish: true,
        address: '城南 12 号院', status: 'SUBMITTED',
        verificationLevel: 'STRICT',
        sellerNote: '孩子长大换新床（系统已标记严格验真）',
      }),
    );
    // 画像按历史重算：反悔 1 次(3分) + 不符 1 次(2分) = 5 分 → STRICT
    await m.update(
      SellerProfile,
      { sellerId: byName['linfan'].id },
      {
        backtrackCount: 1,
        mismatchCount: 1,
        disputeCount: 0,
        completedCount: 0,
        riskScore: '5.00',
        verificationLevel: 'STRICT',
        riskNote: '风险分 5（反悔1/不符1/争议0），新寄卖需严格上门验真',
      },
    );

    // ---------- 样例 5：王阿姨在售书柜（丰富市场） ----------
    const bookC = await m.save(
      m.create(Consignment, {
        code: 'CN202600007', sellerId: byName['wangjiayi'].id,
        category: 'BOOKCASE', brand: '宜家 BILLY', sizeText: '80x28x202 cm',
        material: '刨花板贴膜', yearsUsed: 2, defectPhotos: [],
        disassemblable: true, floor: 6, elevator: 'ELEVATOR',
        expectedPrice: '200.00', acceptRefurbish: false,
        status: 'LISTED', verificationLevel: 'NORMAL',
      }),
    );
    await m.save(
      m.create(Appraisal, {
        consignmentId: bookC.id, appraiserId: byName['gujia'].id,
        structuralScore: 2, stainScore: 1, odorScore: 1, mothScore: 1, warpScore: 2,
        moveDifficulty: 2, consignmentPrice: '150.00', minDealPrice: '100.00',
        commissionRate: '0.1500', estimatedRefurbishCost: '0',
        cleaningAdvice: '擦拭即可', refurbishSuggestions: '无', matchResult: 'MATCH',
      }),
    );
    await m.save(
      m.create(Item, {
        consignmentId: bookC.id, category: 'BOOKCASE',
        title: '宜家 BILLY 书柜 80cm 白色',
        description: '可拆装，层板完好，无明显划痕。仅支持同城自提或短途配送 10km。\n【色差提示】白色贴膜在暖光灯下可能偏米白，自然光下为标准白色。',
        status: 'LISTED', location: 'WAREHOUSE', warehouseSlot: 'C-02-08',
        deliveryRadiusKm: 10, listedPrice: '150.00', minDealPrice: '100.00',
        photos: ['seed://item/billy-1.jpg'],
        shootLighting: '影室闪光灯 5500K，白背景',
        rawPhotos: ['seed://raw/billy-raw-1.jpg'],
        retouchNote: '未修图，仅裁剪',
        colorNotice: true, listedColor: '标准白',
        reviewStatus: 'NEUTRAL', photoStandardFlag: 'OK',
        enteredWarehouseAt: daysAgo(3), listedAt: daysAgo(1),
      }),
    );

    // ---------- 样例 6：书柜色差（页面描述不准确）→ 平台承担退货，家具取回中、卖家结算暂缓 ----------
    const book6C = await m.save(
      m.create(Consignment, {
        code: 'CN202600008', sellerId: byName['wangjiayi'].id,
        category: 'BOOKCASE', brand: '源氏木语', sizeText: '100x35x180 cm',
        material: '白橡木贴面', yearsUsed: 2, defectPhotos: [],
        disassemblable: true, floor: 3, elevator: 'ELEVATOR',
        expectedPrice: '900.00', acceptRefurbish: true,
        address: '和平小区 3 栋 602', status: 'LISTED', verificationLevel: 'NORMAL',
      }),
    );
    await m.save(
      m.create(Appraisal, {
        consignmentId: book6C.id, appraiserId: byName['gujia'].id,
        structuralScore: 2, stainScore: 1, odorScore: 1, mothScore: 1, warpScore: 2,
        moveDifficulty: 2, consignmentPrice: '680.00', minDealPrice: '520.00',
        commissionRate: '0.1500', estimatedRefurbishCost: '40.00',
        cleaningAdvice: '擦拭即可', refurbishSuggestions: '无', matchResult: 'MATCH',
      }),
    );
    const book6Item = await m.save(
      m.create(Item, {
        consignmentId: book6C.id, category: 'BOOKCASE',
        title: '源氏木语 1m 橡木书柜（页面标「浅原木色」）',
        description: '页面标注浅原木色，照片明亮偏白。可拆装，层板可调。',
        status: 'RETURNING', location: 'WAREHOUSE', warehouseSlot: 'C-03-02',
        deliveryRadiusKm: 20, listedPrice: '680.00', minDealPrice: '520.00',
        cleaningCost: '30.00', refurbishCost: '20.00',
        photos: ['seed://item/oak-case-1.jpg'],
        shootLighting: '暖光摄影灯 3200K（页面成片明显偏亮偏白）',
        rawPhotos: ['seed://raw/oak-case-raw-1.jpg'],
        retouchNote: '提高曝光 +0.7、饱和度 -15，原木深色纹理被淡化',
        colorNotice: false, listedColor: '浅原木色（偏白）',
        reviewStatus: 'BAD',
        reviewNote: '色差成立：实物为偏深橡木色，页面暖光拍摄并过度调色，且未提示色差',
        photoStandardFlag: 'NEEDS_REMEDY',
        photoRemedyNote: '标准自然光（北向窗上午）下重新拍摄并保留原图，禁止降低饱和度；页面颜色改为「橡木本色（偏深）」，显著标注不同光线下色差提示',
        relistEligible: true,
        enteredWarehouseAt: daysAgo(8), listedAt: daysAgo(6),
      }),
    );
    const book6Order = await m.save(
      m.create(Order, {
        code: 'OD2026000003', itemId: book6Item.id, consignmentId: book6C.id,
        buyerId: byName['zhangmai'].id, sellerId: byName['wangjiayi'].id,
        dealPrice: '680.00', deliveryFee: '60.00',
        buyerAddress: '幸福里 2 栋 501', buyerFloor: 5, buyerElevator: 'ELEVATOR',
        status: 'RETURNING', settlementHold: true,
        settlementHoldReason: '色差售后退货成立：等待家具回库残值评估、仓储费核算与二次上架结论，卖家结算暂缓',
        deliveryNote: '买家反馈实物颜色比页面深两个色号', createdAt: daysAgo(2),
      }),
    );
    await m.save(
      m.create(Delivery, {
        orderId: book6Order.id, teamId: byName['peisong'].id,
        vehicleType: 'SMALL_VAN', needsDisassembly: true,
        pickupFloor: 3, pickupElevator: 'ELEVATOR',
        dropoffFloor: 5, dropoffElevator: 'ELEVATOR',
        scheduledWindow: '2026-10-01 上午', status: 'DONE',
        createdAt: daysAgo(3),
      }),
    );
    const book6Ticket = await m.save(
      m.create(Ticket, {
        consignmentId: book6C.id, itemId: book6Item.id, orderId: book6Order.id,
        type: 'COLOR_DIFFERENCE', createdBy: byName['zhangmai'].id, creatorRole: 'BUYER',
        status: 'RESOLVED', resolution: 'RETURN_REFUND', liableParty: 'PLATFORM',
        compensationAmount: '60.00', colorFinding: 'LISTING_INACCURATE',
        careAdvice: '退货包装请保留原泡沫护角，返程搬运已安排。',
        title: '书柜实物颜色比页面照片深，认为描述不符',
        description: '页面为浅原木偏白色，实物为偏深橡木色，买家家中自然光下对比仍差异明显，要求退货退款并承担返程搬运费。',
        buyerPhotos: ['seed://buyer/bookcase-livingroom-1.jpg', 'seed://buyer/bookcase-livingroom-2.jpg'],
        buyerLighting: 'NATURAL_DAYLIGHT',
        buyerSceneNote: '书柜放在南向客厅，上午自然光拍摄，旁边是白色电视柜，对比明显偏深',
        createdAt: daysAgo(2),
      }),
    );
    await m.save(TicketMessage, [
      m.create(TicketMessage, { ticketId: book6Ticket.id, authorId: byName['zhangmai'].id, authorRole: 'BUYER', authorName: '买家张女士', content: '收到当天自然光下拍的，颜色和页面差很多，申请退货。', createdAt: daysAgo(2) }),
      m.create(TicketMessage, { ticketId: book6Ticket.id, authorId: byName['cangguan'].id, authorRole: 'WAREHOUSE', authorName: '仓库管理员阿海', content: '已调取原图：拍摄用了 3200K 暖光灯且修图降饱和提曝光，页面也没挂色差提示。', createdAt: daysAgo(2) }),
      m.create(TicketMessage, { ticketId: book6Ticket.id, authorId: byName['kefu'].id, authorRole: 'CS', authorName: '客服小陈', content: '【处理结论】色差裁定原因：页面描述不准确；平台承担退货退款并补偿 60 元返程搬运费，卖家结算暂缓至回库复检完成，商品按摄影规范整改后才能二次上架。', createdAt: daysAgo(1) }),
    ]);

    // ---------- 样例 7：书柜色差（自然光差异且页面已提示）→ 维持交易 + 保养建议 ----------
    const book7C = await m.save(
      m.create(Consignment, {
        code: 'CN202600009', sellerId: byName['liujing'].id,
        category: 'BOOKCASE', brand: '宜家 PAX 配件柜', sizeText: '75x40x200 cm',
        material: '刨花板贴膜', yearsUsed: 1, defectPhotos: [],
        disassemblable: true, floor: 3, elevator: 'ELEVATOR',
        expectedPrice: '260.00', acceptRefurbish: false,
        address: '科技园公寓', status: 'LISTED', verificationLevel: 'NORMAL',
      }),
    );
    await m.save(
      m.create(Appraisal, {
        consignmentId: book7C.id, appraiserId: byName['gujia'].id,
        structuralScore: 1, stainScore: 1, odorScore: 1, mothScore: 1, warpScore: 1,
        moveDifficulty: 2, consignmentPrice: '220.00', minDealPrice: '160.00',
        commissionRate: '0.1500', estimatedRefurbishCost: '0',
        cleaningAdvice: '擦拭即可', refurbishSuggestions: '无', matchResult: 'MATCH',
      }),
    );
    const book7Item = await m.save(
      m.create(Item, {
        consignmentId: book7C.id, category: 'BOOKCASE',
        title: '宜家窄边书柜 暖白色（已标注色差提示）',
        description: '暖白色贴膜，九成新，无磕碰。\n【色差提示】暖光灯下偏米黄、自然光下偏白，属正常光线差异。',
        status: 'DELIVERED', location: 'WAREHOUSE', warehouseSlot: 'C-04-01',
        deliveryRadiusKm: 15, listedPrice: '220.00', minDealPrice: '160.00',
        photos: ['seed://item/pax-1.jpg'],
        shootLighting: '自然光 下午3点 东向窗',
        rawPhotos: ['seed://raw/pax-raw-1.jpg'],
        retouchNote: '无',
        colorNotice: true, listedColor: '暖白色',
        reviewStatus: 'GOOD',
        reviewNote: '买家认可：自然光差异，页面已有色差提示',
        photoStandardFlag: 'OK',
        enteredWarehouseAt: daysAgo(6), listedAt: daysAgo(5),
      }),
    );
    const book7Order = await m.save(
      m.create(Order, {
        code: 'OD2026000004', itemId: book7Item.id, consignmentId: book7C.id,
        buyerId: byName['sunmai'].id, sellerId: byName['liujing'].id,
        dealPrice: '220.00', deliveryFee: '60.00',
        buyerAddress: '梧桐苑 7 栋 902', buyerFloor: 9, buyerElevator: 'ELEVATOR',
        status: 'DELIVERED',
        deliveryNote: '签收后反馈晚上看偏黄', createdAt: daysAgo(1),
      }),
    );
    await m.save(
      m.create(Delivery, {
        orderId: book7Order.id, teamId: byName['peisong'].id,
        vehicleType: 'SMALL_VAN', needsDisassembly: true,
        pickupFloor: 3, pickupElevator: 'ELEVATOR',
        dropoffFloor: 9, dropoffElevator: 'ELEVATOR',
        scheduledWindow: '2026-10-02 下午', status: 'DONE',
        createdAt: daysAgo(2),
      }),
    );
    const book7Ticket = await m.save(
      m.create(Ticket, {
        consignmentId: book7C.id, itemId: book7Item.id, orderId: book7Order.id,
        type: 'COLOR_DIFFERENCE', createdBy: byName['sunmai'].id, creatorRole: 'BUYER',
        status: 'RESOLVED', resolution: 'KEEP_LISTING', liableParty: 'NONE',
        compensationAmount: '0', colorFinding: 'NATURAL_VARIATION',
        careAdvice: '暖白色贴膜在暖光灯下偏米黄属正常现象：白天自然光下即偏白；避免紧贴暖色射灯摆放，日常用微湿软布顺纹理擦拭，避免阳光长时间直射可延缓黄变。',
        title: '书柜晚上看比照片黄，怀疑色差',
        description: '买家晚上在客厅暖光灯下觉得书柜偏黄，与页面照片不一致。',
        buyerPhotos: ['seed://buyer/bookcase-warmlight-1.jpg'],
        buyerLighting: 'INDOOR_WARM',
        buyerSceneNote: '晚上客厅 3000K 暖光筒灯下拍摄',
        createdAt: daysAgo(1),
      }),
    );
    await m.save(TicketMessage, [
      m.create(TicketMessage, { ticketId: book7Ticket.id, authorId: byName['sunmai'].id, authorRole: 'BUYER', authorName: '买家孙先生', content: '晚上看挺黄的，和页面不一样。', createdAt: daysAgo(1) }),
      m.create(TicketMessage, { ticketId: book7Ticket.id, authorId: byName['cangguan'].id, authorRole: 'WAREHOUSE', authorName: '仓库管理员阿海', content: '比对原图：页面为自然光拍摄无修图，商品页已标注暖光灯下偏米黄，买家照片是 3000K 暖光环境。', createdAt: daysAgo(1) }),
      m.create(TicketMessage, { ticketId: book7Ticket.id, authorId: byName['kefu'].id, authorRole: 'CS', authorName: '客服小陈', content: '【处理结论】色差裁定原因：自然光/灯光差异（页面已提示）；交易维持，已向买家发送摆放与保养建议。', createdAt: daysAgo(1) }),
    ]);

    // eslint-disable-next-line no-console
    console.log('[seed] 演示数据已写入');
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User, SellerProfile, Consignment, Appraisal, Item, ItemWorkLog,
      Order, Delivery, Ticket, TicketMessage, Settlement, SettlementEntry,
    ]),
  ],
  providers: [SeederService],
  exports: [SeederService],
})
export class SeederModule {}
