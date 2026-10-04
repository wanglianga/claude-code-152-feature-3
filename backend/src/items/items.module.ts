import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Item,
  ItemWorkLog,
  WorkLogType,
} from '../entities/item.entity';
import { Consignment } from '../entities/consignment.entity';
import { Appraisal } from '../entities/appraisal.entity';
import { Order } from '../entities/order.entity';
import {
  PhotoAudit,
  ItemReview,
} from '../entities/photo-audit.entity';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';

class AddWorkLogDto {
  type: WorkLogType;
  note?: string;
  cost?: number;
}

class AdvanceDto {
  to: 'PHOTOGRAPHY' | 'LISTED' | 'PREPARING';
  description?: string;
  photos?: string[];
  warehouseSlot?: string;
  deliveryRadiusKm?: number;
  listedPrice?: number;
}

class PhotoAuditDto {
  lightingSetup?: string;
  cameraSetup?: string;
  rawPhotos?: string[];
  editedPhotos?: string[];
  retouchNote?: string;
  colorNoticeOnPage?: boolean;
  colorNoticeText?: string;
  colorReference?: string;
}

class ReviewDto {
  colorScore: number;
  content?: string;
  photos?: string[];
}

/** 重算商品色差评价均分 */
async function recalcColorScore(m: DataSource['manager'], itemId: string) {
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

const VALID_TRANSITIONS: Record<string, string[]> = {
  PREPARING: ['PHOTOGRAPHY', 'OFF_SHELF'],
  PHOTOGRAPHY: ['LISTED', 'PREPARING'],
  LISTED: ['RESERVED', 'OFF_SHELF'],
  RESERVED: ['LISTED', 'SOLD'],
  SOLD: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED', 'SETTLED'],
  RETURNED: ['LISTED', 'OFF_SHELF'],
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('items')
export class ItemController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** 买家市场只看在售；仓库/翻新/运营可按状态看全部 */
  @Get()
  async list(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('location') location?: string,
  ) {
    const repo = this.ds.getRepository(Item);
    const qb = repo.createQueryBuilder('i');
    if (user.role === 'BUYER') {
      qb.where('i.status = :s', { s: 'LISTED' });
    } else if (status) {
      qb.where('i.status = :s', { s: status });
    } else {
      qb.where('i.status != :s', { s: 'OFF_SHELF' });
    }
    if (category) qb.andWhere('i.category = :c', { c: category });
    if (location) qb.andWhere('i.location = :l', { l: location });
    qb.orderBy('i."createdAt"', 'DESC');
    const items = await qb.getMany();
    const consignmentIds = Array.from(new Set(items.map((i) => i.consignmentId)));
    const consignments = consignmentIds.length
      ? await this.ds.getRepository(Consignment).find({
          where: { id: In(consignmentIds) },
        })
      : [];
    const cMap = new Map(consignments.map((c) => [c.id, c]));
    return items.map((i) => {
      const c = cMap.get(i.consignmentId);
      return {
        ...i,
        sellerId: c?.sellerId,
        brand: c?.brand,
        elevator: c?.elevator,
        floor: c?.floor,
        disassemblable: c?.disassemblable,
      };
    });
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const item = await this.ds.getRepository(Item).findOne({ where: { id } });
    if (!item) throw new NotFoundException('商品不存在');
    const consignment = await this.ds
      .getRepository(Consignment)
      .findOne({ where: { id: item.consignmentId } });
    const appraisal = await this.ds
      .getRepository(Appraisal)
      .findOne({ where: { consignmentId: item.consignmentId } });
    const workLogs = await this.ds.getRepository(ItemWorkLog).find({
      where: { itemId: id },
      order: { createdAt: 'DESC' },
    });
    const photoAudit = await this.ds
      .getRepository(PhotoAudit)
      .findOne({ where: { itemId: id } });
    const reviews = await this.ds.getRepository(ItemReview).find({
      where: { itemId: id },
      order: { createdAt: 'DESC' },
    });
    return { item, consignment, appraisal, workLogs, photoAudit, reviews };
  }

  /** 仓库/摄影登记上架照片的灯光、原图、修图记录与页面色差提示（色差争议证据链） */
  @Roles('WAREHOUSE', 'REFURBISHER', 'OPS', 'CS', 'ADMIN')
  @Post(':id/photo-audit')
  async upsertPhotoAudit(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: PhotoAuditDto,
  ) {
    return this.ds.transaction(async (m) => {
      const item = await m.findOne(Item, { where: { id } });
      if (!item) throw new NotFoundException('商品不存在');
      let audit = await m.findOne(PhotoAudit, { where: { itemId: id } });
      if (!audit) {
        audit = m.create(PhotoAudit, { itemId: id, recordedBy: user.sub });
      }
      if (dto.lightingSetup != null) audit.lightingSetup = dto.lightingSetup;
      if (dto.cameraSetup != null) audit.cameraSetup = dto.cameraSetup;
      if (dto.rawPhotos) audit.rawPhotos = dto.rawPhotos;
      if (dto.editedPhotos) audit.editedPhotos = dto.editedPhotos;
      if (dto.retouchNote != null) audit.retouchNote = dto.retouchNote;
      if (dto.colorNoticeOnPage != null) audit.colorNoticeOnPage = dto.colorNoticeOnPage;
      if (dto.colorNoticeText != null) audit.colorNoticeText = dto.colorNoticeText;
      if (dto.colorReference != null) audit.colorReference = dto.colorReference;
      await m.save(audit);
      return audit;
    });
  }

  /** 买家对已购商品进行色差评价（需有该商品的订单） */
  @Roles('BUYER')
  @Post(':id/reviews')
  async addReview(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
  ) {
    const score = Number(dto.colorScore);
    if (!score || score < 1 || score > 5) {
      throw new BadRequestException('颜色一致性评分需在 1-5 之间');
    }
    return this.ds.transaction(async (m) => {
      const item = await m.findOne(Item, { where: { id } });
      if (!item) throw new NotFoundException('商品不存在');
      const order = await m.findOne(Order, {
        where: { itemId: id, buyerId: user.sub },
      });
      if (!order) {
        throw new BadRequestException('仅购买过该商品的买家可评价颜色一致性');
      }
      const review = m.create(ItemReview, {
        itemId: id,
        orderId: order.id,
        authorId: user.sub,
        authorRole: 'BUYER',
        authorName: user.name,
        colorScore: score,
        content: dto.content || '',
        photos: dto.photos || [],
        source: 'BUYER',
      });
      await m.save(review);
      await recalcColorScore(m, id);
      return review;
    });
  }

  /** 清洁、补漆、维修、拍照、上架描述、入库登记——作业即记账 */
  @Roles('WAREHOUSE', 'REFURBISHER', 'OPS')
  @Post(':id/work-logs')
  async addWorkLog(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AddWorkLogDto,
  ) {
    const validTypes: WorkLogType[] = [
      'CLEANING',
      'REPAINT',
      'REPAIR',
      'PHOTOGRAPHY',
      'LISTING_COPY',
      'STORAGE',
    ];
    if (!validTypes.includes(dto.type)) {
      throw new BadRequestException('未知作业类型');
    }
    return this.ds.transaction(async (m) => {
      const item = await m.findOne(Item, { where: { id } });
      if (!item) throw new NotFoundException('商品不存在');
      if (item.status === 'SOLD' || item.status === 'DELIVERED') {
        throw new BadRequestException('已成交商品不可再登记作业');
      }
      const cost = Number(dto.cost || 0);
      const log = m.create(ItemWorkLog, {
        itemId: id,
        assigneeId: user.sub,
        type: dto.type,
        note: dto.note || '',
        cost: cost.toFixed(2),
      });
      await m.save(log);

      if (dto.type === 'CLEANING') {
        item.cleaningCost = (Number(item.cleaningCost) + cost).toFixed(2);
      } else if (dto.type === 'REPAINT' || dto.type === 'REPAIR') {
        item.refurbishCost = (Number(item.refurbishCost) + cost).toFixed(2);
      } else if (dto.type === 'STORAGE') {
        if (dto.note) item.warehouseSlot = dto.note;
        if (!item.enteredWarehouseAt) item.enteredWarehouseAt = new Date();
        item.location = 'WAREHOUSE';
      }
      await m.save(item);
      return { log, item };
    });
  }

  /** 状态推进：清洁完成→拍照→上架（写描述/照片/库位/配送范围） */
  @Roles('WAREHOUSE', 'REFURBISHER', 'OPS')
  @Post(':id/advance')
  async advance(@Param('id') id: string, @Body() dto: AdvanceDto) {
    return this.ds.transaction(async (mgr) => {
      const item = await mgr.findOne(Item, { where: { id } });
      if (!item) throw new NotFoundException('商品不存在');
      const allowed = VALID_TRANSITIONS[item.status] || [];
      if (!dto.to || !allowed.includes(dto.to)) {
        throw new BadRequestException(
          `商品当前 ${item.status}，不能转到 ${dto.to}；允许：${allowed.join(', ') || '无'}`,
        );
      }
      const fromStatus = item.status;
      item.status = dto.to as any;
      if (dto.description != null) item.description = dto.description;
      if (dto.photos) item.photos = dto.photos;
      if (dto.warehouseSlot) item.warehouseSlot = dto.warehouseSlot;
      if (dto.deliveryRadiusKm != null) {
        item.deliveryRadiusKm = Number(dto.deliveryRadiusKm);
      }
      if (dto.listedPrice != null && Number(dto.listedPrice) > 0) {
        item.listedPrice = Number(dto.listedPrice).toFixed(2);
      }
      if (dto.to === 'LISTED') {
        if (!item.description && item.photos.length === 0) {
          throw new BadRequestException('上架前需填写描述或上传拍照');
        }
        item.listedAt = new Date();
        // 退货回库二次上架：二次销售仓储费自回库日重新起算
        if (fromStatus === 'RETURNED' || item.lastRestockAt) {
          item.enteredWarehouseAt = item.lastRestockAt || new Date();
        }
        const consignment = await mgr.findOne(Consignment, {
          where: { id: item.consignmentId },
        });
        if (consignment && consignment.status !== 'LISTED') {
          consignment.status = 'LISTED';
          await mgr.save(consignment);
        }
      }
      await mgr.save(item);
      return item;
    });
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Item, ItemWorkLog, Consignment, Appraisal, Order, PhotoAudit, ItemReview])],
  controllers: [ItemController],
})
export class ItemModule {}
