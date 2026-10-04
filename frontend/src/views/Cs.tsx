import { useEffect, useState } from 'react';
import { api } from '../api';
import {
  Badge, Money, Empty, toast,
} from '../ui';
import {
  TICKET_TYPE, TICKET_STATUS, RESOLUTION, ORDER_STATUS, SETTLEMENT_TYPE, CATEGORY,
} from '../labels';
import { TicketDetail } from './TicketDetail';

export function CsView({ mode }: { mode: 'tickets' | 'settlements' }) {
  return mode === 'tickets' ? <TicketList /> : <SettlementList />;
}

function TicketList() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState('OPEN');

  const load = () => {
    api('/tickets').then(setTickets);
  };
  useEffect(() => {
    load();
  }, []);

  if (openId) return <TicketDetail id={openId} onBack={() => { setOpenId(null); load(); }} />;

  const shown = tickets.filter((t) => (filter === 'ALL' ? true : t.status === filter));

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>协同工单</h2>
          <div className="sub">卖家、买家、仓库、翻新师、配送、客服围绕同一件家具处理；裁定结论联动订单与结算</div>
        </div>
      </div>
      <div className="pill-filter">
        {[['OPEN', '处理中'], ['RESOLVED', '已裁定'], ['CLOSED', '已关闭'], ['ALL', '全部']].map(([k, v]) => (
          <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{v}</button>
        ))}
      </div>
      {shown.length === 0 ? (
        <Empty text="暂无工单" />
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>类型</th><th>标题</th><th>状态</th><th>处理结论</th><th>责任方</th><th>赔付</th><th>时间</th><th></th></tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.id}>
                    <td>{TICKET_TYPE[t.type]}</td>
                    <td>{t.title}</td>
                    <td><Badge map={TICKET_STATUS} value={t.status} /></td>
                    <td className="muted">{RESOLUTION[t.resolution]}</td>
                    <td>{t.liableParty}</td>
                    <td>{Number(t.compensationAmount) > 0 ? <Money v={t.compensationAmount} className="money-out" /> : '-'}</td>
                    <td className="muted">{new Date(t.createdAt).toLocaleDateString()}</td>
                    <td><button className="btn sm" onClick={() => setOpenId(t.id)}>进入处理</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SettlementList() {
  const [orders, setOrders] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<Record<string, any>>({});
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    const os = await api('/orders');
    setOrders(os);
    setItems(await api('/items'));
    const map: Record<string, any> = {};
    await Promise.all(
      os.map(async (o: any) => {
        try {
          map[o.id] = await api(`/settlements/order/${o.id}`);
        } catch { /* 未结算 */ }
      }),
    );
    setSettlements(map);
  };
  useEffect(() => {
    load();
  }, []);

  const settle = async (orderId: string) => {
    try {
      await api(`/settlements/order/${orderId}/generate`);
      toast('结算单已生成');
      load();
    } catch (e: any) {
      toast(e.message, true);
    }
  };

  if (openId) return <SettlementDetail orderId={openId} onBack={() => { setOpenId(null); load(); }} />;

  const itemMap = new Map(items.map((i: any) => [i.id, i]));

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>结算管理</h2>
          <div className="sub">订单送达或退货完结后生成结算单；成交价、佣金、翻新费、仓储费、配送费、赔付均有来源</div>
        </div>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>订单</th><th>商品</th><th>成交价</th><th>订单状态</th><th>卖家应得</th><th>平台净收入</th><th></th></tr>
            </thead>
            <tbody>
              {orders.length === 0 && <tr><td colSpan={7}><Empty text="暂无订单" /></td></tr>}
              {orders.map((o) => {
                const s = settlements[o.id];
                const it = itemMap.get(o.itemId);
                return (
                  <tr key={o.id}>
                    <td>{o.code}</td>
                    <td>{it ? `${CATEGORY[it.category]} · ${it.title}` : '-'}</td>
                    <td><Money v={o.dealPrice} /></td>
                    <td><Badge map={ORDER_STATUS} value={o.status} /></td>
                    <td>{s ? <Money v={s.settlement.sellerPayout} className="money-in" /> : '-'}</td>
                    <td>{s ? <Money v={s.settlement.platformIncome} /> : '-'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {s ? (
                        <button className="btn ghost sm" onClick={() => setOpenId(o.id)}>查看明细</button>
                      ) : ['DELIVERED', 'RETURNED'].includes(o.status) ? (
                        <button className="btn sm" onClick={() => settle(o.id)}>生成结算单</button>
                      ) : o.status === 'RETURNING' ? (
                        <span className="badge amber" title="售后退货已成立，家具回库评估残值/仓储费/二次上架后，卖家结算解除暂缓">退货回库评估中·结算暂缓</span>
                      ) : (
                        <span className="muted">未到结算节点</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SettlementDetail({ orderId, onBack }: { orderId: string; onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    api(`/settlements/order/${orderId}`).then(setData);
  }, [orderId]);
  if (!data) return <div className="empty">加载中…</div>;
  const { settlement, entries } = data;
  return (
    <div>
      <div className="page-head">
        <div>
          <button className="btn ghost sm" onClick={onBack}>← 返回</button>
          <h2 style={{ marginTop: 10 }}>结算单明细</h2>
        </div>
      </div>
      <div className="grid grid-2" style={{ marginBottom: 14 }}>
        <div className="card stat">
          <div className="l">卖家最终应得</div>
          <div className="v money-in"><Money v={settlement.sellerPayout} /></div>
        </div>
        <div className="card stat">
          <div className="l">平台净收入</div>
          <div className="v"><Money v={settlement.platformIncome} /></div>
        </div>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th style={{ width: 140 }}>项目</th><th>金额</th><th>来源说明</th></tr></thead>
            <tbody>
              {entries.map((e: any) => (
                <tr key={e.id}>
                  <td><b>{SETTLEMENT_TYPE[e.type]}</b></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Money v={e.amount} className={['SELLER_PAYOUT', 'COMPENSATION'].includes(e.type) ? 'money-out' : e.type === 'DEAL_PRICE' ? '' : ''} />
                  </td>
                  <td className="muted">{e.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
