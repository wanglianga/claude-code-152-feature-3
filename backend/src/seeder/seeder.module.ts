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
import {
  PhotoAudit,
  PhotoStandard,
  ItemReview,
} from '../entities/photo-audit.entity';
import { ReturnAssessment } from '../entities/return-assessment.entity';

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
        description: '头层牛皮，使用 3 年；已完成深度清洁与扶手补色，结构稳固无异味。电梯房，可拆装，配送范围 30km。',
        status: 'LISTED', location: 'WAREHOUSE', warehouseSlot: 'A-03-12',
        deliveryRadiusKm: 30, listedPrice: '980.00', minDealPrice: '800.00',
        cleaningCost: '60.00', refurbishCost: '80.00',
        photos: ['seed://item/sofa-1.jpg', 'seed://item/sofa-2.jpg'],
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
        description: '可拆装，层板完好，无明显划痕。仅支持同城自提或短途配送 10km。',
        status: 'LISTED', location: 'WAREHOUSE', warehouseSlot: 'C-02-08',
        deliveryRadiusKm: 10, listedPrice: '150.00', minDealPrice: '100.00',
        enteredWarehouseAt: daysAgo(3), listedAt: daysAgo(1),
      }),
    );

    // ---------- 样例 6：书柜色差争议（OPEN，待客服认定）——页面已提示自然光差异 ----------
    const bc6 = await m.save(
      m.create(Consignment, {
        code: 'CN202600008', sellerId: byName['wangjiayi'].id,
        category: 'BOOKCASE', brand: '源氏木语', sizeText: '90x35x180 cm',
        material: '白橡木', yearsUsed: 2, defectPhotos: ['seed://defect/bookcase-oak.jpg'],
        disassemblable: true, floor: 6, elevator: 'ELEVATOR',
        expectedPrice: '680.00', acceptRefurbish: true,
        address: '和平小区 3 栋 602', status: 'LISTED', verificationLevel: 'NORMAL',
        sellerNote: '橡木纹理，不同光线下颜色略有深浅',
      }),
    );
    await m.save(
      m.create(Appraisal, {
        consignmentId: bc6.id, appraiserId: byName['gujia'].id,
        structuralScore: 1, stainScore: 1, odorScore: 1, mothScore: 1, warpScore: 1,
        moveDifficulty: 2, consignmentPrice: '560.00', minDealPrice: '450.00',
        commissionRate: '0.1500', estimatedRefurbishCost: '40.00',
        cleaningAdvice: '擦拭上木蜡油', refurbishSuggestions: '无',
        matchResult: 'MATCH', matchNote: '颜色与卖家描述一致',
      }),
    );
    const item6 = await m.save(
      m.create(Item, {
        consignmentId: bc6.id, category: 'BOOKCASE',
        title: '源氏木语 白橡木五层书柜 90cm',
        description:
          '白橡木原木色，已清洁上木蜡油。页面照片于标准日光下拍摄，' +
          '【色差提示】木质家具在暖光/自然光下颜色会有轻微深浅差异，属正常现象，介意者慎拍。',
        status: 'DELIVERED', location: 'WAREHOUSE', warehouseSlot: 'C-03-02',
        deliveryRadiusKm: 20, listedPrice: '560.00', minDealPrice: '450.00',
        cleaningCost: '40.00', refurbishCost: '0.00',
        photos: ['seed://item/bookcase-oak-1.jpg', 'seed://item/bookcase-oak-2.jpg'],
        enteredWarehouseAt: daysAgo(8), listedAt: daysAgo(6),
      }),
    );
    await m.save(
      m.create(PhotoAudit, {
        itemId: item6.id, recordedBy: byName['cangguan'].id,
        lightingSetup: '5500K 标准日光摄影棚 + 右侧补光板',
        cameraSetup: '索尼 A7M4 / 35mm / 白平衡 5300K，灰卡校准',
        rawPhotos: ['seed://raw/bookcase-oak-raw-1.jpg', 'seed://raw/bookcase-oak-raw-2.jpg'],
        editedPhotos: ['seed://item/bookcase-oak-1.jpg', 'seed://item/bookcase-oak-2.jpg'],
        retouchNote: '仅曝光 +0.2 与裁切，未调整饱和度与色温，修图前后留档',
        colorNoticeOnPage: true,
        colorNoticeText: '木质家具在暖光/自然光下颜色会有轻微深浅差异，属正常现象',
        colorReference: '橡木色 NCS S 4010-Y30R',
      }),
    );
    const order6 = await m.save(
      m.create(Order, {
        code: 'OD2026000003', itemId: item6.id, consignmentId: bc6.id,
        buyerId: byName['zhangmai'].id, sellerId: byName['wangjiayi'].id,
        dealPrice: '560.00', deliveryFee: '60.00',
        buyerAddress: '幸福里 2 栋 501', buyerFloor: 5, buyerElevator: 'ELEVATOR',
        status: 'DELIVERED', appointmentWindow: '2026-10-02 上午',
        deliveryNote: '买家称实物比页面偏黄', createdAt: daysAgo(1),
      }),
    );
    await m.save(
      m.create(Delivery, {
        orderId: order6.id, teamId: byName['peisong'].id,
        vehicleType: 'SMALL_VAN', needsDisassembly: true,
        pickupFloor: 6, pickupElevator: 'ELEVATOR',
        dropoffFloor: 5, dropoffElevator: 'ELEVATOR',
        scheduledWindow: '2026-10-02 上午', status: 'DONE',
      }),
    );
    const ticket6 = await m.save(
      m.create(Ticket, {
        consignmentId: bc6.id, itemId: item6.id, orderId: order6.id,
        type: 'COLOR_DIFFERENCE', createdBy: byName['zhangmai'].id, creatorRole: 'BUYER',
        status: 'OPEN', resolution: 'PENDING', liableParty: 'SHARED',
        title: '书柜到货颜色比页面照片偏黄，认为色差明显',
        description:
          '买家张女士反馈：晚上暖光灯下书柜整体偏黄，与页面冷白光照片不一致，要求解释或补偿。' +
          '客服可调取拍摄灯光、原图、修图记录、买家现场照片与商品描述核对。',
        buyerPhotos: [
          'seed://buyer/bookcase-warm-light-1.jpg',
          'seed://buyer/bookcase-warm-light-2.jpg',
        ],
        createdAt: daysAgo(0),
      }),
    );
    await m.save(
      m.create(TicketMessage, {
        ticketId: ticket6.id, authorId: byName['zhangmai'].id, authorRole: 'BUYER',
        authorName: '买家张女士',
        content: '家里 3000K 暖光灯下看着明显偏黄，和照片颜色不一样，附两张晚上拍的照片。',
      }),
    );

    // ---------- 样例 7：餐边柜色差——页面描述不准确，退货成立，待回库评估（卖家结算暂缓） ----------
    const cc7 = await m.save(
      m.create(Consignment, {
        code: 'CN202600009', sellerId: byName['liujing'].id,
        category: 'APPLIANCE_CABINET', brand: '林氏木业', sizeText: '120x40x85 cm',
        material: '板材贴胡桃木皮', yearsUsed: 2, defectPhotos: [],
        disassemblable: true, floor: 3, elevator: 'ELEVATOR',
        expectedPrice: '900.00', acceptRefurbish: true,
        address: '科技园公寓', status: 'LISTED', verificationLevel: 'NORMAL',
      }),
    );
    await m.save(
      m.create(Appraisal, {
        consignmentId: cc7.id, appraiserId: byName['gujia'].id,
        structuralScore: 2, stainScore: 2, odorScore: 1, mothScore: 1, warpScore: 2,
        moveDifficulty: 2, consignmentPrice: '780.00', minDealPrice: '620.00',
        commissionRate: '0.1500', estimatedRefurbishCost: '60.00',
        cleaningAdvice: '擦拭即可', refurbishSuggestions: '无',
        matchResult: 'MINOR_DIFF', matchNote: '实物皮面偏红棕，申报偏深胡桃色',
      }),
    );
    const item7 = await m.save(
      m.create(Item, {
        consignmentId: cc7.id, category: 'APPLIANCE_CABINET',
        title: '林氏木业 胡桃木色餐边柜 1.2m',
        // 页面描述把颜色写成"深胡桃色"，修图又压了色温，未做色差提示
        description: '深胡桃木色，质感沉稳，几乎全新。已清洁，支持 20km 配送。',
        status: 'RETURNED', location: 'WAREHOUSE', warehouseSlot: 'D-04-01',
        deliveryRadiusKm: 20, listedPrice: '780.00', minDealPrice: '620.00',
        cleaningCost: '60.00', refurbishCost: '0.00',
        photos: ['seed://item/cabinet-walnut-1.jpg'],
        enteredWarehouseAt: daysAgo(10), listedAt: daysAgo(8),
        colorAvgScore: '2.00', colorReviewCount: 1,
      }),
    );
    await m.save(
      m.create(PhotoAudit, {
        itemId: item7.id, recordedBy: byName['cangguan'].id,
        lightingSetup: '混合光源（暖光顶灯为主），未做白平衡校准',
        cameraSetup: '手机直出，自动白平衡',
        rawPhotos: ['seed://raw/cabinet-raw-1.jpg'],
        editedPhotos: ['seed://item/cabinet-walnut-1.jpg'],
        retouchNote: '色温 -18% 往深胡桃色调，饱和度 +12%（超出规范 ±5%）',
        colorNoticeOnPage: false,
        colorNoticeText: '',
        colorReference: '',
      }),
    );
    const order7 = await m.save(
      m.create(Order, {
        code: 'OD2026000004', itemId: item7.id, consignmentId: cc7.id,
        buyerId: byName['sunmai'].id, sellerId: byName['liujing'].id,
        dealPrice: '780.00', deliveryFee: '60.00',
        buyerAddress: '梧桐苑 7 栋 902', buyerFloor: 9, buyerElevator: 'ELEVATOR',
        status: 'RETURNING',
        deliveryNote: '实物红棕色，页面深胡桃色，描述与修图均失真', createdAt: daysAgo(3),
      }),
    );
    await m.save(
      m.create(Delivery, {
        orderId: order7.id, teamId: byName['peisong'].id,
        vehicleType: 'SMALL_VAN', needsDisassembly: true,
        pickupFloor: 3, pickupElevator: 'ELEVATOR',
        dropoffFloor: 9, dropoffElevator: 'ELEVATOR',
        scheduledWindow: '2026-10-01 下午', status: 'DONE',
      }),
    );
    const ticket7 = await m.save(
      m.create(Ticket, {
        consignmentId: cc7.id, itemId: item7.id, orderId: order7.id,
        type: 'COLOR_DIFFERENCE', createdBy: byName['sunmai'].id, creatorRole: 'BUYER',
        status: 'RESOLVED', resolution: 'RETURN_REFUND', liableParty: 'PLATFORM',
        compensationAmount: '60.00',
        title: '餐边柜实物红棕，页面深胡桃色，描述与照片均失真',
        description:
          '买家孙先生反馈实物为红棕色，页面描述"深胡桃色"且修图压低色温。' +
          '客服核对原图/修图记录/现场照片后认定页面描述不准确，平台承担退货退款并补偿往返运费。',
        buyerPhotos: ['seed://buyer/cabinet-red-brown-1.jpg'],
        colorFinding: 'LISTING_INACCURATE', colorScore: 2,
        findingBasis: '原图为红棕色调，修图色温 -18%、饱和度 +12% 超出规范，页面描述写成深胡桃色且无色差提示',
        careAdvice: '',
        createdAt: daysAgo(2),
      }),
    );
    await m.save(
      m.create(ItemReview, {
        itemId: item7.id, orderId: order7.id, authorId: byName['sunmai'].id,
        authorRole: 'BUYER', authorName: '买家孙先生', colorScore: 2,
        content: '实物红棕，照片深胡桃，差距明显。',
        photos: ['seed://buyer/cabinet-red-brown-1.jpg'], source: 'BUYER',
        createdAt: daysAgo(2),
      }),
    );
    await m.save(
      m.create(TicketMessage, {
        ticketId: ticket7.id, authorId: byName['kefu'].id, authorRole: 'CS',
        authorName: '客服小陈',
        content:
          '【色差认定】页面描述/照片不准确（平台承担退换），颜色一致性评分 2/5。' +
          '依据：原图为红棕色调，修图色温 -18%、饱和度 +12% 超出规范，页面描述写成深胡桃色且无色差提示。' +
          '该认定将沉淀为商品色差评价并触发摄影规范整改。（责任方：PLATFORM，赔付：¥60.00）',
        createdAt: daysAgo(2),
      }),
    );
    await m.save(
      m.create(PhotoStandard, {
        category: 'APPLIANCE_CABINET', material: '板材贴胡桃木皮',
        title: '【家电柜·板材贴胡桃木皮】色差整改摄影规范',
        content:
          '来源工单「餐边柜实物红棕，页面深胡桃色，描述与照片均失真」认定页面颜色呈现不准确。' +
          '后续拍摄要求：1) 使用 5000-5500K 标准日光光源并附灰卡校准白平衡；' +
          '2) 留存窗边自然光与室内暖光各 1 张原图；3) 修图仅允许曝光与裁切，色温/饱和度调整不超过 ±5%；' +
          '4) 页面必须标注色差提示并写明材质色号；5) 上架前双人核对原图与页面图。',
        status: 'ACTIVE', sourceTicketId: ticket7.id, createdBy: byName['kefu'].id,
        createdAt: daysAgo(2),
      }),
    );

    // ---------- 样例 8：色差退货已回库评估完成、二次上架（结算可确认） ----------
    const cc8 = await m.save(
      m.create(Consignment, {
        code: 'CN202600010', sellerId: byName['wangjiayi'].id,
        category: 'BOOKCASE', brand: '宜家 PAX', sizeText: '100x40x200 cm',
        material: '刨花板贴膜', yearsUsed: 3, defectPhotos: [],
        disassemblable: true, floor: 6, elevator: 'ELEVATOR',
        expectedPrice: '400.00', acceptRefurbish: true,
        address: '和平小区 3 栋 602', status: 'LISTED', verificationLevel: 'NORMAL',
      }),
    );
    await m.save(
      m.create(Appraisal, {
        consignmentId: cc8.id, appraiserId: byName['gujia'].id,
        structuralScore: 2, stainScore: 1, odorScore: 1, mothScore: 1, warpScore: 2,
        moveDifficulty: 2, consignmentPrice: '320.00', minDealPrice: '240.00',
        commissionRate: '0.1500', estimatedRefurbishCost: '30.00',
        cleaningAdvice: '擦拭', refurbishSuggestions: '无', matchResult: 'MATCH',
      }),
    );
    const item8 = await m.save(
      m.create(Item, {
        consignmentId: cc8.id, category: 'BOOKCASE',
        title: '宜家 PAX 衣柜/书柜组合 100cm（返仓复检 9 新）',
        description:
          '原买家因色差退货，回库复检无磕碰、结构完好，已重新清洁。' +
          '残值评估 ¥260 二次上架；页面附标准日光与暖光两组实拍，并标注色差提示。',
        status: 'LISTED', location: 'WAREHOUSE', warehouseSlot: 'C-05-06',
        deliveryRadiusKm: 15, listedPrice: '260.00', minDealPrice: '200.00',
        cleaningCost: '30.00', refurbishCost: '0.00',
        photos: ['seed://item/pax-resale-1.jpg', 'seed://item/pax-resale-2.jpg'],
        enteredWarehouseAt: daysAgo(1), listedAt: daysAgo(0),
        lastRestockAt: daysAgo(1),
      }),
    );
    const order8 = await m.save(
      m.create(Order, {
        code: 'OD2026000005', itemId: item8.id, consignmentId: cc8.id,
        buyerId: byName['sunmai'].id, sellerId: byName['wangjiayi'].id,
        dealPrice: '320.00', deliveryFee: '60.00',
        buyerAddress: '梧桐苑 7 栋 902', buyerFloor: 9, buyerElevator: 'ELEVATOR',
        status: 'RETURNED', createdAt: daysAgo(4),
      }),
    );
    await m.save(
      m.create(Delivery, {
        orderId: order8.id, teamId: byName['peisong'].id,
        vehicleType: 'SMALL_VAN', needsDisassembly: true,
        pickupFloor: 6, pickupElevator: 'ELEVATOR',
        dropoffFloor: 9, dropoffElevator: 'ELEVATOR',
        scheduledWindow: '2026-09-30 上午', status: 'DONE',
      }),
    );
    const ticket8 = await m.save(
      m.create(Ticket, {
        consignmentId: cc8.id, itemId: item8.id, orderId: order8.id,
        type: 'COLOR_DIFFERENCE', createdBy: byName['sunmai'].id, creatorRole: 'BUYER',
        status: 'CLOSED', resolution: 'RETURN_REFUND', liableParty: 'PLATFORM',
        compensationAmount: '60.00',
        title: 'PAX 书柜白色偏暖，买家要求退货',
        description: '买家认为页面纯白实物偏暖。客服认定修图偏冷、描述不准确，平台承担退货退款。',
        buyerPhotos: ['seed://buyer/pax-warm-1.jpg'],
        colorFinding: 'LISTING_INACCURATE', colorScore: 2,
        findingBasis: '页面图白平衡偏冷，实物偏暖白，描述写"纯白"不准确',
        createdAt: daysAgo(4),
      }),
    );
    await m.save(
      m.create(ReturnAssessment, {
        ticketId: ticket8.id, itemId: item8.id, orderId: order8.id,
        assessedBy: byName['cangguan'].id, assessorName: '仓库管理员阿海',
        conditionNote: '回库复检：无磕碰、无污损、五金齐全，层板轻微使用痕迹，重新清洁后可二次上架',
        checkPhotos: ['seed://return/pax-check-1.jpg', 'seed://return/pax-check-2.jpg'],
        residualValue: '260.00', restockStorageFee: '15.00', restockHandlingFee: '20.00',
        decision: 'RE_LISTABLE', warehouseSlot: 'C-05-06',
        returnedAt: daysAgo(1), createdAt: daysAgo(1),
      }),
    );
    await m.save(
      m.create(TicketMessage, {
        ticketId: ticket8.id, authorId: byName['cangguan'].id, authorRole: 'WAREHOUSE',
        authorName: '仓库管理员阿海',
        content:
          '【回库评估】可二次上架；残值 ¥260.00，回库仓储费 ¥15.00，复检处理费 ¥20.00。' +
          '回库复检：无磕碰、无污损、五金齐全，重新清洁后可二次上架。',
        createdAt: daysAgo(1),
      }),
    );

    // eslint-disable-next-line no-console
    console.log('[seed] 演示数据已写入');
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User, SellerProfile, Consignment, Appraisal, Item, ItemWorkLog,
      Order, Delivery, Ticket, TicketMessage, Settlement, SettlementEntry,
      PhotoAudit, PhotoStandard, ItemReview, ReturnAssessment,
    ]),
  ],
  providers: [SeederService],
  exports: [SeederService],
})
export class SeederModule {}
