import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Ticket, TicketMessage, TicketType } from '../entities/ticket.entity';
import { Consignment } from '../entities/consignment.entity';
import { Item } from '../entities/item.entity';
import { Order } from '../entities/order.entity';
import { Delivery } from '../entities/delivery.entity';
import {
  PhotoAudit,
  PhotoStandard,
  ItemReview,
} from '../entities/photo-audit.entity';
import { ReturnAssessment } from '../entities/return-assessment.entity';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SellerRiskService } from '../risk/risk.module';

const TICKET_TYPES: TicketType[] = [
  'SELLER_BACKTRACK',
  'APPRAISAL_MISMATCH',
  'REFURBISH_OVERRUN',
  'COLOR_DIFFERENCE',
  'ELEVATOR_BLOCK',
  'TRANSIT_DAMAGE',
  'RETURN_REQUEST',
  'OTHER',
];

const CATEGORY_LABELS: Record<string, string> = {
  SOFA: '沙发',
  DINING_TABLE: '餐桌',
  KIDS_BED: '儿童床',
  BOOKCASE: '书柜',
  OFFICE_CHAIR: '办公椅',
  APPLIANCE_CABINET: '家电柜',
};

const DEFAULT_CARE_ADVICE =
  '不同光源（暖光/冷光/自然光）下木质与漆面颜色会有轻微差异，属正常现象。' +
  '建议避免阳光长时间直射，日常用干净软布顺纹理擦拭，远离暖气片与加湿器，每半年可做一次木蜡保养。';

class CreateTicketDto {
  consignmentId?: string;
  itemId?: string;
  orderId?: string;
  type: TicketType;
  title: string;
  description: string;
  buyerPhotos?: string[];
}

class ResolveDto {
  resolution:
    | 'KEEP_LISTING'
    | 'REDUCE_PRICE'
    | 'SELLER_COMPENSATE'
    | 'PLATFORM_COMPENSATE'
    | 'RETURN_REFUND'
    | 'RE_LIST'
    | 'CANCEL_CONSIGNMENT';
  liableParty: 'SELLER' | 'BUYER' | 'PLATFORM' | 'DELIVERY' | 'REFURBISHER' | 'SHARED';
  compensationAmount?: number;
  note?: string;
  newPrice?: number;
  /** 色差认定：LISTING_INACCURATE 页面描述不准确 / NATURAL_LIGHT 自然光差异 */
  colorFinding?: 'LISTING_INACCURATE' | 'NATURAL_LIGHT' | 'INCONCLUSIVE';
  /** 颜色一致性 1-5 */
  colorScore?: number;
  /** 维持交易时的保养建议 */
  careAdvice?: string;
  /** 认定依据（灯光/原图/修图/现场照片/页面描述核对结论） */
  findingBasis?: string;
}

class ReturnAssessmentDto {
  conditionNote: string;
  checkPhotos?: string[];
  residualValue: number;
  restockStorageFee?: number;
  restockHandlingFee?: number;
  decision: 'RE_LISTABLE' | 'DISPOSED';
  warehouseSlot?: string;
}

/** 重算商品色差评价均分（买家评价 + 客服认定） */
async function recalcItemColorScore(m: DataSource['manager'], itemId: string) {
  const reviews = await m.find(ItemReview, { where: { itemId } });
  const item = await m.findOne(Item, { where: { id: itemId } });
  if (!item) return;
  if (reviews.length === 0) {
    item.colorAvgScore = null;
    item.colorReviewCount = 0;
  } else {
    const avg = reviews.reduce((s, r) => s + r.colorScore, 0) / reviews.length;
    item.colorAvgScore = (Math.round(avg * 10) / 10).toFixed(2);
    item.colorReviewCount = reviews.length;
  }
  await m.save(item);
}

/**
 * 协同工单：卖家、买家、仓库、翻新师、配送、客服围绕同一件家具处理异常。
 * 色差争议需核对拍摄灯光/原图/修图记录/买家现场照片/页面描述后给出认定：
 * 页面描述不准确 → 平台承担退换或补偿，并沉淀摄影规范与商品评价；
 * 自然光差异且页面已提示 → 维持交易并附保养建议。
 * 退货成立后家具回库评估残值/仓储费/二次上架，卖家结算暂缓至评估确认。
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tickets')
export class TicketController {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly risk: SellerRiskService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateTicketDto,
  ) {
    if (!TICKET_TYPES.includes(dto.type)) {
      throw new BadRequestException('未知工单类型');
    }
    if (!dto.title || !dto.description) {
      throw new BadRequestException('请填写工单标题与描述');
    }
    return this.ds.transaction(async (m) => {
      let consignmentId = dto.consignmentId;
      let itemId = dto.itemId || null;
      let orderId = dto.orderId || null;

      if (orderId) {
        const order = await m.findOne(Order, { where: { id: orderId } });
        if (!order) throw new NotFoundException('关联订单不存在');
        if (
          user.role === 'BUYER' &&
          order.buyerId !== user.sub
        ) {
          throw new ForbiddenException('只能为自己的订单发起工单');
        }
        if (user.role === 'SELLER' && order.sellerId !== user.sub) {
          throw new ForbiddenException('只能为自己的订单发起工单');
        }
        consignmentId = order.consignmentId;
        itemId = order.itemId;
      } else if (itemId) {
        const item = await m.findOne(Item, { where: { id: itemId } });
        if (!item) throw new NotFoundException('关联商品不存在');
        consignmentId = item.consignmentId;
      }
      if (!consignmentId) {
        throw new BadRequestException('工单必须关联家具（寄卖单/商品/订单）');
      }
      const consignment = await m.findOne(Consignment, {
        where: { id: consignmentId },
      });
      if (!consignment) throw new NotFoundException('寄卖单不存在');
      if (user.role === 'SELLER' && consignment.sellerId !== user.sub) {
        throw new ForbiddenException('只能为自己的寄卖发起工单');
      }

      const ticket = m.create(Ticket, {
        consignmentId,
        itemId,
        orderId,
        type: dto.type,
        createdBy: user.sub,
        creatorRole: user.role,
        status: 'OPEN',
        resolution: 'PENDING',
        liableParty: 'SHARED',
        title: dto.title,
        description: dto.description,
        buyerPhotos: dto.buyerPhotos || [],
      });
      await m.save(ticket);

      // 卖家临时反悔/描述不符工单即时留下画像痕迹（处理完结时再重算）
      if (
        user.role === 'SELLER' &&
        ['SELLER_BACKTRACK', 'APPRAISAL_MISMATCH'].includes(dto.type)
      ) {
        await this.risk.recalculate(consignment.sellerId);
      }
      return this.buildDetail(m, ticket.id, user);
    });
  }

  @Get()
  async list(@CurrentUser() user: JwtPayload) {
    const repo = this.ds.getRepository(Ticket);
    let tickets: Ticket[];
    if (['CS', 'OPS', 'ADMIN', 'APPRAISER', 'WAREHOUSE', 'REFURBISHER', 'DELIVERY'].includes(user.role)) {
      tickets = await repo.find({ order: { createdAt: 'DESC' } });
    } else if (user.role === 'SELLER') {
      const consignments = await this.ds.getRepository(Consignment).find({
        where: { sellerId: user.sub },
      });
      const ids = consignments.map((c) => c.id);
      tickets = ids.length
        ? await repo.find({
            where: { consignmentId: In(ids) },
            order: { createdAt: 'DESC' },
          })
        : [];
    } else {
      const orders = await this.ds.getRepository(Order).find({
        where: { buyerId: user.sub },
      });
      const ids = orders.map((o) => o.id);
      tickets = ids.length
        ? await repo.find({
            where: { orderId: In(ids) },
            order: { createdAt: 'DESC' },
          })
        : [];
    }
    return tickets;
  }

  @Get(':id')
  async detail(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.buildDetail(this.ds.manager, id, user, true);
  }

  /** 各方在同一工单下协同留言 */
  @Post(':id/messages')
  async message(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { content: string },
  ) {
    if (!body?.content?.trim()) {
      throw new BadRequestException('留言内容不能为空');
    }
    const ticket = await this.ds.getRepository(Ticket).findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('工单不存在');
    await this.assertVisible(user, ticket);
    const msg = this.ds.getRepository(TicketMessage).create({
      ticketId: id,
      authorId: user.sub,
      authorRole: user.role,
      authorName: user.name,
      content: body.content.trim(),
    });
    await this.ds.getRepository(TicketMessage).save(msg);
    return msg;
  }

  /** 客服裁定处理结论，联动订单/商品/寄卖单状态；赔付金额写入工单供结算引用 */
  @Roles('CS', 'OPS', 'ADMIN')
  @Post(':id/resolve')
  async resolve(
    @Param('id') id: string,
    @Body() dto: ResolveDto,
  ) {
    const validResolutions = [
      'KEEP_LISTING',
      'REDUCE_PRICE',
      'SELLER_COMPENSATE',
      'PLATFORM_COMPENSATE',
      'RETURN_REFUND',
      'RE_LIST',
      'CANCEL_CONSIGNMENT',
    ];
    if (!validResolutions.includes(dto.resolution)) {
      throw new BadRequestException('未知处理结论');
    }
    return this.ds.transaction(async (m) => {
      const ticket = await m.findOne(Ticket, { where: { id } });
      if (!ticket) throw new NotFoundException('工单不存在');
      if (ticket.status === 'CLOSED') {
        throw new BadRequestException('工单已关闭');
      }

      // ---------- 色差争议：证据核对与认定 ----------
      let colorFinding = dto.colorFinding ?? 'NONE' as const;
      let liableParty = dto.liableParty;
      let careAdvice = dto.careAdvice?.trim() || '';
      let colorScore = dto.colorScore == null ? null : Number(dto.colorScore);
      if (colorScore != null && (colorScore < 1 || colorScore > 5)) {
        throw new BadRequestException('色差一致性评分需在 1-5 之间');
      }

      if (ticket.type === 'COLOR_DIFFERENCE') {
        if (colorFinding === 'NONE') {
          throw new BadRequestException(
            '色差争议必须给出认定：页面描述不准确 或 自然光差异',
          );
        }
        if (colorFinding === 'INCONCLUSIVE') {
          throw new BadRequestException('证据不足，请在协同记录中补充灯光/原图/现场照片后再裁定');
        }
        if (colorFinding === 'LISTING_INACCURATE') {
          // 页面描述/照片不准确 → 平台承担退换或补偿
          if (!['PLATFORM_COMPENSATE', 'RETURN_REFUND', 'REDUCE_PRICE'].includes(dto.resolution)) {
            throw new BadRequestException(
              '页面描述不准确：处理方式应为平台补偿、退货退款或平台降价补差',
            );
          }
          liableParty = 'PLATFORM';
          if (colorScore == null) colorScore = 2;
        } else {
          // 自然光差异且页面已提示 → 维持交易 + 保养建议
          if (dto.resolution !== 'KEEP_LISTING') {
            throw new BadRequestException(
              '认定为自然光差异时应维持交易（保养建议），如确需退换请改选"页面描述不准确"',
            );
          }
          if (!careAdvice) careAdvice = DEFAULT_CARE_ADVICE;
          if (colorScore == null) colorScore = 4;
        }
      }

      ticket.resolution = dto.resolution;
      ticket.liableParty = liableParty;
      ticket.compensationAmount = String(Number(dto.compensationAmount || 0));
      ticket.status = 'RESOLVED';
      ticket.colorFinding = colorFinding as any;
      ticket.colorScore = colorScore;
      ticket.careAdvice = careAdvice;
      ticket.findingBasis = dto.findingBasis?.trim() || '';
      await m.save(ticket);

      const findingText =
        ticket.type === 'COLOR_DIFFERENCE'
          ? colorFinding === 'LISTING_INACCURATE'
            ? `【色差认定】页面描述/照片不准确（平台承担${dto.resolution === 'RETURN_REFUND' ? '退换' : '补偿/补差'}）` +
              `，颜色一致性评分 ${colorScore}/5。${ticket.findingBasis ? `依据：${ticket.findingBasis}。` : ''}` +
              `该认定将沉淀为商品色差评价并触发摄影规范整改。`
            : `【色差认定】属自然光源差异且页面已有色差提示，维持交易。颜色一致性评分 ${colorScore}/5。` +
              `保养建议：${careAdvice}`
          : '';
      const noteText = [dto.note ? `【处理结论】${dto.note}` : '', findingText]
        .filter(Boolean)
        .join('\n');
      if (noteText) {
        await m.save(
          m.create(TicketMessage, {
            ticketId: ticket.id,
            authorId: ticket.createdBy,
            authorRole: 'CS',
            authorName: '客服裁定',
            content:
              noteText +
              `（责任方：${liableParty}，赔付：¥${ticket.compensationAmount}）`,
          }),
        );
      }

      const item = ticket.itemId
        ? await m.findOne(Item, { where: { id: ticket.itemId } })
        : null;
      const order = ticket.orderId
        ? await m.findOne(Order, { where: { id: ticket.orderId } })
        : null;
      const consignment = await m.findOne(Consignment, {
        where: { id: ticket.consignmentId },
      });
      const delivery = order
        ? await m.findOne(Delivery, { where: { orderId: order.id } })
        : null;

      switch (dto.resolution) {
        case 'CANCEL_CONSIGNMENT':
          if (consignment) {
            consignment.status = 'CANCELLED';
            await m.save(consignment);
          }
          if (order && !['DELIVERED', 'SETTLED'].includes(order.status)) {
            order.status = 'CANCELLED';
            await m.save(order);
          }
          if (item) {
            item.status = 'OFF_SHELF';
            await m.save(item);
          }
          break;
        case 'RETURN_REFUND':
          if (order) {
            // 已送达后的退货需家具回库评估：订单进入退货中，卖家结算暂缓
            order.status =
              order.status === 'SETTLED'
                ? 'RETURNED'
                : 'RETURNING';
            await m.save(order);
          }
          if (item) {
            item.status = 'RETURNED';
            await m.save(item);
          }
          if (delivery && delivery.status !== 'DONE') {
            delivery.status = 'FAILED';
            delivery.failReason =
              ticket.type === 'ELEVATOR_BLOCK'
                ? 'ELEVATOR_TOO_SMALL'
                : delivery.failReason;
            await m.save(delivery);
          }
          break;
        case 'REDUCE_PRICE':
          if (item && dto.newPrice && Number(dto.newPrice) > 0) {
            item.listedPrice = Number(dto.newPrice).toFixed(2);
            if (
              Number(item.minDealPrice) > Number(dto.newPrice)
            ) {
              item.minDealPrice = Number(dto.newPrice).toFixed(2);
            }
            await m.save(item);
          }
          if (order && dto.newPrice && Number(dto.newPrice) > 0) {
            order.dealPrice = Number(dto.newPrice).toFixed(2);
            await m.save(order);
          }
          break;
        case 'RE_LIST':
          if (item && ['RETURNED', 'RESERVED'].includes(item.status)) {
            item.status = 'LISTED';
            item.listedAt = new Date();
            await m.save(item);
          }
          if (order && order.status === 'RETURNING') {
            order.status = 'CANCELLED';
            await m.save(order);
          }
          ticket.status = 'CLOSED';
          await m.save(ticket);
          break;
        case 'KEEP_LISTING':
          if (item && item.status === 'RESERVED' && !order) {
            item.status = 'LISTED';
            await m.save(item);
          }
          break;
      }

      // ---------- 色差认定沉淀：商品评价 + 摄影规范 ----------
      if (ticket.type === 'COLOR_DIFFERENCE' && item) {
        const audit = await m.findOne(PhotoAudit, { where: { itemId: item.id } });
        const review = m.create(ItemReview, {
          itemId: item.id,
          orderId: ticket.orderId,
          authorId: ticket.createdBy,
          authorRole: 'CS',
          authorName: '客服色差认定',
          colorScore: colorScore!,
          content:
            colorFinding === 'LISTING_INACCURATE'
              ? `官方认定页面颜色呈现不准确：${ticket.findingBasis || '详见工单证据核对'}`
              : `官方认定属自然光差异、页面已提示：${careAdvice}`,
          photos: ticket.buyerPhotos,
          source: 'CS',
          ticketId: ticket.id,
        });
        await m.save(review);

        if (colorFinding === 'LISTING_INACCURATE') {
          // 描述不准确 → 摄影规范整改，影响后续同品类/材质拍摄
          const material = consignment?.material || '';
          const catLabel = CATEGORY_LABELS[consignment?.category || ''] || '';
          const standard = m.create(PhotoStandard, {
            category: consignment?.category || '',
            material,
            title: `【${catLabel}${material ? '·' + material : ''}】色差整改摄影规范`,
            content:
              `来源工单「${ticket.title}」认定页面颜色呈现不准确（灯光：${audit?.lightingSetup || '未登记'}；` +
              `修图：${audit?.retouchNote || '未登记'}；色卡基准：${audit?.colorReference || '未登记'}）。\n` +
              `后续拍摄要求：1) 使用 5000-5500K 标准日光光源并附灰卡/色卡校准白平衡；` +
              `2) 同一商品至少留存窗边自然光与室内暖光各 1 张原图；` +
              `3) 修图仅允许曝光与裁切，饱和度/色温调整幅度不超过 ±5%，修图前后记录留档；` +
              `4) 页面必须标注"不同光源下实物颜色可能存在差异"并写明材质色号；` +
              `5) 上架前由仓库与摄影双人核对原图与页面图一致性。`,
            status: 'ACTIVE',
            sourceTicketId: ticket.id,
            createdBy: ticket.createdBy,
          });
          await m.save(standard);
        }
        await recalcItemColorScore(m, item.id);
      }

      if (consignment) {
        await this.risk.recalculate(consignment.sellerId);
      }
      return this.buildDetail(m, ticket.id, null);
    });
  }

  /** 仓库回库评估：残值、回库仓储费、能否二次上架；确认后退货完结，工单关闭 */
  @Roles('WAREHOUSE', 'OPS', 'CS', 'ADMIN')
  @Post(':id/return-assessment')
  async assessReturn(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReturnAssessmentDto,
  ) {
    if (!['RE_LISTABLE', 'DISPOSED'].includes(dto.decision)) {
      throw new BadRequestException('请给出评估结论：可二次上架 或 报废/捐赠');
    }
    if (dto.decision === 'RE_LISTABLE' && Number(dto.residualValue || 0) <= 0) {
      throw new BadRequestException('可二次上架需填写残值评估价');
    }
    return this.ds.transaction(async (m) => {
      const ticket = await m.findOne(Ticket, { where: { id } });
      if (!ticket) throw new NotFoundException('工单不存在');
      if (ticket.resolution !== 'RETURN_REFUND') {
        throw new BadRequestException('仅退货退款工单需做回库评估');
      }
      if (ticket.status === 'CLOSED') {
        throw new BadRequestException('工单已关闭');
      }
      const item = ticket.itemId
        ? await m.findOne(Item, { where: { id: ticket.itemId } })
        : null;
      const order = ticket.orderId
        ? await m.findOne(Order, { where: { id: ticket.orderId } })
        : null;
      if (!item || !order) throw new NotFoundException('关联商品/订单缺失');

      let assessment = await m.findOne(ReturnAssessment, { where: { ticketId: ticket.id } });
      if (!assessment) {
        assessment = m.create(ReturnAssessment, { ticketId: ticket.id });
      }
      assessment.itemId = item.id;
      assessment.orderId = order.id;
      assessment.assessedBy = user.sub;
      assessment.assessorName = user.name;
      assessment.conditionNote = dto.conditionNote || '';
      assessment.checkPhotos = dto.checkPhotos || [];
      assessment.residualValue = Number(dto.residualValue || 0).toFixed(2);
      assessment.restockStorageFee = Number(dto.restockStorageFee || 0).toFixed(2);
      assessment.restockHandlingFee = Number(dto.restockHandlingFee || 0).toFixed(2);
      assessment.decision = dto.decision;
      assessment.warehouseSlot = dto.warehouseSlot || item.warehouseSlot || '';
      assessment.returnedAt = new Date();
      await m.save(assessment);

      // 回库完成：退货订单完结（卖家结算可按评估结果重新计算）
      order.status = 'RETURNED';
      await m.save(order);

      if (dto.decision === 'RE_LISTABLE') {
        item.status = 'RETURNED'; // 等待仓库复检后重新上架
        item.warehouseSlot = assessment.warehouseSlot;
        item.lastRestockAt = new Date();
        // 注：原 enteredWarehouseAt 保留至退货结算（退货前在仓天数由平台吸收）；
        // 仓库复检重新上架时才重置入仓时间，二次销售仓储周期重新起算
        item.resaleOfOrderId = order.id;
        if (Number(assessment.residualValue) > 0) {
          item.listedPrice = assessment.residualValue;
        }
        await m.save(item);
      } else {
        item.status = 'OFF_SHELF';
        await m.save(item);
      }

      ticket.status = 'CLOSED';
      await m.save(ticket);

      await m.save(
        m.create(TicketMessage, {
          ticketId: ticket.id,
          authorId: user.sub,
          authorRole: user.role,
          authorName: user.name,
          content:
            `【回库评估】${dto.decision === 'RE_LISTABLE' ? '可二次上架' : '建议报废/捐赠'}；` +
            `残值 ¥${assessment.residualValue}，回库仓储费 ¥${assessment.restockStorageFee}，` +
            `复检处理费 ¥${assessment.restockHandlingFee}。${dto.conditionNote || ''}`,
        }),
      );
      return this.buildDetail(m, ticket.id, null);
    });
  }

  private async assertVisible(user: JwtPayload, ticket: Ticket) {
    if (['CS', 'OPS', 'ADMIN', 'APPRAISER', 'WAREHOUSE', 'REFURBISHER', 'DELIVERY'].includes(user.role)) {
      return;
    }
    if (user.role === 'SELLER') {
      const c = await this.ds.getRepository(Consignment).findOne({
        where: { id: ticket.consignmentId },
      });
      if (c?.sellerId === user.sub) return;
    }
    if (user.role === 'BUYER' && ticket.orderId) {
      const o = await this.ds.getRepository(Order).findOne({
        where: { id: ticket.orderId },
      });
      if (o?.buyerId === user.sub) return;
    }
    throw new ForbiddenException('无权查看该工单');
  }

  private async buildDetail(
    manager: DataSource['manager'] | DataSource,
    ticketId: string,
    user: JwtPayload | null,
    checkAccess = false,
  ) {
    const m: any = manager;
    const ticket = await m.findOne(Ticket, { where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('工单不存在');
    if (checkAccess && user) await this.assertVisible(user, ticket);
    const messages = await m.find(TicketMessage, {
      where: { ticketId },
      order: { createdAt: 'ASC' },
    });
    const consignment = await m.findOne(Consignment, {
      where: { id: ticket.consignmentId },
    });
    const item = ticket.itemId
      ? await m.findOne(Item, { where: { id: ticket.itemId } })
      : null;
    const order = ticket.orderId
      ? await m.findOne(Order, { where: { id: ticket.orderId } })
      : null;
    const delivery = order
      ? await m.findOne(Delivery, { where: { orderId: order.id } })
      : null;
    const photoAudit = item
      ? await m.findOne(PhotoAudit, { where: { itemId: item.id } })
      : null;
    const returnAssessment = await m.findOne(ReturnAssessment, {
      where: { ticketId },
    });
    const reviews = item
      ? await m.find(ItemReview, {
          where: { itemId: item.id },
          order: { createdAt: 'DESC' },
        })
      : [];
    return {
      ticket,
      messages,
      consignment,
      item,
      order,
      delivery,
      photoAudit,
      returnAssessment,
      reviews,
    };
  }
}

/** 摄影规范：色差认定沉淀的拍摄规范，仓库/摄影/运营查阅与维护 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('photo-standards')
export class PhotoStandardController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @Roles('OPS', 'ADMIN', 'CS', 'WAREHOUSE', 'REFURBISHER', 'APPRAISER', 'DELIVERY')
  @Get()
  async list() {
    return this.ds.getRepository(PhotoStandard).find({
      order: { createdAt: 'DESC' },
    });
  }

  @Roles('CS', 'OPS', 'ADMIN')
  @Post()
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: { category?: string; material?: string; title: string; content: string },
  ) {
    if (!dto.title || !dto.content) {
      throw new BadRequestException('请填写规范标题与正文');
    }
    const standard = this.ds.getRepository(PhotoStandard).create({
      category: dto.category || '',
      material: dto.material || '',
      title: dto.title,
      content: dto.content,
      status: 'ACTIVE',
      createdBy: user.sub,
    });
    return this.ds.getRepository(PhotoStandard).save(standard);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Ticket,
      TicketMessage,
      Consignment,
      Item,
      Order,
      Delivery,
      PhotoAudit,
      PhotoStandard,
      ItemReview,
      ReturnAssessment,
    ]),
  ],
  controllers: [TicketController, PhotoStandardController],
})
export class TicketModule {}
