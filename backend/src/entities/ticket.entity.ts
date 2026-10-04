import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 协同工单：卖家、买家、仓库、翻新师、配送、客服围绕同一件家具处理异常
 * 类型：
 * SELLER_BACKTRACK 卖家临时反悔
 * APPRAISAL_MISMATCH 估价与实物不符
 * REFURBISH_OVERRUN 翻新成本超预期
 * COLOR_DIFFERENCE 买家认为色差明显
 * ELEVATOR_BLOCK 沙发进不了电梯
 * TRANSIT_DAMAGE 配送途中磕碰
 * RETURN_REQUEST 售后要求退货
 */
export type TicketType =
  | 'SELLER_BACKTRACK'
  | 'APPRAISAL_MISMATCH'
  | 'REFURBISH_OVERRUN'
  | 'COLOR_DIFFERENCE'
  | 'ELEVATOR_BLOCK'
  | 'TRANSIT_DAMAGE'
  | 'RETURN_REQUEST'
  | 'OTHER';

/** OPEN 处理中 / RESOLVED 已解决 / CLOSED 已关闭（如退货完结） */
export type TicketStatus = 'OPEN' | 'RESOLVED' | 'CLOSED';

/** 处理结论（决定结算与卖家画像） */
export type TicketResolution =
  | 'PENDING'
  | 'KEEP_LISTING'
  | 'REDUCE_PRICE'
  | 'SELLER_COMPENSATE'
  | 'PLATFORM_COMPENSATE'
  | 'RETURN_REFUND'
  | 'RE_LIST'
  | 'CANCEL_CONSIGNMENT';

@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  consignmentId: string;

  @Column({ type: 'uuid', nullable: true })
  itemId: string | null;

  @Column({ type: 'uuid', nullable: true })
  orderId: string | null;

  @Index()
  @Column({ type: 'varchar', length: 24 })
  type: TicketType;

  @Column({ type: 'uuid' })
  createdBy: string;

  @Column({ type: 'varchar', length: 16 })
  creatorRole: string;

  @Column({ type: 'varchar', length: 12 })
  status: TicketStatus;

  @Column({ type: 'varchar', length: 24, default: 'PENDING' })
  resolution: TicketResolution;

  /** 责任方：SELLER / BUYER / PLATFORM / DELIVERY / REFURBISHER / SHARED */
  @Column({ type: 'varchar', length: 16, default: 'SHARED' })
  liableParty: string;

  /** 协商后的赔付/扣款金额（结算引用） */
  @Column({ type: 'numeric', precision: 10, scale: 2, default: '0' })
  compensationAmount: string;

  @Column({ default: '' })
  title: string;

  @Column({ type: 'text' })
  description: string;

  // ---- 色差争议取证（COLOR_DIFFERENCE 专用）----
  /** 买家现场照片 URL 列表 */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  buyerPhotos: string[];

  /** 买家现场光线：NATURAL_DAYLIGHT 自然光 / INDOOR_WARM 室内暖光 / INDOOR_COOL 室内冷光 / OTHER */
  @Column({ type: 'varchar', length: 24, default: '' })
  buyerLighting: string;

  /** 买家现场补充说明（摆放位置、朝向、对比物等） */
  @Column({ default: '' })
  buyerSceneNote: string;

  /**
   * 色差裁定原因：
   * LISTING_INACCURATE 页面描述不准确（颜色/修图失真/未提示色差）→ 平台承担退换或补偿
   * NATURAL_VARIATION 自然光差异且页面已提示 → 维持交易 + 保养建议
   * MIXED 部分属实（描述有瑕疵但买家光线也有影响）
   * '' 非色差工单
   */
  @Column({ type: 'varchar', length: 24, default: '' })
  colorFinding: string;

  /** 维持交易时给买家的保养建议（色差成立退换时可为保养/翻新说明） */
  @Column({ default: '' })
  careAdvice: string;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('ticket_messages')
export class TicketMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  ticketId: string;

  @Column({ type: 'uuid' })
  authorId: string;

  /** 作者角色，便于前端区分卖家/买家/仓库/翻新师/配送/客服 */
  @Column({ type: 'varchar', length: 16 })
  authorRole: string;

  @Column()
  authorName: string;

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn()
  createdAt: Date;
}
