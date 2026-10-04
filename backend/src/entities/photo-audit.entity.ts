import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 商品摄影档案：记录上架照片的拍摄灯光、原图、修图过程与页面色差提示。
 * 色差争议发生时，客服据此核对"页面照片是否客观还原实物颜色"。
 */
@Entity('photo_audits')
export class PhotoAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  itemId: string;

  @Column({ type: 'uuid' })
  recordedBy: string;

  /** 拍摄灯光条件，如"5500K 自然光模拟灯箱 + 左侧窗光" */
  @Column({ default: '' })
  lightingSetup: string;

  /** 拍摄设备与参数，如"索尼 A7M4 / 50mm / 白平衡 5200K" */
  @Column({ default: '' })
  cameraSetup: string;

  /** 原图（未修）照片链接 */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  rawPhotos: string[];

  /** 修图后用于页面的照片链接 */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  editedPhotos: string[];

  /** 修图记录：做过哪些调色（亮度/饱和度/色温等） */
  @Column({ type: 'text', default: '' })
  retouchNote: string;

  /** 页面是否已提示色差风险（自然光源下颜色可能存在差异） */
  @Column({ default: false })
  colorNoticeOnPage: boolean;

  /** 页面提示原文 */
  @Column({ default: '' })
  colorNoticeText: string;

  /** 标准色卡/材质色号，如"橡木色 NCS S 4010-Y30R" */
  @Column({ default: '' })
  colorReference: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * 摄影规范：色差争议处理结论沉淀为拍摄规范更新，
 * 影响后续同材质/品类商品的拍摄要求（色温、修图幅度、必拍角度与提示语）。
 */
@Entity('photo_standards')
export class PhotoStandard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 适用品类（空字符串表示全品类通用） */
  @Index()
  @Column({ default: '' })
  category: string;

  /** 适用材质关键词，如"橡木/胡桃木/皮面" */
  @Column({ default: '' })
  material: string;

  @Column()
  title: string;

  /** 规范正文：灯光色温、白平衡、修图幅度限制、必拍场景等 */
  @Column({ type: 'text' })
  content: string;

  /** 状态：ACTIVE 生效中 / SUPERSEDED 已被更新替代 */
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'ACTIVE' })
  status: 'ACTIVE' | 'SUPERSEDED';

  /** 来源色差工单 id */
  @Column({ type: 'uuid', nullable: true })
  sourceTicketId: string | null;

  @Column({ type: 'uuid' })
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;
}

/**
 * 商品色差评价：买家收货后可对"实物与页面颜色一致性"打分（1-5，5 为完全一致）。
 * 客服完成色差认定后也会沉淀一条官方评价，影响商品色差展示。
 */
@Entity('item_reviews')
export class ItemReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  itemId: string;

  @Column({ type: 'uuid', nullable: true })
  orderId: string | null;

  @Column({ type: 'uuid' })
  authorId: string;

  @Column({ type: 'varchar', length: 16 })
  authorRole: string;

  @Column()
  authorName: string;

  /** 颜色一致性 1-5 分 */
  @Column({ type: 'int' })
  colorScore: number;

  @Column({ type: 'text', default: '' })
  content: string;

  /** 买家现场照片 */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  photos: string[];

  /** 官方认定来源：BUYER 买家评价 / CS 客服色差认定 */
  @Column({ type: 'varchar', length: 16, default: 'BUYER' })
  source: 'BUYER' | 'CS';

  /** 关联色差工单（客服认定时） */
  @Column({ type: 'uuid', nullable: true })
  ticketId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
