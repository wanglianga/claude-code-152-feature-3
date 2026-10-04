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

/**
 * 色差认定结论（仅色差类工单）：
 * LISTING_INACCURATE 页面描述/照片不准确 → 平台承担退换或补偿
 * NATURAL_LIGHT 自然光差异且页面已提示 → 维持交易，提供保养建议
 * INCONCLUSIVE 证据不足，需继续协同
 */
export type ColorFinding =
  | 'NONE'
  | 'LISTING_INACCURATE'
  | 'NATURAL_LIGHT'
  | 'INCONCLUSIVE';

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

  /** 买家收货现场照片（色差/磕碰异议举证） */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  buyerPhotos: string[];

  /** 色差认定结论（仅色差类工单，默认 NONE） */
  @Column({ type: 'varchar', length: 24, default: 'NONE' })
  colorFinding: ColorFinding;

  /** 色差一致性评分 1-5（客服认定时记录，5 为一致），无则空 */
  @Column({ type: 'int', nullable: true })
  colorScore: number | null;

  /** 维持交易时提供给买家的保养/使用建议 */
  @Column({ type: 'text', default: '' })
  careAdvice: string;

  /** 认定依据摘要：灯光/原图/修图记录/现场照片/页面描述的核对结论 */
  @Column({ type: 'text', default: '' })
  findingBasis: string;

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
