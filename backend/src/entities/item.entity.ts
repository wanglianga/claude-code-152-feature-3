import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/** 商品所在：仓库 / 仍在卖家家中（同城自提或卖家仓直发） */
export type StockLocation = 'WAREHOUSE' | 'SELLER_HOME';

/**
 * 商品状态：
 * PREPARING 清洁翻新中 / PHOTOGRAPHY 拍照中 / LISTED 在售 /
 * RESERVED 已被下单锁定 / SOLD 已成交 / DELIVERED 已交付 /
 * RETURNED 退货 / OFF_SHELF 下架
 */
export type ItemStatus =
  | 'PREPARING'
  | 'PHOTOGRAPHY'
  | 'LISTED'
  | 'RESERVED'
  | 'SOLD'
  | 'DELIVERED'
  | 'RETURNED'
  | 'OFF_SHELF';

@Entity('items')
export class Item {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  consignmentId: string;

  @Index()
  @Column({ type: 'varchar', length: 24 })
  category: string;

  @Column()
  title: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Index()
  @Column({ type: 'varchar', length: 16, default: 'PREPARING' })
  status: ItemStatus;

  @Column({ type: 'varchar', length: 16, default: 'WAREHOUSE' })
  location: StockLocation;

  /** 仓库库位，如 A-03-12 */
  @Column({ default: '' })
  warehouseSlot: string;

  /** 可配送范围（公里），0 表示仅同城自提 */
  @Column({ type: 'int', default: 0 })
  deliveryRadiusKm: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  listedPrice: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: '0' })
  minDealPrice: string;

  /** 实际清洁费 */
  @Column({ type: 'numeric', precision: 10, scale: 2, default: '0' })
  cleaningCost: string;

  /** 实际翻新费（补漆/维修等） */
  @Column({ type: 'numeric', precision: 10, scale: 2, default: '0' })
  refurbishCost: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  photos: string[];

  @Column({ type: 'timestamptz', nullable: true })
  enteredWarehouseAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  listedAt: Date | null;

  /** 色差评价均分（1-5，买家评价与客服认定共同沉淀，5 为颜色一致），无评价则空 */
  @Column({ type: 'numeric', precision: 3, scale: 2, nullable: true })
  colorAvgScore: string | null;

  @Column({ type: 'int', default: 0 })
  colorReviewCount: number;

  /** 退货回库二次上架时，记录原始订单 id（结算/追溯用） */
  @Column({ type: 'uuid', nullable: true })
  resaleOfOrderId: string | null;

  /** 退货回库后二次上架的重新入仓时间（二次销售仓储费从此起算） */
  @Column({ type: 'timestamptz', nullable: true })
  lastRestockAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}

/** 翻新/上架作业记录：清洁、补漆、拍照、上架描述等 */
export type WorkLogType =
  | 'CLEANING'
  | 'REPAINT'
  | 'REPAIR'
  | 'PHOTOGRAPHY'
  | 'LISTING_COPY'
  | 'STORAGE';

@Entity('item_work_logs')
export class ItemWorkLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  itemId: string;

  @Column({ type: 'uuid', nullable: true })
  assigneeId: string | null;

  @Column({ type: 'varchar', length: 16 })
  type: WorkLogType;

  @Column({ default: '' })
  note: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: '0' })
  cost: string;

  @CreateDateColumn()
  createdAt: Date;
}
