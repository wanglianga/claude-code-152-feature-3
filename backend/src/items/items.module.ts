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
  /** 拍摄档案（色差取证） */
  shootLighting?: string;
  rawPhotos?: string[];
  retouchNote?: string;
  colorNotice?: boolean;
  listedColor?: string;
}

/** 退货回库复检结论：残值、额外仓储费、能否二次上架 */
class ReturnInspectionDto {
  residualValue: number;
  returnStorageFee?: number;
  relistEligible: boolean;
  note?: string;
}

/** 摄影规范整改完成：重新拍照、修正描述、补足色差提示 */
class PhotoRemedyDto {
  photos?: string[];
  rawPhotos?: string[];
  shootLighting?: string;
  retouchNote?: string;
  colorNotice?: boolean;
  listedColor?: string;
  description?: string;
  note?: string;
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  PREPARING: ['PHOTOGRAPHY', 'OFF_SHELF'],
  PHOTOGRAPHY: ['LISTED', 'PREPARING'],
  LISTED: ['RESERVED', 'OFF_SHELF'],
  RESERVED: ['LISTED', 'SOLD'],
  SOLD: ['DELIVERED', 'RETURNING'],
  DELIVERED: ['RETURNING', 'RETURNED', 'SETTLED'],
  RETURNING: ['RETURNED', 'OFF_SHELF'],
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
    return { item, consignment, appraisal, workLogs };
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
      'RESHOOT',
      'RETURN_INSPECTION',
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
      // 拍摄档案随上架写入（色差争议时由客服调取核对）
      if (dto.shootLighting != null) item.shootLighting = dto.shootLighting;
      if (dto.rawPhotos) item.rawPhotos = dto.rawPhotos;
      if (dto.retouchNote != null) item.retouchNote = dto.retouchNote;
      if (dto.colorNotice != null) item.colorNotice = !!dto.colorNotice;
      if (dto.listedColor != null) item.listedColor = dto.listedColor;
      if (dto.to === 'LISTED') {
        if (!item.description && item.photos.length === 0) {
          throw new BadRequestException('上架前需填写描述或上传拍照');
        }
        if (dto.colorNotice === false && !item.colorNotice) {
          throw new BadRequestException(
            '摄影规范要求上架时勾选「已做色差提示」，并填写拍摄灯光与修图记录',
          );
        }
        item.listedAt = new Date();
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

  /**
   * 退货家具回库复检：评估残值、登记返程/复检仓储费、判定能否二次上架。
   * 复检完成后商品置 RETURNED，关联订单解除部分暂缓（仍需客服确认重新处理结果后结算）。
   */
  @Roles('WAREHOUSE', 'OPS', 'ADMIN')
  @Post(':id/return-inspection')
  async returnInspection(@Param('id') id: string, @Body() dto: ReturnInspectionDto) {
    if (dto.residualValue == null || Number(dto.residualValue) < 0) {
      throw new BadRequestException('请填写评估残值（不低于 0）');
    }
    return this.ds.transaction(async (m) => {
      const item = await m.findOne(Item, { where: { id } });
      if (!item) throw new NotFoundException('商品不存在');
      if (!['RETURNING', 'RETURNED'].includes(item.status)) {
        throw new BadRequestException(
          `商品当前 ${item.status}，仅退货取回中的商品可登记回库复检`,
        );
      }
      const residual = Number(dto.residualValue);
      const extraStorage = Number(dto.returnStorageFee || 0);
      item.status = 'RETURNED';
      item.residualValue = residual.toFixed(2);
      item.returnStorageFee = extraStorage.toFixed(2);
      item.relistEligible = !!dto.relistEligible;
      item.returnInspectionNote = dto.note || '';
      item.returnedAt = new Date();
      await m.save(item);

      await m.save(
        m.create(ItemWorkLog, {
          itemId: id,
          assigneeId: null,
          type: 'RETURN_INSPECTION',
          note: `残值 ¥${residual.toFixed(2)}；额外仓储费 ¥${extraStorage.toFixed(2)}；${
            dto.relistEligible ? '可二次上架' : '不可二次上架'
          }${dto.note ? `；${dto.note}` : ''}`,
          cost: extraStorage.toFixed(2),
        }),
      );

      // 回库后解除订单结算暂缓：最终结算仍以 RETURNED + 复检结论为准
      const orders = await m.find(Order, { where: { itemId: id } });
      for (const o of orders) {
        if (o.status === 'RETURNING') {
          o.status = 'RETURNED';
          o.settlementHold = false;
          o.settlementHoldReason = '';
          await m.save(o);
        }
      }
      return item;
    });
  }

  /**
   * 摄影规范整改：色差成立后重新拍摄标准光线照片、附原图与修图记录、
   * 修正颜色描述、补足色差提示；整改完成后方可二次上架。
   */
  @Roles('WAREHOUSE', 'OPS', 'ADMIN')
  @Post(':id/photo-remedy')
  async photoRemedy(@Param('id') id: string, @Body() dto: PhotoRemedyDto) {
    return this.ds.transaction(async (m) => {
      const item = await m.findOne(Item, { where: { id } });
      if (!item) throw new NotFoundException('商品不存在');
      if (item.photoStandardFlag !== 'NEEDS_REMEDY') {
        throw new BadRequestException('该商品没有待完成的摄影规范整改项');
      }
      if (!dto.photos?.length && !item.photos.length) {
        throw new BadRequestException('整改需重新拍摄并上传照片');
      }
      if (!dto.shootLighting?.trim() && !item.shootLighting) {
        throw new BadRequestException('请填写重新拍摄的灯光条件（自然光/色温）');
      }
      if (dto.colorNotice === false) {
        throw new BadRequestException('整改后页面必须包含色差提示');
      }
      if (dto.photos) item.photos = dto.photos;
      if (dto.rawPhotos) item.rawPhotos = dto.rawPhotos;
      if (dto.shootLighting != null) item.shootLighting = dto.shootLighting;
      if (dto.retouchNote != null) item.retouchNote = dto.retouchNote;
      if (dto.listedColor != null) item.listedColor = dto.listedColor;
      if (dto.description != null) item.description = dto.description;
      item.colorNotice = true;
      item.photoStandardFlag = 'OK';
      item.photoRemedyNote = '';
      item.reviewNote = item.reviewNote
        ? `${item.reviewNote}（已按摄影规范整改重拍）`
        : '已按摄影规范整改重拍';
      await m.save(item);

      await m.save(
        m.create(ItemWorkLog, {
          itemId: id,
          assigneeId: null,
          type: 'RESHOOT',
          note: `色差售后摄影规范整改重拍：${dto.shootLighting || item.shootLighting}；${
            dto.note || '已附原图/修图记录/色差提示'
          }`,
          cost: '0.00',
        }),
      );
      return item;
    });
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Item, ItemWorkLog, Consignment, Appraisal, Order])],
  controllers: [ItemController],
})
export class ItemModule {}
