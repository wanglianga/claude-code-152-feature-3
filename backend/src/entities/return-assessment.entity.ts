import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 退货回库评估：售后退货成立、家具回库后由仓库重新评估
 * 残值、回库后仓储费、以及是否可二次上架。卖家结算暂缓至该结果确认。
 */
@Entity('return_assessments')
export class ReturnAssessment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  ticketId: string;

  @Index()
  @Column({ type: 'uuid' })
  itemId: string;

  @Index()
  @Column({ type: 'uuid' })
  orderId: string;

  @Column({ type: 'uuid' })
  assessedBy: string;

  @Column()
  assessorName: string;

  /** 回库时的成色检查记录（磕碰、污损、包装情况等） */
  @Column({ type: 'text', default: '' })
  conditionNote: string;

  /** 回库复检照片 */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  checkPhotos: string[];

  /** 重新评估的残值（可二次上架时的建议挂牌价） */
  @Column({ type: 'numeric', precision: 10, scale: 2, default: '0' })
  residualValue: string;

  /** 退货往返产生的额外仓储费（回库入库费/复检占仓费快照） */
  @Column({ type: 'numeric', precision: 10, scale: 2, default: '0' })
  restockStorageFee: string;

  /** 退货复检/重新清洁等额外处理成本 */
  @Column({ type: 'numeric', precision: 10, scale: 2, default: '0' })
  restockHandlingFee: string;

  /** 是否可二次上架：RE_LISTABLE 可重新上架 / DISPOSED 建议报废或捐贈 / PENDING 待评估 */
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  decision: 'PENDING' | 'RE_LISTABLE' | 'DISPOSED';

  /** 重新上架时的库位 */
  @Column({ default: '' })
  warehouseSlot: string;

  /** 回库时间 */
  @Column({ type: 'timestamptz', nullable: true })
  returnedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
