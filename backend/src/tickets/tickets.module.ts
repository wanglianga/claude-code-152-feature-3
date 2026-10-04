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

class CreateTicketDto {
  consignmentId?: string;
  itemId?: string;
  orderId?: string;
  type: TicketType;
  title: string;
  description: string;
  /** 色差工单：买家现场照片 */
  buyerPhotos?: string[];
  /** 色差工单：买家现场光线 */
  buyerLighting?: string;
  /** 色差工单：现场补充（朝向、摆放、对比物） */
  buyerSceneNote?: string;
}

class ColorEvidenceDto {
  buyerPhotos?: string[];
  buyerLighting?: string;
  buyerSceneNote?: string;
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
  liableParty: 'SELLER' | 'BUYER' | 'PLATFORM' | 'DELIVERY' | 'REFURBISHER' | 'SHARED' | 'NONE';
  compensationAmount?: number;
  note?: string;
  newPrice?: number;
  /** 色差裁定原因：LISTING_INACCURATE / NATURAL_VARIATION / MIXED */
  colorFinding?: string;
  /** 维持交易时提供的保养建议 */
  careAdvice?: string;
  /** 页面描述不准确→摄影规范整改要求（同步到商品，重新拍照上架前必须执行） */
  photoRemedyNote?: string;
}

/**
 * 协同工单：卖家、买家、仓库、翻新师、配送、客服围绕同一件家具处理异常。
 * 客服可给出处理结论并触发订单/商品/寄卖状态联动，结论与赔付金额进入结算来源。
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
        buyerPhotos: dto.type === 'COLOR_DIFFERENCE' ? dto.buyerPhotos || [] : [],
        buyerLighting: dto.type === 'COLOR_DIFFERENCE' ? dto.buyerLighting || '' : '',
        buyerSceneNote: dto.type === 'COLOR_DIFFERENCE' ? dto.buyerSceneNote || '' : '',
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

  /** 买家/仓库补充色差取证：现场照片、现场光线、摆放说明 */
  @Post(':id/color-evidence')
  async colorEvidence(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ColorEvidenceDto,
  ) {
    const ticket = await this.ds.getRepository(Ticket).findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('工单不存在');
    if (ticket.type !== 'COLOR_DIFFERENCE') {
      throw new BadRequestException('仅色差争议工单可补充色差取证');
    }
    await this.assertVisible(user, ticket);
    if (ticket.status === 'CLOSED') {
      throw new BadRequestException('工单已关闭，不可补充取证');
    }
    return this.ds.transaction(async (m) => {
      if (dto.buyerPhotos) ticket.buyerPhotos = dto.buyerPhotos;
      if (dto.buyerLighting != null) ticket.buyerLighting = dto.buyerLighting;
      if (dto.buyerSceneNote != null) ticket.buyerSceneNote = dto.buyerSceneNote;
      await m.save(ticket);

      const lightingLabel: Record<string, string> = {
        NATURAL_DAYLIGHT: '自然光/日光',
        INDOOR_WARM: '室内暖光',
        INDOOR_COOL: '室内冷白光',
        OTHER: '其他光线',
      };
      const parts: string[] = [];
      if (dto.buyerPhotos?.length) parts.push(`现场照片 ${dto.buyerPhotos.length} 张`);
      if (dto.buyerLighting) parts.push(`现场光线：${lightingLabel[dto.buyerLighting] || dto.buyerLighting}`);
      if (dto.buyerSceneNote) parts.push(dto.buyerSceneNote);
      if (parts.length) {
        await m.save(
          m.create(TicketMessage, {
            ticketId: id,
            authorId: user.sub,
            authorRole: user.role,
            authorName: `${user.name}·色差取证`,
            content: `【买家现场取证】${parts.join('；')}`,
          }),
        );
      }
      return this.buildDetail(m, ticket.id, null);
    });
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
    const validFindings = ['LISTING_INACCURATE', 'NATURAL_VARIATION', 'MIXED'];
    return this.ds.transaction(async (m) => {
      const ticket = await m.findOne(Ticket, { where: { id } });
      if (!ticket) throw new NotFoundException('工单不存在');
      if (ticket.status === 'CLOSED') {
        throw new BadRequestException('工单已关闭');
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

      const isColor = ticket.type === 'COLOR_DIFFERENCE';
      // 首次裁定才落评价/摄影整改；之后的重新处理结论（如复检后确认二次上架）不重复打标
      const firstAdjudication = ticket.resolution === 'PENDING';
      const finding = isColor
        ? dto.colorFinding || (!firstAdjudication ? ticket.colorFinding : '') || ''
        : '';
      if (isColor && firstAdjudication && !validFindings.includes(finding)) {
        throw new BadRequestException(
          '色差争议需选择裁定原因：页面描述不准确 / 自然光差异 / 部分属实',
        );
      }

      if (isColor) {
        if (finding === 'NATURAL_VARIATION') {
          // 页面已做色差提示，才能按自然光差异维持交易
          if (!item?.colorNotice) {
            throw new BadRequestException(
              '页面未做色差提示，不能按「自然光差异」维持交易；请改判页面描述不准确或部分属实',
            );
          }
          if (!['KEEP_LISTING'].includes(dto.resolution)) {
            throw new BadRequestException(
              '自然光差异且页面已提示：应维持交易（可附保养建议），退换/赔付不成立',
            );
          }
          if (!dto.careAdvice?.trim()) {
            throw new BadRequestException('维持交易需向买家提供保养/摆放建议');
          }
        }
        if (finding === 'LISTING_INACCURATE') {
          if (dto.resolution === 'KEEP_LISTING') {
            throw new BadRequestException(
              '页面描述不准确成立时平台需承担退换或补偿，不能维持原交易',
            );
          }
          if (!['PLATFORM', 'SHARED'].includes(dto.liableParty)) {
            throw new BadRequestException(
              '页面描述不准确属于平台上架责任，责任方应为平台或多方共担',
            );
          }
        }
      }

      ticket.resolution = dto.resolution;
      ticket.liableParty = dto.liableParty;
      // 重复裁定（如退货后确认二次上架）未传金额时保留原赔付，避免清零
      ticket.compensationAmount =
        dto.compensationAmount != null
          ? String(Number(dto.compensationAmount || 0))
          : ticket.compensationAmount;
      ticket.status = 'RESOLVED';
      if (firstAdjudication || !ticket.colorFinding) {
        ticket.colorFinding = finding;
      }
      ticket.careAdvice = dto.careAdvice || ticket.careAdvice || '';
      await m.save(ticket);

      if (dto.note || (finding && firstAdjudication)) {
        const findingLabel: Record<string, string> = {
          LISTING_INACCURATE: '页面描述不准确',
          NATURAL_VARIATION: '自然光差异（页面已提示）',
          MIXED: '部分属实',
        };
        const segs: string[] = [];
        if (finding) segs.push(`色差裁定原因：${findingLabel[finding]}`);
        if (dto.note) segs.push(dto.note);
        if (dto.careAdvice) segs.push(`保养建议：${dto.careAdvice}`);
        await m.save(
          m.create(TicketMessage, {
            ticketId: ticket.id,
            authorId: ticket.createdBy,
            authorRole: 'CS',
            authorName: '客服裁定',
            content: `【处理结论】${segs.join('；')}（责任方：${dto.liableParty}，赔付：¥${ticket.compensationAmount}）`,
          }),
        );
      }

      // ---- 色差裁定对商品评价与摄影规范的联动（仅首次裁定；复检后二次上架确认不重置整改结论）----
      if (isColor && item && firstAdjudication) {
        if (finding === 'LISTING_INACCURATE') {
          item.reviewStatus = 'BAD';
          item.reviewNote = `色差成立：${dto.note || '页面颜色描述/照片与实物不符'}`;
          item.photoStandardFlag = 'NEEDS_REMEDY';
          item.photoRemedyNote =
            dto.photoRemedyNote?.trim() ||
            '重新拍摄标准光线下照片并附原图，修正页面颜色描述，显著标注不同光线色差提示';
        } else if (finding === 'NATURAL_VARIATION') {
          item.reviewStatus = 'GOOD';
          item.reviewNote = '买家认可：自然光差异，页面已有色差提示';
        } else if (finding === 'MIXED') {
          item.reviewStatus = 'NEUTRAL';
          item.reviewNote = `色差部分属实：${dto.note || '描述不够充分，买家光线也有影响'}`;
          if (dto.photoRemedyNote?.trim() || !item.colorNotice) {
            item.photoStandardFlag = 'NEEDS_REMEDY';
            item.photoRemedyNote =
              dto.photoRemedyNote?.trim() ||
              '补充自然光/暖光对比图与色差提示，完善颜色描述';
          }
        }
      }

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
            // 已送达：进入退货取回流程，卖家结算暂缓，待家具回库复检结论确认
            order.status =
              order.status === 'DELIVERED' || order.status === 'SETTLED'
                ? 'RETURNING'
                : 'RETURNING';
            order.settlementHold = true;
            order.settlementHoldReason = isColor
              ? '色差售后退货成立：等待家具回库残值评估、仓储费核算与二次上架结论，卖家结算暂缓'
              : '售后退货成立：等待家具回库复检与重新处理结果确认，卖家结算暂缓';
            await m.save(order);
          }
          if (item) {
            item.status = 'RETURNING';
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
          if (!item || !['RETURNED'].includes(item.status)) {
            throw new BadRequestException(
              '家具尚未完成回库复检，不能二次上架（请先由仓库登记残值评估与复检结论）',
            );
          }
          if (!item.relistEligible) {
            throw new BadRequestException(
              '复检结论为不可二次上架，应改为终止寄卖/下架处理',
            );
          }
          if (item.photoStandardFlag === 'NEEDS_REMEDY') {
            throw new BadRequestException(
              '该商品摄影规范整改未完成（重新拍照/修正描述/色差提示），暂不能二次上架',
            );
          }
          item.status = 'LISTED';
          item.listedAt = new Date();
          break;
        case 'KEEP_LISTING':
          if (item && item.status === 'RESERVED' && !order) {
            item.status = 'LISTED';
          }
          // 色差维持交易：订单继续履约，不暂缓结算
          break;
      }

      if (item) await m.save(item);
      if (consignment) {
        await this.risk.recalculate(consignment.sellerId);
      }
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
    return { ticket, messages, consignment, item, order, delivery };
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
    ]),
  ],
  controllers: [TicketController],
})
export class TicketModule {}
