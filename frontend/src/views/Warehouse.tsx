import { useEffect, useState } from 'react';
import { api, AuthUser } from '../api';
import {
  Badge, Modal, Field, Money, Empty, toast,
} from '../ui';
import { CATEGORY, ITEM_STATUS, WORK_LOG_TYPE } from '../labels';
import { ConsignmentDetail } from './ConsignmentDetail';

const FILTERS = ['PREPARING', 'PHOTOGRAPHY', 'LISTED', 'RESERVED', 'RETURNED'] as const;

export function WarehouseView({ user }: { user: AuthUser }) {
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>('PREPARING');
  const [workFor, setWorkFor] = useState<any>(null);
  const [advanceFor, setAdvanceFor] = useState<any>(null);
  const [photoFor, setPhotoFor] = useState<any>(null);
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
              : '管理库位、拍照与上架描述；退货返仓商品可检查后重新上架'}
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
                  <th>商品</th><th>品类</th><th>状态</th><th>位置/库位</th>
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
                      {['PHOTOGRAPHY', 'LISTED', 'RETURNED'].includes(it.status) && (
                        <button className="btn ghost sm" style={{ marginRight: 4 }} onClick={() => setPhotoFor(it)}>摄影档案</button>
                      )}
                      {it.status === 'PREPARING' && (
                        <button className="btn sm" onClick={() => setAdvanceFor(it)}>清洁完成→拍照</button>
                      )}
                      {it.status === 'PHOTOGRAPHY' && (
                        <button className="btn sm" onClick={() => setAdvanceFor(it)}>完善信息→上架</button>
                      )}
                      {it.status === 'RETURNED' && (
                        <button className="btn sm" onClick={() => setAdvanceFor(it)}>返仓复检→重新上架</button>
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
      {photoFor && (
        <PhotoAuditModal
          item={photoFor}
          onClose={() => setPhotoFor(null)}
          onDone={() => { setPhotoFor(null); load(); }}
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
        <Field label="照片链接（逗号分隔）">
          <input value={f.photos} onChange={(e) => setF({ ...f, photos: e.target.value })} />
        </Field>
      </div>
      <Field label="上架描述（成色、尺寸、通道/电梯适配提示等）">
        <textarea style={{ minHeight: 110 }} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })}
          placeholder="建议写明：实际成色、已完成的清洁翻新、最小通道/电梯尺寸要求、是否可拆装" />
      </Field>
    </Modal>
  );
}

/** 摄影档案登记：拍摄灯光、原图、修图记录、页面色差提示——色差争议的核心证据 */
function PhotoAuditModal({ item, onClose, onDone }: { item: any; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/items/${item.id}`).then((d: any) => {
      const a = d.photoAudit;
      setF({
        lightingSetup: a?.lightingSetup || '',
        cameraSetup: a?.cameraSetup || '',
        rawPhotos: (a?.rawPhotos || []).join(','),
        editedPhotos: (a?.editedPhotos || (d.item.photos || [])).join(','),
        retouchNote: a?.retouchNote || '',
        colorNoticeOnPage: a?.colorNoticeOnPage ?? true,
        colorNoticeText: a?.colorNoticeText || '木质/漆面家具在暖光与自然光下颜色会有轻微差异，属正常现象，介意者慎拍',
        colorReference: a?.colorReference || '',
      });
    });
  }, [item.id]);

  if (!f) return null;
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  const submit = async () => {
    setBusy(true);
    try {
      await api(`/items/${item.id}/photo-audit`, {
        body: {
          lightingSetup: f.lightingSetup,
          cameraSetup: f.cameraSetup,
          rawPhotos: f.rawPhotos ? f.rawPhotos.split(/[,，\s]+/).filter(Boolean) : [],
          editedPhotos: f.editedPhotos ? f.editedPhotos.split(/[,，\s]+/).filter(Boolean) : [],
          retouchNote: f.retouchNote,
          colorNoticeOnPage: !!f.colorNoticeOnPage,
          colorNoticeText: f.colorNoticeText,
          colorReference: f.colorReference,
        },
      });
      toast('摄影档案已保存，色差争议时客服将据此核对');
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
      title={`摄影档案 · ${item.title}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn gray" onClick={onClose}>取消</button>
          <button className="btn" disabled={busy} onClick={submit}>保存档案</button>
        </>
      }
    >
      <div className="banner warn">
        规范要求：5000-5500K 标准日光 + 灰卡/色卡校准；留存自然光与暖光原图；
        修图仅允许曝光/裁切，饱和度与色温调整不超过 ±5%；页面须标注色差提示。
        若发生色差争议，平台将依据本档案认定责任。
      </div>
      <div className="row2">
        <Field label="拍摄灯光布置">
          <input value={f.lightingSetup} onChange={(e) => set('lightingSetup', e.target.value)} placeholder="如 5500K 灯箱 + 左侧窗光" />
        </Field>
        <Field label="设备 / 白平衡参数">
          <input value={f.cameraSetup} onChange={(e) => set('cameraSetup', e.target.value)} placeholder="如 索尼A7M4 / 白平衡5300K，灰卡校准" />
        </Field>
        <Field label="色卡 / 材质色号基准">
          <input value={f.colorReference} onChange={(e) => set('colorReference', e.target.value)} placeholder="如 NCS S 4010-Y30R" />
        </Field>
        <Field label="原图（未修）链接，逗号分隔">
          <input value={f.rawPhotos} onChange={(e) => set('rawPhotos', e.target.value)} />
        </Field>
        <Field label="修图后页面照片链接，逗号分隔">
          <input value={f.editedPhotos} onChange={(e) => set('editedPhotos', e.target.value)} />
        </Field>
      </div>
      <Field label="修图记录（调色项与幅度，需留档可核对）">
        <textarea style={{ minHeight: 70 }} value={f.retouchNote} onChange={(e) => set('retouchNote', e.target.value)}
          placeholder="如：曝光+0.2、裁切；未调整饱和度与色温" />
      </Field>
      <label className="checkline" style={{ marginBottom: 8 }}>
        <input type="checkbox" checked={!!f.colorNoticeOnPage} onChange={(e) => set('colorNoticeOnPage', e.target.checked)} />
        页面已展示色差提示（未提示时，色差争议将倾向认定页面描述不准确）
      </label>
      <Field label="页面色差提示原文">
        <textarea style={{ minHeight: 50 }} value={f.colorNoticeText} onChange={(e) => set('colorNoticeText', e.target.value)} />
      </Field>
    </Modal>
  );
}
