import React, { useEffect, useMemo, useState } from "react";

/* ==========================================================
 🏀 重構 2/3：
 4) 顏色工具合併（colorScale） + 與舊 API 相容（colorMono/colorDiverge 作為薄包裝）
 5) 抽出重複 Tailwind class（cls 常數）+ 小元件 Btn/BtnSm/FileLabel/SectionCard
 - 不變：UI/資料行為、CSV 匯入/追加/下載、Preset/LocalStorage 流程、測試。
 - 保留：DataTable（columns 驅動）、calcStats(players)、cmp 比較器。
========================================================== */

// --- 基本資料：30 隊 ---
const TEAMS = [
  { abbr: "ATL", nameZh: "老鷹", conf: "East" },
  { abbr: "BOS", nameZh: "塞爾提克", conf: "East" },
  { abbr: "BKN", nameZh: "籃網", conf: "East" },
  { abbr: "CHA", nameZh: "黃蜂", conf: "East" },
  { abbr: "CHI", nameZh: "公牛", conf: "East" },
  { abbr: "CLE", nameZh: "騎士", conf: "East" },
  { abbr: "DET", nameZh: "活塞", conf: "East" },
  { abbr: "IND", nameZh: "溜馬", conf: "East" },
  { abbr: "MIA", nameZh: "熱火", conf: "East" },
  { abbr: "MIL", nameZh: "公鹿", conf: "East" },
  { abbr: "NYK", nameZh: "尼克", conf: "East" },
  { abbr: "ORL", nameZh: "魔術", conf: "East" },
  { abbr: "PHI", nameZh: "七六人", conf: "East" },
  { abbr: "TOR", nameZh: "暴龍", conf: "East" },
  { abbr: "WAS", nameZh: "巫師", conf: "East" },
  { abbr: "DAL", nameZh: "獨行俠", conf: "West" },
  { abbr: "DEN", nameZh: "金塊", conf: "West" },
  { abbr: "GSW", nameZh: "勇士", conf: "West" },
  { abbr: "HOU", nameZh: "火箭", conf: "West" },
  { abbr: "LAC", nameZh: "快艇", conf: "West" },
  { abbr: "LAL", nameZh: "湖人", conf: "West" },
  { abbr: "MEM", nameZh: "灰熊", conf: "West" },
  { abbr: "MIN", nameZh: "灰狼", conf: "West" },
  { abbr: "NOP", nameZh: "鵜鶘", conf: "West" },
  { abbr: "OKC", nameZh: "雷霆", conf: "West" },
  { abbr: "PHX", nameZh: "太陽", conf: "West" },
  { abbr: "POR", nameZh: "拓荒者", conf: "West" },
  { abbr: "SAC", nameZh: "國王", conf: "West" },
  { abbr: "SAS", nameZh: "馬刺", conf: "West" },
  { abbr: "UTA", nameZh: "爵士", conf: "West" },
];
const EAST = TEAMS.filter(t=>t.conf==='East').sort((a,b)=>a.abbr.localeCompare(b.abbr));
const WEST = TEAMS.filter(t=>t.conf==='West').sort((a,b)=>a.abbr.localeCompare(b.abbr));

// --- 儲存鍵名/旗標 ---
const STORAGE_KEY = "nba_tabs_app_v1";
const PRESET_FLAG_KEY = "nba_preset_loaded_v1"; // 避免重覆載入
const QS = (typeof window!=="undefined")? new URLSearchParams(window.location.search): null;
const FORCE_PRESET = !!(QS && (QS.get('preset')==='1' || QS.get('reset')==='1'));

// --- Preset URL（避免 import.meta） ---
function getPresetURL(){
  try{ if(typeof document!=="undefined"){ const baseHref=document.querySelector('base')?.getAttribute('href')||'/'; const base=baseHref.endsWith('/')?baseHref:baseHref+'/'; return base+"data/preset.json"; } }catch{}
  try{ if(typeof location!=="undefined"){ const dir=location.pathname.endsWith('/')?location.pathname:location.pathname.replace(/[^/]+$/,''); return `${dir}data/preset.json`; } }catch{}
  return '/data/preset.json';
}

// --- 小工具 ---
const newId = ()=> (typeof crypto!=='undefined' && crypto.randomUUID? crypto.randomUUID(): `id-${Math.random().toString(36).slice(2)}`);
function fmtMoney(n){ if(n==null||n==='') return ''; const v=Math.round(Number(n)||0); const a=Math.abs(v).toLocaleString(); return v<0?`-$${a}`:`$${a}`; }
function parseMoney(s){
  if (typeof s === 'number') return s;
  let str = String(s || '').trim();
  const negParen = /^\(.*\)$/.test(str);
  // 正規化：各種 Unicode 減號 → '-'
  str = str.replace(/[−–—]/g, '-');
  // 僅保留數字/正負號/小數點/千分位逗號，其餘（貨幣符號、字母）去除
  str = str.replace(/[^0-9+\-\.,]/g, '');
  // 去掉千分位
  str = str.replace(/,/g, '');
  let num = Number(str || 0);
  if (negParen) num = -Math.abs(num);
  return isFinite(num) ? num : 0;
}
async function readFileAsText(file){
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  try {
    // 簡化：僅支援 UTF-8 與 BOM 標示的 UTF-16（LE/BE），否則一律以 UTF-8 解碼
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes);
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes);
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    try { return new TextDecoder('utf-8').decode(bytes); } catch { return ''; }
  }

}
function readFileAsDataURL(file){ return new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(file); }); }

// --- CSV ---
function parseCSV(csv){ const rows=[]; let i=0,cur='',row=[],q=false,s=String(csv); while(i<s.length){ const ch=s[i++]; if(ch==='"'){ if(q && s[i]=='"'){ cur+='"'; i++; } else q=!q; } else if(ch===',' && !q){ row.push(cur); cur=''; } else if((ch==='\n'||ch==='\r') && !q){ if(cur.length||row.length){ row.push(cur); rows.push(row);} cur=''; row=[]; if(ch==='\r'&&s[i]==='\n') i++; } else cur+=ch; } if(cur.length||row.length){ row.push(cur); rows.push(row); } return rows; }

// ==========================================================
// ✅ 4) 顏色工具合併：單一 colorScale + 相容包裝
// ==========================================================
function hexToRGBA(hex,a){ const h=(hex||'').replace('#',''); const r=parseInt(h.slice(0,2),16)||0; const g=parseInt(h.slice(2,4),16)||0; const b=parseInt(h.slice(4,6),16)||0; const aa=Math.max(0,Math.min(1,a)); return `rgba(${r}, ${g}, ${b}, ${aa})`; }
function colorScale({v,min,max,mode='mono',pos='#09734E',neg='#7D2C2D'}){
  if(v==null||isNaN(v)||min==null||max==null) return 'transparent';
  if(mode==='mono'){
    if(max<=min) return 'transparent';
    const t=(v-min)/(max-min);
    return hexToRGBA(pos, Math.max(0,Math.min(1,t)));
  }
  // diverging
  const pr=Math.max(0,max); const nr=Math.abs(Math.min(0,min));
  if(v===0 || (pr===0 && nr===0)) return 'transparent';
  const a = v>0 ? (pr? Math.min(1, v/pr):0) : (nr? Math.min(1, Math.abs(v)/nr):0);
  return hexToRGBA(v>0?pos:neg, a);
}
// 舊 API 相容（測試仍使用這兩個函式）
const colorMono     = (v,min,max,hex="#09734E")=> colorScale({v,min,max,mode:'mono',pos:hex});
const colorDiverge  = (v,min,max,pos="#09734E",neg="#7D2C2D")=> colorScale({v,min,max,mode:'div',pos,neg});

// --- 商業邏輯 ---
const salaryDiff = (p)=> (Number(p?.評估薪水)||0) - (Number(p?.真實薪水)||0);
function csvToPlayers(text){ const rows=parseCSV(text); if(!rows.length) return []; const h=rows[0], ix=n=>h.indexOf(n);
  const iR=ix('Rank'), iP=ix('PLAYER'), iT=ix('TEAM'), iPos=ix('POS'), iPos2=(ix("POS'")!==-1?ix("POS'"):ix('POS2')),
        iRt=ix('評分'), iPr=ix('上季評分'), iDl=ix('本季增減'), iRe=ix('真實薪水'), iEs=ix('評估薪水'), iDf=ix('差額');
  const out=[]; for(let r=1;r<rows.length;r++){ const row=rows[r]; if(!row||row.every(x=>!x||!String(x).trim())) continue; const real=iRe>=0?parseMoney(row[iRe]):0; const est=iEs>=0?parseMoney(row[iEs]):0; out.push({ id:newId(), Rank:iR>=0?Number(row[iR])||0:undefined, PLAYER:iP>=0?row[iP]:'', TEAM:iT>=0?String(row[iT]||'').toUpperCase():'', POS:iPos>=0?row[iPos]:'', POS2:iPos2>=0?row[iPos2]:'', 評分:iRt>=0?Number(row[iRt])||0:0, 上季評分:iPr>=0?Number(row[iPr])||0:undefined, 本季增減:iDl>=0?Number(row[iDl])||0:undefined, 真實薪水:real, 評估薪水:est, 差額:iDf>=0?Number(parseMoney(row[iDf])):est-real, cardImage:null }); }
  return out; }
function playersToCSV(list){ const H=["Rank","PLAYER","TEAM","POS","POS'","評分","上季評分","本季增減","真實薪水","評估薪水","差額"], esc=v=>{ const s=String(v??''); return (s.includes(',')||s.includes('\n')||s.includes('"'))?('"'+s.replace(/"/g,'""')+'"'):s; }; const lines=[H.join(',')]; for(const p of list){ const d=salaryDiff(p); lines.push([esc(p.Rank),esc(p.PLAYER),esc(p.TEAM),esc(p.POS),esc(p.POS2),p.評分??'',p.上季評分??'',p.本季增減??'',p.真實薪水,p.評估薪水,d].join(',')); } return lines.join('\n'); }

// ==========================================================
// ✅ 2) 單一 calcStats（一次算全體，供所有表用）
// ==========================================================
function calcStats(players){
  const monoCols=['評分','上季評分','真實薪水','評估薪水'];
  const divCols=['本季增減','差額'];
  const mono=Object.fromEntries(monoCols.map(c=>[c,{min:Infinity,max:-Infinity}]));
  const div =Object.fromEntries(divCols.map(c=>[c,{min:Infinity,max:-Infinity}]));
  for(const p of players||[]){
    for(const c of monoCols){ const v=Number(c==='真實薪水'?p['真實薪水']: c==='評估薪水'?p['評估薪水']: p[c]); if(!isFinite(v)) continue; mono[c].min=Math.min(mono[c].min,v); mono[c].max=Math.max(mono[c].max,v); }
    const d=salaryDiff(p); if(isFinite(d)){ div['差額'].min=Math.min(div['差額'].min,d); div['差額'].max=Math.max(div['差額'].max,d); }
    const del=Number(p['本季增減']); if(isFinite(del)){ div['本季增減'].min=Math.min(div['本季增減'].min,del); div['本季增減'].max=Math.max(div['本季增減'].max,del); }
  }
  for(const c of Object.keys(mono)) if(mono[c].min===Infinity) mono[c]={min:0,max:1};
  for(const c of Object.keys(div))  if(div[c].min===Infinity)  div[c]={min:-1,max:1};
  return {mono,div};
}

// ==========================================================
// ✅ 3) 統一比較器（數字/字串）
// ==========================================================
function cmp(a,b,asc){ const dir=asc?1:-1; if(typeof a==='number' && typeof b==='number') return (a-b)*dir; return String(a??'').localeCompare(String(b??''))*dir; }

// ==========================================================
// ✅ 5) 抽 Tailwind class + 小元件
// ==========================================================
const cls={
  btn: "px-3 py-2 rounded-xl border text-base bg-zinc-900 text-zinc-100 border-zinc-700 shadow-sm",
  btnSm: "px-3 py-2 rounded-xl border text-sm bg-zinc-900 text-zinc-100 border-zinc-700 shadow-sm",
  th: "p-3 text-lg",
  thClickable: "p-3 cursor-pointer select-none text-lg",
  td: "p-3",
  card: "rounded-2xl border border-zinc-700 bg-zinc-900 p-4 shadow-sm text-base",
  tabBtn: "px-4 py-2 rounded-xl border text-base shadow-sm mr-2",
  tabActive: "bg-blue-600 text-white border-blue-600",
  tabInactive: "bg-zinc-900 text-zinc-100 border-zinc-700 hover:bg-zinc-800",
};
const Btn    = ({className='',...props})=> <button {...props} className={`${cls.btn} ${className}`} />;
const BtnSm  = ({className='',...props})=> <button {...props} className={`${cls.btnSm} ${className}`} />;
const FileLabel=({children,className='',...inputProps})=> (
  <label className={`${cls.btnSm} cursor-pointer ${className}`}>
    {children}
    <input className="hidden" {...inputProps} />
  </label>
);
const SectionCard=({children})=> <div className={cls.card}>{children}</div>;

// ==========================================================
// UI 元件（通用）
// ==========================================================
function TopTabs({tab,setTab}){
  const TabBtn=({id,label})=> (
    <button onClick={()=>setTab(id)} className={`${cls.tabBtn} ${tab===id? cls.tabActive: cls.tabInactive}`}>{label}</button>
  );
  return (
    <div className="sticky top-0 z-50 bg-zinc-950/80 backdrop-blur border-b border-zinc-800">
      <div className="w-full px-6 py-3 flex items-center">
        <div className="font-bold mr-4">🏀 NBA 2025 Player Rating</div>
        <TabBtn id="Team" label="Team 球隊" />
        <TabBtn id="Player" label="Player 球員" />
        <TabBtn id="Predict" label="Predict 季前預測" />
        <div className="ml-auto text-xs text-zinc-400">資料儲存於本機瀏覽器（深色）</div>
      </div>
    </div>
  );
}
function Section({title,right,children}){
  return (
    <div className="my-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xl font-semibold">{title}</h3>
        <div>{right}</div>
      </div>
      <SectionCard>{children}</SectionCard>
    </div>
  );
}
function DownloadBtn({name,text}){
  return (
    <Btn onClick={()=>{ const blob=new Blob([text],{type:'text/plain;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); }}>下載</Btn>
  );
}

// ==========================================================
// ✅ 通用 DataTable（columns 驅動）
// columns: { key,label, sort:'num'|'str'|null, src?, compute?, color:'mono'|'div', rangeKey?, fmt?, render? }
// default sort on new key: key==='評分' ? desc(false) : asc(true)
// ==========================================================
function DataTable({columns, rows, sortKey, sortAsc, onSort, stats, getRowKey}){
  const getColByKey = useMemo(()=> Object.fromEntries(columns.map(c=>[c.key,c])), [columns]);
  const getVal = (row, key)=>{
    const col=getColByKey[key]; if(!col) return row?.[key];
    if(col.compute) return col.compute(row);
    if(col.src) return row?.[col.src];
    return row?.[key];
  };
  const sorted = useMemo(()=>{
    const arr=[...rows];
    if(!sortKey) return arr;
    arr.sort((a,b)=> cmp(getVal(a,sortKey), getVal(b,sortKey), sortAsc));
    return arr;
  },[rows,sortKey,sortAsc]);
  // 統一：數字欄位初次點擊→降序；字串欄位→升序
const defaultAsc = (col)=> (col && col.sort==='num') ? false : true;
  const headerCell = (col)=>{
    if(!col.sort) return <th key={col.key} className={cls.th}>{col.label}</th>;
    const active = sortKey===col.key;
    return (
      <th key={col.key} className={cls.thClickable} onClick={()=>{ if(active) onSort(col.key, !sortAsc); else onSort(col.key, defaultAsc(col)); }}>
        <span className="underline decoration-dotted underline-offset-4">{col.label}</span>{' '}{active? (sortAsc?'▲':'▼'):''}
      </th>
    );
  };
  const cellStyle = (col,val)=>{
    if(!col.color) return undefined;
    const key = col.rangeKey || col.key;
    if(col.color==='mono'){ const r=stats?.mono?.[key]; if(!r) return undefined; return {background: colorScale({v:Number(val), min:r.min, max:r.max, mode:'mono'})}; }
    if(col.color==='div'){ const r=stats?.div?.[key];  if(!r) return undefined; return {background: colorScale({v:Number(val), min:r.min, max:r.max, mode:'div'})}; }
    return undefined;
  };
  return (
    <table className="min-w-full text-lg">
      <thead className="sticky top-0 z-10 bg-zinc-900"><tr className="text-left font-semibold border-b border-zinc-700">{columns.map(headerCell)}</tr></thead>
      <tbody>
        {sorted.map(row=> (
          <tr key={getRowKey? getRowKey(row): (row.id||row.key)} className="border-t border-zinc-800">
            {columns.map(col=>{
              const val = getVal(row,col.key);
              const content = col.render? col.render(row,val) : (col.fmt? col.fmt(val): val);
              return <td key={col.key} className={cls.td} style={cellStyle(col,val)}>{content}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ==========================================================
// Player Tab（使用 DataTable）
// ==========================================================
function PlayerTab({app,setApp,goPlayerCard,stats}){
  const players = app?.players || [];
  const [sortKey,setSortKey] = useState('Rank');
  const [sortAsc,setSortAsc] = useState(true);;

  const columns = useMemo(()=>[
    { key:'Rank', label:'Rank', sort:'num' },
    { key:'PLAYER', label:'PLAYER', sort:'str', render:(p)=> (
        <span className="text-blue-400 underline-offset-2 hover:underline cursor-pointer" onClick={()=>goPlayerCard && goPlayerCard(p)}>{p.PLAYER}</span>
      ) },
    { key:'TEAM', label:'TEAM', sort:'str' },
    { key:'POS', label:'POS', sort:'str' },
    { key:"POS'", src:'POS2', label:"POS'", sort:'str' },
    { key:'評分', label:'評分', sort:'num', color:'mono' },
    { key:'上季評分', label:'上季評分', sort:'num', color:'mono' },
    { key:'本季增減', label:'本季增減', sort:'num', color:'div', rangeKey:'本季增減' },
    { key:'真實薪水', label:'真實薪水', sort:'num', color:'mono', fmt:fmtMoney },
    { key:'評估薪水', label:'評估薪水', sort:'num', color:'mono', fmt:fmtMoney },
    { key:'差額', label:'差額', sort:'num', color:'div', rangeKey:'差額', compute:(p)=>salaryDiff(p), fmt:fmtMoney },
  ],[goPlayerCard]);

  async function onImportCSV(file, mode='replace'){
    try{ const text=await readFileAsText(file); const list=csvToPlayers(text); const nextPlayers=(mode==='append')?[...players,...list]:list; const next={...app,players:nextPlayers}; setApp(next); saveApp(next); }
    catch(err){ alert('CSV 匯入失敗：'+(err?.message||err)); }
  }

  return (
    <div className="max-w-[2400px] mx-auto px-6 py-6">
      <Section title="球員表（點欄位可排序）" right={(
        <div className="flex gap-2 flex-wrap items-center">
          <FileLabel accept=".csv,text/csv" onChange={e=> e.target.files?.[0] && onImportCSV(e.target.files[0],'replace')}>匯入 CSV（取代）</FileLabel>
          <FileLabel accept=".csv,text/csv" onChange={e=> e.target.files?.[0] && onImportCSV(e.target.files[0],'append')}>追加 CSV</FileLabel>
          <DownloadBtn name="players.csv" text={playersToCSV(players)} />
        </div>
      )}>
        <div className="overflow-y-scroll max-h-[80vh] pr-2">
          <DataTable columns={columns} rows={players} sortKey={sortKey} sortAsc={sortAsc} onSort={(k,a)=>{setSortKey(k);setSortAsc(a);}} stats={stats} />
        </div>
      </Section>
    </div>
  );
}

// ================= PlayerCard（球員卡） =================
function PlayerCard({app,setApp,player,back,allPlayers,selectPlayer,goTeam,isAdmin}){
  const sameTeamPlayers = useMemo(()=> (allPlayers||[]).filter(x=>x.TEAM===player?.TEAM),[allPlayers,player]);

  // 若 player 無效，顯示回退 UI，避免整頁空白
  if(!player){
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-6 space-y-4">
        <Btn onClick={back}>← 返回球員頁</Btn>
        <div className="text-base text-zinc-400">找不到球員資料（可能資料尚未載入或玩家已被移除）。</div>
      </div>
    );
  }

  // 依 Rank 全域排序，用於上一位/下一位
  const orderedByRank = useMemo(()=>{
    const arr = [...(allPlayers||[])];
    arr.sort((a,b)=>{
      const A = Number(a?.Rank ?? Infinity);
      const B = Number(b?.Rank ?? Infinity);
      if (A===B) return String(a?.PLAYER??'').localeCompare(String(b?.PLAYER??''));
      return A - B;
    });
    return arr;
  },[allPlayers]);
  const indexInRank = useMemo(()=> orderedByRank.findIndex(x=> x?.id===player?.id), [orderedByRank, player?.id]);
  const gotoByOffset = (off)=>{ if(indexInRank<0 || !orderedByRank.length) return; const nextIdx=(indexInRank+off+orderedByRank.length)%orderedByRank.length; const p=orderedByRank[nextIdx]; if(p) selectPlayer(p); };
  async function onUploadCard(file){ const url = await readFileAsDataURL(file); const nextPlayers = (app.players||[]).map(x=> x.id===player.id ? {...x, cardImage:url} : x); const next = {...app, players: nextPlayers}; setApp(next); saveApp(next); const updated = nextPlayers.find(x=>x.id===player.id); if(updated) selectPlayer(updated); }
  return (
    <div className="max-w-[1200px] mx-auto px-6 py-6 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Btn onClick={back}>← 返回球員頁</Btn>
        <Btn onClick={()=>gotoByOffset(-1)}>← 上一位</Btn>
        <Btn onClick={()=>gotoByOffset(1)}>下一位 →</Btn>
        {player?.TEAM && (<Btn onClick={()=>goTeam(player.TEAM)}>← 返回 {player.TEAM}</Btn>)}
        <div className="text-2xl font-bold">{player?.PLAYER}</div>
        <div className="text-base text-zinc-400">{player?.TEAM} · {player?.POS}{player?.POS2?` / ${player.POS2}`:''}</div>
        <div className="ml-auto flex items-center gap-2">
          <select className="px-3 py-2 rounded-xl border bg-zinc-900 text-zinc-100 border-zinc-700" value={player?.id || ''} onChange={e=>{ const p=(allPlayers||[]).find(x=>x.id===e.target.value); if(p) selectPlayer(p); }}>{(allPlayers||[]).map(p=> <option key={p.id} value={p.id}>{p.PLAYER}（{p.TEAM}）</option>)}</select>
          <select className="px-3 py-2 rounded-xl border bg-zinc-900 text-zinc-100 border-zinc-700" value={player?.id || ''} onChange={e=>{ const p=sameTeamPlayers.find(x=>x.id===e.target.value); if(p) selectPlayer(p); }}>{sameTeamPlayers.map(p=> <option key={p.id} value={p.id}>{p.PLAYER}</option>)}</select>
      </div>
      </div>
      <Section title="球員卡圖片" right={isAdmin ? (<FileLabel accept="image/*" onChange={e=> e.target.files?.[0] && onUploadCard(e.target.files[0])}>上傳</FileLabel>): null}>
        {player?.cardImage ? (<div className="overflow-auto border border-zinc-700 rounded-xl p-2" style={{maxHeight:'80vh'}}><img src={player.cardImage} alt="card" className="block max-w-none h-auto" /></div>) : (<div className="text-base text-zinc-400">尚未上傳球員卡圖片（建議直式）。{isAdmin? ' 使用上傳按鈕新增。':''}</div>)}
      </Section>
    </div>
  );
}

// ================= TeamDetail（單隊頁） =================
function TeamDetail({abbr, app, setApp, openPlayerCard, onSwitchTeam, isAdmin, stats}){
  const all = app?.players || [];
  const team = TEAMS.find(t=>t.abbr===abbr) || {abbr, nameZh:'', conf:''};
  const img  = app?.teamImages?.[abbr] || null;
  const teamPlayers = useMemo(()=> all.filter(p=>p.TEAM===abbr),[all,abbr]);

  const [sortKey,setSortKey] = useState('Rank');
  const [sortAsc,setSortAsc] = useState(true);
  const columns = useMemo(()=>[
    { key:'Rank', label:'Rank', sort:'num' },
    { key:'PLAYER', label:'PLAYER', sort:'str', render:(p)=> (<span className="text-blue-400 underline-offset-2 hover:underline cursor-pointer" onClick={()=>openPlayerCard(p)}>{p.PLAYER}</span>) },
    { key:'POS', label:'POS', sort:'str', compute:(p)=> (p.POS + (p.POS2?` / ${p.POS2}`:'')) },
    { key:'評分', label:'評分', sort:'num', color:'mono' },
    { key:'上季評分', label:'上季評分', sort:'num', color:'mono' },
    { key:'本季增減', label:'本季增減', sort:'num', color:'div', rangeKey:'本季增減' },
  ], [openPlayerCard]);

  // 薪資分析表：排序 / 欄位（預設 Rank 升冪 + 可點欄位排序）
  const [saSortKey,setSaSortKey] = useState('Rank');
  const [saSortAsc,setSaSortAsc] = useState(true);
  const salaryColumns = useMemo(()=>[
    { key:'Rank', label:'Rank', sort:'num' },
    { key:'PLAYER', label:'PLAYER', sort:'str', render:(p)=> (<span className="text-blue-400 underline-offset-2 hover:underline cursor-pointer" onClick={()=>openPlayerCard(p)}>{p.PLAYER}</span>) },
    { key:'POS', label:'POS', sort:'str', compute:(p)=> (p.POS + (p.POS2?` / ${p.POS2}`:'')) },
    { key:'評分', label:'評分', sort:'num', color:'mono' },
    { key:'真實薪水', label:'真實薪水', sort:'num', color:'mono', fmt:fmtMoney },
    { key:'評估薪水', label:'評估薪水', sort:'num', color:'mono', fmt:fmtMoney },
    { key:'差額', label:'差額', sort:'num', color:'div', rangeKey:'差額', compute:(p)=>salaryDiff(p), fmt:fmtMoney },
  ],[openPlayerCard]);

  async function onUploadDepth(file){ const url=await readFileAsDataURL(file); const next={...app, teamImages:{...app.teamImages,[abbr]:url}}; setApp(next); saveApp(next); }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Btn onClick={()=>onSwitchTeam('')}>← 返回 30 隊</Btn>
        <div className="text-2xl font-bold">{team.nameZh}（{abbr}）</div>
        <select className="px-3 py-2 rounded-xl border bg-zinc-900 text-zinc-100 border-zinc-700" value={abbr} onChange={e=>onSwitchTeam(e.target.value)}>
          {[...EAST,...WEST].sort((a,b)=>a.abbr.localeCompare(b.abbr)).map(t=> <option key={t.abbr} value={t.abbr}>{t.abbr} - {t.nameZh}</option>)}
        </select>
        <div className="ml-auto text-sm text-zinc-400">分區：{team.conf}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="球隊 Depth Chart" right={isAdmin ? (
          <FileLabel accept="image/*" onChange={e=> e.target.files?.[0] && onUploadDepth(e.target.files[0])}>上傳</FileLabel>
        ) : null}>
          {img ? (
            <div className="border border-zinc-700 rounded-xl p-2 h-[92vh] overflow-auto">
              <img src={img} alt="depth" className="max-w-full h-auto object-contain" />
            </div>
          ) : (
            <div className="text-base text-zinc-400">尚未上傳。建議尺寸：1000×2080（直式）。圖片會依容器寬度縮放，維持比例。</div>
          )}
        </Section>

        <div className="space-y-4">
          <Section title={`球員評分（${abbr}）`}>
            <div className="overflow-auto">
              <DataTable columns={columns} rows={teamPlayers} sortKey={sortKey} sortAsc={sortAsc} onSort={(k,a)=>{setSortKey(k);setSortAsc(a);}} stats={stats} />
            </div>
          </Section>

          <Section title="薪資分析">
            <div className="overflow-auto">
              <DataTable columns={salaryColumns} rows={teamPlayers} sortKey={saSortKey} sortAsc={saSortAsc} onSort={(k,a)=>{setSaSortKey(k);setSaSortAsc(a);}} stats={stats} />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function TeamTab({app,setApp, openPlayerCard, teamAbbr, setTeamAbbr, isAdmin, stats}){
  return (
    <div className="px-6 py-6">
      {!teamAbbr ? (
        <div className="max-w-[1800px] mx-auto">
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
            <Section title="東區（Eastern Conference）"><TeamGrid teams={[...EAST]} onSelect={setTeamAbbr} /></Section>
            <Section title="西區（Western Conference）"><TeamGrid teams={[...WEST]} onSelect={setTeamAbbr} /></Section>
          </div>
        </div>
      ) : (
        <div className="max-w-[2400px] mx-auto">
          <TeamDetail abbr={teamAbbr} app={app} setApp={setApp} openPlayerCard={openPlayerCard} onSwitchTeam={setTeamAbbr} isAdmin={isAdmin} stats={stats} />
        </div>
      )}
    </div>
  );
}

// ==========================================================
// TeamGrid + Predict Tab（排序用 cmp）
// ==========================================================
function TeamGrid({teams,onSelect}){
  return (
    <div className="grid grid-cols-5 gap-3">
      {teams.map(t=> (
        <button key={t.abbr} onClick={()=>onSelect&&onSelect(t.abbr)} className="text-left px-4 py-3 rounded-2xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 transition shadow-sm">
          <div className="text-xl font-bold tracking-wider">{t.abbr}</div>
          <div className="text-sm text-zinc-400 mt-0.5">{t.nameZh}</div>
        </button>
      ))}
    </div>
  );
}
function PredictTab({app,setApp}){
  const predictLine=app?.predictLine||{}; const predictOpt=app?.predictOpt||{}; const predictPes=app?.predictPes||{};
  const setLine=(abbr,val)=>{ const v=Number(val)||0; const next={...app,predictLine:{...predictLine,[abbr]:v}}; setApp(next); saveApp(next); };
  const setOpt =(abbr,val)=>{ const v=Number(val)||0; const next={...app,predictOpt :{...predictOpt ,[abbr]:v}}; setApp(next); saveApp(next); };
  const setPes =(abbr,val)=>{ const v=Number(val)||0; const next={...app,predictPes :{...predictPes ,[abbr]:v}}; setApp(next); saveApp(next); };
  const predicted =(abbr)=>{ const o=Number(predictOpt[abbr]||0); const p=Number(predictPes[abbr]||0); return (o+p)/2; };
  const diffToLine=(abbr)=> predicted(abbr) - Number(predictLine[abbr]||0);
  function Table({label,teams}){
    const [sortKey,setSortKey]=useState('預測勝場'); const [sortAsc,setSortAsc]=useState(false);
    const rows=useMemo(()=>{ const arr=[...teams]; arr.sort((a,b)=>{ let A,B; if(sortKey==='隊伍'){A=a.abbr;B=b.abbr;} else if(sortKey==='賭盤盤口'){A=Number(predictLine[a.abbr]||0); B=Number(predictLine[b.abbr]||0);} else if(sortKey==='預測勝場'){A=predicted(a.abbr); B=predicted(b.abbr);} else if(sortKey==='Over/Under'){A=diffToLine(a.abbr); B=diffToLine(b.abbr);} return cmp(A,B,sortAsc); }); return arr; },[teams,sortKey,sortAsc,predictLine,predictOpt,predictPes]);
    const H=({label,key})=>{ const active=sortKey===key; const isNum = key!== '隊伍'; return (<th className="p-2 cursor-pointer select-none" onClick={()=>{ if(active) setSortAsc(s=>!s); else { setSortKey(key); setSortAsc(!isNum ? true : false); }}}><span className="underline decoration-dotted underline-offset-4">{label}</span>{' '}{active?(sortAsc?'▲':'▼'):''}</th>); };
    return (
      <Section title={`${label}`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-base">
            <thead><tr className="text-left font-semibold">{H({label:'隊伍',key:'隊伍'})}<th className="p-2">中文</th>{H({label:'賭盤盤口',key:'賭盤盤口'})}<th className="p-2">樂觀預測</th><th className="p-2">悲觀預測</th>{H({label:'預測勝場',key:'預測勝場'})}{H({label:'Over/Under',key:'Over/Under'})}</tr></thead>
            <tbody>
              {rows.map(t=>{ const pred=predicted(t.abbr); const d=diffToLine(t.abbr); const ouText=d>0?`Over +${d.toFixed(1)}`: d<0?`Under ${d.toFixed(1)}`:`Push 0.0`; const ouCls=d>0?'text-green-400': d<0?'text-red-400':'text-zinc-400'; return (
                <tr key={t.abbr} className="border-t border-zinc-800">
                  <td className="p-2"><div className="text-base font-semibold">{t.abbr}</div></td>
                  <td className="p-2">{t.nameZh}</td>
                  <td className="p-2 w-32"><input className="w-28 px-2 py-1 rounded border bg-zinc-900 text-zinc-100 border-zinc-700" type="number" step="0.5" value={predictLine[t.abbr]||0} onChange={e=>setLine(t.abbr,e.target.value)} /></td>
                  <td className="p-2 w-32"><input className="w-28 px-2 py-1 rounded border bg-zinc-900 text-zinc-100 border-zinc-700" type="number" step="0.5" value={predictOpt[t.abbr]||0} onChange={e=>setOpt(t.abbr,e.target.value)} /></td>
                  <td className="p-2 w-32"><input className="w-28 px-2 py-1 rounded border bg-zinc-900 text-zinc-100 border-zinc-700" type="number" step="0.5" value={predictPes[t.abbr]||0} onChange={e=>setPes(t.abbr,e.target.value)} /></td>
                  <td className="p-2">{pred.toFixed(1)}</td>
                  <td className={`p-2 font-semibold ${ouCls}`}>{ouText}</td>
                </tr> ); })}
            </tbody>
          </table>
        </div>
      </Section>
    );
  }
  return (<div className="max-w-[1800px] mx-auto px-6 py-6 grid grid-cols-1 xl:grid-cols-2 gap-6"><Table label="東區" teams={EAST} /><Table label="西區" teams={WEST} /></div>);
}

// ==========================================================
// 內建小型測試（不改你原本資料）
// ==========================================================
function assert(name,cond){ console[cond?'log':'error'](`🧪 ${cond?'PASS':'FAIL'} - ${name}`); }
export function runTests(){ try{
  const csv=`Rank,PLAYER,TEAM,POS,POS',評分,上季評分,本季增減,真實薪水,評估薪水,差額\n1,A,ATL,G,,9.5,8.5,1.0,1000000,1200000,200000\n2,"B, Jr.",BOS,F,C,8,8.2,-0.2,2000000,1500000,-500000`;
  const rows=parseCSV(csv); assert('parseCSV rows length',rows.length===3); assert('parseCSV quoted comma',rows[2][1]==='B, Jr.');
  const ps=csvToPlayers(csv); assert('csvToPlayers length',ps.length===2); assert('csvToPlayers TEAM upper', ps[0].TEAM==='ATL'); assert('csvToPlayers delta keep', ps[1].本季增減===-0.2); assert('salaryDiff calc row1', salaryDiff(ps[0])===200000); assert('salaryDiff calc row2', salaryDiff(ps[1])===-500000);
  const csv2=playersToCSV(ps); assert("playersToCSV header POS'", csv2.split('\n')[0].includes("POS'")); assert('playersToCSV header 包含上季/本季增減', csv2.split('\n')[0].includes('上季評分') && csv2.split('\n')[0].includes('本季增減'));
  const cLow=colorMono(1,0,10), cHigh=colorMono(9,0,10); assert('colorMono alpha increases', cLow!==cHigh);
  assert('colorDiverge zero transparent', colorDiverge(0,-5,5)==='transparent'); assert('colorDiverge positive rgba', colorDiverge(5,-5,5).startsWith('rgba(')); assert('colorDiverge negative rgba', colorDiverge(-5,-5,5).startsWith('rgba('));
  assert('parseMoney currency words', parseMoney('US$1,234')===1234); assert('parseMoney unicode minus', parseMoney('−500')===-500); assert('parseMoney paren negative', parseMoney('(1,000)')===-1000); assert('fmtMoney negative sign', fmtMoney(-9876)==='-$9,876');
} catch(e){ console.error('🧪 TEST ERROR',e); } }

// ==========================================================
// 預設輸出工具（建立 preset.json）
function cleanPlayersForPreset(list){
  return (list||[]).map(p=>{
    // 移除 data URL 等本機上傳痕跡，避免膨脹
    const { cardImage, ...rest } = p || {};
    return rest;
  });
}
function buildTeamImagesMap(ext='jpg'){
  return Object.fromEntries(TEAMS.map(t=> [t.abbr, `img/depth/${t.abbr}.${ext}`]));
}
function downloadText(name, text){
  try{
    const blob=new Blob([text],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=name; a.click();
    URL.revokeObjectURL(url);
  }catch(e){ console.warn('下載失敗：', e?.message||e); }
}

// ==========================================================
// App 主體
// ==========================================================
function loadApp(){ try{ const raw=localStorage.getItem(STORAGE_KEY); return raw? JSON.parse(raw): null; }catch{ return null; } }
function saveApp(data){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }catch(e){ console.warn('儲存失敗：', e?.message||e); } }
const DEFAULT_STATE={ players:[], teamImages:Object.fromEntries(TEAMS.map(t=>[t.abbr,null])), predictWins:Object.fromEntries(TEAMS.map(t=>[t.abbr,0])), predictLine:Object.fromEntries(TEAMS.map(t=>[t.abbr,0])), predictOpt:Object.fromEntries(TEAMS.map(t=>[t.abbr,0])), predictPes:Object.fromEntries(TEAMS.map(t=>[t.abbr,0])) };

export default function App(){
  async function tryLoadPresetOnce(current){ try{ if(typeof window==='undefined') return; if(FORCE_PRESET){ try{ localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(PRESET_FLAG_KEY);}catch{} } const already=localStorage.getItem(PRESET_FLAG_KEY); const empty=!current||!Array.isArray(current.players)||current.players.length===0; if(!FORCE_PRESET && (already || !empty)) return; const url=getPresetURL(); const res=await fetch(url,{cache:'no-store'}); if(!res.ok){ console.warn('Preset fetch not ok:', res.status); return; } const data=await res.json(); const merged={...DEFAULT_STATE, ...data}; saveApp(merged); setApp(merged); localStorage.setItem(PRESET_FLAG_KEY,'1'); console.log('Preset loaded from', url, '(forced:', FORCE_PRESET, ')'); }catch(err){ console.warn('Preset load skipped:', err); } }
  const [app,setApp]=useState(loadApp()||DEFAULT_STATE);
  useEffect(()=>{ tryLoadPresetOnce(app); },[]);
  const [tab,setTab]=useState('Player');
  const [teamAbbr,setTeamAbbr]=useState('LAL');
  const [playerCard,setPlayerCard]=useState(null);
  useEffect(()=>{ document.title='NBA 2025 Player Rating'; },[]);
  // Admin 工具列以 Query Flag 控制：在網址加 ?admin=1 顯示
const isAdmin=(typeof window!=="undefined") && (new URLSearchParams(window.location.search).get('admin')==='1');

  // 產生 preset.json：
  // - players 取目前狀態（移除 cardImage 等 base64）
  // - teamImages 直接指向 public/img/depth/ABBR.jpg
  const exportPreset = (ext='jpg') => {
    const preset = {
      players: cleanPlayersForPreset(app.players||[]),
      teamImages: buildTeamImagesMap(ext)
    };
    const text = JSON.stringify(preset, null, 2);
    downloadText('preset.json', text);
  };
  function openPlayerCard(p){
  if(!p) return;
  const id = p.id;
  const fromStore = (app.players||[]).find(x=> id ? x.id===id : (x.PLAYER===p.PLAYER && x.TEAM===p.TEAM));
  setPlayerCard(fromStore || p);
  setTab('Player');
}
  useEffect(()=>{ const id=setTimeout(()=>saveApp(app),200); return ()=>clearTimeout(id); },[app]);
  const setTabAndMaybeReset=(id)=>{ if(id==='Team') setTeamAbbr(''); setTab(id); };

  // ✅ 單一 calcStats：以全體 players 為基準
  const stats = useMemo(()=> calcStats(app.players||[]), [app.players]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {FORCE_PRESET && (<div className="px-6 py-2 text-xs text-amber-300 bg-amber-950/40 border-b border-amber-800">已啟用「強制載入預設資料」。此訊息僅本次可見。</div>)}
      <TopTabs tab={tab} setTab={setTabAndMaybeReset} />

      {isAdmin && (
        <div className="w-full px-6 py-4 flex items-center gap-2">
          <FileLabel accept="application/json" onChange={e=>e.target.files?.[0]&& (async (f)=>{ try{ const text=await readFileAsText(f); const data=JSON.parse(text); const merged={...DEFAULT_STATE,...data}; setApp(merged); saveApp(merged);} catch(err){ alert('JSON 匯入失敗：'+(err?.message||err)); } })(e.target.files[0])}>匯入 JSON</FileLabel>
          <DownloadBtn name="nba_all_data.json" text={JSON.stringify(app,null,2)} />
          <Btn onClick={()=>exportPreset('jpg')}>匯出 preset.json（depth/*.jpg）</Btn>
          <Btn className="ml-auto text-xs" onClick={()=>runTests()}>🧪 執行內建測試</Btn>
        </div>
      )}

      {tab==='Player' && !playerCard && (
        <PlayerTab app={app} setApp={setApp} goPlayerCard={openPlayerCard} stats={stats} />
      )}
      {tab==='Player' && playerCard && (
        <PlayerCard app={app} setApp={setApp} player={playerCard} back={()=>setPlayerCard(null)} allPlayers={app.players} selectPlayer={setPlayerCard} goTeam={(abbr)=>{ setTeamAbbr(abbr); setTab('Team'); }} isAdmin={isAdmin} />
      )}
      {tab==='Team' && (
        <TeamTab app={app} setApp={setApp} openPlayerCard={openPlayerCard} teamAbbr={teamAbbr} setTeamAbbr={setTeamAbbr} isAdmin={isAdmin} stats={stats} />
      )}
      {tab==='Predict' && (
        <PredictTab app={app} setApp={setApp} />
      )}
    </div>
  );
}
