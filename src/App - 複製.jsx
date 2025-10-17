import React, { useEffect, useMemo, useState } from "react";

/* ==========================================================
 🏀 三分頁介面（Team / Player / Predict）— 依需求改版
 - Player：CSV 匯入/匯出、複選篩選（PLAYER/TEAM/POS/POS'）、條件化著色（評分/真實薪水/評估薪水/差額）、點名字開「球員卡」
 - Team：先看東/西 30 隊清單 → 隊頁：左 Depth Chart（容器等比縮放；高一點）、右球員表（排序、條件化著色；欄位同 Player）
 - Predict：東/西各 15 隊，可填預測勝場、依勝場排序
 - 資料：localStorage；提供 JSON 備份/還原
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

const EAST = TEAMS.filter(t => t.conf === "East").sort((a,b)=>a.abbr.localeCompare(b.abbr));
const WEST = TEAMS.filter(t => t.conf === "West").sort((a,b)=>a.abbr.localeCompare(b.abbr));

// --- 儲存鍵名 ---
const STORAGE_KEY = "nba_tabs_app_v1";

// --- 工具 ---
const newId = () => (crypto?.randomUUID?.() || `id-${Math.random().toString(36).slice(2)}`);

function fmtMoney(n){
  if (n == null || n === "") return "";
  const num = Number(n)||0;
  const v = Math.round(num);
  const abs = Math.abs(v).toLocaleString();
  return v<0? (`-$${abs}`): (`$${abs}`);
}
function parseMoney(s){ if(typeof s === 'number') return s; return Number(String(s||'').replace(/[$,\s]/g,''))||0; }

async function readFileAsText(file){
  // 嘗試多種編碼，降低姓名亂碼機率
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const encodings = ['utf-8','utf-16le','utf-16be','big5','windows-1252','iso-8859-1'];
  const score = (t)=> (t.match(/\uFFFD/g)||[]).length; // " " 次數
  let bestText = '';
  let bestScore = Infinity;
  for(const enc of encodings){
    try{
      const dec = new TextDecoder(enc, { fatal: false });
      const t = dec.decode(bytes);
      const sc = score(t);
      if(sc < bestScore){ bestScore = sc; bestText = t; }
      if(sc === 0 && (enc === 'utf-8' || enc === 'utf-16le')) break;
    }catch{ /* 某些瀏覽器可能不支援全部標籤 */ }
  }
  if(bestText) return bestText;
  try{ return new TextDecoder('utf-8').decode(bytes);}catch{ return ''; }
}

function readFileAsDataURL(file){
  return new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(file); });
}

// --- CSV 解析（RFC4180 簡化） ---
function parseCSV(csvText){
  const rows=[]; let i=0, cur="", row=[], q=false; const s=String(csvText);
  while(i<s.length){ const ch=s[i++];
    if(ch==='"'){ if(q && s[i]=='"'){ cur+='"'; i++; } else q=!q; }
    else if(ch===',' && !q){ row.push(cur); cur=""; }
    else if((ch==='\n'||ch==='\r') && !q){ if(cur.length||row.length){ row.push(cur); rows.push(row);} cur=""; row=[]; if(ch==='\r'&&s[i]==='\n') i++; }
    else cur+=ch;
  }
  if(cur.length||row.length){ row.push(cur); rows.push(row); }
  return rows;
}

// 欄位：Rank、PLAYER、TEAM、POS、POS'、評分、真實薪水、評估薪水、差額
function csvToPlayers(csvText){
  const rows=parseCSV(csvText); if(!rows.length) return [];
  const norm = (s)=> String(s||'')
    .trim()
    .toLowerCase()
    .replace(/\s+/g,'')
    .replace(/[’'′‵`]/g,"'")
    .replace(/實際薪資|真實薪資/g,'真實薪水')
    .replace(/預估薪資|估算薪資|估值薪資/g,'評估薪水')
    .replace(/pos2|位置2|位置'|第二位置/g,"pos'");
  const header = rows[0].map(norm);
  const find = (keys) => { const wants = keys.map(norm); for(let i=0;i<header.length;i++){ if(wants.includes(header[i])) return i; } return -1; };
  const idxRank=find(["rank","排名"]);
  const idxPLAYER=find(["player","姓名","球員","名字"]);
  const idxTEAM=find(["team","隊","球隊","隊伍"]);
  const idxPOS=find(["pos","位置"]);
  const idxPOS2=find(["pos'","posprime","位置'","第二位置"]);
  const idxRating=find(["評分","rating","score"]);
  const idxReal=find(["真實薪水","real","realsalary","actualsalary","actual_salary"]);
  const idxEst=find(["評估薪水","est","estimatedsalary","estimate"]);
  const idxDiff=find(["差額","diff","delta"]);

  const out=[];
  for(let r=1;r<rows.length;r++){
    const row=rows[r]; if(!row||row.every(x=>!x||!String(x).trim())) continue;
    out.push({
      id: newId(),
      Rank: idxRank>=0? Number(row[idxRank])||0 : undefined,
      PLAYER: idxPLAYER>=0? row[idxPLAYER]: "",
      TEAM: (idxTEAM>=0? row[idxTEAM]: "").toUpperCase(),
      POS: idxPOS>=0? row[idxPOS]: "",
      POS2: idxPOS2>=0? row[idxPOS2]: "",
      評分: idxRating>=0? Number(row[idxRating])||0 : 0,
      真實薪水: idxReal>=0? parseMoney(row[idxReal]) : 0,
      評估薪水: idxEst>=0? parseMoney(row[idxEst]) : 0,
      差額: idxDiff>=0? parseMoney(row[idxDiff]) : undefined,
      cardImage: null,
    });
  }
  return out;
}

function playersToCSV(players){
  const header=["Rank","PLAYER","TEAM","POS","POS'","評分","真實薪水","評估薪水","差額"];
  const esc=(v)=>{ const s=String(v??""); return (s.includes(',')||s.includes('\n')||s.includes('"'))?('"'+s.replace(/"/g,'""')+'"'):s; };
  const lines=[header.join(',')];
  for(const p of players){
    lines.push([
      esc(p.Rank), esc(p.PLAYER), esc(p.TEAM), esc(p.POS), esc(p.POS2),
      p.評分, p.真實薪水, p.評估薪水, (p.差額??"")
    ].join(','));
  }
  return lines.join('\n');
}

// --- 條件化著色：最低→深紅，中間→深灰，最高→深綠（連續漸層） ---
function lerp(a,b,t){ return a+(b-a)*t; }
function mixRGB(c1,c2,t){ return [ Math.round(lerp(c1[0],c2[0],t)), Math.round(lerp(c1[1],c2[1],t)), Math.round(lerp(c1[2],c2[2],t)) ]; }
const C_GREEN=[0,100,0], C_WHITE=[64,64,64], C_RED=[139,0,0]; // 名稱沿用，但值改為深綠/深灰/深紅
function heatColor(val,min,max){
  if(val==null || isNaN(val) || min==null || max==null || max<=min) return "transparent";
  const pos = (val-min)/(max-min);
  if(pos<=0.5){ const t=pos/0.5; const [r,g,b]=mixRGB(C_RED,C_WHITE,t); return `rgb(${r},${g},${b})`; }
  const t=(pos-0.5)/0.5; const [r,g,b]=mixRGB(C_WHITE,C_GREEN,t); return `rgb(${r},${g},${b})`;
}

// --- App 狀態 ---
function loadApp(){
  try { const raw=localStorage.getItem(STORAGE_KEY); return raw? JSON.parse(raw): null; } catch { return null; }
}
function saveApp(data){ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }

const DEFAULT_STATE = {
  players: [],
  teamImages: Object.fromEntries(TEAMS.map(t=>[t.abbr,null])),
  predictWins: Object.fromEntries(TEAMS.map(t=>[t.abbr,0])),
};

// ==========================================================
// UI 元件
// ==========================================================
function TopTabs({tab,setTab}){
  const TabBtn=({id,label})=> (
    <button
      onClick={()=>setTab(id)}
      className={`px-4 py-2 rounded-xl border text-sm shadow-sm mr-2 ${tab===id? 'bg-blue-600 text-white border-blue-600':'bg-white/70 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 hover:bg-blue-50 dark:hover:bg-zinc-800'}`}
    >{label}</button>
  );
  return (
    <div className="sticky top-0 z-50 bg-zinc-50/80 dark:bg-zinc-950/80 backdrop-blur border-b border-zinc-200 dark:border-zinc-800">
      <div className="max-w-none w-full px-6 py-3 flex items-center">
        <div className="font-bold mr-4">🏀 NBA Tool</div>
        <TabBtn id="Team" label="Team 球隊" />
        <TabBtn id="Player" label="Player 球員" />
        <TabBtn id="Predict" label="Predict 季前預測" />
        <div className="ml-auto text-xs text-zinc-500">資料儲存於本機瀏覽器</div>
      </div>
    </div>
  );
}

function Section({title,right,children}){
  return (
    <div className="my-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <div>{right}</div>
      </div>
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 shadow-sm">{children}</div>
    </div>
  );
}

function DownloadBtn({name, text}){
  return (
    <button
      onClick={()=>{ const blob=new Blob([text],{type:'text/plain;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); }}
      className="px-3 py-2 rounded-xl border text-sm bg-white/70 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 shadow-sm"
    >下載</button>
  );
}

// ==========================================================
// Player Tab：匯入/匯出 + 表格 + 球員卡
// ==========================================================
function PlayerTab({app,setApp,goPlayerCard}){
  const {players}=app;
  // 預設：以「評分」由大到小
  const [sortKey,setSortKey] = useState('評分');
  const [sortAsc,setSortAsc] = useState(false);

  // 多選篩選（PLAYER / TEAM / POS / POS'）
  const [ms,setMS] = useState({ PLAYER:[], TEAM:[], POS:[], POS2:[] });

  const uniq = (arr)=> Array.from(new Set(arr.filter(Boolean)));
  const optPLAYER = useMemo(()=> uniq(players.map(p=>String(p.PLAYER||''))).sort((a,b)=>a.localeCompare(b)), [players]);
  const optTEAM   = useMemo(()=> uniq(players.map(p=>String(p.TEAM||'').toUpperCase())).sort(), [players]);
  const optPOS    = useMemo(()=> uniq(players.map(p=>String(p.POS||''))).sort(), [players]);
  const optPOS2   = useMemo(()=> uniq(players.map(p=>String(p.POS2||''))).sort(), [players]);

  const stats=useMemo(()=>{
    const cols=['評分','真實薪水','評估薪水','差額'];
    const init=Object.fromEntries(cols.map(c=>[c,{min:Infinity,max:-Infinity}]));
    for(const p of players){ for(const c of cols){ const v=Number(p[c]); if(!isFinite(v)) continue; init[c].min=Math.min(init[c].min,v); init[c].max=Math.max(init[c].max,v); } }
    for(const c of cols){ if(init[c].min===Infinity){ init[c]={min:0,max:1}; } }
    return init;
  },[players]);

  const filtered = useMemo(()=>{
    return players.filter(p=>{
      if(ms.PLAYER.length && !ms.PLAYER.includes(p.PLAYER)) return false;
      if(ms.TEAM.length && !ms.TEAM.includes(String(p.TEAM||'').toUpperCase())) return false;
      if(ms.POS.length && !ms.POS.includes(p.POS)) return false;
      if(ms.POS2.length && !ms.POS2.includes(p.POS2)) return false;
      return true;
    });
  },[players,ms]);

  const rows = useMemo(()=>{
    const arr=[...filtered]; const dir=sortAsc?1:-1;
    arr.sort((a,b)=>{ const A=a[sortKey]; const B=b[sortKey]; if(typeof A==='number' && typeof B==='number') return (A-B)*dir; return String(A??'').localeCompare(String(B??''))*dir; });
    return arr;
  },[filtered,sortKey,sortAsc]);

  function header(label,key){ const active=sortKey===key; return (
    <th className="p-2 cursor-pointer select-none" onClick={()=>{ if(active) setSortAsc(s=>!s); else { setSortKey(key); setSortAsc(false);} }}>
      <span className="underline decoration-dotted underline-offset-4">{label}</span>{' '}{active ? (sortAsc ? '▲':'▼') : ''}
    </th>
  ); }

  function MultiSelect({label, options, values, onChange}){
    const [open,setOpen]=useState(false);
    const toggle=(v)=>{ onChange(values.includes(v)? values.filter(x=>x!==v): [...values,v]); };
    return (
      <div className="relative inline-block mr-2 mb-2">
        <button className="px-3 py-2 rounded-xl border text-sm bg-white/70 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 shadow-sm" onClick={()=>setOpen(o=>!o)}>
          {label}{values.length?`（${values.length}）`:''}
        </button>
        {open && (
          <div className="absolute z-50 mt-2 max-h-72 w-64 overflow-auto p-2 rounded-2xl border bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 shadow-lg">
            <div className="text-xs px-1 mb-1 text-zinc-500">可複選</div>
            <ul className="grid grid-cols-1 gap-1 pr-1">
              {options.map(opt=> (
                <label key={opt||'__empty'} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                  <input type="checkbox" checked={values.includes(opt)} onChange={()=>toggle(opt)} />
                  <span className="text-sm">{opt||'（空值）'}</span>
                </label>
              ))}
            </ul>
            <div className="flex justify-between mt-2">
              <button className="text-xs underline" onClick={()=>onChange([])}>清除</button>
              <button className="text-xs underline" onClick={()=>setOpen(false)}>完成</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  async function onImportCSV(file){
    try{
      const text=await readFileAsText(file);
      const list=csvToPlayers(text);
      if(!list.length) return alert('CSV 內容解析不到任何球員資料');
      const next={...app, players:list}; setApp(next); saveApp(next);
    }catch(e){ alert('CSV 匯入失敗：'+e.message); }
  }

  function exportCSV(){ const csv=playersToCSV(rows); const a=document.createElement('a'); const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.href=url; a.download='players.csv'; a.click(); URL.revokeObjectURL(url); }
  function exportAllJSON(){ const a=document.createElement('a'); const url=URL.createObjectURL(new Blob([JSON.stringify(app,null,2)],{type:'application/json'})); a.href=url; a.download='nba_all_data.json'; a.click(); URL.revokeObjectURL(url); }
  async function importAllJSON(file){ try{ const text=await readFileAsText(file); const data=JSON.parse(text); const merged={...DEFAULT_STATE, ...data}; setApp(merged); saveApp(merged);}catch(e){ alert('JSON 匯入失敗：'+e.message);} }

  return (
    <div className="max-w-[2400px] mx-auto px-6 py-6">
      <Section title="資料匯入/匯出">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="px-3 py-2 rounded-xl border text-sm bg-white/70 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 shadow-sm cursor-pointer">匯入 CSV
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={e=>e.target.files?.[0]&&onImportCSV(e.target.files[0])} />
          </label>
          <button className="px-3 py-2 rounded-xl border text-sm bg-white/70 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 shadow-sm" onClick={exportCSV}>匯出 CSV（套用篩選/排序）</button>
          <button className="px-3 py-2 rounded-xl border text-sm bg-white/70 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 shadow-sm" onClick={exportAllJSON}>匯出 JSON（全站備份）</button>
          <label className="px-3 py-2 rounded-xl border text-sm bg-white/70 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 shadow-sm cursor-pointer">匯入 JSON（全站還原）
            <input type="file" accept="application/json" className="hidden" onChange={e=>e.target.files?.[0]&&importAllJSON(e.target.files[0])} />
          </label>
        </div>
      </Section>

      <Section title="篩選（可複選）">
        <div className="flex flex-wrap items-center">
          <MultiSelect label="PLAYER" options={optPLAYER} values={ms.PLAYER} onChange={(v)=>setMS(s=>({...s,PLAYER:v}))} />
          <MultiSelect label="TEAM"   options={optTEAM}   values={ms.TEAM}   onChange={(v)=>setMS(s=>({...s,TEAM:v}))} />
          <MultiSelect label="POS"    options={optPOS}    values={ms.POS}    onChange={(v)=>setMS(s=>({...s,POS:v}))} />
          <MultiSelect label="POS'"   options={optPOS2}   values={ms.POS2}   onChange={(v)=>setMS(s=>({...s,POS2:v}))} />
        </div>
      </Section>

      <Section title="球員表（點欄位可排序）">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left font-semibold">
                {header('Rank','Rank')}
                {header('PLAYER','PLAYER')}
                {header('TEAM','TEAM')}
                {header('POS','POS')}
                {header("POS'",'POS2')}
                {header('評分','評分')}
                {header('真實薪水','真實薪水')}
                {header('評估薪水','評估薪水')}
                {header('差額','差額')}
              </tr>
            </thead>
            <tbody>
              {rows.map(p=> (
                <tr key={p.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="p-2">{p.Rank??''}</td>
                  <td className="p-2 text-blue-600 underline-offset-2 hover:underline cursor-pointer" onClick={()=>goPlayerCard(p)}>{p.PLAYER}</td>
                  <td className="p-2">{p.TEAM}</td>
                  <td className="p-2">{p.POS}</td>
                  <td className="p-2">{p.POS2}</td>
                  <td className="p-2" style={{background:heatColor(Number(p.評分),stats['評分'].min,stats['評分'].max)}}>{p.評分}</td>
                  <td className="p-2" style={{background:heatColor(Number(p.真實薪水),stats['真實薪水'].min,stats['真實薪水'].max)}}>{fmtMoney(p.真實薪水)}</td>
                  <td className="p-2" style={{background:heatColor(Number(p.評估薪水),stats['評估薪水'].min,stats['評估薪水'].max)}}>{fmtMoney(p.評估薪水)}</td>
                  <td className="p-2 font-medium" style={{background:heatColor(Number(p.差額),stats['差額'].min,stats['差額'].max)}}>{p.差額==null? '' : fmtMoney(p.差額)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function PlayerCard({player, setApp, app, back}){
  if(!player) return null;
  async function onUpload(file){ const url=await readFileAsDataURL(file); const next={...app, players: app.players.map(p=> p.id===player.id? {...p, cardImage:url}: p)}; setApp(next); saveApp(next); }
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <button onClick={back} className="mb-4 px-3 py-2 rounded-xl border text-sm bg-white/70 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 shadow-sm">← 返回 Player</button>
      <h2 className="text-2xl font-bold">{player.PLAYER}</h2>
      <div className="mt-2 text-sm text-zinc-500">{player.TEAM} · {player.POS} {player.POS2?`/ ${player.POS2}`:''}</div>
      <Section title="球員卡圖片" right={<label className="cursor-pointer px-3 py-2 rounded-xl border text-sm bg-white/70 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 shadow-sm">上傳
        <input type="file" accept="image/*" className="hidden" onChange={e=>e.target.files?.[0]&&onUpload(e.target.files[0])} /></label>}>
        {player.cardImage ? (
          <div className="overflow-auto border border-zinc-200 dark:border-zinc-700 rounded-xl p-2" style={{maxHeight:'80vh'}}>
            <img src={player.cardImage} alt="card" className="block max-w-none h-auto" />
          </div>
        ) : (
          <div className="text-sm text-zinc-500">尚未上傳。建議尺寸：直式長圖，可無上限高度，會提供滾動。</div>
        )}
      </Section>
    </div>
  );
}

// ==========================================================
// Team Tab：球隊清單 -> 詳細頁（Depth Chart + 該隊球員）
// ==========================================================
function TeamGrid({teams, onSelect}){
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {teams.map(t=> (
        <div key={t.abbr} onClick={()=>onSelect(t.abbr)} className="p-3 rounded-2xl border bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 cursor-pointer hover:shadow">
          <div className="text-xs text-zinc-500">{t.conf}</div>
          <div className="text-xl font-bold">{t.abbr}</div>
          <div className="text-sm">{t.nameZh}</div>
        </div>
      ))}
    </div>
  );
}

function TeamDetail({abbr, app, setApp, openPlayerCard, onSwitchTeam}){
  const team = TEAMS.find(t=>t.abbr===abbr);
  const img = app.teamImages[abbr];
  const all = app.players || [];

  const [sortKey,setSortKey] = useState('Rank');
  const [sortAsc,setSortAsc] = useState(true);

  const teamPlayers = useMemo(()=> all.filter(p=> (p.TEAM||'').toUpperCase()===abbr), [all,abbr]);

  const stats=useMemo(()=>{
    const cols=['評分','真實薪水','評估薪水','差額'];
    const init=Object.fromEntries(cols.map(c=>[c,{min:Infinity,max:-Infinity}]));
    for(const p of teamPlayers){ for(const c of cols){ const v=Number(p[c]); if(!isFinite(v)) continue; init[c].min=Math.min(init[c].min,v); init[c].max=Math.max(init[c].max,v); } }
    for(const c of cols){ if(init[c].min===Infinity){ init[c]={min:0,max:1}; } }
    return init;
  },[teamPlayers]);

  const rows = useMemo(()=>{ const arr=[...teamPlayers]; const dir=sortAsc?1:-1; arr.sort((a,b)=>{ const A=a[sortKey]; const B=b[sortKey]; if(typeof A==='number' && typeof B==='number') return (A-B)*dir; return String(A??'').localeCompare(String(B??''))*dir; }); return arr; },[teamPlayers,sortKey,sortAsc]);

  function header(label,key){ const active=sortKey===key; return (
    <th className="p-2 cursor-pointer select-none" onClick={()=>{ if(active) setSortAsc(s=>!s); else { setSortKey(key); setSortAsc(true);} }}>
      <span className="underline decoration-dotted underline-offset-4">{label}</span>{' '}{active ? (sortAsc ? '▲':'▼') : ''}
    </th>
  ); }

  async function onUploadDepth(file){ const url=await readFileAsDataURL(file); const next={...app, teamImages:{...app.teamImages,[abbr]:url}}; setApp(next); saveApp(next); }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-2xl font-bold">{team.nameZh}（{abbr}）</div>
        <select className="px-3 py-2 rounded-xl border bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700" value={abbr} onChange={e=>onSwitchTeam(e.target.value)}>
          {[...EAST,...WEST].sort((a,b)=>a.abbr.localeCompare(b.abbr)).map(t=> <option key={t.abbr} value={t.abbr}>{t.abbr} - {t.nameZh}</option>)}
        </select>
        <div className="ml-auto text-sm text-zinc-500">分區：{team.conf}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 左：Depth Chart 提高窗格高度 */}
        <Section title="球隊 Depth Chart" right={<label className="cursor-pointer px-3 py-2 rounded-xl border text-sm bg-white/70 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 shadow-sm">上傳
          <input type="file" accept="image/*" className="hidden" onChange={e=>e.target.files?.[0]&&onUploadDepth(e.target.files[0])} /></label>}>
          {img ? (
            <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-2 h-[86vh] overflow-auto">
              <img src={img} alt="depth" className="max-w-full h-auto object-contain" />
            </div>
          ) : (
            <div className="text-sm text-zinc-500">尚未上傳。建議尺寸：1000×2080（直式）。圖片會依容器寬度縮放，維持比例。</div>
          )}
        </Section>

        {/* 右：該隊球員（排序） */}
        <Section title={`球員資訊（${abbr}）`}>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left font-semibold">
                  {header('Rank','Rank')}
                  {header('PLAYER','PLAYER')}
                  {header('TEAM','TEAM')}
                  {header('POS','POS')}
                  {header("POS'",'POS2')}
                  {header('評分','評分')}
                  {header('真實薪水','真實薪水')}
                  {header('評估薪水','評估薪水')}
                  {header('差額','差額')}
                </tr>
              </thead>
              <tbody>
                {rows.map(p=> (
                  <tr key={p.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="p-2">{p.Rank??''}</td>
                    <td className="p-2 text-blue-600 underline-offset-2 hover:underline cursor-pointer" onClick={()=>openPlayerCard(p)}>{p.PLAYER}</td>
                    <td className="p-2">{p.TEAM}</td>
                    <td className="p-2">{p.POS}</td>
                    <td className="p-2">{p.POS2}</td>
                    <td className="p-2" style={{background:heatColor(Number(p.評分),stats['評分'].min,stats['評分'].max)}}>{p.評分}</td>
                    <td className="p-2" style={{background:heatColor(Number(p.真實薪水),stats['真實薪水'].min,stats['真實薪水'].max)}}>{fmtMoney(p.真實薪水)}</td>
                    <td className="p-2" style={{background:heatColor(Number(p.評估薪水),stats['評估薪水'].min,stats['評估薪水'].max)}}>{fmtMoney(p.評估薪水)}</td>
                    <td className="p-2 font-medium" style={{background:heatColor(Number(p.差額),stats['差額'].min,stats['差額'].max)}}>{p.差額==null? '' : fmtMoney(p.差額)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}

function TeamTab({app,setApp, openPlayerCard}){
  const [teamAbbr,setTeamAbbr]=useState(""); // 先顯示 30 隊清單（分東/西）
  return (
    <div className="max-w-[2400px] mx-auto px-6 py-6">
      {!teamAbbr ? (
        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
          <Section title="東區（Eastern Conference）">
            <TeamGrid teams={[...EAST]} onSelect={setTeamAbbr} />
          </Section>
          <Section title="西區（Western Conference）">
            <TeamGrid teams={[...WEST]} onSelect={setTeamAbbr} />
          </Section>
        </div>
      ) : (
        <TeamDetail abbr={teamAbbr} app={app} setApp={setApp} openPlayerCard={openPlayerCard} onSwitchTeam={setTeamAbbr} />
      )}
    </div>
  );
}

// ==========================================================
// Predict Tab：東/西 15 隊 + 可填勝場，排序
// ==========================================================
function PredictTab({app,setApp}){
  function setWin(abbr,val){ const v=Number(val)||0; const next={...app, predictWins:{...app.predictWins,[abbr]:v}}; setApp(next); saveApp(next); }
  const sortByWins=(teams)=>[...teams].sort((a,b)=> (app.predictWins[b.abbr]||0)-(app.predictWins[a.abbr]||0));

  function Table({label, teams}){
    const sorted=sortByWins(teams);
    return (
      <Section title={`${label}（可填預測勝場並自動排序）`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left font-semibold">
                <th className="p-2">隊伍</th>
                <th className="p-2">縮寫</th>
                <th className="p-2">預測勝場</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t,i)=>(
                <tr key={t.abbr} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="p-2">{i+1}. {t.nameZh}</td>
                  <td className="p-2">{t.abbr}</td>
                  <td className="p-2 w-40">
                    <input className="w-32 px-2 py-1 rounded border bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700" type="number" step="0.5" value={app.predictWins[t.abbr]||0} onChange={e=>setWin(t.abbr, e.target.value)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    );
  }

  return (
    <div className="max-w-none w-full px-6 py-6">
      <Table label="東區" teams={EAST} />
      <Table label="西區" teams={WEST} />
    </div>
  );
}

// ==========================================================
// 內建小型測試（不依賴外部框架；結果顯示在 console）
// ==========================================================
function assert(name, cond){ console[cond? 'log':'error'](`🧪 ${cond?'PASS':'FAIL'} - ${name}`); }
export function runTests(){
  try{
    const csv = "Rank,PLAYER,TEAM,POS,POS',評分,真實薪水,評估薪水,差額\n1,A,ATL,G,,9.5,1000000,1200000,200000\n2,\"B, Jr.\",BOS,F,C,8,2000000,1500000,-500000";
    const rows = parseCSV(csv);
    assert('parseCSV rows length', rows.length===3);
    assert('parseCSV quoted comma', rows[2][1]==='B, Jr.');

    const ps = csvToPlayers(csv);
    assert('csvToPlayers length', ps.length===2);
    assert('csvToPlayers TEAM upper', ps[0].TEAM==='ATL');
    assert('csvToPlayers diff keep', ps[1].差額===-500000);

    const csv2 = playersToCSV(ps);
    assert("playersToCSV header POS'", csv2.split('\n')[0].includes("POS'"));

    assert('heatColor min -> rgb', heatColor(0,0,10).includes('rgb('));
    assert('heatColor mid -> rgb', heatColor(5,0,10).includes('rgb('));

    // ➕ 額外測試（不更動原有測試）
    // 1) 中文欄名解析
    const csvZh = "排名,球員,隊,位置,位置',評分,真實薪水,評估薪水,差額\n1,王小明,NYK,G,,7,1500000,1200000,-300000";
    const psZh = csvToPlayers(csvZh);
    assert('csvToPlayers(中文) length', psZh.length===1);
    assert('csvToPlayers(中文) TEAM upper', psZh[0].TEAM==='NYK');
    assert('csvToPlayers(中文) POS2 empty', psZh[0].POS2==='');

    // 2) 金額格式
    assert('fmtMoney positive', fmtMoney(1234567)==='$1,234,567');
    assert('fmtMoney negative', fmtMoney(-2500)==='-$2,500');

    // 3) parseCSV 換行處理
    const r2 = parseCSV('A,B\nC,D');
    assert('parseCSV newline split', r2.length===2 && r2[0][0]==='A' && r2[1][0]==='C');
  }catch(e){ console.error('🧪 TEST ERROR', e); }
}

// ==========================================================
// App 主體
// ==========================================================
export default function App(){
  const [tab,setTab]=useState('Player'); // 預設進到 Player
  const [app,setApp]=useState(()=> loadApp() || DEFAULT_STATE);
  const [playerCard,setPlayerCard]=useState(null); // 選中的球員（Player / Team 都可開啟）

  const [dark,setDark]=useState(false);
  useEffect(()=>{ const root=document.documentElement; dark? root.classList.add('dark'): root.classList.remove('dark'); },[dark]);

  function openPlayerCard(p){ setPlayerCard(p); setTab('Player'); }

  useEffect(()=>{ const id=setTimeout(()=>saveApp(app), 200); return ()=>clearTimeout(id); },[app]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <TopTabs tab={tab} setTab={setTab} />

      <div className="max-w-none w-full px-6 py-4 flex items-center gap-2">
        <button className="px-3 py-2 rounded-xl border text-sm bg-white/70 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 shadow-sm" onClick={()=>setDark(d=>!d)}>{dark? '🌙 深色':'☀️ 淺色'}</button>
        <label className="ml-2 px-3 py-2 rounded-xl border text-sm bg-white/70 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 shadow-sm cursor-pointer">匯入 JSON
          <input type="file" accept="application/json" className="hidden" onChange={e=>e.target.files?.[0]&& (async (f)=>{ try{ const text=await readFileAsText(f); const data=JSON.parse(text); const merged={...DEFAULT_STATE,...data}; setApp(merged); saveApp(merged);} catch(err){ alert('JSON 匯入失敗：'+err.message); } })(e.target.files[0])} />
        </label>
        <DownloadBtn name="nba_all_data.json" text={JSON.stringify(app,null,2)} />
        <button className="ml-auto px-3 py-2 rounded-xl border text-xs bg-white/70 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700" onClick={()=>runTests()}>🧪 執行內建測試</button>
      </div>

      {tab==='Player' && !playerCard && (
        <PlayerTab app={app} setApp={setApp} goPlayerCard={openPlayerCard} />
      )}
      {tab==='Player' && playerCard && (
        <PlayerCard app={app} setApp={setApp} player={playerCard} back={()=>setPlayerCard(null)} />
      )}
      {tab==='Team' && (
        <TeamTab app={app} setApp={setApp} openPlayerCard={openPlayerCard} />
      )}
      {tab==='Predict' && (
        <PredictTab app={app} setApp={setApp} />
      )}

      <footer className="max-w-none w-full px-6 py-10 text-xs text-zinc-500">
        <div>
          📌 提示：Player 匯入 CSV 欄位支援：Rank、PLAYER、TEAM、POS、POS'、評分、真實薪水、評估薪水、差額。<br/>
          顏色規則：最低 → 深紅，中間 → 深灰，最高 → 深綠（連續漸層）。<br/>
          Depth Chart 與球員卡：依容器顯示，維持比例；高度超過視窗時可滾動查看。
        </div>
      </footer>
    </div>
  );
}
