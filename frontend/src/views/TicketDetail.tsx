import { useEffect, useState } from 'react';
import { api, getUser } from '../api';
import {
  Badge, Field, Money, toast,
} from '../ui';
import {
  TICKET_TYPE, TICKET_STATUS, ROLE, ROLE_COLOR, RESOLUTION, CATEGORY,
  COLOR_FINDING, LIGHTING,
} from '../labels';

export function TicketDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const me = getUser()!;
  const [data, setData] = useState<any>(null);
  const [content, setContent] = useState('');
  const [showResolve, setShowResolve] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => api(`/tickets/${id}`).then(setData);
  useEffect(() => {
    load();
  }, [id]);

  if (!data) return <div className="empty">加载中…</div>;
  const { ticket, messages, consignment, item, order, delivery } = data;
  const isCs = ['CS', 'OPS', 'ADMIN'].includes(me.role);
  const isColor = ticket.type === 'COLOR_DIFFERENCE';

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
            {isColor && ticket.colorFinding && (
              <span style={{ marginLeft: 6 }}><Badge map={COLOR_FINDING} value={ticket.colorFinding} /></span>
            )}
          </h2>
          <div className="sub">
            关联家具：{consignment.code} · {CATEGORY[consignment.category]} · {consignment.brand}
            {order && ` · 订单 ${order.code}`}
            {order?.settlementHold && (
              <span className="badge red" style={{ marginLeft: 8 }}>卖家结算暂缓中</span>
            )}
          </div>
        </div>
        {isCs && ticket.status !== 'CLOSED' && ticket.resolution === 'PENDING' && (
          <button className="btn" onClick={() => setShowResolve(true)}>客服裁定</button>
        )}
      </div>

      {isColor && (
        <ColorEvidencePanel
          ticket={ticket}
          item={item}
          canAdd={ticket.status !== 'CLOSED' && ['BUYER', 'WAREHOUSE', 'CS', 'OPS', 'ADMIN'].includes(me.role)}
          showForm={showEvidence}
          onToggleForm={() => setShowEvidence((v) => !v)}
          onSaved={async () => { setShowEvidence(false); await load(); }}
        />
      )}

      {isColor && ticket.careAdvice && ticket.resolution !== 'PENDING' && (
        <div className="banner info" style={{ marginBottom: 14 }}>
          <b>保养/摆放建议（客服已发送买家）：</b>{ticket.careAdvice}
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h3>问题描述</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{ticket.description}</p>
          <dl className="kv" style={{ marginTop: 8 }}>
            <dt>发起人</dt>
            <dd><span className={`badge ${ROLE_COLOR[ticket.creatorRole]}`}>{ROLE[ticket.creatorRole]}</span></dd>
            <dt>责任方</dt><dd>{ticket.liableParty}</dd>
            <dt>赔付金额</dt><dd><Money v={ticket.compensationAmount} /></dd>
            {item && <>
              <dt>商品状态</dt><dd>{item.title}</dd>
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
                <div className="mc">{m.content}</div>
              </div>
            ))}
          </div>
          <Field label="补充信息 / 处理意见">
            <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="例如：仓库核对照片、配送现场情况、卖家同意降价…" />
          </Field>
          <button className="btn" disabled={busy} onClick={send}>发送</button>
        </div>
      </div>

      {showResolve && (
        <ResolveModal
          ticket={ticket}
          onClose={() => setShowResolve(false)}
          onResolved={() => {
            setShowResolve(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function ColorEvidencePanel({
  ticket,
  item,
  canAdd,
  showForm,
  onToggleForm,
  onSaved,
}: {
  ticket: any;
  item: any;
  canAdd: boolean;
  showForm: boolean;
  onToggleForm: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    buyerPhotos: (ticket.buyerPhotos || []).join(','),
    buyerLighting: ticket.buyerLighting || 'NATURAL_DAYLIGHT',
    buyerSceneNote: ticket.buyerSceneNote || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setBusy(true);
    try {
      await api(`/tickets/${ticket.id}/color-evidence`, {
        body: {
          buyerPhotos: f.buyerPhotos ? f.buyerPhotos.split(/[,，\s]+/).filter(Boolean) : [],
          buyerLighting: f.buyerLighting,
          buyerSceneNote: f.buyerSceneNote,
        },
      });
      toast('色差取证已补充并同步到协同记录');
      onSaved();
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 14, borderLeft: '3px solid #7c3aed' }}>
      <h3>🎨 色差争议取证核对</h3>
      <div className="grid grid-2" style={{ gap: 12 }}>
        <div>
          <div className="hint" style={{ fontWeight: 700, marginBottom: 4 }}>平台拍摄档案（商品页）</div>
          <dl className="kv">
            <dt>标注颜色</dt><dd>{item?.listedColor || '—'}</dd>
            <dt>拍摄灯光</dt><dd>{item?.shootLighting || '未登记'}</dd>
            <dt>原图留存</dt><dd>{item?.rawPhotos?.length ? `${item.rawPhotos.length} 张` : '无'}</dd>
            <dt>修图记录</dt><dd>{item?.retouchNote || '无修图记录'}</dd>
            <dt>页面色差提示</dt>
            <dd>{item?.colorNotice ? <span className="badge green">已提示</span> : <span className="badge red">未提示</span>}</dd>
            <dt>页面描述</dt><dd className="muted" style={{ whiteSpace: 'pre-wrap' }}>{item?.description || '—'}</dd>
          </dl>
        </div>
        <div>
          <div className="hint" style={{ fontWeight: 700, marginBottom: 4 }}>买家现场证据</div>
          <dl className="kv">
            <dt>现场照片</dt>
            <dd>{ticket.buyerPhotos?.length ? `${ticket.buyerPhotos.length} 张` : <span className="money-out">未上传</span>}</dd>
            <dt>现场光线</dt><dd>{ticket.buyerLighting ? LIGHTING[ticket.buyerLighting] : '未填写'}</dd>
            <dt>现场说明</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{ticket.buyerSceneNote || '—'}</dd>
          </dl>
          {canAdd && !showForm && (
            <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={onToggleForm}>
              {ticket.buyerPhotos?.length ? '补充/更新现场取证' : '补充买家现场照片与光线'}
            </button>
          )}
          {showForm && (
            <div style={{ marginTop: 8 }}>
              <Field label="现场照片链接（逗号分隔）">
                <input value={f.buyerPhotos} onChange={(e) => set('buyerPhotos', e.target.value)} />
              </Field>
              <Field label="现场光线">
                <select value={f.buyerLighting} onChange={(e) => set('buyerLighting', e.target.value)}>
                  {Object.entries(LIGHTING).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="现场说明（摆放朝向、对比参照物等）">
                <textarea value={f.buyerSceneNote} onChange={(e) => set('buyerSceneNote', e.target.value)} />
              </Field>
              <button className="btn sm" disabled={busy} onClick={submit}>保存取证</button>
            </div>
          )}
        </div>
      </div>
      {item?.photoStandardFlag === 'NEEDS_REMEDY' && (
        <div className="banner risk" style={{ marginTop: 10 }}>
          摄影规范整改要求：{item.photoRemedyNote}
        </div>
      )}
    </div>
  );
}

function ResolveModal({
  ticket,
  onClose,
  onResolved,
}: {
  ticket: any;
  onClose: () => void;
  onResolved: () => void;
}) {
  const isColor = ticket.type === 'COLOR_DIFFERENCE';
  const [f, setF] = useState({
    resolution: isColor ? 'RETURN_REFUND' : 'PLATFORM_COMPENSATE',
    liableParty: isColor ? 'PLATFORM' : 'PLATFORM',
    compensationAmount: 0,
    note: '',
    newPrice: undefined as number | undefined,
    colorFinding: 'LISTING_INACCURATE',
    careAdvice: '',
    photoRemedyNote: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  const inaccurate = isColor && f.colorFinding === 'LISTING_INACCURATE';
  const natural = isColor && f.colorFinding === 'NATURAL_VARIATION';
  const mixed = isColor && f.colorFinding === 'MIXED';

  const submit = async () => {
    setBusy(true);
    try {
      await api(`/tickets/${ticket.id}/resolve`, {
        body: {
          resolution: f.resolution,
          liableParty: natural ? 'NONE' : f.liableParty,
          compensationAmount: natural ? 0 : Number(f.compensationAmount || 0),
          note: f.note,
          newPrice: f.newPrice,
          ...(isColor
            ? {
                colorFinding: f.colorFinding,
                careAdvice: f.careAdvice,
                photoRemedyNote: f.photoRemedyNote,
              }
            : {}),
        },
      });
      toast('裁定已下达，订单/商品状态已联动');
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
          <div className="banner info" style={{ marginBottom: 10 }}>
            请先核对左侧取证：拍摄灯光/原图/修图记录、页面色差提示、买家现场照片与光线，
            再判定色差原因。
          </div>
        )}

        {isColor && (
          <Field label="色差裁定原因（决定退换/补偿或维持交易）">
            <select value={f.colorFinding} onChange={(e) => {
              const v = e.target.value;
              set('colorFinding', v);
              if (v === 'NATURAL_VARIATION') set('resolution', 'KEEP_LISTING');
              if (v === 'LISTING_INACCURATE') set('resolution', 'RETURN_REFUND');
              if (v === 'MIXED') set('resolution', 'PLATFORM_COMPENSATE');
            }}>
              <option value="LISTING_INACCURATE">页面描述不准确（照片/修图失真、未提示色差）→ 平台承担退换或补偿</option>
              <option value="NATURAL_VARIATION">自然光差异且页面已提示 → 维持交易 + 保养建议</option>
              <option value="MIXED">部分属实（描述有瑕疵，买家光线也有影响）→ 补偿/降价 + 补提示</option>
            </select>
          </Field>
        )}

        <Field label="处理结论">
          <select
            value={f.resolution}
            onChange={(e) => set('resolution', e.target.value)}
            disabled={natural}
          >
            {natural && <option value="KEEP_LISTING">维持交易（自然光差异）</option>}
            <option value="KEEP_LISTING">维持上架/继续履约</option>
            <option value="REDUCE_PRICE">降价处理（同步订单成交价）</option>
            <option value="SELLER_COMPENSATE">卖家承担赔付（从卖家应得扣除）</option>
            <option value="PLATFORM_COMPENSATE">平台承担赔付</option>
            <option value="RETURN_REFUND">退货退款（家具回库复检，卖家结算暂缓）</option>
            <option value="RE_LIST">退货返仓后重新上架（需复检+整改完成）</option>
            <option value="CANCEL_CONSIGNMENT">终止寄卖并下架</option>
          </select>
        </Field>
        {natural && (
          <div className="hint" style={{ margin: '-6px 0 8px' }}>
            自然光差异且页面已提示：维持交易，客服向买家提供家具保养/摆放建议。
          </div>
        )}
        {f.resolution === 'REDUCE_PRICE' && (
          <Field label="新价格（元）">
            <input type="number" onChange={(e) => set('newPrice', +e.target.value)} />
          </Field>
        )}
        {!natural && (
          <div className="row2">
            <Field label="责任方">
              <select value={f.liableParty} onChange={(e) => set('liableParty', e.target.value)}>
                {inaccurate ? (
                  <>
                    <option value="PLATFORM">平台（上架描述/摄影责任）</option>
                    <option value="SHARED">多方共担</option>
                  </>
                ) : (
                  <>
                    <option value="SELLER">卖家</option>
                    <option value="BUYER">买家</option>
                    <option value="PLATFORM">平台</option>
                    <option value="DELIVERY">配送</option>
                    <option value="REFURBISHER">翻新师</option>
                    <option value="SHARED">多方共担</option>
                  </>
                )}
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
        )}
        {isColor && (
          <Field label={natural ? '保养/摆放建议（必填，将发送买家）' : '保养/售后说明（随裁定发送买家，可选）'}>
            <textarea
              value={f.careAdvice}
              onChange={(e) => set('careAdvice', e.target.value)}
              placeholder={natural ? '如：避免阳光直射，远离窗边摆放；每月用中性护理剂擦拭可稳定木色…' : '如退货包装指引、翻新后的保养方式…'}
            />
          </Field>
        )}
        {(inaccurate || mixed) && (
          <Field label="摄影规范整改要求（同步商品，重拍改描述前不可二次上架）">
            <textarea
              value={f.photoRemedyNote}
              onChange={(e) => set('photoRemedyNote', e.target.value)}
              placeholder="如：标准自然光下重新拍摄、保留原图、修图不得改色，页面显著标注不同光线下色差"
            />
          </Field>
        )}
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
