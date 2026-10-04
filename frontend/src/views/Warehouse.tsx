import { useEffect, useState } from 'react';
import { api, AuthUser } from '../api';
import {
  Badge, Modal, Field, Money, Empty, toast,
} from '../ui';
import { CATEGORY, ITEM_STATUS, WORK_LOG_TYPE, ITEM_REVIEW, PHOTO_FLAG } from '../labels';
import { ConsignmentDetail } from './ConsignmentDetail';

const FILTERS = ['PREPARING', 'PHOTOGRAPHY', 'LISTED', 'RESERVED', 'RETURNING', 'RETURNED'] as const;

export function WarehouseView({ user }: { user: AuthUser }) {
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>('PREPARING');
  const [workFor, setWorkFor] = useState<any>(null);
  const [advanceFor, setAdvanceFor] = useState<any>(null);
  const [inspectFor, setInspectFor] = useState<any>(null);
  const [remedyFor, setRemedyFor] = useState<any>(null);
  const [detailConsignment, setDetailConsignment] = useState<string | null>(null);

  const load = () => {
    api(`/items?status=${filter}`).then(setItems);
  };
  useEffect(() => {
    load();
  }, [filter]);

  if (detailConsignment) {
    return <ConsignmentDetail id={detailConsignment} onBack={() => setDetailConsignment(null)} viewerRole={user.role} />;
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>清洁翻新 · 入库上架</h2>
          <div className="sub">
            {user.role === 'REFURBISHER'
              ? '登记清洁、补漆、维修作业，费用自动累计并进入结算来源'
              : '管理库位、拍照档案与上架描述；售后退货回库需复检残值，色差整改需重拍'}
          </div>
        </div>
      </div>
      <div className="pill-filter">
        {FILTERS.map((s) => (
          <button key={s} className={filter === s ? 'active' : ''} onClick={() => setFilter(s)}>
            {ITEM_STATUS[s].label}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <Empty text="该状态下暂无商品" />
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>商品</th><th>品类</th><th>状态</th><th>评价/摄影规范</th><th>位置/库位</th>
                  <th>清洁费</th><th>翻新费</th><th>配送范围</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <a onClick={() => setDetailConsignment(it.consignmentId)} style={{ cursor: 'pointer' }}>
                        {it.title}
                      </a>
                    </td>
                    <td>{CATEGORY[it.category]}</td>
                    <td><Badge map={ITEM_STATUS} value={it.status} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Badge map={ITEM_REVIEW} value={it.reviewStatus || 'NEUTRAL'} />
                      <div style={{ marginTop: 3 }}><Badge map={PHOTO_FLAG} value={it.photoStandardFlag || 'OK'} /></div>
                    </td>
                    <td>
                      {it.location === 'WAREHOUSE' ? '在仓' : '卖家家中'}
                      {it.warehouseSlot && <span className="tag">{it.warehouseSlot}</span>}
                    </td>
                    <td><Money v={it.cleaningCost} /></td>
                    <td><Money v={it.refurbishCost} /></td>
                    <td>{String(it.deliveryRadiusKm) === '0' ? '仅自提' : `${it.deliveryRadiusKm}km`}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {['PREPARING', 'PHOTOGRAPHY'].includes(it.status) && (
                        <button className="btn ghost sm" style={{ marginRight: 4 }} onClick={() => setWorkFor(it)}>登记作业</button>
                      )}
                      {it.status === 'PREPARING' && (
                        <button className="btn sm" onClick={() => setAdvanceFor(it)}>清洁完成→拍照</button>
                      )}
                      {it.status === 'PHOTOGRAPHY' && (
                        <button className="btn sm" onClick={() => setAdvanceFor(it)}>完善信息→上架</button>
                      )}
                      {it.status === 'RETURNING' && (
                        <button className="btn sm" onClick={() => setInspectFor(it)}>登记回库复检</button>
                      )}
                      {it.status === 'RETURNED' && (
                        <>
                          {it.photoStandardFlag === 'NEEDS_REMEDY' && (
                            <button className="btn ghost sm" style={{ marginRight: 4 }} onClick={() => setRemedyFor(it)}>摄影整改重拍</button>
                          )}
                          <button className="btn sm" onClick={() => setInspectFor(it)}>复检结论/残值</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {workFor && <WorkLogModal item={workFor} onClose={() => setWorkFor(null)} onDone={() => { setWorkFor(null); load(); }} role={user.role} />}
      {advanceFor && (
        <AdvanceModal
          item={advanceFor}
          onClose={() => setAdvanceFor(null)}
          onDone={() => { setAdvanceFor(null); load(); }}
        />
      )}
      {inspectFor && (
        <ReturnInspectionModal
          item={inspectFor}
          onClose={() => setInspectFor(null)}
          onDone={() => { setInspectFor(null); load(); }}
        />
      )}
      {remedyFor && (
        <PhotoRemedyModal
          item={remedyFor}
          onClose={() => setRemedyFor(null)}
          onDone={() => { setRemedyFor(null); load(); }}
        />
      )}
    </div>
  );
}

function WorkLogModal({ item, onClose, onDone, role }: { item: any; onClose: () => void; onDone: () => void; role: string }) {
  const refurbisher = role === 'REFURBISHER';
  const [f, setF] = useState({
    type: refurbisher ? 'CLEANING' : 'STORAGE',
    note: '',
    cost: 0,
  });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api(`/items/${item.id}/work-logs`, { body: f });
      toast('作业已登记');
      onDone();
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`登记作业 · ${item.title}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn gray" onClick={onClose}>取消</button>
          <button className="btn" disabled={busy} onClick={submit}>保存</button>
        </>
      }
    >
      <Field label="作业类型">
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          {Object.entries(WORK_LOG_TYPE)
            .filter(([k]) => role === 'REFURBISHER'
              ? ['CLEANING', 'REPAINT', 'REPAIR'].includes(k)
              : ['STORAGE', 'PHOTOGRAPHY', 'LISTING_COPY', 'CLEANING'].includes(k))
            .map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label={f.type === 'STORAGE' ? '库位编号（如 A-03-12）' : '作业说明'}>
        <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </Field>
      {f.type !== 'STORAGE' && (
        <Field label="费用（元，将计入结算）">
          <input type="number" min={0} value={f.cost} onChange={(e) => setF({ ...f, cost: +e.target.value })} />
        </Field>
      )}
    </Modal>
  );
}

function AdvanceModal({ item, onClose, onDone }: { item: any; onClose: () => void; onDone: () => void }) {
  const isPreparing = item.status === 'PREPARING';
  const [f, setF] = useState({
    description: item.description || '',
    photos: (item.photos || []).join(','),
    warehouseSlot: item.warehouseSlot || '',
    deliveryRadiusKm: item.deliveryRadiusKm,
    listedPrice: Number(item.listedPrice),
    shootLighting: item.shootLighting || '',
    rawPhotos: (item.rawPhotos || []).join(','),
    retouchNote: item.retouchNote || '',
    colorNotice: !!item.colorNotice,
    listedColor: item.listedColor || '',
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      if (isPreparing) {
        await api(`/items/${item.id}/advance`, { body: { to: 'PHOTOGRAPHY' } });
        toast('已进入拍照环节');
      } else {
        await api(`/items/${item.id}/advance`, {
          body: {
            to: 'LISTED',
            description: f.description,
            photos: f.photos ? f.photos.split(/[,，\s]+/).filter(Boolean) : [],
            warehouseSlot: f.warehouseSlot,
            deliveryRadiusKm: Number(f.deliveryRadiusKm),
            listedPrice: Number(f.listedPrice),
            shootLighting: f.shootLighting,
            rawPhotos: f.rawPhotos ? f.rawPhotos.split(/[,，\s]+/).filter(Boolean) : [],
            retouchNote: f.retouchNote,
            colorNotice: f.colorNotice,
            listedColor: f.listedColor,
          },
        });
        toast('商品已上架');
      }
      onDone();
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  if (isPreparing) {
    return (
      <Modal
        title="确认清洁翻新完成"
        onClose={onClose}
        footer={
          <>
            <button className="btn gray" onClick={onClose}>取消</button>
            <button className="btn" disabled={busy} onClick={submit}>进入拍照环节</button>
          </>
        }
      >
        <div className="banner info">
          已累计清洁费 <Money v={item.cleaningCost} />、翻新费 <Money v={item.refurbishCost} />。
          若翻新成本明显超出估价师预估，可先在协同工单中发起「翻新成本超预期」协商。
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      wide
      title={item.status === 'RETURNED' ? '退货返仓 · 复检后重新上架' : '完善拍照与上架描述'}
      onClose={onClose}
      footer={
        <>
          <button className="btn gray" onClick={onClose}>取消</button>
          <button className="btn" disabled={busy} onClick={submit}>确认上架</button>
        </>
      }
    >
      <div className="row2">
        <Field label="库位编号">
          <input value={f.warehouseSlot} onChange={(e) => setF({ ...f, warehouseSlot: e.target.value })} />
        </Field>
        <Field label="可配送范围（公里，0=仅同城自提）">
          <input type="number" min={0} value={f.deliveryRadiusKm} onChange={(e) => setF({ ...f, deliveryRadiusKm: +e.target.value })} />
        </Field>
        <Field label="挂牌价（元）">
          <input type="number" value={f.listedPrice} onChange={(e) => setF({ ...f, listedPrice: +e.target.value })} />
        </Field>
        <Field label="页面标注颜色（如 橡木本色/偏暖白）">
          <input value={f.listedColor} onChange={(e) => setF({ ...f, listedColor: e.target.value })} />
        </Field>
        <Field label="成片链接（逗号分隔）">
          <input value={f.photos} onChange={(e) => setF({ ...f, photos: e.target.value })} />
        </Field>
        <Field label="未修原图链接（逗号分隔，色差取证留存）">
          <input value={f.rawPhotos} onChange={(e) => setF({ ...f, rawPhotos: e.target.value })} />
        </Field>
      </div>
      <div className="row2">
        <Field label="拍摄灯光条件（自然光/时间朝向，或灯光色温）">
          <input value={f.shootLighting} onChange={(e) => setF({ ...f, shootLighting: e.target.value })} placeholder="如：自然光 上午10点 北向窗 / 影室闪光灯5500K" />
        </Field>
        <Field label="修图记录（白平衡/饱和度等处理）">
          <input value={f.retouchNote} onChange={(e) => setF({ ...f, retouchNote: e.target.value })} placeholder="如：仅校正白平衡，未调整饱和度" />
        </Field>
      </div>
      <label className="checkline" style={{ margin: '4px 0 10px' }}>
        <input
          type="checkbox"
          checked={f.colorNotice}
          onChange={(e) => setF({ ...f, colorNotice: e.target.checked })}
        />
        页面已显著标注「不同光线/屏幕下可能存在色差」提示（摄影规范必填）
      </label>
      <Field label="上架描述（成色、尺寸、通道/电梯适配提示等）">
        <textarea style={{ minHeight: 110 }} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })}
          placeholder="建议写明：实际成色与颜色、已完成的清洁翻新、最小通道/电梯尺寸要求、是否可拆装" />
      </Field>
    </Modal>
  );
}

function ReturnInspectionModal({ item, onClose, onDone }: { item: any; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({
    residualValue: item.residualValue != null ? Number(item.residualValue) : Math.round(Number(item.listedPrice) * 0.8),
    returnStorageFee: Number(item.returnStorageFee || 0),
    relistEligible: item.relistEligible !== false,
    note: item.returnInspectionNote || '',
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api(`/items/${item.id}/return-inspection`, {
        body: {
          residualValue: Number(f.residualValue),
          returnStorageFee: Number(f.returnStorageFee),
          relistEligible: f.relistEligible,
          note: f.note,
        },
      });
      toast('回库复检已登记，订单解除结算暂缓');
      onDone();
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      title={`退货回库复检 · ${item.title}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn gray" onClick={onClose}>取消</button>
          <button className="btn" disabled={busy} onClick={submit}>保存复检结论</button>
        </>
      }
    >
      <div className="banner warn">
        售后退货成立后卖家结算暂缓。回库复检残值、返程/复检仓储费与二次上架结论，
        是恢复结算与决定家具去向的依据。
      </div>
      {item.photoStandardFlag === 'NEEDS_REMEDY' && (
        <div className="banner risk">
          该商品存在摄影规范整改项：{item.photoRemedyNote || '需重新拍照并修正颜色描述'}。
          复检后即使可二次上架，也须先完成「摄影整改重拍」。
        </div>
      )}
      <div className="row2">
        <Field label="评估残值（元）">
          <input type="number" min={0} value={f.residualValue} onChange={(e) => setF({ ...f, residualValue: +e.target.value })} />
        </Field>
        <Field label="返程/复检额外仓储费（元）">
          <input type="number" min={0} value={f.returnStorageFee} onChange={(e) => setF({ ...f, returnStorageFee: +e.target.value })} />
        </Field>
      </div>
      <label className="checkline" style={{ margin: '4px 0 10px' }}>
        <input
          type="checkbox"
          checked={f.relistEligible}
          onChange={(e) => setF({ ...f, relistEligible: e.target.checked })}
        />
        成色完好、可二次上架（不可上架则按残值处置/终止寄卖）
      </label>
      <Field label="复检备注（成色、包装、磕碰、残值依据）">
        <textarea style={{ minHeight: 90 }} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })}
          placeholder="如：包装完整无磕碰，仅买家家中摆放两天；按原价 8 折评估残值" />
      </Field>
    </Modal>
  );
}

function PhotoRemedyModal({ item, onClose, onDone }: { item: any; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({
    photos: (item.photos || []).join(','),
    rawPhotos: (item.rawPhotos || []).join(','),
    shootLighting: item.shootLighting || '',
    retouchNote: item.retouchNote || '',
    listedColor: item.listedColor || '',
    description: item.description || '',
    note: '',
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api(`/items/${item.id}/photo-remedy`, {
        body: {
          photos: f.photos ? f.photos.split(/[,，\s]+/).filter(Boolean) : [],
          rawPhotos: f.rawPhotos ? f.rawPhotos.split(/[,，\s]+/).filter(Boolean) : [],
          shootLighting: f.shootLighting,
          retouchNote: f.retouchNote,
          listedColor: f.listedColor,
          description: f.description,
          note: f.note,
          colorNotice: true,
        },
      });
      toast('摄影规范整改完成，商品可重新上架');
      onDone();
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      title={`摄影规范整改重拍 · ${item.title}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn gray" onClick={onClose}>取消</button>
          <button className="btn" disabled={busy} onClick={submit}>完成整改</button>
        </>
      }
    >
      <div className="banner risk">整改要求：{item.photoRemedyNote || '标准光线下重拍、附原图、修正颜色描述并标注色差提示'}</div>
      <div className="row2">
        <Field label="重拍成片链接（逗号分隔）">
          <input value={f.photos} onChange={(e) => setF({ ...f, photos: e.target.value })} />
        </Field>
        <Field label="未修原图链接（逗号分隔）">
          <input value={f.rawPhotos} onChange={(e) => setF({ ...f, rawPhotos: e.target.value })} />
        </Field>
        <Field label="拍摄灯光条件">
          <input value={f.shootLighting} onChange={(e) => setF({ ...f, shootLighting: e.target.value })} placeholder="如：自然光 上午10点 北向窗" />
        </Field>
        <Field label="修图记录">
          <input value={f.retouchNote} onChange={(e) => setF({ ...f, retouchNote: e.target.value })} placeholder="如：仅校正曝光，未改色" />
        </Field>
        <Field label="修正后页面颜色标注">
          <input value={f.listedColor} onChange={(e) => setF({ ...f, listedColor: e.target.value })} />
        </Field>
      </div>
      <Field label="修正后页面描述（需显著包含色差提示）">
        <textarea style={{ minHeight: 100 }} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>
      <Field label="整改备注">
        <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </Field>
    </Modal>
  );
}
