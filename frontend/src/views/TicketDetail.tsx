import { useEffect, useState } from 'react';
import { api, getUser } from '../api';
import {
  Badge, Field, Money, toast,
} from '../ui';
import {
  TICKET_TYPE, TICKET_STATUS, ROLE, ROLE_COLOR, RESOLUTION, CATEGORY,
  COLOR_FINDING, RETURN_DECISION, ITEM_STATUS,
} from '../labels';

export function TicketDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const me = getUser()!;
  const [data, setData] = useState<any>(null);
  const [content, setContent] = useState('');
  const [showResolve, setShowResolve] = useState(false);
  const [showAssess, setShowAssess] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => api(`/tickets/${id}`).then(setData);
  useEffect(() => {
    load();
  }, [id]);

  if (!data) return <div className="empty">加载中…</div>;
  const { ticket, messages, consignment, item, order, delivery, photoAudit, returnAssessment, reviews } = data;
  const isCs = ['CS', 'OPS', 'ADMIN'].includes(me.role);
  const isWh = ['WAREHOUSE', 'OPS', 'ADMIN'].includes(me.role);
  const isColor = ticket.type === 'COLOR_DIFFERENCE';
  const needsReturnAssessment =
    ticket.resolution === 'RETURN_REFUND' &&
    ticket.status === 'RESOLVED' &&
    order?.status === 'RETURNING';

  const send = async () => {
    if (!content.trim()) return;
    setBusy(true);
    try {
      await api(`/tickets/${id}/messages`, { body: { content } });
      setContent('');
      await load();
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <button className="btn ghost sm" onClick={onBack}>← 返回</button>
          <h2 style={{ marginTop: 10 }}>
            【{TICKET_TYPE[ticket.type]}】{ticket.title}
            <span style={{ marginLeft: 10 }}><Badge map={TICKET_STATUS} value={ticket.status} /></span>
            {ticket.resolution !== 'PENDING' && (
              <span className="badge blue" style={{ marginLeft: 6 }}>{RESOLUTION[ticket.resolution]}</span>
            )}
            {isColor && ticket.colorFinding !== 'NONE' && (
              <span className={`badge ${COLOR_FINDING[ticket.colorFinding]?.cls || 'gray'}`} style={{ marginLeft: 6 }}>
                {COLOR_FINDING[ticket.colorFinding]?.label}
              </span>
            )}
          </h2>
          <div className="sub">
            关联家具：{consignment.code} · {CATEGORY[consignment.category]} · {consignment.brand}
            {order && ` · 订单 ${order.code}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isCs && ticket.status !== 'CLOSED' && ticket.resolution === 'PENDING' && (
            <button className="btn" onClick={() => setShowResolve(true)}>客服裁定</button>
          )}
          {isWh && needsReturnAssessment && (
            <button className="btn" onClick={() => setShowAssess(true)}>退货回库评估</button>
          )}
        </div>
      </div>

      {isColor && (
        <div className="card" style={{ marginBottom: 14, borderColor: '#bae6fd' }}>
          <h3>🎨 色差证据链核对（灯光 / 原图 / 修图 / 现场照片 / 页面描述）</h3>
          {needsReturnAssessment === false && ticket.colorFinding !== 'NONE' && (
            <div className={`banner ${ticket.colorFinding === 'LISTING_INACCURATE' ? 'warn' : 'info'}`}>
              <b>客服认定：{COLOR_FINDING[ticket.colorFinding]?.label}</b>
              {ticket.colorScore != null && <span> · 颜色一致性 {ticket.colorScore}/5</span>}
              {ticket.findingBasis && <div style={{ marginTop: 4 }}>认定依据：{ticket.findingBasis}</div>}
            </div>
          )}
          <div className="grid grid-2" style={{ marginTop: 10 }}>
            <div>
              <h4 style={{ margin: '6px 0' }}>① 拍摄灯光与设备（仓库/摄影登记）</h4>
              {photoAudit ? (
                <dl className="kv">
                  <dt>灯光布置</dt><dd>{photoAudit.lightingSetup || '未登记'}</dd>
                  <dt>设备/白平衡</dt><dd>{photoAudit.cameraSetup || '未登记'}</dd>
                  <dt>色卡基准</dt><dd>{photoAudit.colorReference || '未登记'}</dd>
                  <dt>页面色差提示</dt>
                  <dd>
                    {photoAudit.colorNoticeOnPage
                      ? <span className="badge green">已提示</span>
                      : <span className="badge red">未提示</span>}
                    {photoAudit.colorNoticeText && <span className="muted">：{photoAudit.colorNoticeText}</span>}
                  </dd>
                </dl>
              ) : (
                <div className="muted">未登记摄影档案，请仓库在「翻新上架」补充拍摄灯光/原图/修图记录。</div>
              )}
              <h4 style={{ margin: '10px 0 6px' }}>② 修图记录</h4>
              <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>
                {photoAudit?.retouchNote || '未登记'}
              </div>
              <h4 style={{ margin: '10px 0 6px' }}>③ 原图（未修）</h4>
              <PhotoLinks photos={photoAudit?.rawPhotos || []} />
              <h4 style={{ margin: '10px 0 6px' }}>④ 页面修图后照片</h4>
              <PhotoLinks photos={photoAudit?.editedPhotos?.length ? photoAudit.editedPhotos : (item?.photos || [])} />
            </div>
            <div>
              <h4 style={{ margin: '6px 0' }}>⑤ 买家收货现场照片</h4>
              <PhotoLinks photos={ticket.buyerPhotos || []} />
              <h4 style={{ margin: '10px 0 6px' }}>⑥ 页面商品描述</h4>
              <div className="muted" style={{ whiteSpace: 'pre-wrap', background: '#f8fafc', padding: 10, borderRadius: 6 }}>
                {item?.description || '（空）'}
              </div>
              {ticket.careAdvice && (
                <>
                  <h4 style={{ margin: '10px 0 6px' }}>⑦ 客服保养建议（维持交易）</h4>
                  <div className="banner info" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{ticket.careAdvice}</div>
                </>
              )}
            </div>
          </div>
          {reviews?.length > 0 && (
            <>
              <h4 style={{ margin: '14px 0 6px' }}>该商品色差评价（影响商品展示与摄影规范）</h4>
              <div className="grid grid-3">
                {reviews.map((r: any) => (
                  <div key={r.id} className="card" style={{ margin: 0, padding: 10 }}>
                    <div>
                      <span className={`badge ${ROLE_COLOR[r.authorRole] || 'gray'}`}>{r.source === 'CS' ? '客服认定' : ROLE[r.authorRole]}</span>
                      <b style={{ marginLeft: 6 }}>{r.authorName}</b>
                    </div>
                    <div style={{ margin: '6px 0' }}>颜色一致性 <b className={r.colorScore <= 2 ? 'money-out' : ''}>{r.colorScore}/5</b></div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{r.content}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h3>问题描述</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{ticket.description}</p>
          {!isColor && (ticket.buyerPhotos?.length > 0) && (
            <div style={{ marginTop: 8 }}>
              <b>现场照片：</b>
              <PhotoLinks photos={ticket.buyerPhotos} />
            </div>
          )}
          <dl className="kv" style={{ marginTop: 8 }}>
            <dt>发起人</dt>
            <dd><span className={`badge ${ROLE_COLOR[ticket.creatorRole]}`}>{ROLE[ticket.creatorRole]}</span></dd>
            <dt>责任方</dt><dd>{ticket.liableParty}</dd>
            <dt>赔付金额</dt><dd><Money v={ticket.compensationAmount} /></dd>
            {item && <>
              <dt>商品状态</dt><dd>{item.title} <Badge map={ITEM_STATUS} value={item.status} /></dd>
              <dt>色差评分</dt>
              <dd>
                {item.colorReviewCount > 0
                  ? `${Number(item.colorAvgScore).toFixed(1)}/5（${item.colorReviewCount} 条）`
                  : '暂无评价'}
              </dd>
              <dt>所在/库位</dt><dd>{item.location === 'WAREHOUSE' ? `仓库 ${item.warehouseSlot || '-'}` : '卖家家中'} · 配送半径 {item.deliveryRadiusKm}km</dd>
            </>}
            {order && <>
              <dt>成交价</dt><dd><Money v={order.dealPrice} />（配送费 <Money v={order.deliveryFee} />）</dd>
              <dt>买家楼层</dt><dd>{order.buyerFloor} 层 · {order.buyerElevator === 'ELEVATOR' ? '有电梯' : '无电梯'}{order.needOldFurnitureRemoval ? ' · 需搬出旧家具' : ''}</dd>
            </>}
            {delivery && <>
              <dt>车辆/拆装</dt><dd>{delivery.vehicleType} · {delivery.needsDisassembly ? '需拆装' : '无需拆装'}</dd>
              <dt>配送状态</dt><dd>
                {delivery.status}
                {delivery.status === 'FAILED' && <span className="badge red" style={{ marginLeft: 6 }}>{delivery.failReason}</span>}
              </dd>
              {delivery.failNote && <><dt>现场记录</dt><dd>{delivery.failNote}</dd></>}
            </>}
          </dl>
          {returnAssessment && (
            <div className="banner info" style={{ marginTop: 10 }}>
              <b>回库评估（{returnAssessment.assessorName}）</b> ·{' '}
              <Badge map={RETURN_DECISION} value={returnAssessment.decision} />
              <dl className="kv" style={{ marginTop: 6 }}>
                <dt>残值评估</dt><dd><Money v={returnAssessment.residualValue} /></dd>
                <dt>回库仓储费</dt><dd><Money v={returnAssessment.restockStorageFee} /></dd>
                <dt>复检处理费</dt><dd><Money v={returnAssessment.restockHandlingFee} /></dd>
                <dt>库位</dt><dd>{returnAssessment.warehouseSlot || '-'}</dd>
                <dt>成色检查</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{returnAssessment.conditionNote}</dd>
              </dl>
              <PhotoLinks photos={returnAssessment.checkPhotos || []} />
            </div>
          )}
        </div>

        <div className="card">
          <h3>多方协同记录</h3>
          <div className="chat">
            {messages.length === 0 && <div className="muted">还没有留言，卖家、买家、仓库、翻新师、配送、客服在此围绕同一件家具协商。</div>}
            {messages.map((m: any) => (
              <div key={m.id} className={`msg ${m.authorId === me.id ? 'me' : ''}`}>
                <div className="mh">
                  <span className={`badge ${ROLE_COLOR[m.authorRole] || 'gray'}`}>{ROLE[m.authorRole] || m.authorRole}</span>
                  <b>{m.authorName}</b>
                  <span>{new Date(m.createdAt).toLocaleString()}</span>
                </div>
                <div className="mc" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
              </div>
            ))}
          </div>
          <Field label="补充信息 / 处理意见">
            <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="例如：仓库核对照片与修图记录、配送现场情况、卖家同意降价…" />
          </Field>
          <button className="btn" disabled={busy} onClick={send}>发送</button>
        </div>
      </div>

      {showResolve && (
        <ResolveModal
          ticket={ticket}
          photoAudit={photoAudit}
          onClose={() => setShowResolve(false)}
          onResolved={() => {
            setShowResolve(false);
            load();
          }}
        />
      )}
      {showAssess && (
        <ReturnAssessModal
          ticket={ticket}
          item={item}
          onClose={() => setShowAssess(false)}
          onDone={() => {
            setShowAssess(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function PhotoLinks({ photos }: { photos: string[] }) {
  if (!photos || photos.length === 0) {
    return <div className="muted" style={{ fontSize: 12.5 }}>暂无照片</div>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {photos.map((p) => (
        <a
          key={p}
          className="tag"
          href={p.startsWith('http') ? p : undefined}
          target="_blank"
          rel="noreferrer"
          title={p}
          style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          📷 {p.split('/').pop()}
        </a>
      ))}
    </div>
  );
}

function ResolveModal({
  ticket,
  photoAudit,
  onClose,
  onResolved,
}: {
  ticket: any;
  photoAudit: any;
  onClose: () => void;
  onResolved: () => void;
}) {
  const isColor = ticket.type === 'COLOR_DIFFERENCE';
  const [f, setF] = useState({
    resolution: isColor ? 'PLATFORM_COMPENSATE' : 'PLATFORM_COMPENSATE',
    liableParty: 'PLATFORM',
    compensationAmount: 0,
    note: '',
    newPrice: undefined as number | undefined,
    colorFinding: 'LISTING_INACCURATE' as 'LISTING_INACCURATE' | 'NATURAL_LIGHT',
    colorScore: 2,
    careAdvice: '',
    findingBasis: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setBusy(true);
    try {
      const body: any = {
        resolution: f.resolution,
        liableParty: f.liableParty,
        compensationAmount: Number(f.compensationAmount || 0),
        note: f.note,
        newPrice: f.newPrice,
      };
      if (isColor) {
        body.colorFinding = f.colorFinding;
        body.colorScore = Number(f.colorScore);
        body.careAdvice = f.careAdvice;
        body.findingBasis = f.findingBasis;
      }
      await api(`/tickets/${ticket.id}/resolve`, { body });
      toast('裁定已下达，订单/商品状态与商品评价已联动');
      onResolved();
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>客服裁定 · {ticket.title}</h3>

        {isColor && (
          <div className="banner warn" style={{ marginBottom: 10 }}>
            色差争议需先核对证据链：拍摄灯光（{photoAudit?.lightingSetup || '未登记'}）、原图/修图（{photoAudit?.retouchNote || '未登记'}）、
            买家现场照片（{(ticket.buyerPhotos || []).length} 张）、页面提示：
            {photoAudit?.colorNoticeOnPage ? '已提示' : '未提示'}。
          </div>
        )}

        {isColor && (
          <>
            <Field label="色差认定结论">
              <select
                value={f.colorFinding}
                onChange={(e) => {
                  const finding = e.target.value as 'LISTING_INACCURATE' | 'NATURAL_LIGHT';
                  set('colorFinding', finding);
                  if (finding === 'LISTING_INACCURATE') {
                    setF((p) => ({
                      ...p,
                      colorFinding: finding,
                      resolution: 'PLATFORM_COMPENSATE',
                      liableParty: 'PLATFORM',
                      colorScore: 2,
                    }));
                  } else {
                    setF((p) => ({
                      ...p,
                      colorFinding: finding,
                      resolution: 'KEEP_LISTING',
                      liableParty: 'BUYER',
                      colorScore: 4,
                    }));
                  }
                }}
              >
                <option value="LISTING_INACCURATE">页面描述/照片不准确 → 平台承担退换或补偿，沉淀摄影规范</option>
                <option value="NATURAL_LIGHT">自然光差异且页面已提示 → 维持交易，附保养建议</option>
              </select>
            </Field>
            <Field label="颜色一致性评分（1 严重不符 ~ 5 完全一致，写入商品评价）">
              <input type="number" min={1} max={5} value={f.colorScore} onChange={(e) => set('colorScore', +e.target.value)} />
            </Field>
            <Field label="认定依据（灯光/原图/修图/现场照片/页面描述的核对结论，将同步协同记录）">
              <textarea
                style={{ minHeight: 70 }}
                value={f.findingBasis}
                onChange={(e) => set('findingBasis', e.target.value)}
                placeholder="如：原图偏红棕，修图色温-18%超规范，页面写深胡桃且无提示"
              />
            </Field>
            {f.colorFinding === 'NATURAL_LIGHT' && (
              <Field label="保养/使用建议（留空则使用平台默认建议）">
                <textarea
                  style={{ minHeight: 70 }}
                  value={f.careAdvice}
                  onChange={(e) => set('careAdvice', e.target.value)}
                  placeholder="不同光源下颜色差异说明、清洁与木蜡保养建议…"
                />
              </Field>
            )}
          </>
        )}

        <Field label="处理结论">
          <select
            value={f.resolution}
            onChange={(e) => set('resolution', e.target.value)}
            disabled={isColor}
          >
            {isColor && f.colorFinding === 'NATURAL_LIGHT' ? (
              <option value="KEEP_LISTING">维持交易（保养建议）</option>
            ) : (
              <>
                <option value="KEEP_LISTING">维持上架/继续履约</option>
                <option value="REDUCE_PRICE">降价/补差处理（同步订单成交价）</option>
                <option value="SELLER_COMPENSATE">卖家承担赔付（从卖家应得扣除）</option>
                <option value="PLATFORM_COMPENSATE">平台承担赔付</option>
                <option value="RETURN_REFUND">退货退款（家具回库后做残值/仓储费/二次上架评估，卖家结算暂缓）</option>
                <option value="RE_LIST">退货返仓后重新上架</option>
                <option value="CANCEL_CONSIGNMENT">终止寄卖并下架</option>
              </>
            )}
          </select>
        </Field>
        {f.resolution === 'REDUCE_PRICE' && (
          <Field label="新价格（元）">
            <input type="number" onChange={(e) => set('newPrice', +e.target.value)} />
          </Field>
        )}
        <div className="row2">
          <Field label="责任方">
            <select value={f.liableParty} onChange={(e) => set('liableParty', e.target.value)} disabled={isColor}>
              <option value="SELLER">卖家</option>
              <option value="BUYER">买家</option>
              <option value="PLATFORM">平台</option>
              <option value="DELIVERY">配送</option>
              <option value="REFURBISHER">翻新师</option>
              <option value="SHARED">多方共担</option>
            </select>
          </Field>
          <Field label="赔付/扣款金额（元）">
            <input
              type="number"
              min={0}
              value={f.compensationAmount}
              onChange={(e) => set('compensationAmount', +e.target.value)}
            />
          </Field>
        </div>
        <Field label="裁定说明（将同步到协同记录与结算来源）">
          <textarea value={f.note} onChange={(e) => set('note', e.target.value)} />
        </Field>
        <div className="modal-foot">
          <button className="btn gray" onClick={onClose}>取消</button>
          <button className="btn" disabled={busy} onClick={submit}>确认裁定</button>
        </div>
      </div>
    </div>
  );
}

function ReturnAssessModal({
  ticket,
  item,
  onClose,
  onDone,
}: {
  ticket: any;
  item: any;
  onClose: () => void;
  onDone: () => void;
}) {
  const [f, setF] = useState({
    conditionNote: '',
    checkPhotos: '',
    residualValue: Number(item?.listedPrice || 0),
    restockStorageFee: 0,
    restockHandlingFee: 0,
    decision: 'RE_LISTABLE' as 'RE_LISTABLE' | 'DISPOSED',
    warehouseSlot: item?.warehouseSlot || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setBusy(true);
    try {
      await api(`/tickets/${ticket.id}/return-assessment`, {
        body: {
          conditionNote: f.conditionNote,
          checkPhotos: f.checkPhotos ? f.checkPhotos.split(/[,，\s]+/).filter(Boolean) : [],
          residualValue: Number(f.residualValue),
          restockStorageFee: Number(f.restockStorageFee),
          restockHandlingFee: Number(f.restockHandlingFee),
          decision: f.decision,
          warehouseSlot: f.warehouseSlot,
        },
      });
      toast('回库评估已确认，退货完结、工单关闭，卖家结算解除暂缓');
      onDone();
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>退货回库评估 · {item?.title}</h3>
        <div className="banner info">
          售后退货成立，家具回库后重新评估残值、回库仓储费与是否可二次上架；
          评估确认前卖家结算暂缓。可二次上架时仓储周期自回库日重新起算。
        </div>
        <Field label="评估结论">
          <select value={f.decision} onChange={(e) => set('decision', e.target.value)}>
            <option value="RE_LISTABLE">可二次上架（复检清洁后重新售卖）</option>
            <option value="DISPOSED">报废/捐赠（不再上架）</option>
          </select>
        </Field>
        <div className="row2">
          {f.decision === 'RE_LISTABLE' && (
            <Field label="残值评估价（二次上架挂牌价，元）">
              <input type="number" min={0} value={f.residualValue} onChange={(e) => set('residualValue', +e.target.value)} />
            </Field>
          )}
          <Field label="回库库位">
            <input value={f.warehouseSlot} onChange={(e) => set('warehouseSlot', e.target.value)} placeholder="如 C-05-06" />
          </Field>
          <Field label="回库仓储费（元，平台吸收，进入结算来源）">
            <input type="number" min={0} value={f.restockStorageFee} onChange={(e) => set('restockStorageFee', +e.target.value)} />
          </Field>
          <Field label="复检/重新清洁处理费（元）">
            <input type="number" min={0} value={f.restockHandlingFee} onChange={(e) => set('restockHandlingFee', +e.target.value)} />
          </Field>
        </div>
        <Field label="成色检查记录（磕碰、污损、五金、包装情况等）">
          <textarea style={{ minHeight: 80 }} value={f.conditionNote} onChange={(e) => set('conditionNote', e.target.value)} />
        </Field>
        <Field label="复检照片链接（逗号分隔）">
          <input value={f.checkPhotos} onChange={(e) => set('checkPhotos', e.target.value)} />
        </Field>
        <div className="modal-foot">
          <button className="btn gray" onClick={onClose}>取消</button>
          <button className="btn" disabled={busy} onClick={submit}>确认评估并完结退货</button>
        </div>
      </div>
    </div>
  );
}
