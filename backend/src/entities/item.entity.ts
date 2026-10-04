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
 * RETURNING 售后退货取回中（等待回库复检）/
 * RETURNED 退货回库（待残值评估或重新上架）/ OFF_SHELF 下架
 */
export type ItemStatus =
  | 'PREPARING'
  | 'PHOTOGRAPHY'
  | 'LISTED'
  | 'RESERVED'
  | 'SOLD'
  | 'DELIVERED'
  | 'RETURNING'
  | 'RETURNED'
  | 'OFF_SHELF';

/** 商品评价（受色差等售后结论影响）：GOOD 好评 / NEUTRAL 中性 / BAD 差评 */
export type ItemReviewStatus = 'GOOD' | 'NEUTRAL' | 'BAD';

/** 摄影规范标志：OK 合规 / NEEDS_REMEDY 需整改（描述不准/修图过度/缺色差提示） */
export type PhotoStandardFlag = 'OK' | 'NEEDS_REMEDY';

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

  // ---- 拍摄档案（色差争议取证用）----
  /** 拍摄灯光条件，如「自然光 上午10点 北向窗」/「影室闪光灯 5500K」 */
  @Column({ default: '' })
  shootLighting: string;

  /** 拍摄原图（未修）URL 列表 */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  rawPhotos: string[];

  /** 修图记录：调色/白平衡/饱和度处理说明 */
  @Column({ default: '' })
  retouchNote: string;

  /** 页面是否已做色差提示（不同光线/屏幕可能存在色差） */
  @Column({ default: false })
  colorNotice: boolean;

  /** 页面标注颜色，如「橡木本色 / 偏暖白」 */
  @Column({ default: '' })
  listedColor: string;

  // ---- 售后评价与摄影规范联动 ----
  /** 商品评价：GOOD/NEUTRAL/BAD，色差成立的差评会影响品类口碑 */
  @Column({ type: 'varchar', length: 12, default: 'NEUTRAL' })
  reviewStatus: ItemReviewStatus;

  /** 售后对商品的评价备注（如「实物颜色偏深，与照片不符」） */
  @Column({ default: '' })
  reviewNote: string;

  /** 摄影规范标志：NEEDS_REMEDY 时需重新拍照/修正描述后才能再上架 */
  @Column({ type: 'varchar', length: 16, default: 'OK' })
  photoStandardFlag: PhotoStandardFlag;

  /** 摄影规范整改要求（运营/客服填写，仓库重新拍照时执行） */
  @Column({ default: '' })
  photoRemedyNote: string;

  // ---- 退货回库复检（残值/仓储费/二次上架）----
  /** 回库复检后评估残值（元） */
  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  residualValue: string | null;

  /** 退货返程与复检产生的额外仓储费（元） */
  @Column({ type: 'numeric', precision: 10, scale: 2, default: '0' })
  returnStorageFee: string;

  /** 是否可二次上架 */
  @Column({ default: true })
  relistEligible: boolean;

  /** 回库复检备注（成色、包装、磕碰、残值依据） */
  @Column({ default: '' })
  returnInspectionNote: string;

  /** 退货商品实际回库时间 */
  @Column({ type: 'timestamptz', nullable: true })
  returnedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  enteredWarehouseAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  listedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}

/** 翻新/上架作业记录：清洁、补漆、拍照、上架描述、退货复检等 */
export type WorkLogType =
  | 'CLEANING'
  | 'REPAINT'
  | 'REPAIR'
  | 'PHOTOGRAPHY'
  | 'LISTING_COPY'
  | 'STORAGE'
  | 'RESHOOT'
  | 'RETURN_INSPECTION';

@Entity('item_work_logs')
export class ItemWorkLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  itemId: string;

  @Column({ type: 'uuid', nullable: true })
  assigneeId: string | null;

  @Column({ type: 'varchar', length: 24 })
  type: WorkLogType;

  @Column({ default: '' })
  note: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: '0' })
  cost: string;

  @CreateDateColumn()
  createdAt: Date;
}
