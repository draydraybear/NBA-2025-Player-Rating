import React, { useEffect, useMemo, useState } from "react";

/* ==========================================================
 🏀 三分頁介面（Team / Player / Predict）— Dark Only + 新欄位 + 新條件色
 - Dark-only：整站固定深色
 - Player：欄位 Rank、PLAYER、TEAM、POS、POS'、評分、上季評分、本季增減、真實薪水、評估薪水、差額（👉 程式動態：評估薪水 - 真實薪水）；
           PLAYER/TEAM/POS/POS' 可複選篩選；全欄位可點擊排序；預設以「評分」由大到小
           條件化著色：
             * 評分、上季評分：#09734E，低值→透明，高值→不透明（alpha 0→1）
             * 本季增減、差額：以 0 為中點；>0 用 #09734E、<0 用 #7D2C2D；越極端 alpha 越高；0 時「不著色（透明）」
 - Team：先顯示東/西 30 隊；點入隊頁左側 Depth Chart、右側「球員資訊」表；
         右側表格的著色使用「全體球員」的分佈（先著色再篩選）
         提供返回 30 隊按鈕；點上方 Team 頁籤也會回到 30 隊
 - Predict：東西區左右並排；欄位：隊伍、中文、賭盤盤口、樂觀預測、悲觀預測、預測勝場、Over/Under
           預測勝場 = (樂觀 + 悲觀)/2；Over/Under 依與盤口差（顯示 ± 差值）；可排序；盤口寫入 localStorage
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
const PRESET_FLAG_KEY = "nba_preset_loaded_v1"; // 避免重覆載入
const BASE_PATH = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL)
  ? import.meta.env.BASE_URL
  : '/';

// 取得在 GitHub Pages 下可用的預設資料 URL：
// - 若你用 Route A（main/docs 發佈），把檔案放到 docs/data/preset.json
// - 也支援 Vite 的 public/data/preset.json（build 後會變成 /data/preset.json）
function getPresetURL(){
  // 優先嘗試相對於網站根路徑（會自動含 base，例如 /NBA-2025-Player-Rating/）
  const url1 = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL ? import.meta.env.BASE_URL : '/') + 'data/preset.json';
  return url1;
}

// --- 工具 ---
const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`);

function fmtMoney(n){
  if (n == null || n === "") return "";
  const num = Number(n)||0;
  const v = Math.round(num);
  const abs = Math.abs(v).toLocaleString();
  return v<0? (`-$${abs}`): (`$${abs}`);
}
function parseMoney(s){
  if(typeof s === 'number') return s;
  let str = String(s||'').trim();
  const negParen = /^\(.*\)$/.test(str);
  str = str
    .replace(/[＄]/g,'$')
    .replace(/[，]/g,',')
    .replace(/[−–—]/g,'-')
    .replace(/[＋]/g,'+')
    .replace(/US\$|NT\$|HK\$|CNY|RMB|USD|TWD|HKD/gi,'')
    .replace(/[\s]/g,'');
  str = str.replace(/[^0-9+\-\.]/g,'');
  let num = Number(str||0);
  if(negParen) num = -Math.abs(num);
  return isFinite(num)? num : 0;
}

async function readFileAsText(file){
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
    }catch{ /* 某些瀏覽器可能不支援所有標籤 */ }
  }
  if(bestText) return bestText;
  try{ return new TextDecoder('utf-8').decode(bytes);}catch{ return ''; }
}

function readFileAsDataURL(file){
  return new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(file); });
}

// --- CSV 解析 ---
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

// 色彩工具
function hexToRgb(hex){ const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return m? [parseInt(m[1],16),parseInt(m[2],16),parseInt(m[3],16)] : [0,0,0]; }
function rgba(hex, a){ const [r,g,b]=hexToRgb(hex); const aa=Math.max(0,Math.min(1,a)); return `rgba(${r}, ${g}, ${b}, ${aa})`; }

// 條件化著色：
function colorMono(val,min,max,hex="#09734E"){ if(val==null||isNaN(val)||max==null||min==null||max<=min) return 'transparent'; const t=(val-min)/(max-min); return rgba(hex, Math.max(0, Math.min(1, t))); }
function colorDiverge(val,min,max,hexPos="#09734E",hexNeg="#7D2C2D"){ if(val==null||isNaN(val)||max==null||min==null||max<=min) return 'transparent'; if(val===0) return 'transparent'; const posRange = Math.max(0, max); const negRange = Math.abs(Math.min(0, min)); if(val>0){ const a = posRange? Math.min(1, val/posRange): 0; return rgba(hexPos,a); } else { const a = negRange? Math.min(1, Math.abs(val)/negRange): 0; return rgba(hexNeg,a); } }

// 差額：評估薪水 - 真實薪水
const salaryDiff = (p)=> (Number(p?.評估薪水)||0) - (Number(p?.真實薪水)||0);

// 轉換 CSV -> players 陣列（精簡版：不做欄位名稱 replace，需與表格標題完全一致）
function csvToPlayers(csvText){
  const rows = parseCSV(csvText);
  if (!rows.length) return [];
  const header = rows[0];

  // 你的 CSV 欄位必須「一字不差」：
  // Rank、PLAYER、TEAM、POS、POS'、評分、上季評分、本季增減、真實薪水、評估薪水、差額
  const idx = (name)=> header.indexOf(name);
  const idxRank       = idx('Rank');
  const idxPLAYER     = idx('PLAYER');
  const idxTEAM       = idx('TEAM');
  const idxPOS        = idx('POS');
  // 允許備援：若沒有 POS'，就找 POS2（不做字串替換，只做一次性偵測）
  const idxPOS2       = (idx("POS'") !== -1 ? idx("POS'") : idx('POS2'));
  const idxRating     = idx('評分');
  const idxPrevRating = idx('上季評分');
  const idxDelta      = idx('本季增減');
  const idxReal       = idx('真實薪水');
  const idxEst        = idx('評估薪水');
  const idxDiff       = idx('差額'); // 若 CSV 也給了差額，讀進來但顯示仍以動態計算為準

  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(x => !x || !String(x).trim())) continue;

    const real = idxReal>=0 ? parseMoney(row[idxReal]) : 0;
    const est  = idxEst >=0 ? parseMoney(row[idxEst ]) : 0;

    out.push({
      id: newId(),
      Rank:        idxRank      >=0 ? Number(row[idxRank])||0 : undefined,
      PLAYER:      idxPLAYER    >=0 ? row[idxPLAYER] : '',
      TEAM:        idxTEAM      >=0 ? String(row[idxTEAM]||'').toUpperCase() : '',
      POS:         idxPOS       >=0 ? row[idxPOS] : '',
      POS2:        idxPOS2      >=0 ? row[idxPOS2] : '',
      評分:        idxRating    >=0 ? Number(row[idxRating])||0 : 0,
      上季評分:    idxPrevRating>=0 ? Number(row[idxPrevRating])||0 : undefined,
      本季增減:    idxDelta     >=0 ? Number(row[idxDelta])||0 : undefined,
      真實薪水:    real,
      評估薪水:    est,
      差額:        (idxDiff>=0 ? Number(parseMoney(row[idxDiff])) : (est - real)),
      cardImage:   null,
    });
  }
  return out;
}

function playersToCSV(players){
  const header=["Rank","PLAYER","TEAM","POS","POS'","評分","上季評分","本季增減","真實薪水","評估薪水","差額"];
  const esc=(v)=>{ const s=String(v??""); return (s.includes(',')||s.includes('\n')||s.includes('"'))?('"'+s.replace(/"/g,'""')+'"'):s; };
  const lines=[header.join(',')];
  for(const p of players){
    const diff = salaryDiff(p);
    lines.push([
      esc(p.Rank), esc(p.PLAYER), esc(p.TEAM), esc(p.POS), esc(p.POS2),
      p.評分??"", p.上季評分??"", p.本季增減??"", p.真實薪水, p.評估薪水, diff
    ].join(','));
  }
  return lines.join('\n');
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
  predictLine: Object.fromEntries(TEAMS.map(t=>[t.abbr,0])),
  predictOpt:  Object.fromEntries(TEAMS.map(t=>[t.abbr,0])),
  predictPes:  Object.fromEntries(TEAMS.map(t=>[t.abbr,0])),
};

// ==========================================================
// UI 元件
// ==========================================================
function TopTabs({tab,setTab}){
  const TabBtn=({id,label})=> (
    <button
      onClick={()=>setTab(id)}
      className={`px-4 py-2 rounded-xl border text-base shadow-sm mr-2 ${tab===id? 'bg-blue-600 text-white border-blue-600':'bg-zinc-900 text-zinc-100 border-zinc-700 hover:bg-zinc-800'}`}
    >{label}</button>
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
      <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-4 shadow-sm text-base">{children}</div>
    </div>
  );
}

function DownloadBtn({name, text}){
  return (
    <button
      onClick={()=>{ const blob=new Blob([text],{type:'text/plain;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); }}
      className="px-3 py-2 rounded-xl border text-base bg-zinc-900 text-zinc-100 border-zinc-700 shadow-sm"
    >下載</button>
  );
}

// ==========================================================
// Player Tab：匯入/匯出 + 表格 + 球員卡
// ==========================================================
// ================= PlayerTab（全聯盟列表，排序） =================
function PlayerTab({app,setApp,goPlayerCard}){
  const players = app?.players || [];
  const [sortKey,setSortKey] = useState('評分');
  const [sortAsc,setSortAsc] = useState(false);

  // 全體分佈（先著色再篩選的規則，這裡沒有篩選，直接用全體）
  const stats = useMemo(()=>{
    const monoCols=['評分','上季評分','真實薪水','評估薪水'];
    const divCols=['本季增減','差額'];
    const mono=Object.fromEntries(monoCols.map(c=>[c,{min:Infinity,max:-Infinity}]));
    const div =Object.fromEntries(divCols.map(c=>[c,{min:Infinity,max:-Infinity}]));
    for(const p of players){
      for(const c of monoCols){ const v=Number(c==='真實薪水'?p['真實薪水']: c==='評估薪水'?p['評估薪水']: p[c]); if(!isFinite(v)) continue; mono[c].min=Math.min(mono[c].min,v); mono[c].max=Math.max(mono[c].max,v); }
      const d = salaryDiff(p); if(isFinite(d)){ div['差額'].min=Math.min(div['差額'].min,d); div['差額'].max=Math.max(div['差額'].max,d); }
      const del = Number(p['本季增減']); if(isFinite(del)){ div['本季增減'].min=Math.min(div['本季增減'].min,del); div['本季增減'].max=Math.max(div['本季增減'].max,del); }
    }
    for(const c of Object.keys(mono)){ if(mono[c].min===Infinity){ mono[c]={min:0,max:1}; } }
    for(const c of Object.keys(div)){ if(div[c].min===Infinity){ div[c]={min:-1,max:1}; } }
    return {mono,div};
  },[players]);

  const rows = useMemo(()=>{
    const arr=[...players]; const dir=sortAsc?1:-1;
    arr.sort((a,b)=>{
      const A = sortKey==='差額' ? salaryDiff(a) : a[sortKey];
      const B = sortKey==='差額' ? salaryDiff(b) : b[sortKey];
      if(typeof A==='number' && typeof B==='number') return (A-B)*dir;
      return String(A??'').localeCompare(String(B??''))*dir;
    });
    return arr;
  },[players,sortKey,sortAsc]);

  function header(label,key){ const active=sortKey===key; return (
    <th className="p-3 cursor-pointer select-none text-lg" onClick={()=>{ if(active) setSortAsc(s=>!s); else { setSortKey(key); setSortAsc(key==='評分'? false:true);} }}>
      <span className="underline decoration-dotted underline-offset-4">{label}</span>{' '}{active ? (sortAsc ? '▲':'▼') : ''}
    </th>
  ); }

  return (
    <div className="max-w-[2400px] mx-auto px-6 py-6">
      <Section title="球員表（點欄位可排序）">
        <div className="overflow-auto max-h-[80vh]">
          <table className="min-w-full text-lg">
            <thead className="sticky top-0 z-10 bg-zinc-900">
              <tr className="text-left font-semibold border-b border-zinc-700">
                {header('Rank','Rank')}
                {header('PLAYER','PLAYER')}
                {header('TEAM','TEAM')}
                {header('POS','POS')}
                {header("POS'",'POS2')}
                {header('評分','評分')}
                {header('上季評分','上季評分')}
                {header('本季增減','本季增減')}
                {header('真實薪水','真實薪水')}
                {header('評估薪水','評估薪水')}
                {header('差額','差額')}
              </tr>
            </thead>
            <tbody>
              {rows.map(p=> {
                const diff = salaryDiff(p);
                return (
                  <tr key={p.id} className="border-t border-zinc-800">
                    <td className="p-3">{p.Rank??''}</td>
                    <td className="p-3 text-blue-400 underline-offset-2 hover:underline cursor-pointer" onClick={()=>goPlayerCard(p)}>{p.PLAYER}</td>
                    <td className="p-3">{p.TEAM}</td>
                    <td className="p-3">{p.POS}</td>
                    <td className="p-3">{p.POS2}</td>
                    <td className="p-3" style={{background:colorMono(Number(p.評分),  stats.mono['評分'].min,    stats.mono['評分'].max)}}>{p.評分}</td>
                    <td className="p-3" style={{background:colorMono(Number(p.上季評分),stats.mono['上季評分'].min,stats.mono['上季評分'].max)}}>{p.上季評分??''}</td>
                    <td className="p-3" style={{background:colorDiverge(Number(p.本季增減),stats.div['本季增減'].min,stats.div['本季增減'].max)}}>{p.本季增減??''}</td>
                    <td className="p-3" style={{background:colorMono(Number(p.真實薪水),stats.mono['真實薪水'].min,stats.mono['真實薪水'].max)}}>{fmtMoney(p.真實薪水)}</td>
                    <td className="p-3" style={{background:colorMono(Number(p.評估薪水),stats.mono['評估薪水'].min,stats.mono['評估薪水'].max)}}>{fmtMoney(p.評估薪水)}</td>
                    <td className="p-3 font-medium" style={{background:colorDiverge(diff,stats.div['差額'].min,stats.div['差額'].max)}}>{fmtMoney(diff)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

// ================= PlayerCard（球員卡） =================
function PlayerCard({app,setApp,player,back,allPlayers,selectPlayer,goTeam}){
  const isAdmin = (typeof window!=='undefined') && (new URLSearchParams(window.location.search).get('admin')==='1');
  const sameTeamPlayers = useMemo(()=> (allPlayers||[]).filter(x=>x.TEAM===player?.TEAM),[allPlayers,player]);

  async function onUploadCard(file){
    const url = await readFileAsDataURL(file);
    const nextPlayers = (app.players||[]).map(x=> x.id===player.id ? {...x, cardImage:url} : x);
    const next = {...app, players: nextPlayers};
    setApp(next); saveApp(next);
    const updated = nextPlayers.find(x=>x.id===player.id);
    if(updated) selectPlayer(updated);
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-6 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={back} className="px-3 py-2 rounded-xl border text-base bg-zinc-900 text-zinc-100 border-zinc-700 shadow-sm">← 返回球員頁</button>
        {player?.TEAM && (
          <button onClick={()=>goTeam(player.TEAM)} className="px-3 py-2 rounded-xl border text-base bg-zinc-900 text-zinc-100 border-zinc-700 shadow-sm">← 返回 {player.TEAM}</button>
        )}
        <div className="text-2xl font-bold">{player?.PLAYER}</div>
        <div className="text-base text-zinc-400">{player?.TEAM} · {player?.POS}{player?.POS2?` / ${player.POS2}`:''}</div>
        <div className="ml-auto flex items-center gap-2">
          <select className="px-3 py-2 rounded-xl border bg-zinc-900 text-zinc-100 border-zinc-700" value={player?.id} onChange={e=>{ const p=(allPlayers||[]).find(x=>x.id===e.target.value); if(p) selectPlayer(p); }}>
            {(allPlayers||[]).map(p=> <option key={p.id} value={p.id}>{p.PLAYER}（{p.TEAM}）</option>)}
          </select>
          <select className="px-3 py-2 rounded-xl border bg-zinc-900 text-zinc-100 border-zinc-700" value={player?.id} onChange={e=>{ const p=sameTeamPlayers.find(x=>x.id===e.target.value); if(p) selectPlayer(p); }}>
            {sameTeamPlayers.map(p=> <option key={p.id} value={p.id}>{p.PLAYER}</option>)}
          </select>
        </div>
      </div>

      <Section title="球員卡圖片" right={isAdmin ? (
        <label className="cursor-pointer px-3 py-2 rounded-xl border text-base bg-zinc-900 text-zinc-100 border-zinc-700 shadow-sm">上傳
          <input type="file" accept="image/*" className="hidden" onChange={e=> e.target.files?.[0] && onUploadCard(e.target.files[0])} />
        </label>
      ) : null}>
        {player?.cardImage ? (
          <div className="overflow-auto border border-zinc-700 rounded-xl p-2" style={{maxHeight:'80vh'}}>
            <img src={player.cardImage} alt="card" className="block max-w-none h-auto" />
          </div>
        ) : (
          <div className="text-base text-zinc-400">尚未上傳球員卡圖片（建議直式）。{isAdmin? ' 使用上傳按鈕新增。':''}</div>
        )}
      </Section>
    </div>
  );
}

// ================= TeamDetail（單隊頁：Depth + 表格） =================（單隊頁：Depth + 表格） =================
function TeamDetail({abbr, app, setApp, openPlayerCard, onSwitchTeam, isAdmin}){
  const all = app?.players || [];
  const team = TEAMS.find(t=>t.abbr===abbr) || {abbr, nameZh:'', conf:''};
  const img  = app?.teamImages?.[abbr] || null;
  const [sortKey,setSortKey] = useState('評分');
  const [sortAsc,setSortAsc] = useState(false);

  const teamPlayers = useMemo(()=> all.filter(p=>p.TEAM===abbr),[all,abbr]);

  const stats=useMemo(()=>{
    const monoCols=['評分','上季評分','真實薪水','評估薪水'];
    const divCols=['本季增減','差額'];
    const mono=Object.fromEntries(monoCols.map(c=>[c,{min:Infinity,max:-Infinity}]));
    const div =Object.fromEntries(divCols.map(c=>[c,{min:Infinity,max:-Infinity}]));
    for(const p of all){
      for(const c of monoCols){ const v=Number(c==='真實薪水'?p['真實薪水']: c==='評估薪水'?p['評估薪水']: p[c]); if(!isFinite(v)) continue; mono[c].min=Math.min(mono[c].min,v); mono[c].max=Math.max(mono[c].max,v); }
      const d = salaryDiff(p); if(isFinite(d)){ div['差額'].min=Math.min(div['差額'].min,d); div['差額'].max=Math.max(div['差額'].max,d); }
      const del = Number(p['本季增減']); if(isFinite(del)){ div['本季增減'].min=Math.min(div['本季增減'].min,del); div['本季增減'].max=Math.max(div['本季增減'].max,del); }
    }
    for(const c of Object.keys(mono)){ if(mono[c].min===Infinity){ mono[c]={min:0,max:1}; } }
    for(const c of Object.keys(div)){ if(div[c].min===Infinity){ div[c]={min:-1,max:1}; } }
    return {mono,div};
  },[all]);

  const rows = useMemo(()=>{ const arr=[...teamPlayers]; const dir=sortAsc?1:-1; arr.sort((a,b)=>{ const A=a[sortKey]; const B=b[sortKey]; if(typeof A==='number' && typeof B==='number') return (A-B)*dir; return String(A??'').localeCompare(String(B??''))*dir; }); return arr; },[teamPlayers,sortKey,sortAsc]);

  function header(label,key){ const active=sortKey===key; return (
    <th className="p-3 cursor-pointer select-none text-lg" onClick={()=>{ if(active) setSortAsc(s=>!s); else { setSortKey(key); setSortAsc(key==='評分'? false:true);} }}>
      <span className="underline decoration-dotted underline-offset-4">{label}</span>{' '}{active ? (sortAsc ? '▲':'▼') : ''}
    </th>
  ); }

  async function onUploadDepth(file){ const url=await readFileAsDataURL(file); const next={...app, teamImages:{...app.teamImages,[abbr]:url}}; setApp(next); saveApp(next); }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={()=>onSwitchTeam('')} className="px-3 py-2 rounded-xl border text-base bg-zinc-900 text-zinc-100 border-zinc-700 shadow-sm">← 返回 30 隊</button>
        <div className="text-2xl font-bold">{team.nameZh}（{abbr}）</div>
        <select className="px-3 py-2 rounded-xl border bg-zinc-900 text-zinc-100 border-zinc-700" value={abbr} onChange={e=>onSwitchTeam(e.target.value)}>
          {[...EAST,...WEST].sort((a,b)=>a.abbr.localeCompare(b.abbr)).map(t=> <option key={t.abbr} value={t.abbr}>{t.abbr} - {t.nameZh}</option>)}
        </select>
        <div className="ml-auto text-sm text-zinc-400">分區：{team.conf}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="球隊 Depth Chart" right={isAdmin ? (
          <label className="cursor-pointer px-3 py-2 rounded-xl border text-base bg-zinc-900 text-zinc-100 border-zinc-700 shadow-sm">上傳
            <input type="file" accept="image/*" className="hidden" onChange={e=> e.target.files?.[0] && onUploadDepth(e.target.files[0])} />
          </label>
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
            <table className="min-w-full text-lg">
              <thead>
                <tr className="text-left font-semibold">
                  {header('Rank','Rank')}
                  {header('PLAYER','PLAYER')}
                  {header('POS','POS')}
                  {header('評分','評分')}
                  {header('上季評分','上季評分')}
                  {header('本季增減','本季增減')}
                </tr>
              </thead>
              <tbody>
                {rows.map(p=> (
                  <tr key={p.id} className="border-t border-zinc-800">
                    <td className="p-3">{p.Rank??''}</td>
                    <td className="p-3 text-blue-400 underline-offset-2 hover:underline cursor-pointer" onClick={()=>openPlayerCard(p)}>{p.PLAYER}</td>
                    <td className="p-3">{p.POS}{p.POS2?` / ${p.POS2}`:''}</td>
                    <td className="p-3" style={{background:colorMono(Number(p.評分),  stats.mono['評分'].min,    stats.mono['評分'].max)}}>{p.評分}</td>
                    <td className="p-3" style={{background:colorMono(Number(p.上季評分),stats.mono['上季評分'].min,stats.mono['上季評分'].max)}}>{p.上季評分??''}</td>
                    <td className="p-3" style={{background:colorDiverge(Number(p.本季增減),stats.div['本季增減'].min,stats.div['本季增減'].max)}}>{p.本季增減??''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="薪資分析">
          <div className="overflow-auto">
            <table className="min-w-full text-lg">
              <thead>
                <tr className="text-left font-semibold">
                  <th className="p-3">Rank</th>
                  <th className="p-3">PLAYER</th>
                  <th className="p-3">POS</th>
                  <th className="p-3">評分</th>
                  <th className="p-3">真實薪水</th>
                  <th className="p-3">評估薪水</th>
                  <th className="p-3">差額</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(p=> {
                  const diff = salaryDiff(p);
                  return (
                    <tr key={p.id} className="border-t border-zinc-800">
                      <td className="p-3">{p.Rank??''}</td>
                      <td className="p-3 text-blue-400 underline-offset-2 hover:underline cursor-pointer" onClick={()=>openPlayerCard(p)}>{p.PLAYER}</td>
                      <td className="p-3">{p.POS}{p.POS2?` / ${p.POS2}`:''}</td>
                      <td className="p-3" style={{background:colorMono(Number(p.評分),  stats.mono['評分'].min,    stats.mono['評分'].max)}}>{p.評分}</td>
                      <td className="p-3" style={{background:colorMono(Number(p.真實薪水), stats.mono['真實薪水'].min, stats.mono['真實薪水'].max)}}>{fmtMoney(p.真實薪水)}</td>
                      <td className="p-3" style={{background:colorMono(Number(p.評估薪水), stats.mono['評估薪水'].min, stats.mono['評估薪水'].max)}}>{fmtMoney(p.評估薪水)}</td>
                      <td className="p-3 font-medium" style={{background:colorDiverge(diff, stats.div['差額'].min, stats.div['差額'].max)}}>{fmtMoney(diff)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
        </div>
      </div>
    </div>
  );
}

function TeamTab({app,setApp, openPlayerCard, teamAbbr, setTeamAbbr, isAdmin}){
  return (
    <div className="px-6 py-6">
      {!teamAbbr ? (
        <div className="max-w-[1800px] mx-auto">
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
            <Section title="東區（Eastern Conference）">
              <TeamGrid teams={[...EAST]} onSelect={setTeamAbbr} />
            </Section>
            <Section title="西區（Western Conference）">
              <TeamGrid teams={[...WEST]} onSelect={setTeamAbbr} />
            </Section>
          </div>
        </div>
      ) : (
        <div className="max-w-[2400px] mx-auto">
          <TeamDetail abbr={teamAbbr} app={app} setApp={setApp} openPlayerCard={openPlayerCard} onSwitchTeam={setTeamAbbr} isAdmin={isAdmin} />
        </div>
      )}
    </div>
  );
}

// ==========================================================
// Predict Tab：東/西 15 隊 + 可填勝場 + 可排序
// ==========================================================
// ==========================================================
// TeamGrid：30 隊清單（可點選進入單隊頁）
// ==========================================================
function TeamGrid({teams, onSelect}){
  return (
    <div className="grid grid-cols-5 gap-3">
      {teams.map(t=> (
        <button key={t.abbr}
                onClick={()=>onSelect && onSelect(t.abbr)}
                className="text-left px-4 py-3 rounded-2xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 transition shadow-sm">
          <div className="text-xl font-bold tracking-wider">{t.abbr}</div>
          <div className="text-sm text-zinc-400 mt-0.5">{t.nameZh}</div>
        </button>
      ))}
    </div>
  );
}

function PredictTab({app,setApp}){
  const predictLine = app?.predictLine || {};
  const predictOpt  = app?.predictOpt  || {};
  const predictPes  = app?.predictPes  || {};

  const setLine=(abbr,val)=>{ const v=Number(val)||0; const next={...app, predictLine:{...predictLine,[abbr]:v}}; setApp(next); saveApp(next); };
  const setOpt =(abbr,val)=>{ const v=Number(val)||0; const next={...app, predictOpt :{...predictOpt ,[abbr]:v}}; setApp(next); saveApp(next); };
  const setPes =(abbr,val)=>{ const v=Number(val)||0; const next={...app, predictPes :{...predictPes ,[abbr]:v}}; setApp(next); saveApp(next); };

  const predicted = (abbr)=>{ const o=Number(predictOpt[abbr]||0); const p=Number(predictPes[abbr]||0); return (o+p)/2; };
  const diffToLine = (abbr)=>{ const pred=predicted(abbr); const line=Number(predictLine[abbr]||0); return pred - line; };

  function Table({label, teams}){
    const [sortKey,setSortKey] = useState('預測勝場');
    const [sortAsc,setSortAsc] = useState(false);

    const rows = useMemo(()=>{
      const arr=[...teams]; const dir=sortAsc?1:-1;
      arr.sort((a,b)=>{
        let A,B;
        if(sortKey==='隊伍'){ A=a.abbr; B=b.abbr; return A.localeCompare(B)*dir; }
        if(sortKey==='賭盤盤口'){ A=Number(predictLine[a.abbr]||0); B=Number(predictLine[b.abbr]||0); return (A-B)*dir; }
        if(sortKey==='預測勝場'){ A=predicted(a.abbr); B=predicted(b.abbr); return (A-B)*dir; }
        if(sortKey==='Over/Under'){ A=diffToLine(a.abbr); B=diffToLine(b.abbr); return (A-B)*dir; }
        return 0;
      });
      return arr;
    },[teams,sortKey,sortAsc,predictLine,predictOpt,predictPes]);

    function H({label,key}){ const active=sortKey===key; return (
      <th className="p-2 cursor-pointer select-none" onClick={()=>{ if(active) setSortAsc(s=>!s); else { setSortKey(key); setSortAsc(key==='隊伍'); }}}>
        <span className="underline decoration-dotted underline-offset-4">{label}</span>{' '}{active ? (sortAsc ? '▲':'▼') : ''}
      </th>
    ); }

    return (
      <Section title={`${label}`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-base">
            <thead>
              <tr className="text-left font-semibold">
                {H({label:'隊伍', key:'隊伍'})}
                <th className="p-2">中文</th>
                {H({label:'賭盤盤口', key:'賭盤盤口'})}
                <th className="p-2">樂觀預測</th>
                <th className="p-2">悲觀預測</th>
                {H({label:'預測勝場', key:'預測勝場'})}
                {H({label:'Over/Under', key:'Over/Under'})}
              </tr>
            </thead>
            <tbody>
              {rows.map((t)=>{
                const pred = predicted(t.abbr);
                const d = diffToLine(t.abbr);
                const ouText = d>0 ? `Over +${d.toFixed(1)}` : d<0 ? `Under ${d.toFixed(1)}` : `Push 0.0`;
                const ouCls = d>0? 'text-green-400' : d<0? 'text-red-400' : 'text-zinc-400';
                return (
                  <tr key={t.abbr} className="border-t border-zinc-800">
                    <td className="p-2">
                      <div className="text-base font-semibold">{t.abbr}</div>
                    </td>
                    <td className="p-2">{t.nameZh}</td>
                    <td className="p-2 w-32"><input className="w-28 px-2 py-1 rounded border bg-zinc-900 text-zinc-100 border-zinc-700" type="number" step="0.5" value={predictLine[t.abbr]||0} onChange={e=>setLine(t.abbr, e.target.value)} /></td>
                    <td className="p-2 w-32"><input className="w-28 px-2 py-1 rounded border bg-zinc-900 text-zinc-100 border-zinc-700" type="number" step="0.5" value={predictOpt[t.abbr]||0}  onChange={e=>setOpt (t.abbr, e.target.value)} /></td>
                    <td className="p-2 w-32"><input className="w-28 px-2 py-1 rounded border bg-zinc-900 text-zinc-100 border-zinc-700" type="number" step="0.5" value={predictPes[t.abbr]||0}  onChange={e=>setPes (t.abbr, e.target.value)} /></td>
                    <td className="p-2">{pred.toFixed(1)}</td>
                    <td className={`p-2 font-semibold ${ouCls}`}>{ouText}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    );
  }

  return (
    <div className="max-w-[1800px] mx-auto px-6 py-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
      <Table label="東區" teams={EAST} />
      <Table label="西區" teams={WEST} />
    </div>
  );
}

// ==========================================================
// 內建小型測試
// ==========================================================
function assert(name, cond){ console[cond? 'log':'error'](`🧪 ${cond?'PASS':'FAIL'} - ${name}`); }
export function runTests(){
  try{
    const csv = `Rank,PLAYER,TEAM,POS,POS',評分,上季評分,本季增減,真實薪水,評估薪水,差額
1,A,ATL,G,,9.5,8.5,1.0,1000000,1200000,200000
2,"B, Jr.",BOS,F,C,8,8.2,-0.2,2000000,1500000,-500000`;
    const rows = parseCSV(csv);
    assert('parseCSV rows length', rows.length===3);
    assert('parseCSV quoted comma', rows[2][1]==='B, Jr.');

    const ps = csvToPlayers(csv);
    assert('csvToPlayers length', ps.length===2);
    assert('csvToPlayers TEAM upper', ps[0].TEAM==='ATL');
    assert('csvToPlayers delta keep', ps[1].本季增減===-0.2);
    assert('salaryDiff calc row1', salaryDiff(ps[0])===200000);
    assert('salaryDiff calc row2', salaryDiff(ps[1])===-500000);

    const csv2 = playersToCSV(ps);
    assert("playersToCSV header POS'", csv2.split('\n')[0].includes("POS'"));
    assert('playersToCSV header 包含上季/本季增減', csv2.split('\n')[0].includes('上季評分') && csv2.split('\n')[0].includes('本季增減'));

    const cLow = colorMono(1, 0, 10);
    const cHigh= colorMono(9, 0, 10);
    assert('colorMono alpha increases', cLow!==cHigh);

    assert('colorDiverge zero transparent', colorDiverge(0,-5,5)==='transparent');
    assert('colorDiverge positive rgba', colorDiverge(5,-5,5).startsWith('rgba('));
    assert('colorDiverge negative rgba', colorDiverge(-5,-5,5).startsWith('rgba('));

    assert('parseMoney currency words', parseMoney('US$1,234')===1234);
    assert('parseMoney unicode minus', parseMoney('−500')===-500);
    assert('parseMoney paren negative', parseMoney('(1,000)')===-1000);
    assert('fmtMoney negative sign', fmtMoney(-9876)==='-$9,876');
  }catch(e){ console.error('🧪 TEST ERROR', e); }
}

// ==========================================================
// App 主體（Dark-only）
// ==========================================================
export default function App(){
  async function tryLoadPresetOnce(current){
    try{
      if(typeof window==='undefined') return;
      const already = localStorage.getItem(PRESET_FLAG_KEY);
      const empty = !current || !Array.isArray(current.players) || current.players.length===0;
      if(already || !empty) return;
      const url = getPresetURL();
      const res = await fetch(url, { cache: 'no-store' });
      if(!res.ok) return;
      const data = await res.json();
      const merged = { ...DEFAULT_STATE, ...data };
      saveApp(merged);
      setApp(merged);
      localStorage.setItem(PRESET_FLAG_KEY, '1');
      console.log('Preset loaded from', url);
    }catch(err){ console.warn('Preset load skipped:', err); }
  }
  const [app,setApp] = useState(loadApp()||DEFAULT_STATE);
  useEffect(()=>{ tryLoadPresetOnce(app); /* 首次載入：若本機無資料，嘗試抓 /data/preset.json */ },[]);
  const [tab,setTab] = useState('Player');
  const [teamAbbr,setTeamAbbr] = useState('LAL');
  const [playerCard,setPlayerCard] = useState(null);
  useEffect(()=>{ document.title='NBA 2025 Player Rating'; },[]);
  const isAdmin = (typeof window!=='undefined') && (new URLSearchParams(window.location.search).get('admin')==='1');

  function openPlayerCard(p){ setPlayerCard(p); setTab('Player'); }

  useEffect(()=>{ const id=setTimeout(()=>saveApp(app), 200); return ()=>clearTimeout(id); },[app]);

  const setTabAndMaybeReset=(id)=>{ if(id==='Team') setTeamAbbr(''); setTab(id); };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <TopTabs tab={tab} setTab={setTabAndMaybeReset} />

      {isAdmin && (
      <div className="w-full px-6 py-4 flex items-center gap-2">
        <label className="px-3 py-2 rounded-xl border text-base bg-zinc-900 text-zinc-100 border-zinc-700 shadow-sm cursor-pointer">匯入 JSON
          <input type="file" accept="application/json" className="hidden" onChange={e=>e.target.files?.[0]&& (async (f)=>{ try{ const text=await readFileAsText(f); const data=JSON.parse(text); const merged={...DEFAULT_STATE,...data}; setApp(merged); saveApp(merged);} catch(err){ alert('JSON 匯入失敗：'+err.message); } })(e.target.files[0])} />
        </label>
        <DownloadBtn name="nba_all_data.json" text={JSON.stringify(app,null,2)} />
        <button className="ml-auto px-3 py-2 rounded-xl border text-xs bg-zinc-900 text-zinc-100 border-zinc-700" onClick={()=>runTests()}>🧪 執行內建測試</button>
      </div>
      )}

      {tab==='Player' && !playerCard && (
        <PlayerTab app={app} setApp={setApp} goPlayerCard={openPlayerCard} />
      )}
      {tab==='Player' && playerCard && (
        <PlayerCard
          app={app}
          setApp={setApp}
          player={playerCard}
          back={()=>setPlayerCard(null)}
          allPlayers={app.players}
          selectPlayer={setPlayerCard}
          goTeam={(abbr)=>{ setTeamAbbr(abbr); setTab('Team'); }}
        />
      )}
      {tab==='Team' && (
        <TeamTab app={app} setApp={setApp} openPlayerCard={openPlayerCard} teamAbbr={teamAbbr} setTeamAbbr={setTeamAbbr} isAdmin={isAdmin} />
      )}
      {tab==='Predict' && (
        <PredictTab app={app} setApp={setApp} />
      )}

      <footer className="w-full px-6 py-10 text-xs text-zinc-500">
        <div>
          📌 提示：Player 匯入 CSV 欄位支援：Rank、PLAYER、TEAM、POS、POS'、評分、上季評分、本季增減、真實薪水、評估薪水、差額（由程式計算）。<br/>
          條件色規則：
          <br/>• 評分/上季評分：#09734E，低值→透明，高值→不透明
          <br/>• 本季增減/差額：0 為中點；&gt;0 #09734E、&lt;0 #7D2C2D；數值越極端透明度越高
        </div>
      </footer>
    </div>
  );
}
