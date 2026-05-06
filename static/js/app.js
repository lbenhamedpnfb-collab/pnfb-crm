// ════════════════════════════════════════════════════════════════ CONSTANTS
const STAGES = ['Prospect','Contacted','Meeting','Proposal','Negotiation','Signed','Deployed'];
const SL = {Prospect:'Prospect',Contacted:'Contacté',Meeting:'RDV Prévu',Proposal:'Proposition',Negotiation:'Négociation',Signed:'Signé ✓',Deployed:'Déployé ✓✓'};
const SECTOR_COLORS = {
  '🧹 Propreté/FM':'#E8500A','🏗️ BTP':'#1A73E8','🍽️ Restauration':'#0F9D58',
  '📦 Logistique':'#7B2FBE','👴 Services Personne':'#F5A623','💼 Intérim/RH':'#0077B5',
  '🏥 Santé':'#E91E8C','🏨 Hôtellerie':'#9C27B0','✈️ Aéroportuaire':'#00ACC1',
  '🛒 Commerce':'#FF7043','🔷 Autre':'#78909C'
};

// ════════════════════════════════════════════════════════════════ STATE
const G = {
  contacts: [],
  view: 'mission',
  sector: null,
  q: '',
  filters: {seg:'', pri:'', at:'', new:''},
  sf: 'score', sd: -1,
  selId: null,
  planState: {},
  metrics: null,
  bulkSel: new Set(),
  formId: null,
};

let ALL_TEMPLATES = [];
let ALL_SCRIPTS   = [];
let ALL_SECTORS   = [];
let ALL_PLAN      = [];
let ALL_KPIS      = {targets:[]};

// ════════════════════════════════════════════════════════════════ API HELPERS
async function apiFetch(url, opts={}) {
  const r = await fetch(url, {headers:{'Content-Type':'application/json'}, ...opts});
  if(r.status === 401) { window.location.href='/login'; return null; }
  return r.json();
}
async function apiPatch(cid, data) {
  return apiFetch(`/api/contacts/${cid}`, {method:'PATCH', body:JSON.stringify(data)});
}

// ════════════════════════════════════════════════════════════════ INIT
// init() defined at bottom of file (overrides this via hoisting — see end of file)

function buildSectorSidebar() {
  // Aggregate counts using canonical sector names to merge variants
  const secCounts = {};
  G.contacts.forEach(c => {
    const canon = canonSec(c.sector);
    if(canon) secCounts[canon] = (secCounts[canon]||0)+1;
  });

  const container = document.getElementById('sb-sectors');
  const rendered = new Set();
  let h = '';

  // Known sectors in fixed order
  Object.entries(SECTOR_COLORS).forEach(([sec, col]) => {
    const cnt = secCounts[sec] || 0;
    if(!cnt) return;
    rendered.add(sec);
    h += `<div class="sb-item" data-v="sector" onclick="setView('sector','${esc(sec)}')">
      <div class="sec-dot" style="background:${col}"></div>
      <span class="lbl">${esc(sec)}</span>
      <span class="bdg bdg-mu">${cnt}</span>
    </div>`;
  });

  // Truly unknown sectors (not matched by canonSec)
  Object.keys(secCounts).forEach(sec => {
    if(rendered.has(sec) || !secCounts[sec]) return;
    rendered.add(sec);
    h += `<div class="sb-item" data-v="sector" onclick="setView('sector','${esc(sec)}')">
      <div class="sec-dot" style="background:#888"></div>
      <span class="lbl">${esc(sec)}</span>
      <span class="bdg bdg-mu">${secCounts[sec]}</span>
    </div>`;
  });
  container.innerHTML = h;
}

function updSidebar() {
  const td = today();
  const ov = G.contacts.filter(c => !isDone(c) && (isOv(c,td)||isTd(c,td)));
  document.getElementById('bdg-today').textContent = ov.length || '0';
  document.getElementById('ss-str').textContent = G.contacts.filter(c=>c.segment==='Strategic').length;
  document.getElementById('ss-qw').textContent  = G.contacts.filter(c=>c.segment==='Quick Win').length;
  document.getElementById('ss-si').textContent  = G.contacts.filter(c=>c.stage==='Signed'||c.stage==='Deployed').length;
}

// ════════════════════════════════════════════════════════════════ NAVIGATION
const VIEW_TITLES = {
  mission:'🎯 Mission Control',growth:'🚀 Growth Dashboard',
  kanban:'📋 Pipeline Kanban',pipeline:'📊 Pipeline Commercial',
  market:'🌍 Étude de Marché',partners:'🤝 Partenaires & Prescripteurs',
  strategic:'⭐ Comptes Stratégiques','all-contacts':'👥 Tous les contacts',
  'new-targets':'🔴 Nouvelles Cibles POEI','sequences':'⚡ Séquences Prospection',
  templates:'✉️ Templates Email',scripts:'📞 Scripts Appels',
  plan90:'📅 Plan 90 Jours',metrics:'📈 Métriques & KPIs',
  settings:'⚙️ Paramètres & Équipe','email-suivi':'📧 Suivi Emails & Relances'
};
function setView(v, sector) {
  G.view = v;
  if(sector) G.sector = sector;
  document.querySelectorAll('.sb-item').forEach(el => el.classList.toggle('active', el.dataset.v===v));
  document.getElementById('view-title').textContent = v==='sector' ? G.sector : (VIEW_TITLES[v]||v);
  render();
}

// ════════════════════════════════════════════════════════════════ FILTERS
function buildFilters() {
  const fr = document.getElementById('filters');
  const segs = ['Strategic','Quick Win','Partner','Long Term','Dormant'];
  let h = '';
  segs.forEach(s => { h += `<button class="fb" data-fk="seg" data-fv="${s}" onclick="tF('seg','${s}')">${s}</button>`; });
  ['HIGH','MEDIUM','LOW'].forEach(p => { h += `<button class="fb" data-fk="pri" data-fv="${p}" onclick="tF('pri','${p}')">${p}</button>`; });
  h += `<button class="fb" data-fk="new" data-fv="1" onclick="tF('new','1')" style="border-color:#E8500A;color:#E8500A">🔴 Nouveaux</button>`;
  fr.innerHTML = h;
}
function tF(k,v) {
  G.filters[k] = G.filters[k]===v ? '' : v;
  document.querySelectorAll(`[data-fk="${k}"]`).forEach(b => b.classList.toggle('on', b.dataset.fv===G.filters[k]));
  render();
}
function onSearch(v) { G.q = v.toLowerCase(); render(); }

function applyF(list) {
  let l = list;
  const q = G.q;
  if(q) l = l.filter(c => (c.company+c.name+c.sector+c.segment+c.next_action+c.notes+c.poei_offer).toLowerCase().includes(q));
  if(G.filters.seg) l = l.filter(c=>c.segment===G.filters.seg);
  if(G.filters.pri) l = l.filter(c=>c.priority===G.filters.pri);
  if(G.filters.at)  l = l.filter(c=>c.action_type===G.filters.at);
  if(G.filters.new) l = l.filter(c=>c.alert==='🔴 NOUVEAU');
  return l;
}

// ════════════════════════════════════════════════════════════════ RENDER
function render() {
  const el = document.getElementById('content');
  const load = (fn) => { el.innerHTML='<div class="loading-state"><div class="loading-spinner"></div></div>'; fn(); };
  if     (G.view==='mission')      load(loadMission);
  else if(G.view==='kanban')       load(loadKanban);
  else if(G.view==='sequences')    load(loadSequencesView);
  else if(G.view==='email-suivi')  load(loadEmailSuivi);
  else if(G.view==='tasks')        load(loadTasks);
  else if(G.view==='growth')       load(loadGrowthDashboard);
  else if(G.view==='dashboard')    load(loadGrowthDashboard);
  else if(G.view==='pipeline')     el.innerHTML = rPipeline();
  else if(G.view==='market')       el.innerHTML = rMarketStudy();
  else if(G.view==='partners')     el.innerHTML = rPartners();
  else if(G.view==='strategic')    el.innerHTML = rStrategic();
  else if(G.view==='all-contacts') el.innerHTML = rAllContacts();
  else if(G.view==='new-targets')  el.innerHTML = rNewTargets();
  else if(G.view==='sector')       el.innerHTML = rSector(G.sector);
  else if(G.view==='templates')    el.innerHTML = rTemplates();
  else if(G.view==='scripts')      el.innerHTML = rScripts();
  else if(G.view==='plan90')       el.innerHTML = rPlan90();
  else if(G.view==='metrics')      el.innerHTML = rMetrics();
  else if(G.view==='settings')     { el.innerHTML = rSettings(); loadUsers(); }
}

// ════════════════════════════════════════════════════════════════ HELPERS
function today() { return new Date().toISOString().split('T')[0]; }
function isDone(c) { return c._done===true; }
function isOv(c,td) { return c.next_action_date && c.next_action_date < td && !isDone(c); }
function isTd(c,td) { return c.next_action_date === td && !isDone(c); }
function segO(c) { return {Strategic:0,Partner:1,'Quick Win':2,'Long Term':3,Dormant:4}[c.segment]??5; }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function segTag(seg) {
  const cls={Strategic:'t-str','Quick Win':'t-qw',Partner:'t-pa','Long Term':'t-lt',Dormant:'t-do'};
  return `<span class="tag ${cls[seg]||'t-do'}">${esc(seg||'')}</span>`;
}
function atTag(t) {
  const ic={Appel:'📞',Email:'✉',LinkedIn:'🔗',Partenariat:'🤝',Enrichir:'⚙',Relance:'🔄',RDV:'📅',Stage:'📊',Note:'📝'};
  const cl={Appel:'t-call',Email:'t-email',LinkedIn:'t-li',Partenariat:'t-part',Enrichir:'t-enr'};
  if(!t) return '';
  return `<span class="tag ${cl[t]||'t-enr'}">${ic[t]||''} ${esc(t)}</span>`;
}
function scoreTag(n) {
  const cls = n>=80?'s-hi':n>=60?'s-mi':'';
  return `<span class="score ${cls}">${n}/100</span>`;
}
function normSec(s) {
  return (s || '').replace(/️/g, '').trim();
}

// Map any sector string (with or without emoji) to the canonical SECTOR_COLORS key
function canonSec(rawSec) {
  if(!rawSec) return '';
  if(SECTOR_COLORS[rawSec]) return rawSec; // already canonical
  // Strip all emoji + variation selectors + punctuation, lowercase
  const strip = s => s
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}\u{FE00}-\u{FEFF}]/gu, '')
    .replace(/️/g,'').trim().toLowerCase();
  const plain = strip(rawSec);
  if(!plain) return rawSec;
  for(const k of Object.keys(SECTOR_COLORS)) {
    const kPlain = strip(k);
    if(kPlain === plain) return k; // exact match after stripping
    // Keyword overlap: split on spaces/slashes, keep words >2 chars
    const kW = kPlain.split(/[\s\/,&À-àÈ-è]+/).filter(w=>w.length>2);
    const pW = plain.split(/[\s\/,&à-à]+/).filter(w=>w.length>2);
    if(kW.length && pW.length && kW.some(w => pW.some(pw => pw.includes(w) || w.includes(pw)))) return k;
  }
  return rawSec; // unknown sector — keep as-is
}

function secColor(sec) {
  if(!sec) return '#888';
  const canon = canonSec(sec);
  return SECTOR_COLORS[canon] || '#888';
}
function quickBtns(c, stop=true) {
  const sp = stop ? 'event.stopPropagation();' : '';
  const ph = c.phone ? `<a href="tel:${(c.phone||'').replace(/\s/g,'')}" class="btn btn-call" onclick="${sp}" title="${esc(c.phone)}">📞</a>` : '';
  const em = c.email&&c.email_status!=='invalid' ? `<a href="mailto:${esc(c.email)}" class="btn btn-email" onclick="${sp}">✉</a>` : '';
  const li = c.linkedin ? `<a href="${esc(c.linkedin)}" target="_blank" class="btn btn-li" onclick="${sp}">in</a>` : '';
  return ph+em+li;
}

// ════════════════════════════════════════════════════════════════ DASHBOARD
function rDashboard() {
  const td = today();
  const list = applyF(G.contacts);
  const ov = list.filter(c=>isOv(c,td)).sort((a,b)=>segO(a)-segO(b)||b.score-a.score);
  const tl = list.filter(c=>isTd(c,td)).sort((a,b)=>segO(a)-segO(b)||b.score-a.score);
  const signed = G.contacts.filter(c=>c.stage==='Signed'||c.stage==='Deployed').length;
  const ve = G.contacts.filter(c=>c.email_status==='valid'||c.email_status==='Verified').length;

  let h = `<div class="dash-grid">
    <div class="kpi-card"><div class="kl">Actions en retard</div><div class="kv" style="color:var(--r)">${ov.length}</div><div class="ks">${tl.length} pour aujourd'hui</div></div>
    <div class="kpi-card"><div class="kl">Contacts total</div><div class="kv">${G.contacts.length}</div><div class="ks">sur ${new Set(G.contacts.map(c=>c.company)).size} entreprises</div></div>
    <div class="kpi-card"><div class="kl">Segment Strategic</div><div class="kv" style="color:var(--r)">${G.contacts.filter(c=>c.segment==='Strategic').length}</div><div class="ks">comptes prioritaires</div></div>
    <div class="kpi-card"><div class="kl">Emails valides</div><div class="kv" style="color:var(--g)">${ve}</div><div class="ks">contacts joignables</div></div>
    <div class="kpi-card"><div class="kl">Signés / Déployés</div><div class="kv" style="color:var(--g)">${signed}</div><div class="ks">conventions actives</div></div>
    <div class="kpi-card"><div class="kl">Score moyen</div><div class="kv">${G.contacts.length?Math.round(G.contacts.reduce((s,c)=>s+c.score,0)/G.contacts.length):0}</div><div class="ks">sur 100 pts</div></div>
  </div>`;

  h += '<div class="dash-cols"><div class="dash-actions">';
  if(ov.length) {
    h += `<div class="section-head"><h3>En retard <span class="tag t-ov" style="margin-left:5px">${ov.length}</span></h3></div><div class="ai-list">`;
    ov.slice(0,8).forEach(c => { h += rAI(c,'ov'); });
    if(ov.length>8) h += `<div style="text-align:center;padding:8px;font-size:12px;color:var(--mu)">${ov.length-8} autres actions en retard…</div>`;
    h += '</div>';
  }
  if(tl.length) {
    h += `<div class="section-head" style="margin-top:${ov.length?16:0}px"><h3>Aujourd'hui <span class="tag t-td" style="margin-left:5px">${tl.length}</span></h3></div><div class="ai-list">`;
    tl.slice(0,6).forEach(c => { h += rAI(c,'td'); });
    h += '</div>';
  }
  if(!ov.length&&!tl.length) h += '<div class="empty"><div class="ei">🎉</div><h3>Aucune action en retard</h3><p>Toutes les actions du jour sont à jour !</p></div>';
  h += '</div><div class="dash-side">';
  h += '<div class="dash-side-card"><h3>Pipeline</h3>';
  const sc={}; STAGES.forEach(s=>{sc[s]=0;}); G.contacts.forEach(c=>{const s=c.stage||'Prospect';if(sc[s]!==undefined)sc[s]++;});
  STAGES.forEach(s=>{ const n=sc[s]; if(!n)return; h+=`<div class="bar-row" style="margin-bottom:6px"><div class="bar-lbl" style="min-width:110px;font-size:12px">${SL[s]}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.round(n/G.contacts.length*100)}%;background:${s==='Signed'||s==='Deployed'?'var(--g)':'var(--ac)'}"></div></div><div class="bar-num">${n}</div></div>`; });
  h += '</div>';
  h += '<div class="dash-side-card"><h3>Par Secteur</h3>';
  const secCounts = {};
  G.contacts.forEach(c=>{
    const s = canonSec(c.sector);
    if(s) secCounts[s]=(secCounts[s]||0)+1;
  });
  const secSorted = Object.entries(secCounts).sort((a,b)=>b[1]-a[1]);
  const maxSec = Math.max(...secSorted.map(x=>x[1]),1);
  secSorted.forEach(([sec,cnt]) => {
    if(!cnt) return;
    const col = secColor(sec);
    h += `<div class="bar-row" style="margin-bottom:6px;cursor:pointer" onclick="setView('sector','${esc(sec)}')"><div class="bar-lbl" style="min-width:130px;font-size:12px">${sec}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.round(cnt/maxSec*100)}%;background:${col}"></div></div><div class="bar-num">${cnt}</div></div>`;
  });
  h += '</div>';
  h += '<div class="dash-side-card"><h3>Top Contacts</h3>';
  [...G.contacts].sort((a,b)=>b.score-a.score).slice(0,5).forEach(c=>{
    h += `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;border-bottom:1px solid var(--bd)" onclick="openC(${c.id})">
      <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.company)}</div><div style="font-size:11px;color:var(--mu)">${esc(c.name)}</div></div>
      ${scoreTag(c.score)}
    </div>`;
  });
  h += '</div></div></div>';
  return h;
}

function rAI(c, type) {
  const dn = type==='dn';
  const alrt = type==='ov'?`<span class="tag t-ov">Retard</span>`:type==='td'?`<span class="tag t-td">Aujourd'hui</span>`:'';
  const db = dn?'':`<button class="btn btn-done" onclick="event.stopPropagation();openDoneFor(${c.id})">✓ Fait</button>`;
  return `<div class="ai${dn?' ai-done':''}" onclick="openC(${c.id})">
    <div class="ai-check${dn?' chk':''}" onclick="event.stopPropagation();${dn?'':('openDoneFor('+c.id+')')}"></div>
    <div class="ai-body">
      <div class="ai-top"><span class="ai-co">${esc(c.company)}</span><span class="ai-nm">${esc(c.name)}</span>${alrt}</div>
      <div class="ai-meta">${atTag(c.action_type)} ${segTag(c.segment)} ${scoreTag(c.score)} ${c.decision_maker?'<span class="tag t-hi">Décideur</span>':''} ${c.priority==='HIGH'?'<span class="tag t-str">HIGH</span>':''}</div>
      <div class="ai-txt">${esc(c.next_action||c.poei_offer||'')}</div>
      ${c.deal_potential?`<div class="ai-sub">💼 ${esc(c.deal_potential)} · ${esc(c.poei_offer||'')}</div>`:''}
    </div>
    <div class="ai-actions">${quickBtns(c)}${db}</div>
  </div>`;
}

// ════════════════════════════════════════════════════════════════ NEW TARGETS
function rNewTargets() {
  const newC = G.contacts.filter(c=>c.alert==='🔴 NOUVEAU');
  const q = G.q;
  let list = q ? newC.filter(c=>(c.company+c.sector+c.poei_offer+c.notes+c.deal_potential).toLowerCase().includes(q)) : newC;

  if(!list.length) return '<div class="empty"><div class="ei">🎯</div><h3>Aucune nouvelle cible</h3><p>Toutes les cibles ont été traitées ou la recherche ne correspond à rien.</p></div>';

  const bySector = {};
  list.forEach(c => { (bySector[c.sector]=bySector[c.sector]||[]).push(c); });
  const secOrder = ['🧹 Propreté/FM','🏥 Santé','🏨 Hôtellerie','✈️ Aéroportuaire','📦 Logistique'];
  const orderedSecs = [...secOrder.filter(s=>bySector[s]), ...Object.keys(bySector).filter(s=>!secOrder.includes(s)&&bySector[s])];

  const strategic = list.filter(c=>c.segment==='Strategic').length;
  const highPri   = list.filter(c=>c.priority==='HIGH').length;
  const qw        = list.filter(c=>c.segment==='Quick Win').length;

  // ── KPI band
  let h = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-bottom:18px">
    <div style="background:#fff;border:1px solid #E5E4E0;border-radius:8px;padding:13px 16px;border-top:3px solid #E8500A">
      <div style="font-size:28px;font-weight:900;color:#E8500A;line-height:1">${list.length}</div>
      <div style="font-size:10px;font-weight:700;color:#9B9A97;text-transform:uppercase;letter-spacing:.6px;margin-top:4px">Nouvelles cibles</div>
    </div>
    <div style="background:#fff;border:1px solid #E5E4E0;border-radius:8px;padding:13px 16px;border-top:3px solid #D93025">
      <div style="font-size:28px;font-weight:900;color:#D93025;line-height:1">${strategic}</div>
      <div style="font-size:10px;font-weight:700;color:#9B9A97;text-transform:uppercase;letter-spacing:.6px;margin-top:4px">Strategic</div>
    </div>
    <div style="background:#fff;border:1px solid #E5E4E0;border-radius:8px;padding:13px 16px;border-top:3px solid #0F9D58">
      <div style="font-size:28px;font-weight:900;color:#0F9D58;line-height:1">${qw}</div>
      <div style="font-size:10px;font-weight:700;color:#9B9A97;text-transform:uppercase;letter-spacing:.6px;margin-top:4px">Quick Win</div>
    </div>
    <div style="background:#fff;border:1px solid #E5E4E0;border-radius:8px;padding:13px 16px;border-top:3px solid #F5A623">
      <div style="font-size:28px;font-weight:900;color:#F5A623;line-height:1">${highPri}</div>
      <div style="font-size:10px;font-weight:700;color:#9B9A97;text-transform:uppercase;letter-spacing:.6px;margin-top:4px">Priorité HIGH</div>
    </div>
    <div style="background:#fff;border:1px solid #E5E4E0;border-radius:8px;padding:13px 16px;border-top:3px solid #1A73E8">
      <div style="font-size:28px;font-weight:900;color:#1A73E8;line-height:1">${orderedSecs.length}</div>
      <div style="font-size:10px;font-weight:700;color:#9B9A97;text-transform:uppercase;letter-spacing:.6px;margin-top:4px">Secteurs</div>
    </div>
  </div>`;

  // ── Alerte enrichissement
  h += `<div style="background:#FFF0EA;border:1px solid #E8500A22;border-left:3px solid #E8500A;border-radius:6px;padding:10px 14px;margin-bottom:20px;font-size:12px;color:#7a2800">
    ⚡ <strong>${list.length} nouvelles cibles</strong> hors portefeuille — contacts à enrichir (nom décideur, email, téléphone, LinkedIn). Cliquer sur une carte pour ouvrir la fiche.
  </div>`;

  // ── Nav secteurs (ancres)
  h += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:20px">`;
  orderedSecs.forEach(sec => {
    const col = secColor(sec);
    const cnt = (bySector[sec]||[]).length;
    h += `<button onclick="document.getElementById('nt-sec-${esc(sec.replace(/[^\w]/g,''))}').scrollIntoView({behavior:'smooth',block:'start'})"
      style="background:${col}18;color:${col};border:1.5px solid ${col}44;border-radius:20px;padding:4px 12px;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap">
      ${sec} <span style="background:${col};color:#fff;padding:1px 6px;border-radius:10px;font-size:10px;margin-left:3px">${cnt}</span>
    </button>`;
  });
  h += '</div>';

  // ── Secteurs
  orderedSecs.forEach(sec => {
    const contacts = [...(bySector[sec]||[])].sort((a,b)=>b.score-a.score);
    const col = secColor(sec);
    const str = contacts.filter(c=>c.segment==='Strategic').length;
    const hi  = contacts.filter(c=>c.priority==='HIGH').length;
    const anchorId = `nt-sec-${sec.replace(/[^\w]/g,'')}`;

    h += `<div id="${anchorId}" style="margin-bottom:32px">`;

    // Sector header
    h += `<div style="background:linear-gradient(135deg,${col},${col}dd);border-radius:10px;padding:16px 20px;margin-bottom:14px;color:#fff;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:0">
        <div style="font-size:17px;font-weight:900;letter-spacing:-.3px">${sec}</div>
        <div style="font-size:11px;opacity:.8;margin-top:2px">${contacts.length} entreprises à prospecter</div>
      </div>
      <div style="display:flex;gap:14px;flex-wrap:wrap">
        <div style="text-align:center"><div style="font-size:20px;font-weight:900">${contacts.length}</div><div style="font-size:9px;opacity:.75;text-transform:uppercase;letter-spacing:.5px">Total</div></div>
        <div style="text-align:center"><div style="font-size:20px;font-weight:900">${str}</div><div style="font-size:9px;opacity:.75;text-transform:uppercase;letter-spacing:.5px">Strategic</div></div>
        <div style="text-align:center"><div style="font-size:20px;font-weight:900">${hi}</div><div style="font-size:9px;opacity:.75;text-transform:uppercase;letter-spacing:.5px">HIGH</div></div>
        <div style="text-align:center"><div style="font-size:20px;font-weight:900">${Math.round(contacts.reduce((s,c)=>s+c.score,0)/contacts.length)}</div><div style="font-size:9px;opacity:.75;text-transform:uppercase;letter-spacing:.5px">Score moy.</div></div>
      </div>
    </div>`;

    // Cards grid
    h += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px">`;

    contacts.forEach(c => {
      const priColor = c.priority==='HIGH'?'#D93025':c.priority==='MEDIUM'?'#F5A623':'#888';
      const atIcons = {Appel:'📞',Email:'✉',LinkedIn:'🔗',Partenariat:'🤝',Enrichir:'⚙',Relance:'🔄',RDV:'📅'};
      const atIcon  = atIcons[c.action_type]||'→';
      const atBg    = {Appel:'#FFF0EA',Email:'#E8F0FE',LinkedIn:'#E7F4FF',Partenariat:'#F0FFF4',Enrichir:'#F5F5F5',Relance:'#FEF3E2',RDV:'#F3E8FD'}[c.action_type]||'#F5F5F5';
      const atFg    = {Appel:'#E8500A',Email:'#1A73E8',LinkedIn:'#0077B5',Partenariat:'#0F9D58',Enrichir:'#666',Relance:'#B07700',RDV:'#7B2FBE'}[c.action_type]||'#444';

      h += `<div style="background:#fff;border:1.5px solid #E5E4E0;border-radius:10px;overflow:hidden;cursor:pointer;transition:.15s;box-shadow:0 1px 4px rgba(0,0,0,.06)"
              onmouseover="this.style.boxShadow='0 6px 20px rgba(0,0,0,.13)';this.style.borderColor='${col}'"
              onmouseout="this.style.boxShadow='0 1px 4px rgba(0,0,0,.06)';this.style.borderColor='#E5E4E0'"
              onclick="openC(${c.id})">

        <!-- Top bar couleur secteur -->
        <div style="height:4px;background:linear-gradient(90deg,${col},${col}88)"></div>

        <!-- Header carte -->
        <div style="padding:14px 16px 10px;border-bottom:1px solid #F0EFEB">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
            <div style="flex:1;min-width:0">
              <div style="font-weight:900;font-size:13.5px;line-height:1.2">${esc(c.company)}</div>
              <div style="font-size:10.5px;color:#9B9A97;margin-top:3px">🎯 ${esc(c.title)}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
              <div style="font-size:18px;font-weight:900;color:${c.score>=80?'#0F9D58':c.score>=65?'#F5A623':'#888'};line-height:1">${c.score}<span style="font-size:9px;font-weight:600;color:#aaa">/100</span></div>
              <span style="font-size:9px;font-weight:800;color:${priColor};letter-spacing:.5px">${c.priority}</span>
            </div>
          </div>
          <div style="display:flex;gap:5px;margin-top:8px;flex-wrap:wrap">
            ${segTag(c.segment)}
            <span style="background:#🔴 NOUVEAU"==='🔴 NOUVEAU'?'#FFF0EA':'#f5f5f5';padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#FFF0EA;color:#E8500A;border:1px solid #E8500A44">🔴 Nouveau</span>
          </div>
        </div>

        <!-- POEI -->
        <div style="padding:10px 16px;background:#F9F9F8;border-bottom:1px solid #F0EFEB">
          <div style="font-size:9.5px;font-weight:800;color:#9B9A97;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px">🎓 Offre POEI</div>
          <div style="font-size:12px;font-weight:700;color:#191918;line-height:1.4">${esc(c.poei_offer)}</div>
          <div style="font-size:11px;color:#0F9D58;font-weight:700;margin-top:4px">💼 ${esc(c.deal_potential)}</div>
        </div>

        <!-- Contexte -->
        <div style="padding:10px 16px;border-bottom:1px solid #F0EFEB">
          <div style="font-size:9.5px;font-weight:800;color:#9B9A97;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px">📋 Contexte</div>
          <div style="font-size:11.5px;color:#5E5C58;line-height:1.5">${esc(c.notes)}</div>
        </div>

        <!-- Action -->
        <div style="padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div style="flex:1;min-width:0">
            <span style="display:inline-block;background:${atBg};color:${atFg};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:800;margin-bottom:4px">${atIcon} ${esc(c.action_type)}</span>
            <div style="font-size:11.5px;color:#191918;line-height:1.4">${esc(c.next_action)}</div>
          </div>
          <button onclick="event.stopPropagation();openDoneFor(${c.id})"
            style="background:#E8500A;color:#fff;border:none;border-radius:6px;padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0;white-space:nowrap">
            ✓ Fait
          </button>
        </div>
      </div>`;
    });

    h += '</div></div>';
  });

  return h;
}

// ════════════════════════════════════════════════════════════════ STRATEGIC
function rStrategic() {
  const top15 = [...G.contacts].sort((a,b)=>b.score-a.score);
  const seen={};const top=[];
  top15.forEach(c=>{ if(!seen[c.company]){seen[c.company]=true;top.push(c);} });
  const list = top.slice(0,15);
  let h = `<div style="margin-bottom:12px;font-size:12.5px;color:var(--mu)">Top 15 comptes par score · Cliquer pour ouvrir le contact</div>`;
  h += '<div class="strat-grid">';
  list.forEach((c,i) => {
    const col = secColor(c.sector);
    h += `<div class="strat-card" onclick="openC(${c.id})">
      <div class="strat-rank">#${i+1}</div>
      <div style="width:8px;height:8px;border-radius:50%;background:${col};display:inline-block;margin-bottom:6px"></div>
      <div class="strat-co">${esc(c.company)}</div>
      <div class="strat-ct">${esc(c.name)} · ${esc((c.title||'').substring(0,40))}${(c.title||'').length>40?'…':''}</div>
      <div class="strat-score">
        <div style="font-size:13px;font-weight:900;color:${c.score>=80?'var(--g)':'var(--y)'}">${c.score}</div>
        <div class="strat-bar-wrap"><div class="strat-bar" style="width:${c.score}%;background:${c.score>=80?'var(--g)':'var(--y)'}"></div></div>
      </div>
      <div class="strat-poei">${esc(c.poei_offer||'—')}</div>
      <div class="strat-meta">
        ${segTag(c.segment)} ${atTag(c.action_type)}
        ${c.decision_maker?'<span class="tag t-hi">Décideur</span>':''}
        ${c.phone?`<a href="tel:${(c.phone||'').replace(/\s/g,'')}" class="btn btn-call" style="padding:3px 8px;font-size:11px" onclick="event.stopPropagation()">📞</a>`:''}
        ${c.email&&c.email_status!=='invalid'?`<a href="mailto:${esc(c.email)}" class="btn btn-email" style="padding:3px 8px;font-size:11px" onclick="event.stopPropagation()">✉</a>`:''}
      </div>
      <div class="strat-deal">💼 ${esc(c.deal_potential||'Volume à qualifier')}</div>
    </div>`;
  });
  return h+'</div>';
}

// ════════════════════════════════════════════════════════════════ SECTOR VIEW
function rSector(sec) {
  const secData = ALL_SECTORS.find(s=>s.name===sec||sec.includes(s.icon?.split(' ')[0])||s.name.toLowerCase().includes(sec.toLowerCase().replace(/[^a-z]/g,'')));
  let contacts = G.contacts.filter(c => c.sector===sec || (sec.includes('Autre')&&(c.sector==='🔷 Autre'||c.sector==='🛒 Commerce')));
  contacts = applyF(contacts).sort((a,b)=>b.score-a.score);
  const col = secColor(sec);
  let h = '';
  if(secData) {
    h += `<div class="sec-hero" style="background:linear-gradient(135deg,${col},${col}cc)">
      <h2>${secData.icon} ${esc(secData.name)}</h2>
      <p>${esc(secData.market)}</p>
      <div class="sec-hero-stats">
        <div class="sec-hs"><div class="sv">${contacts.length}</div><div class="sk">Contacts</div></div>
        <div class="sec-hs"><div class="sv">${contacts.filter(c=>c.email_status==='valid'||c.email_status==='Verified').length}</div><div class="sk">Emails valides</div></div>
        <div class="sec-hs"><div class="sv">${contacts.filter(c=>c.priority==='HIGH').length}</div><div class="sk">Priorité HIGH</div></div>
        <div class="sec-hs"><div class="sv">${contacts.filter(c=>c.segment==='Strategic'||c.segment==='Quick Win').length}</div><div class="sk">Strategic/QW</div></div>
      </div>
    </div>`;
    h += '<div class="sec-pills">';
    h += `<div class="sec-pill" style="border-left:3px solid ${col}"><strong>IDF</strong>${esc(secData.idf||'—')}</div>`;
    h += `<div class="sec-pill"><strong>Timing</strong>${esc(secData.timing||'—')}</div>`;
    h += `<div class="sec-pill"><strong>Interlocuteurs</strong>${esc(secData.titles||'—')}</div>`;
    h += '</div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">';
    h += '<div class="dash-side-card"><h3>Points de douleur</h3>';
    (secData.pains||[]).forEach(p => { h += `<div class="pain-item">${esc(p)}</div>`; });
    h += '</div>';
    h += '<div class="dash-side-card"><h3>Hooks commerciaux</h3>';
    (secData.hooks||[]).forEach(hk => { h += `<div class="hook-card">${esc(hk)}</div>`; });
    h += '</div></div>';
  }
  h += `<div class="section-head"><h3>${contacts.length} contacts dans ce secteur</h3></div>`;
  h += rContactsTable(contacts);
  return h;
}

// ════════════════════════════════════════════════════════════════ ALL CONTACTS
function rAllContacts() {
  let list = applyF(G.contacts);
  list = [...list].sort((a,b) => {
    const fa=a[G.sf]??0, fb=b[G.sf]??0;
    return typeof fa==='number'?(fb-fa)*G.sd:String(fa).localeCompare(String(fb))*G.sd;
  });
  const h = rContactsTable(list);
  return `<div style="margin-bottom:8px;font-size:12px;color:var(--mu)">${list.length} contact${list.length>1?'s':''} affichés sur ${G.contacts.length}</div>`+h;
}

function rContactsTable(list) {
  if(!list.length) return '<div class="empty"><div class="ei">🔍</div><h3>Aucun contact trouvé</h3><p>Modifiez votre recherche ou vos filtres.</p></div>';
  const ar = G.sd===1?' ↑':' ↓';
  let h = `<div class="tbl-wrap"><table><thead><tr>
    <th onclick="sortBy('company')">Entreprise${G.sf==='company'?ar:''}</th>
    <th onclick="sortBy('name')">Contact${G.sf==='name'?ar:''}</th>
    <th onclick="sortBy('score')">Score${G.sf==='score'?ar:''}</th>
    <th>Segment</th>
    <th onclick="sortBy('stage')">Stade</th>
    <th>Prochaine action</th>
    <th>Contact</th>
  </tr></thead><tbody>`;
  list.forEach(c => {
    const col = secColor(c.sector||'');
    h += `<tr onclick="openC(${c.id})">
      <td><div style="display:flex;align-items:center;gap:6px"><div style="width:3px;height:30px;background:${col};border-radius:2px;flex:0 0 3px"></div><div><div style="font-weight:800;font-size:12.5px">${esc(c.company)}</div><div style="font-size:10.5px;color:var(--mu)">${esc(c.sector||'')}</div></div></div></td>
      <td>${c.decision_maker?'<span class="dm-dot"></span>':''}${esc(c.name)}<div style="font-size:10.5px;color:var(--mu)">${esc((c.title||'').substring(0,35))}${(c.title||'').length>35?'…':''}</div></td>
      <td>${scoreTag(c.score)}</td>
      <td>${segTag(c.segment)}</td>
      <td style="font-size:11.5px;color:var(--mu)">${SL[c.stage]||c.stage||'Prospect'}</td>
      <td>${atTag(c.action_type)}<div style="font-size:10.5px;color:var(--mu);margin-top:2px">${esc((c.next_action||'').substring(0,42))}${(c.next_action||'').length>42?'…':''}</div></td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap">${quickBtns(c)}</td>
    </tr>`;
  });
  return h+'</tbody></table></div>';
}
function sortBy(f) { if(G.sf===f)G.sd*=-1; else{G.sf=f;G.sd=-1;} render(); }

// ════════════════════════════════════════════════════════════════ PIPELINE
function rPipeline() {
  const list = applyF(G.contacts);
  const cols={};STAGES.forEach(s=>{cols[s]=[];});
  list.forEach(c=>{const s=c.stage||'Prospect';if(cols[s])cols[s].push(c);else cols['Prospect'].push(c);});
  let h='<div class="pipeline-wrap">';
  STAGES.forEach(st=>{
    const cards=(cols[st]||[]).sort((a,b)=>b.score-a.score);
    const isGood=st==='Signed'||st==='Deployed';
    h+=`<div class="pipe-col">
      <div class="pipe-col-head"><span style="color:${isGood?'var(--g)':'var(--mu)'}">${SL[st]}</span><span class="pipe-col-cnt" style="${isGood?'background:var(--gl);color:var(--g)':''}">${cards.length}</span></div>`;
    cards.forEach(c=>{
      const col=secColor(c.sector||'');
      h+=`<div class="pipe-card" onclick="openC(${c.id})">
        <div style="width:100%;height:2px;background:${col};border-radius:2px;margin-bottom:7px"></div>
        <div class="pc-co">${esc(c.company)}</div>
        <div class="pc-nm">${esc(c.name)}</div>
        <div class="pc-ft"><span class="pc-deal">${esc(c.deal_potential||c.poei_offer||'')}</span>${scoreTag(c.score)}</div>
      </div>`;
    });
    h+='</div>';
  });
  return h+'</div>';
}

// ════════════════════════════════════════════════════════════════ TEMPLATES
function rTemplates() {
  const q = G.q;
  let list = q ? ALL_TEMPLATES.filter(t=>t.name.toLowerCase().includes(q)||t.subject.toLowerCase().includes(q)||(t.seg||'').toLowerCase().includes(q)||(t.sector||'').toLowerCase().includes(q)) : ALL_TEMPLATES;
  if(!list.length) return '<div class="empty"><div class="ei">📧</div><h3>Aucun template trouvé</h3></div>';
  let h = '<div class="tpl-grid">';
  list.forEach(t => {
    const tagH = (t.tags||[]).map(tg=>`<span class="tag t-email">${esc(tg)}</span>`).join('');
    h += `<div class="tpl-card">
      <div class="tpl-name">${esc(t.name)}</div>
      <div class="tpl-tags">${tagH}</div>
      <div class="tpl-subj">✉ ${esc(t.subject)}</div>
      <div class="tpl-body" id="tb-${t.id}">${esc(t.body)}</div>
      <div class="tpl-foot">
        <button class="btn btn-a" style="flex:1" onclick="copyTpl('${t.id}')">📋 Copier</button>
        <button class="btn btn-s" onclick="expandTpl('${t.id}')">⤢</button>
      </div>
    </div>`;
  });
  return h+'</div>';
}
function copyTpl(id) {
  const el=document.getElementById('tb-'+id); if(!el)return;
  navigator.clipboard.writeText(el.textContent).then(()=>{
    const btn=el.closest('.tpl-card').querySelector('.btn-a');
    if(btn){btn.textContent='✓ Copié!';btn.classList.add('copy-flash');setTimeout(()=>{btn.textContent='📋 Copier';btn.classList.remove('copy-flash');},2000);}
  });
}
function expandTpl(id) {
  const el=document.getElementById('tb-'+id);if(!el)return;
  el.style.maxHeight=el.style.maxHeight==='none'?'170px':'none';
}

// ════════════════════════════════════════════════════════════════ SCRIPTS
function rScripts() {
  let h='';
  ALL_SCRIPTS.forEach(sc=>{
    h+=`<div class="scr-card">
      <div class="scr-head" onclick="tScript('${sc.id}')">
        <div class="scr-dot" style="background:${sc.color}"></div>
        <div class="scr-title">${esc(sc.name)}</div>
        <span class="tag" style="background:${sc.color}22;color:${sc.color};margin-right:4px">${sc.seg}</span>
        <span style="font-size:11px;background:var(--bg);padding:2px 9px;border-radius:10px;color:var(--mu);font-weight:600">⏱ ${sc.dur}</span>
        <span class="scr-arrow" id="sca-${sc.id}">›</span>
      </div>
      <div class="scr-body" id="scb-${sc.id}">
        ${sc.steps.map(s=>`<div class="scr-step"><div class="scr-ph">${esc(s.ph)}</div><div class="scr-txt">${esc(s.txt)}</div></div>`).join('')}
      </div>
    </div>`;
  });
  return h;
}
function tScript(id) {
  const b=document.getElementById('scb-'+id),a=document.getElementById('sca-'+id);
  if(b){b.classList.toggle('open');if(a)a.classList.toggle('open');}
}

// ════════════════════════════════════════════════════════════════ PLAN 90J
function rPlan90() {
  let h='';
  ALL_PLAN.forEach(w=>{
    const tasks=w.tasks||[];
    const dn=tasks.filter(t=>G.planState[t.id]).length;
    const pct=tasks.length?Math.round(dn/tasks.length*100):0;
    h+=`<div class="plan-week">
      <div class="pw-head" onclick="tWeek('${w.week}')">
        <span class="pw-badge">${w.week}</span>
        <div style="flex:1;min-width:0"><div class="pw-title">${esc(w.title)}</div><div class="pw-focus">${esc(w.focus)}</div></div>
        <span class="pw-prog">${dn}/${tasks.length} (${pct}%)</span>
        <span class="scr-arrow" id="pwa-${w.week}" style="font-size:20px">›</span>
      </div>
      <div class="pw-body" id="pwb-${w.week}">
        ${tasks.map(t=>{const done=G.planState[t.id]||false;return`<div class="task-item${done?' done':''}" id="tsk-${t.id}">
          <div class="task-cb${done?' chk':''}" onclick="tTask('${t.id}')"></div>
          <div class="task-body"><div class="task-day">${esc(t.day)}</div><div class="task-txt">${esc(t.txt)}</div></div>
          <span class="task-pri p-${t.p}">${t.p}</span>
        </div>`;}).join('')}
      </div>
    </div>`;
  });
  return h;
}
function tWeek(id) {
  const b=document.getElementById('pwb-'+id),a=document.getElementById('pwa-'+id);
  if(b){b.classList.toggle('open');if(a)a.classList.toggle('open');}
}
async function tTask(id) {
  const done = !G.planState[id];
  G.planState[id] = done;
  const el = document.getElementById('tsk-'+id);
  const cb = el?.querySelector('.task-cb');
  if(el) el.className = 'task-item' + (done?' done':'');
  if(cb) cb.className = 'task-cb' + (done?' chk':'');
  // Re-render progress counters
  const week = ALL_PLAN.find(w=>w.tasks?.some(t=>t.id===id));
  if(week) {
    const dn = (week.tasks||[]).filter(t=>G.planState[t.id]).length;
    const pct = week.tasks.length ? Math.round(dn/week.tasks.length*100) : 0;
    const prog = document.querySelector(`#pwb-${week.week}`)?.closest('.plan-week')?.querySelector('.pw-prog');
    if(prog) prog.textContent = `${dn}/${week.tasks.length} (${pct}%)`;
  }
  fetch(`/api/plan/state/${id}`, {method:'POST'});
}

// ════════════════════════════════════════════════════════════════ METRICS
function rMetrics() {
  const tot=G.contacts.length;const cos=new Set(G.contacts.map(c=>c.company)).size;
  const td=today();const ov=G.contacts.filter(c=>isOv(c,td)).length;const tdn=G.contacts.filter(c=>isTd(c,td)).length;
  const hp=G.contacts.filter(c=>c.priority==='HIGH').length;
  const ve=G.contacts.filter(c=>c.email_status==='valid'||c.email_status==='Verified').length;
  const si=G.contacts.filter(c=>c.stage==='Signed'||c.stage==='Deployed').length;
  let h=`<div class="met-grid">
    <div class="met-card"><div class="ml">Total Contacts</div><div class="mv">${tot}</div><div class="ms">${cos} entreprises</div></div>
    <div class="met-card"><div class="ml">Actions retard</div><div class="mv" style="color:var(--r)">${ov}</div><div class="ms">${tdn} aujourd'hui</div></div>
    <div class="met-card"><div class="ml">Priorité HIGH</div><div class="mv" style="color:var(--ac)">${hp}</div><div class="ms">contacts</div></div>
    <div class="met-card"><div class="ml">Emails valides</div><div class="mv" style="color:var(--g)">${ve}</div><div class="ms">joignables</div></div>
    <div class="met-card"><div class="ml">Signés</div><div class="mv" style="color:var(--g)">${si}</div><div class="ms">conventions</div></div>
    <div class="met-card"><div class="ml">Score moyen</div><div class="mv">${tot?Math.round(G.contacts.reduce((s,c)=>s+c.score,0)/tot):0}</div><div class="ms">/ 100 pts</div></div>
  </div>`;
  const segC={};G.contacts.forEach(c=>{segC[c.segment]=(segC[c.segment]||0)+1;});
  const mxS=Math.max(...Object.values(segC));
  h+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">`;
  h+=`<div class="bar-card"><h3>Par segment</h3>`;
  Object.entries(segC).sort((a,b)=>b[1]-a[1]).forEach(([seg,cnt])=>{h+=`<div class="bar-row"><div class="bar-lbl">${seg}</div><div class="bar-track"><div class="bar-fill" style="width:${(cnt/mxS*100).toFixed(0)}%;background:var(--ac)"></div></div><div class="bar-num">${cnt}</div></div>`;});
  h+='</div>';
  const stgC={};STAGES.forEach(s=>{stgC[s]=0;});G.contacts.forEach(c=>{const s=c.stage||'Prospect';if(stgC[s]!==undefined)stgC[s]++;});
  const mxSt=Math.max(...Object.values(stgC),1);
  h+=`<div class="bar-card"><h3>Pipeline par stade</h3>`;
  STAGES.forEach(s=>{const n=stgC[s];const isG=s==='Signed'||s==='Deployed';h+=`<div class="bar-row"><div class="bar-lbl">${SL[s]}</div><div class="bar-track"><div class="bar-fill" style="width:${(n/mxSt*100).toFixed(0)}%;background:${isG?'var(--g)':'var(--ac)'}"></div></div><div class="bar-num">${n}</div></div>`;});
  h+='</div></div>';
  h+=`<div class="bar-card" style="margin-top:12px"><h3>Objectifs KPIs — Plan 90 Jours</h3><div style="overflow:auto"><table class="kpi-table"><thead><tr><th style="text-align:left">Métrique</th><th>S4</th><th>S8</th><th>S12</th></tr></thead><tbody>`;
  ALL_KPIS.targets.forEach(k=>{h+=`<tr><td>${esc(k.label)}</td><td>${k.s4}</td><td>${k.s8}</td><td>${k.s12}</td></tr>`;});
  h+='</tbody></table></div></div>';
  return h;
}

// ════════════════════════════════════════════════════════════════ CONTACT MODAL
function openC(id) {
  const c=G.contacts.find(x=>x.id===id);if(!c)return;
  G.selId=id;
  document.getElementById('mo-co').textContent=c.company;
  document.getElementById('mo-nm').textContent=c.name;
  document.getElementById('mo-ti').textContent=c.title||'';
  const col=secColor(c.sector||'');
  document.getElementById('mo-info').innerHTML=`
    <div class="info-item"><div class="ik">Email</div><div class="iv">${c.email?`<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>&nbsp;<span class="${c.email_status==='valid'||c.email_status==='Verified'?'ev':'ei'}">${c.email_status||'?'}</span>`:'—'}</div></div>
    <div class="info-item"><div class="ik">Téléphone</div><div class="iv">${c.phone?`<a href="tel:${c.phone.replace(/\s/g,'')}">${esc(c.phone)}</a>`:'—'}</div></div>
    <div class="info-item"><div class="ik">Secteur</div><div class="iv"><span style="color:${col};font-weight:700">${esc(c.sector||'—')}</span></div></div>
    <div class="info-item"><div class="ik">Segment</div><div class="iv">${segTag(c.segment)}</div></div>
    <div class="info-item"><div class="ik">Score</div><div class="iv">${scoreTag(c.score)}</div></div>
    <div class="info-item"><div class="ik">Priorité</div><div class="iv"><span style="font-weight:800;color:${c.priority==='HIGH'?'var(--r)':c.priority==='MEDIUM'?'var(--y)':'var(--mu)'}">${c.priority}</span></div></div>
    <div class="info-item"><div class="ik">Décideur</div><div class="iv">${c.decision_maker?'✅ Oui':'Non'}</div></div>
    <div class="info-item"><div class="ik">LinkedIn</div><div class="iv">${c.linkedin?`<a href="${esc(c.linkedin)}" target="_blank">Voir le profil →</a>`:'—'}</div></div>
  `;
  document.getElementById('mo-poei').innerHTML=`<div class="pt">${esc(c.poei_offer||'Non défini')}</div><div class="ps">${esc(c.active_offers||'')} &nbsp;·&nbsp; ${esc(c.deal_potential||'')}</div>`;
  document.getElementById('mo-stage').value=c.stage||'Prospect';
  document.getElementById('mo-next').innerHTML=`${atTag(c.action_type)} <strong>${esc(c.next_action||'')}</strong><div style="margin-top:5px;font-size:11px;color:var(--mu)">Date prévue : ${c.next_action_date||'—'}</div>`;
  rLog();
  document.getElementById('mo-note').value='';
  document.getElementById('overlay').classList.add('show');
}
function rLog() {
  const c=G.contacts.find(x=>x.id===G.selId);if(!c)return;
  const el=document.getElementById('mo-log');
  if(!c.log||!c.log.length){el.innerHTML='<div class="log-empty">Aucune action enregistrée</div>';return;}
  el.innerHTML=[...c.log].reverse().map(e=>`<div class="log-entry"><div class="ld">${e.date} ${atTag(e.type||'')}</div><div class="la">${esc(e.result||e.action||'')}</div>${e.note?`<div class="ln">${esc(e.note)}</div>`:''}</div>`).join('');
}
function closeMo(e) { if(e&&e.target!==document.getElementById('overlay'))return; document.getElementById('overlay').classList.remove('show');G.selId=null; }

async function updStage(v) {
  if(!G.selId) return;
  const c = G.contacts.find(x=>x.id===G.selId);
  if(!c) return;
  const logEntry = {date: new Date().toLocaleString('fr-FR'), type:'Stage', result:`Stade → ${SL[v]||v}`};
  const updated = await apiPatch(c.id, {stage: v});
  if(updated) {
    Object.assign(c, updated);
    c.log = c.log || [];
    c.log.push(logEntry);
  }
  updSidebar();
  render();
}

async function saveNote() {
  if(!G.selId) return;
  const note = document.getElementById('mo-note').value.trim();
  if(!note) return;
  const c = G.contacts.find(x=>x.id===G.selId);
  if(!c) return;
  const logEntry = {date: new Date().toLocaleString('fr-FR'), type:'Note', result: note};
  await fetch(`/api/contacts/${c.id}/log`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(logEntry)
  });
  c.log = c.log || [];
  c.log.push(logEntry);
  document.getElementById('mo-note').value='';
  rLog();
}

// ════════════════════════════════════════════════════════════════ DONE MODAL
let dId = null;
function openDone() { dId=G.selId; _dmo(); }
function openDoneFor(id) { dId=id; _dmo(); }
function _dmo() {
  const c=G.contacts.find(x=>x.id===dId);if(!c)return;
  document.getElementById('d-sub').textContent=`${c.company} — ${c.name}`;
  document.getElementById('d-res').value='';
  document.getElementById('d-stage').value='';
  document.getElementById('d-next-type').value=c.action_type||'Email';
  document.getElementById('d-next-txt').value='';
  document.getElementById('d-next-date').value=new Date(Date.now()+3*86400000).toISOString().split('T')[0];
  document.getElementById('doverlay').classList.add('show');
}
function closeDone(e) { if(e&&e.target!==document.getElementById('doverlay'))return; document.getElementById('doverlay').classList.remove('show'); }

async function confirmDone() {
  const c=G.contacts.find(x=>x.id===dId);if(!c)return;
  const btn = document.getElementById('btn-confirm-done');
  btn.disabled = true; btn.textContent = '…';
  const res  = document.getElementById('d-res').value.trim();
  const ns   = document.getElementById('d-stage').value;
  const nt   = document.getElementById('d-next-type').value;
  const ntxt = document.getElementById('d-next-txt').value.trim();
  const nd   = document.getElementById('d-next-date').value;
  try {
    const updated = await fetch(`/api/contacts/${c.id}/done`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({result:res, stage:ns, next_type:nt, next_txt:ntxt, next_date:nd})
    }).then(r=>r.json());
    Object.assign(c, updated);
    document.getElementById('doverlay').classList.remove('show');
    updSidebar();
    render();
    if(G.selId===dId) openC(dId);
  } finally {
    btn.disabled = false; btn.textContent = 'Valider';
  }
}

// ════════════════════════════════════════════════════════════════ AUTH
async function doLogout() {
  await fetch('/auth/logout', {method:'POST'});
  window.location.href = '/login';
}

// ════════════════════════════════════════════════════════════════ UTILS
function parseDeal(s) {
  const m = String(s||'').match(/(\d[\d\s]*)/);
  return m ? parseInt(m[1].replace(/\s/g,'')) : 0;
}
function pipelineValue(contacts) {
  const PROB = {Prospect:.05,Contacted:.15,Meeting:.35,Proposal:.60,Negotiation:.80,Signed:1,Deployed:1};
  return contacts.reduce((sum,c)=>sum+parseDeal(c.deal_potential||'')*3000*(PROB[c.stage||'Prospect']||.05),0);
}
function fmtEur(n) {
  if(n>=1000000) return (n/1000000).toFixed(1)+'M€';
  if(n>=1000)    return Math.round(n/1000)+'k€';
  return n+'€';
}
function toast(msg, type='') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 3000);
}

// ════════════════════════════════════════════════════════════════ MISSION CONTROL

let G_mission = null;

async function loadMission() {
  const data = await apiFetch('/api/mission');
  if(!data) return;
  G_mission = data;
  // Update badge
  const urgent = (data.stuck||[]).filter(s=>s.days===999).length + data.actions.filter(a=>a.next_action_date && a.next_action_date <= data.today).length;
  const bdg = document.getElementById('bdg-today');
  if(bdg) { bdg.textContent = urgent || ''; bdg.style.display = urgent ? '' : 'none'; }
  document.getElementById('content').innerHTML = rMissionControl(data);
}

function rMissionControl(d) {
  const td = d.today;
  const days = ['Lun','Mar','Mer','Jeu','Ven'];
  const now = new Date();
  const dow = now.getDay(); // 0=Sun
  const weekDay = dow === 0 ? 5 : dow; // 1-5
  const weekPct = Math.round((weekDay / 5) * 100);

  const targets = d.targets;
  const cadence = d.cadence;
  const totalDone = Object.values(cadence).reduce((a,b)=>a+b,0);
  const totalTarget = Object.values(targets).reduce((a,b)=>a+b,0);

  // Date header
  const dateOpts = {weekday:'long',day:'numeric',month:'long',year:'numeric'};
  const dateLabel = now.toLocaleDateString('fr-FR', dateOpts);

  // Week progress bar helper
  function cadBar(label, icon, done, target, color) {
    const pct = Math.min(100, Math.round(done/target*100));
    const ontrack = done >= Math.round(target * weekPct/100);
    return `<div class="cad-item">
      <div class="cad-head">
        <span>${icon} ${label}</span>
        <span style="font-weight:900;color:${ontrack?'#0F9D58':done>0?'#F5A623':'#666'}">${done}<span style="color:#555;font-weight:400">/${target}</span></span>
      </div>
      <div class="cad-bar-track">
        <div class="cad-bar-fill" style="width:${pct}%;background:${color}"></div>
        <div class="cad-bar-mark" style="left:${weekPct}%"></div>
      </div>
    </div>`;
  }

  // Stage funnel counts
  const sc = d.stage_counts || {};
  const stageOrder = ['Prospect','Contacted','Meeting','Proposal','Negotiation','Signed'];
  const stageColors = {'Prospect':'#78909C','Contacted':'#1A73E8','Meeting':'#7B2FBE','Proposal':'#F5A623','Negotiation':'#E8500A','Signed':'#0F9D58'};
  const stageLabels = {'Prospect':'Prospect','Contacted':'Contacté','Meeting':'RDV','Proposal':'Proposition','Negotiation':'Négo','Signed':'Signé ✓'};

  let h = `<div class="mc-wrap">`;

  // ── HEADER ──────────────────────────────────────────────────────
  h += `<div class="mc-header">
    <div>
      <div class="mc-date">${dateLabel}</div>
      <div class="mc-subtitle">Semaine ${weekPct}% écoulée · ${d.wins_this_week} victoire${d.wins_this_week!==1?'s':''} cette semaine · ${d.week_contacts} contact${d.week_contacts!==1?'s':''} touchés</div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <div class="mc-week-badge" style="background:${totalDone>=Math.round(totalTarget*weekPct/100)?'#0F9D5822':'#E8500A22'};color:${totalDone>=Math.round(totalTarget*weekPct/100)?'#0F9D58':'#E8500A'};border:1px solid ${totalDone>=Math.round(totalTarget*weekPct/100)?'#0F9D5844':'#E8500A44'}">
        ${totalDone}/${totalTarget} actions<br><span style="font-size:10px;font-weight:400">${totalDone>=Math.round(totalTarget*weekPct/100)?'✅ Dans les clous':'⚠️ Retard'}</span>
      </div>
    </div>
  </div>`;

  // ── CADENCE HEBDO ────────────────────────────────────────────────
  h += `<div class="mc-cadence-grid">
    ${cadBar('Emails envoyés','✉️', cadence.emails, targets.emails,'#1A73E8')}
    ${cadBar('Appels passés','📞', cadence.appels, targets.appels,'#E8500A')}
    ${cadBar('RDV fixés','📅', cadence.rdv, targets.rdv,'#0F9D58')}
    ${cadBar('Relances','🔄', cadence.relances, targets.relances,'#7B2FBE')}
  </div>`;

  // ── PIPELINE MINI-FUNNEL ─────────────────────────────────────────
  h += `<div class="mc-row">`;
  h += `<div class="mc-panel" style="flex:1">
    <div class="mc-panel-title">🏗 Pipeline</div>`;
  stageOrder.forEach(s => {
    const n = sc[s] || 0;
    const max = sc['Prospect'] || 1;
    const pct = Math.round(n/max*100);
    if(n===0 && s==='Prospect') return;
    h += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer" onclick="setView('all-contacts')">
      <div style="width:60px;font-size:10px;color:#888;text-align:right;flex-shrink:0">${stageLabels[s]}</div>
      <div style="flex:1;background:#1a1a1a;border-radius:3px;height:20px;position:relative">
        <div style="width:${pct}%;background:${stageColors[s]};border-radius:3px;height:100%;display:flex;align-items:center;padding-left:6px;min-width:${n>0?'28px':'0'}">
          ${n>0?`<span style="font-size:10px;font-weight:800;color:#fff">${n}</span>`:''}
        </div>
      </div>
    </div>`;
  });
  // Prospect toujours en bas
  const np = sc['Prospect']||0;
  h += `<div style="display:flex;align-items:center;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid #222;cursor:pointer" onclick="setView('all-contacts')">
    <div style="width:60px;font-size:10px;color:#555;text-align:right;flex-shrink:0">Prospect</div>
    <div style="flex:1;background:#1a1a1a;border-radius:3px;height:20px;position:relative">
      <div style="width:100%;background:#78909C33;border-radius:3px;height:100%;display:flex;align-items:center;padding-left:6px">
        <span style="font-size:10px;color:#78909C">${np} à contacter</span>
      </div>
    </div>
  </div>`;
  h += `</div>`;

  // ── CONTACTS BLOQUÉS ─────────────────────────────────────────────
  const stuck = (d.stuck||[]).slice(0,5);
  h += `<div class="mc-panel" style="flex:1">
    <div class="mc-panel-title">⚠️ Jamais contactés / Bloqués <span style="font-size:10px;color:#555;font-weight:400">(Strategic + Quick Win)</span></div>`;
  if(stuck.length===0) {
    h += `<div style="color:#0F9D58;font-size:12px;padding:12px 0">✅ Aucun contact bloqué — beau travail !</div>`;
  } else {
    stuck.forEach(s => {
      const col = secColor('');
      const label = s.days===999?'Jamais contacté':`Inactif ${s.days}j`;
      const urgColor = s.days===999||s.days>=30?'#E8500A':s.days>=14?'#F5A623':'#888';
      h += `<div class="mc-stuck-row" onclick="openC(${s.id})">
        <div style="flex:1">
          <div style="font-weight:700;font-size:12.5px">${esc(s.company)}</div>
          <div style="font-size:10px;color:#666;margin-top:1px">${stageLabels[s.stage]||s.stage}</div>
        </div>
        <span style="font-size:10px;color:${urgColor};background:${urgColor}18;padding:2px 7px;border-radius:10px;white-space:nowrap">${label}</span>
        <button onclick="event.stopPropagation();openEmailModal(${s.id})" style="background:#1A73E822;border:1px solid #1A73E844;color:#1A73E8;border-radius:4px;padding:3px 7px;font-size:11px;cursor:pointer">📧</button>
      </div>`;
    });
  }
  h += `</div></div>`;

  // ── ACTIONS DU JOUR ──────────────────────────────────────────────
  h += `<div class="mc-panel" style="margin-top:0">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div class="mc-panel-title" style="margin:0">🎯 Actions prioritaires — Top 12 à traiter</div>
      <div style="font-size:11px;color:#555">Score × Segment × Urgence</div>
    </div>`;

  if(!d.actions || d.actions.length===0) {
    h += `<div style="color:#0F9D58;text-align:center;padding:24px;font-size:13px">✅ Toutes les actions prioritaires sont traitées !</div>`;
  } else {
    d.actions.forEach((c,i) => {
      const col = secColor(c.sector||'');
      const overdue = c.next_action_date && c.next_action_date < td;
      const isDue = c.next_action_date === td;
      const rowBg = overdue?'#E8500A08':isDue?'#F5A62308':'';
      const atIcon = {'Email':'✉️','Appel':'📞','LinkedIn':'🔗','RDV':'📅','Relance':'🔄','Partenariat':'🤝'}[c.action_type]||'▸';
      h += `<div class="mc-action-row" style="background:${rowBg}" onclick="openC(${c.id})">
        <div class="mc-action-rank">${i+1}</div>
        <div style="width:3px;height:38px;background:${col};border-radius:2px;flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-weight:800;font-size:12.5px">${esc(c.company)}</span>
            ${segTag(c.segment)}
            ${overdue?'<span style="font-size:9px;background:#E8500A22;color:#E8500A;padding:1px 5px;border-radius:8px">EN RETARD</span>':''}
          </div>
          <div style="font-size:11px;color:#777;margin-top:2px">
            ${atIcon} ${esc(c.next_action||'Définir la prochaine action')}
            ${c.next_action_date?`<span style="color:${overdue?'#E8500A':isDue?'#F5A623':'#555'}"> · ${c.next_action_date}</span>`:''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0" onclick="event.stopPropagation()">
          ${scoreTag(c.score)}
          <button onclick="openEmailModal(${c.id})" style="background:#1A73E822;border:1px solid #1A73E844;color:#1A73E8;border-radius:5px;padding:4px 8px;font-size:11px;cursor:pointer" title="Email">📧</button>
          <button onclick="openDoneFor(${c.id})" style="background:#0F9D5822;border:1px solid #0F9D5844;color:#0F9D58;border-radius:5px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer">✓ Fait</button>
        </div>
      </div>`;
    });
  }
  h += `</div>`;

  // ── OBJECTIFS MODIFIABLES ────────────────────────────────────────
  h += `<div class="mc-panel" style="background:#111;border-color:#222">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div class="mc-panel-title" style="margin:0;color:#888">⚙️ Objectifs hebdomadaires</div>
      <button onclick="saveMissionTargets()" style="background:#E8500A;color:#fff;border:none;border-radius:5px;padding:4px 10px;font-size:11px;cursor:pointer">Sauvegarder</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px">
      ${['emails','appels','rdv','relances'].map(k=>`
        <div>
          <label style="font-size:10px;color:#555;text-transform:uppercase;letter-spacing:.5px">${{emails:'✉️ Emails',appels:'📞 Appels',rdv:'📅 RDV',relances:'🔄 Relances'}[k]}</label>
          <input type="number" id="tgt-${k}" value="${targets[k]}" min="0" max="100"
            style="width:100%;background:#1a1a1a;border:1px solid #333;border-radius:5px;padding:6px 8px;color:#fff;font-size:13px;font-weight:700;margin-top:3px">
        </div>`).join('')}
    </div>
  </div>`;

  h += `</div>`;
  return h;
}

async function saveMissionTargets() {
  const data = {};
  ['emails','appels','rdv','relances'].forEach(k => {
    const el = document.getElementById('tgt-'+k);
    if(el) data[k] = parseInt(el.value)||0;
  });
  await apiFetch('/api/mission/target', {method:'POST', body:JSON.stringify(data)});
  toast('Objectifs mis à jour', 'success');
  loadMission();
}

// ════════════════════════════════════════════════════════════════ KANBAN PIPELINE

const KB_STAGES = ['Prospect','Contacted','Meeting','Proposal','Negotiation','Signed'];
const KB_LABELS = {Prospect:'Prospect',Contacted:'Contacté',Meeting:'RDV Prévu',Proposal:'Proposition',Negotiation:'Négociation',Signed:'Signé ✓'};
const KB_COLORS = {Prospect:'#78909C',Contacted:'#1A73E8',Meeting:'#7B2FBE',Proposal:'#F5A623',Negotiation:'#E8500A',Signed:'#0F9D58'};
const PROB = {Prospect:.05,Contacted:.15,Meeting:.35,Proposal:.60,Negotiation:.80,Signed:1.0,Deployed:1.0};
let _kbDragId = null;

async function loadKanban() {
  G._goals = G._goals || await apiFetch('/api/goals');
  document.getElementById('content').innerHTML = rKanban();
}

function rKanban() {
  const goals = G._goals || {};
  const poeiTarget  = goals.poei_target || 50;
  const caTarget    = goals.ca_target   || 150000;
  const poeiSigned  = goals.poei_signed || 0;
  const caSigned    = goals.ca_signed   || 0;
  const caProgress  = Math.min(100, Math.round(caSigned / caTarget * 100));
  const poeiProgress= Math.min(100, Math.round(poeiSigned / poeiTarget * 100));

  // Group contacts by stage
  const byStage = {};
  KB_STAGES.forEach(s => byStage[s] = []);
  G.contacts.forEach(c => {
    const s = c.stage || 'Prospect';
    if (byStage[s]) byStage[s].push(c);
    else byStage['Prospect'].push(c);
  });

  // Weighted pipeline value per stage
  const stageValues = {};
  KB_STAGES.forEach(s => {
    stageValues[s] = byStage[s].reduce((sum, c) =>
      sum + parseDeal(c.deal_potential || '') * 3000 * (PROB[s] || .05), 0);
  });
  const totalPipeline = Object.values(stageValues).reduce((a, b) => a + b, 0);

  let h = `<div class="kb-page">`;

  // ── OBJECTIFS BANNER ────────────────────────────────────────────
  h += `<div class="kb-metrics-row">
    <div class="kb-metric">
      <div class="kb-metric-label">🎯 POEI Signés</div>
      <div class="kb-metric-val" style="color:#E8500A">${poeiSigned} <span class="kb-metric-target">/ ${poeiTarget}</span></div>
      <div class="kb-metric-bar-track"><div class="kb-metric-bar" style="width:${poeiProgress}%;background:#E8500A"></div></div>
      <div class="kb-metric-pct">${poeiProgress}% de l'objectif</div>
    </div>
    <div class="kb-metric">
      <div class="kb-metric-label">💰 CA Signé</div>
      <div class="kb-metric-val" style="color:#0F9D58">${fmtEur(caSigned)} <span class="kb-metric-target">/ ${fmtEur(caTarget)}</span></div>
      <div class="kb-metric-bar-track"><div class="kb-metric-bar" style="width:${caProgress}%;background:#0F9D58"></div></div>
      <div class="kb-metric-pct">${caProgress}% de l'objectif</div>
    </div>
    <div class="kb-metric">
      <div class="kb-metric-label">📊 Pipeline Pondéré</div>
      <div class="kb-metric-val" style="color:#7B2FBE">${fmtEur(totalPipeline)}</div>
      <div class="kb-metric-pct" style="margin-top:8px">${G.contacts.length} entreprises · probabilité par stage</div>
    </div>
    <div class="kb-metric kb-metric-edit">
      <div class="kb-metric-label">⚙️ Objectifs</div>
      <div class="kb-metric-edit-grid">
        <label>POEI signés</label>
        <input type="number" id="ca-poei-signed" value="${poeiSigned}" min="0">
        <label>Objectif POEI</label>
        <input type="number" id="ca-poei-target" value="${poeiTarget}" min="1">
        <label>CA signé (€)</label>
        <input type="number" id="ca-signed" value="${caSigned}" min="0">
        <label>Objectif CA (€)</label>
        <input type="number" id="ca-target" value="${caTarget}" min="1">
      </div>
      <button class="kb-save-btn" onclick="saveGoals()">💾 Sauvegarder</button>
    </div>
  </div>`;

  // ── KANBAN BOARD ─────────────────────────────────────────────────
  h += `<div class="kb-board">`;
  KB_STAGES.forEach(stage => {
    const cards = [...(byStage[stage] || [])].sort((a, b) => (b.score || 0) - (a.score || 0));
    const val = stageValues[stage] || 0;
    const col = KB_COLORS[stage];
    h += `<div class="kb-col" id="kb-${stage}"
      ondragover="kbDragOver(event,'${stage}')"
      ondragleave="kbDragLeave(event)"
      ondrop="kbDrop(event,'${stage}')">
      <div class="kb-col-head" style="border-top:3px solid ${col}">
        <div>
          <div class="kb-col-name" style="color:${col}">${KB_LABELS[stage]}</div>
          <div class="kb-col-val">${fmtEur(val)}</div>
        </div>
        <span class="kb-badge" style="background:${col}22;color:${col}">${cards.length}</span>
      </div>
      <div class="kb-cards-wrap" id="kbc-${stage}">`;
    cards.forEach(c => { h += kbCard(c, col); });
    if (cards.length === 0) h += `<div class="kb-empty">Glisser ici</div>`;
    h += `</div></div>`;
  });
  h += `</div></div>`;
  return h;
}

function kbCard(c, col) {
  const overdue = c.next_action_date && c.next_action_date < today();
  const sc = col || secColor(c.sector || '');
  return `<div class="kb-card" draggable="true"
    ondragstart="kbDragStart(event,${c.id})"
    ondragend="kbDragEnd(event)"
    onclick="openC(${c.id})">
    <div class="kb-card-stripe" style="background:${sc}"></div>
    <div class="kb-card-inner">
      <div class="kb-card-company">${esc(c.company)}</div>
      ${c.sector ? `<div class="kb-card-sector" style="color:${secColor(c.sector)}">${esc(c.sector)}</div>` : ''}
      <div class="kb-card-tags">${segTag(c.segment)}${scoreTag(c.score)}</div>
      ${c.next_action ? `<div class="kb-card-action">${esc(c.next_action.substring(0, 45))}</div>` : ''}
      ${overdue ? `<div class="kb-card-overdue">⚠️ EN RETARD</div>` : ''}
    </div>
  </div>`;
}

function kbDragStart(e, id) {
  _kbDragId = id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', id);
  setTimeout(() => e.target.classList.add('kb-dragging'), 0);
}
function kbDragEnd(e) { e.target.classList.remove('kb-dragging'); }
function kbDragOver(e, stage) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.getElementById('kb-'+stage)?.classList.add('kb-drop-target');
}
function kbDragLeave(e) {
  if(!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('kb-drop-target');
  }
}
async function kbDrop(e, newStage) {
  e.preventDefault();
  e.currentTarget.classList.remove('kb-drop-target');
  const id = _kbDragId || parseInt(e.dataTransfer.getData('text/plain'));
  _kbDragId = null;
  if(!id) return;
  const c = G.contacts.find(x => x.id === id);
  if(!c || c.stage === newStage) return;
  const oldStage = c.stage;
  c.stage = newStage;                      // optimistic
  document.getElementById('content').innerHTML = rKanban();
  const res = await apiPatch(id, {stage: newStage});
  if(res) {
    G.contacts = G.contacts.map(x => x.id===id ? {...x, stage: newStage} : x);
    toast(`${esc(c.company)} → ${KB_LABELS[newStage]}`, 'success');
    const bdgToday = document.getElementById('bdg-today');
    if(bdgToday) updSidebar();
  } else {
    c.stage = oldStage;
    document.getElementById('content').innerHTML = rKanban();
  }
}

async function saveGoals() {
  const data = {
    poei_signed: parseInt(document.getElementById('ca-poei-signed')?.value)||0,
    poei_target: parseInt(document.getElementById('ca-poei-target')?.value)||50,
    ca_signed:   parseInt(document.getElementById('ca-signed')?.value)||0,
    ca_target:   parseInt(document.getElementById('ca-target')?.value)||150000,
  };
  const res = await apiFetch('/api/goals', {method:'POST', body:JSON.stringify(data)});
  if(res) {
    G._goals = res.goals;
    document.getElementById('content').innerHTML = rKanban();
    toast('Objectifs mis à jour ✅', 'success');
  }
}

// ════════════════════════════════════════════════════════════════ SÉQUENCES PROSPECTION

const SEQUENCES = {
  poei_standard: {
    name:'Séquence Standard POEI', icon:'🎯', color:'#E8500A',
    desc:'Approche POEI classique — 3 semaines',
    steps:[
      {day:0,  type:'Email',    label:'Email présentation POEI PNFB + offre formation'},
      {day:7,  type:'Relance',  label:'Relance email + ajout LinkedIn'},
      {day:14, type:'Appel',    label:'Appel DRH / Responsable Formation'},
      {day:21, type:'LinkedIn', label:'Message LinkedIn décideur si pas de réponse'},
    ]
  },
  quick_win: {
    name:'Quick Win — 10 jours', icon:'⚡', color:'#0F9D58',
    desc:'Pour les cibles avec fort signal d\'intention',
    steps:[
      {day:0,  type:'Email',   label:'Email court + lien plaquette POEI'},
      {day:3,  type:'Relance', label:'Relance courte J+3'},
      {day:7,  type:'Appel',   label:'Appel décideur direct'},
      {day:10, type:'RDV',     label:'Demande de RDV visio'},
    ]
  },
  sante: {
    name:'Séquence Santé / EHPAD', icon:'🏥', color:'#E91E8C',
    desc:'Pour AP-HP, Clariane, Orpea, EHPAD — POEI ASH',
    steps:[
      {day:0,  type:'Email',   label:'Email DRH + plaquette POEI ASH/Brancardiers'},
      {day:7,  type:'Appel',   label:'Appel Direction RH centrale'},
      {day:14, type:'Email',   label:'Envoi dossier OPCO Santé + financement'},
      {day:21, type:'RDV',     label:'RDV présentation PNFB + chiffres AP-HP'},
    ]
  },
  partner: {
    name:'Séquence Partenaire / OPCO', icon:'🤝', color:'#1A73E8',
    desc:'Pour agences intérim, OPCO, missions locales',
    steps:[
      {day:0,  type:'Email',  label:'Email présentation PNFB + partenariat prescripteur'},
      {day:10, type:'Appel',  label:'Appel responsable partenariats'},
      {day:20, type:'RDV',    label:'RDV de présentation + convention'},
      {day:35, type:'Email',  label:'Envoi convention partenariat signée'},
    ]
  },
};

let G_seqData = { applying: null, selected: [] };

async function loadSequencesView() {
  document.getElementById('content').innerHTML = rSequencesView();
}

function rSequencesView() {
  const seqs = Object.entries(SEQUENCES);
  let h = `<div class="page-wrap">`;

  // Stats barre
  const total = G.contacts.length;
  const contacted = G.contacts.filter(c=>c.stage!=='Prospect').length;
  const prospect = total - contacted;
  h += `<div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
    <div class="g-kpi" style="border-left:4px solid #E8500A;flex:1;min-width:160px">
      <div class="kpi-val" style="color:#E8500A">${prospect}</div>
      <div class="kpi-lbl">Prospects à activer</div>
    </div>
    <div class="g-kpi" style="border-left:4px solid #1A73E8;flex:1;min-width:160px">
      <div class="kpi-val" style="color:#1A73E8">${contacted}</div>
      <div class="kpi-lbl">Déjà contactés</div>
    </div>
    <div class="g-kpi" style="border-left:4px solid #0F9D58;flex:1;min-width:160px">
      <div class="kpi-val" style="color:#0F9D58">${G.contacts.filter(c=>c.segment==='Strategic').length}</div>
      <div class="kpi-lbl">Comptes Strategic</div>
    </div>
    <div class="g-kpi" style="border-left:4px solid #7B2FBE;flex:1;min-width:160px">
      <div class="kpi-val" style="color:#7B2FBE">${G.contacts.filter(c=>c.segment==='Quick Win').length}</div>
      <div class="kpi-lbl">Quick Win</div>
    </div>
  </div>`;

  // Les 4 séquences
  h += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">`;
  seqs.forEach(([key, seq]) => {
    h += `<div class="seq-card" style="border-top:3px solid ${seq.color}">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span style="font-size:22px">${seq.icon}</span>
        <div>
          <div style="font-weight:900;font-size:13px">${seq.name}</div>
          <div style="font-size:11px;color:#999">${seq.desc}</div>
        </div>
      </div>
      <div class="seq-steps">`;
    seq.steps.forEach((step, i) => {
      const atIcon = {Email:'✉️',Appel:'📞',LinkedIn:'🔗',RDV:'📅',Relance:'🔄'}[step.type]||'▸';
      h += `<div class="seq-step">
        <div class="seq-step-day" style="background:${seq.color}22;color:${seq.color}">J+${step.day}</div>
        <div class="seq-step-icon">${atIcon}</div>
        <div class="seq-step-label">${step.label}</div>
      </div>`;
    });
    h += `</div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-g" style="font-size:11px;padding:6px 12px" onclick="openApplySequence('${key}')">
          ⚡ Appliquer à une sélection
        </button>
        <button class="btn btn-s" style="font-size:11px;padding:6px 12px" onclick="openApplySequence('${key}','Strategic')">
          ⭐ Tous les Strategic
        </button>
        <button class="btn btn-s" style="font-size:11px;padding:6px 12px" onclick="openApplySequence('${key}','Quick Win')">
          ⚡ Tous les Quick Win
        </button>
      </div>
    </div>`;
  });
  h += `</div>`;

  // Reset dates
  h += `<div class="card" style="border-left:4px solid #F5A623">
    <h3 style="margin:0 0 12px;font-size:13px;color:#F5A623">🔄 Nettoyage — Réinitialiser les dates d'action</h3>
    <p style="font-size:12px;color:#888;margin-bottom:14px">178 contacts ont des dates dépassées (données d'import). Réinitialise pour repartir proprement.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <select id="reset-segment" style="background:#f5f5f3;border:1px solid #e5e4e0;border-radius:6px;padding:6px 10px;font-size:12px">
        <option value="">Tous les contacts</option>
        <option value="Strategic">Strategic uniquement</option>
        <option value="Quick Win">Quick Win uniquement</option>
        <option value="Partner">Partners uniquement</option>
        <option value="Long Term">Long Term uniquement</option>
      </select>
      <select id="reset-offset" style="background:#f5f5f3;border:1px solid #e5e4e0;border-radius:6px;padding:6px 10px;font-size:12px">
        <option value="0">Commencer aujourd'hui</option>
        <option value="1">Demain</option>
        <option value="3">Dans 3 jours</option>
        <option value="7">Dans 1 semaine</option>
      </select>
      <button class="btn btn-g" style="background:#F5A623;font-size:12px" onclick="bulkResetDates()">🔄 Réinitialiser les dates</button>
    </div>
  </div>`;

  h += `</div>`;
  return h;
}

async function openApplySequence(seqKey, autoSegment) {
  const seq = SEQUENCES[seqKey];
  if(!seq) return;
  const targets = autoSegment
    ? G.contacts.filter(c => c.segment === autoSegment && c.stage === 'Prospect')
    : G.contacts.filter(c => c.stage === 'Prospect').slice(0, 20);

  if(targets.length === 0) { toast('Aucun contact Prospect dans ce groupe', 'error'); return; }

  const msg = autoSegment
    ? `Appliquer "${seq.name}" à ${targets.length} contacts ${autoSegment} (Prospect) ?`
    : `Appliquer "${seq.name}" aux ${targets.length} premiers prospects ?`;

  if(!confirm(`${msg}\n\nCela va planifier J+0→J+${seq.steps[seq.steps.length-1].day} pour chaque contact.`)) return;

  const today_ = new Date();
  let applied = 0;
  for(const c of targets) {
    const firstStep = seq.steps[0];
    const d = new Date(today_);
    d.setDate(d.getDate() + firstStep.day);
    const dateStr = d.toISOString().split('T')[0];
    await apiPatch(c.id, {
      action_type: firstStep.type,
      next_action: firstStep.label,
      next_action_date: dateStr,
    });
    G.contacts = G.contacts.map(x => x.id===c.id
      ? {...x, action_type:firstStep.type, next_action:firstStep.label, next_action_date:dateStr}
      : x);
    applied++;
  }
  toast(`✅ Séquence appliquée à ${applied} contacts — prochaine action planifiée`, 'success');
  setTimeout(() => loadSequencesView(), 300);
}

async function bulkResetDates() {
  const segment = document.getElementById('reset-segment')?.value || '';
  const offset  = parseInt(document.getElementById('reset-offset')?.value) || 0;
  const label   = segment || 'tous les contacts';
  if(!confirm(`Réinitialiser les dates d'action pour ${label} ?`)) return;
  const res = await apiFetch('/api/contacts/bulk-date', {
    method:'POST', body: JSON.stringify({days_offset: offset, segment})
  });
  if(res?.ok) {
    toast(`✅ ${res.updated} contacts mis à jour`, 'success');
    const data = await apiFetch('/api/contacts');
    if(data) { G.contacts = data; loadSequencesView(); }
  }
}

// ════════════════════════════════════════════════════════════════ GROWTH DASHBOARD
function rGrowthDashboard() {
  const td = today();
  const list = G.contacts;
  const ov = list.filter(c=>isOv(c,td));
  const tl = list.filter(c=>isTd(c,td));
  const signed = list.filter(c=>c.stage==='Signed'||c.stage==='Deployed');
  const pipeline = pipelineValue(list);
  const strategic = list.filter(c=>c.segment==='Strategic');
  const ve = list.filter(c=>c.email_status==='valid'||c.email_status==='Verified');

  // Stage distribution
  const stageCounts = {};
  STAGES.forEach(s=>stageCounts[s]=0);
  list.forEach(c=>{const s=c.stage||'Prospect';if(stageCounts[s]!==undefined)stageCounts[s]++;});
  const maxStage = Math.max(...Object.values(stageCounts),1);

  // Sector pipeline
  const secPipe = {};
  list.forEach(c=>{
    const s=c.sector||'Autre';
    const val = parseDeal(c.deal_potential||'')*3000*({Prospect:.05,Contacted:.15,Meeting:.35,Proposal:.60,Negotiation:.80,Signed:1,Deployed:1}[c.stage||'Prospect']||.05);
    secPipe[s]=(secPipe[s]||0)+val;
  });
  const topSectors = Object.entries(secPipe).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const maxSecPipe = Math.max(...topSectors.map(x=>x[1]),1);

  // Top opportunities — deduplicated by company (keep best score per company)
  const _seen = {};
  const _deduped = [];
  [...list].sort((a,b)=>(b.score||0)-(a.score||0)).forEach(c => {
    const key = (c.company||'').trim().toLowerCase();
    if(!_seen[key]) { _seen[key]=true; _deduped.push(c); }
  });
  const topOpps = _deduped.sort((a,b)=>(b.score||0)*parseDeal(b.deal_potential||'')-(a.score||0)*parseDeal(a.deal_potential||'')).slice(0,8);

  // Recent activity
  const recentAct = G.metrics?.recent_activity || [];

  let h = `<div class="growth-grid">
    <div class="g-kpi" style="--kpi-color:#E8500A">
      <div class="gk-label">Pipeline pondéré</div>
      <div class="gk-val">${fmtEur(pipeline)}</div>
      <div class="gk-sub">à ${list.length} prospects · prob. stage</div>
      <div class="gk-trend">💰</div>
    </div>
    <div class="g-kpi" style="--kpi-color:#D93025">
      <div class="gk-label">Actions urgentes</div>
      <div class="gk-val">${ov.length+tl.length}</div>
      <div class="gk-sub">${ov.length} en retard · ${tl.length} aujourd'hui</div>
      <div class="gk-trend">⚡</div>
    </div>
    <div class="g-kpi" style="--kpi-color:#7B2FBE">
      <div class="gk-label">Comptes Strategic</div>
      <div class="gk-val">${strategic.length}</div>
      <div class="gk-sub">${fmtEur(pipelineValue(strategic))} pipeline</div>
      <div class="gk-trend">⭐</div>
    </div>
    <div class="g-kpi" style="--kpi-color:#0F9D58">
      <div class="gk-label">Signés / Déployés</div>
      <div class="gk-val">${signed.length}</div>
      <div class="gk-sub">conventions POEI actives</div>
      <div class="gk-trend">✅</div>
    </div>
    <div class="g-kpi" style="--kpi-color:#1A73E8">
      <div class="gk-label">Emails joignables</div>
      <div class="gk-val">${ve.length}</div>
      <div class="gk-sub">${Math.round(ve.length/list.length*100)}% du portefeuille</div>
      <div class="gk-trend">✉</div>
    </div>
    <div class="g-kpi" style="--kpi-color:#F5A623">
      <div class="gk-label">Score moyen</div>
      <div class="gk-val">${Math.round(list.reduce((s,c)=>s+(c.score||0),0)/list.length)}</div>
      <div class="gk-sub">qualité portefeuille / 100</div>
      <div class="gk-trend">📊</div>
    </div>
  </div>`;

  // Alert strip
  if(ov.length+tl.length > 0) {
    h += `<div style="background:#FFF0EA;border:1px solid #E8500A33;border-left:3px solid #E8500A;border-radius:6px;padding:10px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px;font-size:12.5px;cursor:pointer" onclick="setView('all-contacts');tF('','')">
      ⚡ <strong>${ov.length} action${ov.length>1?'s':''} en retard</strong> et <strong>${tl.length} pour aujourd'hui</strong> — cliquer pour voir le tableau de bord
      <span style="margin-left:auto;color:var(--ac);font-weight:700">Voir →</span>
    </div>`;
  }

  h += '<div class="growth-cols">';

  // Left: Funnel + Sector bars
  h += '<div>';

  // Sales Funnel
  h += '<div class="g-card" style="margin-bottom:14px"><h3>Entonnoir Commercial POEI</h3><div class="funnel-wrap">';
  const stageColors = {Prospect:'#aaa',Contacted:'#F5A623',Meeting:'#1A73E8',Proposal:'#7B2FBE',Negotiation:'#E8500A',Signed:'#0F9D58',Deployed:'#0F9D58'};
  STAGES.forEach(s=>{
    const n=stageCounts[s];
    const pct=Math.max(Math.round(n/list.length*100),1);
    const val=fmtEur(pipelineValue(list.filter(c=>c.stage===s)));
    h+=`<div class="funnel-row">
      <div class="funnel-label">${SL[s]}</div>
      <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${pct}%;background:${stageColors[s]};min-width:${n>0?'30px':'0'}">${n>3?n:''}</div></div>
      <div class="funnel-count">${n}</div>
      <div class="funnel-rate">${val}</div>
    </div>`;
  });
  h += '</div></div>';

  // Sector pipeline bars
  h += '<div class="g-card"><h3>Pipeline par Secteur</h3>';
  topSectors.forEach(([sec,val])=>{
    const col=secColor(sec);
    const pct=Math.round(val/maxSecPipe*100);
    h+=`<div class="bar-row" style="margin-bottom:8px;cursor:pointer" onclick="setView('sector','${esc(sec)}')">
      <div class="bar-lbl" style="min-width:140px;font-size:11.5px">${sec}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${col}"></div></div>
      <div class="bar-num" style="min-width:55px;text-align:right;font-size:11px;color:${col};font-weight:700">${fmtEur(val)}</div>
    </div>`;
  });
  h += '</div></div>';

  // Right sidebar
  h += '<div>';

  // Top Opportunities
  h += '<div class="g-card" style="margin-bottom:14px"><h3>Top 8 Opportunités</h3>';
  topOpps.forEach((c,i)=>{
    const vol=parseDeal(c.deal_potential||'');
    const val=fmtEur(vol*3000);
    h+=`<div class="opp-row" onclick="openC(${c.id})">
      <div class="opp-num">${i+1}</div>
      <div class="opp-info">
        <div class="opp-co">${esc(c.company)}</div>
        <div style="font-size:10.5px;color:var(--mu)">${segTag(c.segment)} ${esc(c.sector||'')}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div class="opp-val">${val}</div>
        <div style="font-size:10px;color:var(--mu)">score ${c.score}</div>
      </div>
    </div>`;
  });
  h += '</div>';

  // Urgent actions
  h += '<div class="g-card" style="margin-bottom:14px"><h3>⚡ Actions Urgentes</h3>';
  const urgent = [...ov.slice(0,5), ...tl.slice(0,3)].sort((a,b)=>segO(a)-segO(b)||b.score-a.score);
  if(urgent.length===0) h+='<div style="text-align:center;padding:16px;color:var(--mu);font-size:12px">🎉 Aucune action urgente !</div>';
  urgent.forEach(c=>{
    const isOvr = isOv(c,td);
    h+=`<div class="opp-row" onclick="openC(${c.id})">
      <div style="width:8px;height:8px;border-radius:50%;background:${isOvr?'var(--r)':'var(--y)'};flex-shrink:0;margin-top:2px"></div>
      <div class="opp-info">
        <div class="opp-co">${esc(c.company)}</div>
        <div style="font-size:10.5px;color:var(--mu)">${atTag(c.action_type)} ${esc((c.next_action||'').substring(0,35))}</div>
      </div>
      <button onclick="event.stopPropagation();openDoneFor(${c.id})" style="background:var(--ac);color:#fff;border:none;border-radius:5px;padding:4px 8px;font-size:10px;font-weight:700;cursor:pointer;flex-shrink:0">✓</button>
    </div>`;
  });
  h += '</div>';

  // Recent Activity
  h += '<div class="g-card"><h3>Activité Récente</h3>';
  if(!recentAct.length) {
    h+='<div style="text-align:center;padding:12px;color:var(--mu);font-size:12px">Aucune activité enregistrée</div>';
  } else {
    recentAct.slice(0,8).forEach(a=>{
      h+=`<div class="act-item">
        <div class="act-dot" style="background:${atColors[a.type]||'var(--ac)'}"></div>
        <div class="act-body">
          <div class="act-co">${esc(a.company||'?')} — ${esc(a.contact||'?')}</div>
          <div class="act-txt">${atTag(a.type)} ${esc((a.result||'').substring(0,50))}</div>
          <div class="act-time">${a.date||''}</div>
        </div>
      </div>`;
    });
  }
  h += '</div>';
  h += '</div></div>';

  return h;
}

const atColors = {Appel:'#E8500A',Email:'#1A73E8',LinkedIn:'#0077B5',Partenariat:'#0F9D58',Note:'#888',Stage:'#7B2FBE',RDV:'#9C27B0'};

// ════════════════════════════════════════════════════════════════ MARKET STUDY
const MARKET_DATA = {
  '🧹 Propreté/FM':   {size:'18Md€',jobs:'500k',idf:'80k',turnover:'40-50%',growth:'+2.5%/an',poei:'Agents propreté, techniciens FM',tam:500,color:'#E8500A'},
  '🏥 Santé':         {size:'240Md€',jobs:'1.2M',idf:'200k',turnover:'25-35%',growth:'+4%/an',poei:'ASH, aide-soignant, brancardier',tam:300,color:'#E91E8C'},
  '🏨 Hôtellerie':    {size:'42Md€',jobs:'250k',idf:'60k',turnover:'35-45%',growth:'+6%/an',poei:'Femme chambre, réceptionniste, F&B',tam:180,color:'#9C27B0'},
  '✈️ Aéroportuaire': {size:'5Md€',jobs:'120k',idf:'90k',turnover:'20-30%',growth:'+8%/an',poei:'Agent escale, sûreté APS, bagagiste',tam:150,color:'#00ACC1'},
  '📦 Logistique':    {size:'200Md€',jobs:'1M',idf:'150k',turnover:'30-40%',growth:'+5%/an',poei:'Préparateur commandes, cariste CACES',tam:400,color:'#7B2FBE'},
  '🍽️ Restauration':  {size:'85Md€',jobs:'700k',idf:'80k',turnover:'50-60%',growth:'+3%/an',poei:'Équipier restauration, cuisinier',tam:200,color:'#0F9D58'},
  '🏗️ BTP':           {size:'150Md€',jobs:'1.5M',idf:'200k',turnover:'15-20%',growth:'+1%/an',poei:'Maçon, électricien, plombier',tam:120,color:'#1A73E8'},
  '👴 Services Personne':{size:'14Md€',jobs:'800k',idf:'100k',turnover:'35-45%',growth:'+7%/an',poei:'ADVF, aide à domicile, auxiliaire vie',tam:100,color:'#F5A623'},
};

function rMarketStudy() {
  const secCounts={};
  G.contacts.forEach(c=>{secCounts[c.sector]=(secCounts[c.sector]||0)+1;});
  const totalPipe = pipelineValue(G.contacts);

  let h = `<div class="market-hero">
    <h2>🌍 Intelligence Marché POEI — IDF 2026</h2>
    <p>Analyse des marchés adressables, couverture du portefeuille et recommandations stratégiques</p>
    <div class="market-hero-stats">
      <div class="mhs"><div class="mv">${G.contacts.length}</div><div class="mk">Contacts en base</div></div>
      <div class="mhs"><div class="mv">${fmtEur(totalPipe)}</div><div class="mk">Pipeline pondéré</div></div>
      <div class="mhs"><div class="mv">${Object.keys(secCounts).length}</div><div class="mk">Secteurs couverts</div></div>
      <div class="mhs"><div class="mv">27.8M€</div><div class="mk">Potentiel total estimé</div></div>
    </div>
  </div>`;

  // Overview table
  h += '<table class="market-table"><thead><tr><th>Secteur</th><th>Taille marché</th><th>Emplois IDF</th><th>Turnover</th><th>Croissance</th><th>Nos contacts</th><th>Couverture</th><th>Pipeline</th><th>POEI ciblé</th><th>Recommandation</th></tr></thead><tbody>';

  Object.entries(MARKET_DATA).forEach(([sec,m])=>{
    const cnt = secCounts[sec]||0;
    const coverage = Math.min(Math.round(cnt/m.tam*100),100);
    const pipe = pipelineValue(G.contacts.filter(c=>c.sector===sec));
    const rec = coverage<10?{t:'🔴 Peu couvert',bg:'#FCE8E6',c:'#D93025'}:coverage<30?{t:'🟡 En développement',bg:'#FEF3E2',c:'#B07700'}:{t:'🟢 Bien couvert',bg:'#E6F4EA',c:'#0F9D58'};
    const col = m.color || secColor(sec);
    h+=`<tr>
      <td style="cursor:pointer" onclick="setView('sector','${esc(sec)}')"><span style="font-weight:900;color:${col}">${sec}</span></td>
      <td style="font-weight:700">${m.size}</td>
      <td>${m.idf}</td>
      <td style="color:#E8500A;font-weight:600">${m.turnover}</td>
      <td style="color:#0F9D58;font-weight:700">${m.growth}</td>
      <td style="font-weight:800;text-align:center">${cnt}</td>
      <td>
        <div class="penetration-bar"><div class="penetration-fill" style="width:${coverage}%;background:${col}"></div></div>
        <div style="font-size:10px;color:var(--mu);margin-top:2px">${coverage}% / objectif TAM ~${m.tam}</div>
      </td>
      <td style="color:${col};font-weight:700">${fmtEur(pipe)}</td>
      <td style="font-size:11px;color:var(--mu)">${m.poei}</td>
      <td><span class="rec-pill" style="background:${rec.bg};color:${rec.c}">${rec.t}</span></td>
    </tr>`;
  });
  h += '</tbody></table>';

  // Strategic recommendations
  h += `<div class="g-card" style="margin-bottom:16px">
    <h3>🎯 Recommandations Stratégiques Head of Growth</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-top:4px">
      <div style="background:#FFF0EA;border-radius:8px;padding:14px;border-left:3px solid #E8500A">
        <div style="font-weight:900;font-size:12.5px;color:#E8500A;margin-bottom:6px">🔥 Action Immédiate</div>
        <div style="font-size:12px;color:#5E5C58;line-height:1.5">AP-HP, Clariane, Orpea — 3 comptes santé = +500 recrutements/an. Pipeline non adressé. Démarrer prospection dès cette semaine.</div>
      </div>
      <div style="background:#E6F4EA;border-radius:8px;padding:14px;border-left:3px solid #0F9D58">
        <div style="font-weight:900;font-size:12.5px;color:#0F9D58;margin-bottom:6px">✅ Consolider</div>
        <div style="font-size:12px;color:#5E5C58;line-height:1.5">Propreté/FM : 164 contacts, secteur core. Pousser vers stade Contacted → Meeting. Objectif : 10 RDV cette semaine sur TOP 20 Strategic.</div>
      </div>
      <div style="background:#E8F0FE;border-radius:8px;padding:14px;border-left:3px solid #1A73E8">
        <div style="font-weight:900;font-size:12.5px;color:#1A73E8;margin-bottom:6px">📈 Développer</div>
        <div style="font-size:12px;color:#5E5C58;line-height:1.5">Logistique : 8.7M€ pipeline. Amazon (1000 recrut./an), Carrefour, XPO — KEY ACCOUNTS. Nommer un account manager dédié logistique.</div>
      </div>
      <div style="background:#F3E8FD;border-radius:8px;padding:14px;border-left:3px solid #9C27B0">
        <div style="font-weight:900;font-size:12.5px;color:#9C27B0;margin-bottom:6px">🏨 Opportunité non exploitée</div>
        <div style="font-size:12px;color:#5E5C58;line-height:1.5">Hôtellerie & Aéroportuaire = 0% couverture sur secteurs en forte pénurie. Accor (500+ recrut/an) + ADP (400+ recrut/an) = priorité absolue Q2.</div>
      </div>
      <div style="background:#FFF8F6;border-radius:8px;padding:14px;border-left:3px solid #F5A623">
        <div style="font-weight:900;font-size:12.5px;color:#B07700;margin-bottom:6px">🤝 Levier Partenariats</div>
        <div style="font-size:12px;color:#5E5C58;line-height:1.5">Signer 3 conventions prescripteurs (intérim IDF, CMA, France Travail 93/94/95) pour multiplier le flux candidats × 3 sans coût acquisition.</div>
      </div>
      <div style="background:#E6F4EA;border-radius:8px;padding:14px;border-left:3px solid #0F9D58">
        <div style="font-weight:900;font-size:12.5px;color:#0F9D58;margin-bottom:6px">💰 Objectif Q3 2026</div>
        <div style="font-size:12px;color:#5E5C58;line-height:1.5">10 conventions POEI signées = 100 candidats/mois en formation = CA mensuel estimé 300k€. Focus sur top 30 comptes pour atteindre cet objectif.</div>
      </div>
    </div>
  </div>`;

  // Sector deep dives
  h += '<div class="market-sector-cards">';
  Object.entries(MARKET_DATA).forEach(([sec,m])=>{
    const sContacts=G.contacts.filter(c=>c.sector===sec);
    const col=m.color||secColor(sec);
    const strategic=sContacts.filter(c=>c.segment==='Strategic').length;
    const signed=sContacts.filter(c=>c.stage==='Signed'||c.stage==='Deployed').length;
    const pipe=pipelineValue(sContacts);
    if(!sContacts.length && !m.tam) return;
    h+=`<div class="msc">
      <div class="msc-head" style="background:${col}">${sec} — ${m.size}</div>
      <div class="msc-body">
        <div class="msc-stat"><span class="mk">Emplois IDF</span><span class="mv">${m.idf}</span></div>
        <div class="msc-stat"><span class="mk">Turnover annuel</span><span class="mv" style="color:#E8500A">${m.turnover}</span></div>
        <div class="msc-stat"><span class="mk">Nos contacts</span><span class="mv">${sContacts.length}</span></div>
        <div class="msc-stat"><span class="mk">Strategic</span><span class="mv" style="color:var(--r)">${strategic}</span></div>
        <div class="msc-stat"><span class="mk">Signés</span><span class="mv" style="color:var(--g)">${signed}</span></div>
        <div class="msc-stat"><span class="mk">Pipeline pondéré</span><span class="mv" style="color:${col}">${fmtEur(pipe)}</span></div>
        <div class="msc-stat"><span class="mk">POEI ciblé</span><span class="mv" style="font-size:11px">${m.poei}</span></div>
      </div>
    </div>`;
  });
  h += '</div>';
  return h;
}

// ════════════════════════════════════════════════════════════════ PARTNERS
const PARTNER_TYPES = {
  'interim':   {label:'Intérim IDF',   icon:'🏢', color:'#1A73E8', desc:'Agences intérim = prescripteurs candidats'},
  'cfa':       {label:'CFA / OF',      icon:'🎓', color:'#7B2FBE', desc:'Centres formation = co-traitance POEI'},
  'ft':        {label:'France Travail', icon:'🏛', color:'#0F9D58', desc:'Financement POEI + sourcing candidats'},
  'opco':      {label:'OPCO',          icon:'💼', color:'#E8500A', desc:'AKTO, UNIFORMATION = financement alternance'},
  'cma':       {label:'CMA / CCI',     icon:'🤝', color:'#F5A623', desc:'Réseau entreprises PME/ETI'},
  'ess':       {label:'ESS / Insertion',icon:'♻️', color:'#00ACC1', desc:'IAE, missions locales = sources candidats'},
};
const PARTNER_STAGES = ['À approcher','Contact établi','Réunion faite','Convention signée','Partenaire actif'];
const PARTNER_STAGE_COLORS = ['#aaa','#F5A623','#1A73E8','#7B2FBE','#0F9D58'];

function getPartners() {
  return G.contacts.filter(c=>c.segment==='Partner');
}

function rPartners() {
  const partners = getPartners();
  const byStage = {};
  PARTNER_STAGES.forEach(s=>{byStage[s]=[];});
  partners.forEach(c=>{
    const s = c.stage==='Signed'||c.stage==='Deployed'?'Partenaire actif':
              c.stage==='Proposal'||c.stage==='Negotiation'?'Convention signée':
              c.stage==='Meeting'?'Réunion faite':
              c.stage==='Contacted'?'Contact établi':'À approcher';
    byStage[s].push(c);
  });

  let h = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:20px">`;
  Object.entries(PARTNER_TYPES).forEach(([k,t])=>{
    const cnt = partners.filter(c=>(c.notes||'').toLowerCase().includes(t.label.toLowerCase().split(' ')[0])||
      (c.poei_offer||'').toLowerCase().includes(k)||(c.sector||'').includes('Intérim')&&k==='interim').length;
    h+=`<div style="background:var(--w);border:1px solid var(--bd);border-radius:8px;padding:12px;border-top:3px solid ${t.color}">
      <div style="font-size:20px;margin-bottom:4px">${t.icon}</div>
      <div style="font-weight:800;font-size:12px">${t.label}</div>
      <div style="font-size:10px;color:var(--mu);margin-top:2px">${t.desc}</div>
    </div>`;
  });
  h += '</div>';

  // Partner pipeline kanban
  h += '<div style="margin-bottom:20px"><div style="font-size:11px;font-weight:800;color:var(--mu);text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px">Pipeline Partenariats</div>';
  h += '<div class="partner-pipeline">';
  PARTNER_STAGES.forEach((stage,i)=>{
    const cards=byStage[stage]||[];
    const col=PARTNER_STAGE_COLORS[i];
    h+=`<div class="p-col">
      <div class="p-col-head"><span class="p-col-title" style="color:${col}">${stage}</span><span class="p-col-cnt">${cards.length}</span></div>
      <div class="p-col-body">`;
    cards.forEach(c=>{
      h+=`<div class="p-card" onclick="openC(${c.id})">
        <div class="p-card-name">${esc(c.company)}</div>
        <div class="p-card-type">${esc(c.title||c.sector||'')}</div>
        <div class="p-card-score">Score ${c.score} · ${c.priority}</div>
      </div>`;
    });
    h += '</div></div>';
  });
  h += '</div></div>';

  // Recommandations partenariats
  h += `<div class="g-card" style="margin-bottom:16px">
    <h3>🎯 Stratégie Acquisition Partenaires — Priorités Q2 2026</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:8px">
      <div style="padding:12px;background:var(--gl);border-radius:8px;border-left:3px solid var(--g)">
        <div style="font-weight:900;font-size:12px;color:var(--g);margin-bottom:5px">1. France Travail 93/94/95 — URGENT</div>
        <div style="font-size:11.5px;color:#333;line-height:1.5">Convention POEI = accès base candidats + financement formation 100%. Objectif : signer avant fin mai. Contact : Directeur territorial.</div>
      </div>
      <div style="padding:12px;background:var(--bl);border-radius:8px;border-left:3px solid var(--b)">
        <div style="font-weight:900;font-size:12px;color:var(--b);margin-bottom:5px">2. Top 5 Agences Intérim IDF</div>
        <div style="font-size:11.5px;color:#333;line-height:1.5">Manpower, Adecco, Randstad, Synergie, Actual — prescripteurs naturels POEI. Convention co-positionnement candidats = flux qualifié permanent.</div>
      </div>
      <div style="padding:12px;background:var(--yl);border-radius:8px;border-left:3px solid var(--y)">
        <div style="font-weight:900;font-size:12px;color:#B07700;margin-bottom:5px">3. AKTO + UNIFORMATION (OPCO)</div>
        <div style="font-size:11.5px;color:#333;line-height:1.5">Financement alternance + POEI. AKTO = hôtellerie, propreté, services. UNIFORMATION = logistique. Objectif : référencement OF AKTO.</div>
      </div>
      <div style="padding:12px;background:var(--pl);border-radius:8px;border-left:3px solid var(--p)">
        <div style="font-weight:900;font-size:12px;color:var(--p);margin-bottom:5px">4. Missions Locales IDF + CIVIS</div>
        <div style="font-size:11.5px;color:#333;line-height:1.5">Jeunes 16-26 ans = profils POEI idéaux. Partenariat missions locales Aubervilliers, Saint-Denis, Bobigny pour flux candidats régulier.</div>
      </div>
      <div style="padding:12px;background:#FFF0EA;border-radius:8px;border-left:3px solid #E8500A">
        <div style="font-weight:900;font-size:12px;color:#E8500A;margin-bottom:5px">5. CMA IDF + BGE (accompagnement TPE)</div>
        <div style="font-size:11.5px;color:#333;line-height:1.5">Réseau 50k+ TPE/PME IDF. Convention prescripteur = recommandations POEI à leurs membres. ROI élevé pour coût faible.</div>
      </div>
      <div style="padding:12px;background:var(--gl);border-radius:8px;border-left:3px solid var(--g)">
        <div style="font-weight:900;font-size:12px;color:var(--g);margin-bottom:5px">6. IAE — Insertion par Activité Éco.</div>
        <div style="font-size:11.5px;color:#333;line-height:1.5">ARES, ENVIE, Emmaüs Défi — prescripteurs pour publics éloignés emploi. Angle RSE/impact pour entreprises clientes. Financement Région possible.</div>
      </div>
    </div>
  </div>`;

  // Partner contact cards
  if(partners.length) {
    h += '<div style="font-size:11px;font-weight:800;color:var(--mu);text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px">Contacts Partenaires en Portefeuille</div>';
    h += '<div class="partner-cards">';
    partners.sort((a,b)=>b.score-a.score).forEach(c=>{
      const col=secColor(c.sector);
      h+=`<div class="partner-card" onclick="openC(${c.id})">
        <div class="pc-head">
          <div class="pc-logo" style="background:${col}22;font-size:18px">🤝</div>
          <div><div class="pc-name">${esc(c.company)}</div><div class="pc-type">${esc(c.title||c.sector||'')}</div></div>
          <div style="margin-left:auto">${scoreTag(c.score)}</div>
        </div>
        <div class="pc-metrics">
          <div class="pcm"><div class="pv" style="color:${col}">${c.score}</div><div class="pk">Score</div></div>
          <div class="pcm"><div class="pv">${parseDeal(c.deal_potential||'')}</div><div class="pk">Vol/an</div></div>
          <div class="pcm"><div class="pv" style="color:${c.priority==='HIGH'?'var(--r)':'var(--y)'}">${c.priority}</div><div class="pk">Priorité</div></div>
        </div>
        <div style="font-size:11px;color:var(--mu);margin-bottom:8px">${esc((c.notes||'').substring(0,80))}…</div>
        <div style="display:flex;gap:6px;align-items:center">
          ${atTag(c.action_type)}
          <span style="font-size:11px;color:var(--mu)">${esc((c.next_action||'').substring(0,40))}</span>
        </div>
      </div>`;
    });
    h += '</div>';
  } else {
    h += `<div style="text-align:center;padding:32px;background:var(--w);border:1px solid var(--bd);border-radius:10px">
      <div style="font-size:36px;margin-bottom:10px">🤝</div>
      <div style="font-weight:800;font-size:14px;margin-bottom:6px">Aucun partenaire en portefeuille</div>
      <div style="font-size:12px;color:var(--mu);margin-bottom:14px">Changez le segment d'un contact en "Partner" pour l'ajouter ici.</div>
      <button class="tb-btn" onclick="openContactForm()">➕ Ajouter un partenaire</button>
    </div>`;
  }

  return h;
}

// ════════════════════════════════════════════════════════════════ SETTINGS
function rSettings() {
  return `<div class="settings-section">
    <h3>👥 Équipe & Utilisateurs</h3>
    <div id="users-list">Chargement…</div>
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--bd)">
      <div style="font-size:12px;font-weight:700;margin-bottom:8px">Créer un utilisateur</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end">
        <div><label style="font-size:10px;color:var(--mu);display:block;margin-bottom:3px">Identifiant</label><input id="nu-name" type="text" placeholder="prenom.nom" style="width:100%;border:1.5px solid var(--bd);border-radius:6px;padding:7px 10px;font-size:13px;outline:none"></div>
        <div><label style="font-size:10px;color:var(--mu);display:block;margin-bottom:3px">Email</label><input id="nu-email" type="email" placeholder="email@pnfb.fr" style="width:100%;border:1.5px solid var(--bd);border-radius:6px;padding:7px 10px;font-size:13px;outline:none"></div>
        <div><label style="font-size:10px;color:var(--mu);display:block;margin-bottom:3px">Mot de passe</label><input id="nu-pw" type="password" placeholder="••••••••" style="width:100%;border:1.5px solid var(--bd);border-radius:6px;padding:7px 10px;font-size:13px;outline:none"></div>
        <button class="tb-btn" onclick="createUser()" style="white-space:nowrap;height:36px">➕ Créer</button>
      </div>
    </div>
  </div>
  <div class="settings-section">
    <h3>📊 Statistiques Base de Données</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">
      <div style="background:var(--bg);border-radius:8px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:900">${G.contacts.length}</div><div style="font-size:10px;color:var(--mu)">Contacts total</div></div>
      <div style="background:var(--bg);border-radius:8px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:900;color:var(--r)">${G.contacts.filter(c=>c.segment==='Strategic').length}</div><div style="font-size:10px;color:var(--mu)">Strategic</div></div>
      <div style="background:var(--bg);border-radius:8px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:900;color:var(--g)">${G.contacts.filter(c=>c.email_status==='valid'||c.email_status==='Verified').length}</div><div style="font-size:10px;color:var(--mu)">Emails valides</div></div>
      <div style="background:var(--bg);border-radius:8px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:900;color:var(--ac)">${fmtEur(pipelineValue(G.contacts))}</div><div style="font-size:10px;color:var(--mu)">Pipeline total</div></div>
    </div>
  </div>
  <div class="settings-section">
    <h3>⬇ Export & Données</h3>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="tb-btn" onclick="exportCSV()">⬇ Exporter tous les contacts (CSV)</button>
      <button class="tb-btn tb-btn-s" onclick="exportCSV('strategic')">⬇ Exporter Strategic seulement</button>
      <button class="tb-btn tb-btn-s" onclick="normalizeSectors()" title="Corrige les noms de secteurs sans emoji (ex: BTP → 🏗️ BTP)">🔧 Normaliser les secteurs</button>
    </div>
  </div>
  ${G.contacts.length===0?`<div class="settings-section" style="border:2px dashed var(--ac);background:var(--acl)">
    <h3 style="color:var(--ac)">🚀 Démarrage rapide — Charger des données de démonstration</h3>
    <p style="font-size:13px;color:var(--mu);margin-bottom:12px">La base de données est vide. Chargez 10 contacts de démonstration pour explorer toutes les fonctionnalités du CRM.</p>
    <button class="tb-btn" style="background:var(--ac);color:#fff;font-size:13px;padding:10px 20px" onclick="seedDemo()">🎯 Charger les données de démo (10 contacts)</button>
  </div>`:''}`;

}

async function normalizeSectors() {
  const r = await apiFetch('/api/admin/normalize-sectors', {method:'POST'});
  if(r?.ok) {
    toast(`✓ ${r.fixed} secteur(s) corrigé(s) sur ${r.total} contacts`, 'success');
    if(r.fixed > 0) {
      const contacts = await apiFetch('/api/contacts');
      if(contacts) { G.contacts = contacts; updSidebar(); buildSectorSidebar(); render(); }
    }
  } else {
    toast(r?.error || 'Erreur', 'error');
  }
}

async function seedDemo() {
  if(!confirm('Charger 10 contacts de démonstration ? Cette action ne peut pas être annulée si la base est non-vide.')) return;
  const r = await apiFetch('/api/seed/demo', {method:'POST'});
  if(r?.ok) {
    toast(r.message || '10 contacts créés !', 'success');
    const contacts = await apiFetch('/api/contacts');
    if(contacts) { G.contacts = contacts; updSidebar(); buildSectorSidebar(); render(); }
  } else {
    toast(r?.error || 'Erreur lors du seed', 'error');
  }
}

async function loadUsers() {
  const el = document.getElementById('users-list');
  if(!el) return;
  const users = await apiFetch('/auth/users');
  if(!users||users.error) { el.innerHTML='<div style="font-size:12px;color:var(--mu)">Accès admin requis</div>'; return; }
  el.innerHTML = users.map(u=>`<div class="user-row">
    <div class="user-av">${u.username.charAt(0).toUpperCase()}</div>
    <div class="user-info"><div class="un">${esc(u.username)}</div><div class="ue">${esc(u.email)} · Dernière connexion: ${u.last_login?u.last_login.substring(0,10):'jamais'}</div></div>
    <span class="role-badge ${u.role==='admin'?'role-admin':'role-user'}">${u.role}</span>
    <button onclick="deleteUser(${u.id})" style="background:none;border:none;cursor:pointer;color:var(--mu);padding:4px 8px;border-radius:4px;font-size:12px" title="Supprimer">🗑</button>
  </div>`).join('');
}

async function createUser() {
  const name = document.getElementById('nu-name').value.trim();
  const email = document.getElementById('nu-email').value.trim();
  const pw = document.getElementById('nu-pw').value;
  if(!name||!email||!pw) { toast('Remplissez tous les champs','error'); return; }
  const r = await apiFetch('/auth/users',{method:'POST',body:JSON.stringify({username:name,email,password:pw,role:'user'})});
  if(r?.ok) { toast('Utilisateur créé ✓','success'); loadUsers(); }
  else toast(r?.error||'Erreur','error');
}

async function deleteUser(id) {
  if(!confirm('Supprimer cet utilisateur ?')) return;
  const r = await apiFetch(`/auth/users/${id}`,{method:'DELETE'});
  if(r?.ok) { toast('Supprimé','success'); loadUsers(); }
  else toast(r?.error||'Erreur','error');
}

// ════════════════════════════════════════════════════════════════ CONTACT CRUD
let _formContactId = null;

function openContactForm(id=null) {
  _formContactId = id;
  const drawer = document.getElementById('form-drawer');
  const overlay = document.getElementById('form-overlay');
  const title = document.getElementById('fd-title');
  const delBtn = document.getElementById('fd-del-btn');

  if(id) {
    const c = G.contacts.find(x=>x.id===id);
    if(!c) return;
    title.textContent = `Modifier : ${c.company}`;
    delBtn.style.display = 'block';
    // Fill form
    document.getElementById('fd-company').value = c.company||'';
    document.getElementById('fd-sector').value = c.sector||'🔷 Autre';
    document.getElementById('fd-segment').value = c.segment||'Long Term';
    document.getElementById('fd-name').value = c.name||'';
    document.getElementById('fd-title').value = c.title||'';
    document.getElementById('fd-email').value = c.email||'';
    document.getElementById('fd-email-status').value = c.email_status||'unknown';
    document.getElementById('fd-phone').value = c.phone||'';
    document.getElementById('fd-linkedin').value = c.linkedin||'';
    document.getElementById('fd-dm').checked = !!c.decision_maker;
    document.getElementById('fd-stage').value = c.stage||'Prospect';
    document.getElementById('fd-priority').value = c.priority||'MEDIUM';
    const sc = document.getElementById('fd-score');
    sc.value = c.score||50;
    sc.style.setProperty('--pct',(c.score||50)+'%');
    document.getElementById('fd-score-val').textContent = c.score||50;
    document.getElementById('fd-poei').value = c.poei_offer||'';
    document.getElementById('fd-offers').value = c.active_offers||'';
    document.getElementById('fd-deal').value = c.deal_potential||'';
    document.getElementById('fd-action-type').value = c.action_type||'Email';
    document.getElementById('fd-action-date').value = c.next_action_date||'';
    document.getElementById('fd-action-txt').value = c.next_action||'';
    document.getElementById('fd-notes').value = c.notes||'';
  } else {
    title.textContent = 'Nouveau contact';
    delBtn.style.display = 'none';
    // Reset form
    ['fd-company','fd-name','fd-title','fd-email','fd-phone','fd-linkedin',
     'fd-poei','fd-offers','fd-deal','fd-action-txt','fd-notes'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('fd-sector').value = '🧹 Propreté/FM';
    document.getElementById('fd-segment').value = 'Long Term';
    document.getElementById('fd-stage').value = 'Prospect';
    document.getElementById('fd-priority').value = 'MEDIUM';
    document.getElementById('fd-email-status').value = 'unknown';
    document.getElementById('fd-action-type').value = 'Email';
    document.getElementById('fd-dm').checked = false;
    const sc = document.getElementById('fd-score');
    sc.value = 50; sc.style.setProperty('--pct','50%');
    document.getElementById('fd-score-val').textContent = 50;
    document.getElementById('fd-action-date').value = new Date(Date.now()+3*86400000).toISOString().split('T')[0];
  }

  overlay.classList.add('show');
  drawer.classList.add('open');
}

function closeContactForm(e) {
  if(e && e.target !== document.getElementById('form-overlay')) return;
  document.getElementById('form-overlay').classList.remove('show');
  document.getElementById('form-drawer').classList.remove('open');
}

function editCurrentContact() {
  if(G.selId) openContactForm(G.selId);
}

async function saveContact() {
  const btn = document.getElementById('fd-save-btn');
  btn.disabled = true; btn.textContent = '💾 Enregistrement…';
  const company = document.getElementById('fd-company').value.trim();
  if(!company) { toast('Le nom d\'entreprise est requis','error'); btn.disabled=false; btn.textContent='💾 Enregistrer'; return; }

  const data = {
    company, sector: document.getElementById('fd-sector').value,
    segment: document.getElementById('fd-segment').value,
    name: document.getElementById('fd-name').value.trim(),
    title: document.getElementById('fd-title').value.trim(),
    email: document.getElementById('fd-email').value.trim(),
    email_status: document.getElementById('fd-email-status').value,
    phone: document.getElementById('fd-phone').value.trim(),
    linkedin: document.getElementById('fd-linkedin').value.trim(),
    decision_maker: document.getElementById('fd-dm').checked,
    stage: document.getElementById('fd-stage').value,
    priority: document.getElementById('fd-priority').value,
    score: parseInt(document.getElementById('fd-score').value),
    poei_offer: document.getElementById('fd-poei').value.trim(),
    active_offers: document.getElementById('fd-offers').value.trim(),
    deal_potential: document.getElementById('fd-deal').value.trim(),
    action_type: document.getElementById('fd-action-type').value,
    next_action_date: document.getElementById('fd-action-date').value,
    next_action: document.getElementById('fd-action-txt').value.trim(),
    notes: document.getElementById('fd-notes').value.trim(),
    alert: _formContactId ? '' : '🔴 NOUVEAU',
  };

  try {
    let result;
    if(_formContactId) {
      result = await apiFetch(`/api/contacts/${_formContactId}`, {method:'PATCH', body:JSON.stringify(data)});
      const idx = G.contacts.findIndex(c=>c.id===_formContactId);
      if(idx>=0) Object.assign(G.contacts[idx], result);
      toast('Contact mis à jour ✓','success');
    } else {
      result = await apiFetch('/api/contacts', {method:'POST', body:JSON.stringify(data)});
      G.contacts.push(result);
      document.getElementById('bdg-total').textContent = G.contacts.length;
      toast('Contact créé ✓','success');
    }
    closeContactForm();
    updSidebar();
    render();
  } catch(e) {
    toast('Erreur lors de l\'enregistrement','error');
  }
  btn.disabled = false; btn.textContent = '💾 Enregistrer';
}

async function deleteCurrentContact() {
  if(!_formContactId) return;
  const c = G.contacts.find(x=>x.id===_formContactId);
  if(!confirm(`Supprimer ${c?.company} ? Cette action est irréversible.`)) return;
  const r = await apiFetch(`/api/contacts/${_formContactId}`,{method:'DELETE'});
  if(r?.ok) {
    G.contacts = G.contacts.filter(x=>x.id!==_formContactId);
    closeContactForm();
    if(G.selId===_formContactId) closeMo();
    updSidebar(); render();
    document.getElementById('bdg-total').textContent = G.contacts.length;
    toast('Contact supprimé','success');
  }
}

// ════════════════════════════════════════════════════════════════ BULK ACTIONS
function toggleBulkSelect(id, checked) {
  if(checked) G.bulkSel.add(id); else G.bulkSel.delete(id);
  updateBulkBar();
}
function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  const cnt = document.getElementById('bulk-count');
  if(G.bulkSel.size>0) {
    bar.style.display='block';
    cnt.textContent = `${G.bulkSel.size} contact${G.bulkSel.size>1?'s':''} sélectionné${G.bulkSel.size>1?'s':''}`;
  } else {
    bar.style.display='none';
  }
  document.querySelectorAll('.tbl-cb').forEach(cb=>{
    cb.checked = G.bulkSel.has(parseInt(cb.dataset.id));
  });
}
function clearBulk() { G.bulkSel.clear(); updateBulkBar(); render(); }
async function bulkAction(field, value) {
  if(!value||!G.bulkSel.size) return;
  const ids = [...G.bulkSel];
  const r = await apiFetch('/api/contacts/bulk',{method:'POST',body:JSON.stringify({ids,updates:{[field]:value}})});
  if(r?.ok) {
    ids.forEach(id=>{
      const c=G.contacts.find(x=>x.id===id);
      if(c) c[field]=value;
    });
    toast(`${ids.length} contacts mis à jour ✓`,'success');
    clearBulk(); render();
  }
}
async function bulkDelete() {
  if(!G.bulkSel.size) return;
  if(!confirm(`Supprimer ${G.bulkSel.size} contacts ? Cette action est irréversible.`)) return;
  const ids = [...G.bulkSel];
  for(const id of ids) {
    await apiFetch(`/api/contacts/${id}`,{method:'DELETE'});
    G.contacts = G.contacts.filter(c=>c.id!==id);
  }
  clearBulk(); updSidebar(); render();
  document.getElementById('bdg-total').textContent = G.contacts.length;
  toast(`${ids.length} contacts supprimés`,'success');
}

// ════════════════════════════════════════════════════════════════ CONTACTS TABLE (grouped by company)
function rContactsTable(list) {
  if(!list.length) return '<div class="empty"><div class="ei">🔍</div><h3>Aucun contact trouvé</h3><p>Modifiez votre recherche ou vos filtres.</p></div>';
  const ar = G.sd===1?' ↑':' ↓';

  // Group by company name
  const groups = {};
  list.forEach(c => {
    const key = (c.company||'').trim();
    if(!groups[key]) groups[key] = [];
    groups[key].push(c);
  });

  // Sort groups: best score of group descending
  const sorted = Object.entries(groups).sort((a,b) => {
    const sa = Math.max(...a[1].map(x=>x.score||0));
    const sb = Math.max(...b[1].map(x=>x.score||0));
    return sb - sa;
  });

  let h = `<div class="tbl-wrap"><table><thead><tr>
    <th style="width:30px"><input type="checkbox" onchange="(()=>{const chk=this.checked;list.forEach(c=>{if(chk)G.bulkSel.add(c.id);else G.bulkSel.delete(c.id)});updateBulkBar()})()" style="cursor:pointer;accent-color:var(--ac)"></th>
    <th onclick="sortBy('company')">Entreprise${G.sf==='company'?ar:''}</th>
    <th onclick="sortBy('name')">Contacts${G.sf==='name'?ar:''}</th>
    <th onclick="sortBy('score')">Score${G.sf==='score'?ar:''}</th>
    <th>Segment</th>
    <th onclick="sortBy('stage')">Stade</th>
    <th>Prochaine action</th>
    <th>Actions</th>
  </tr></thead><tbody>`;

  sorted.forEach(([company, contacts]) => {
    const col = secColor(contacts[0].sector||'');
    const best = contacts.reduce((a,b) => (a.score||0)>=(b.score||0)?a:b);
    const multi = contacts.length > 1;
    const gid = 'grp_' + best.id;
    const allSel = contacts.every(c => G.bulkSel.has(c.id));

    if(multi) {
      // ── COMPANY GROUP ROW (header) ──────────────────────────────
      const stages = [...new Set(contacts.map(c=>SL[c.stage]||c.stage||'Prospect'))].join(', ');
      const bestScore = Math.max(...contacts.map(c=>c.score||0));
      const dmContacts = contacts.filter(c=>c.decision_maker);
      h += `<tr class="company-group-row" onclick="toggleGroup('${gid}')" style="cursor:pointer;background:#1a1a1a;border-left:3px solid ${col}">
        <td onclick="event.stopPropagation()">
          <input type="checkbox" ${allSel?'checked':''} onchange="(()=>{contacts${best.id}.forEach(id=>{if(this.checked)G.bulkSel.add(id);else G.bulkSel.delete(id)});updateBulkBar()})()" style="cursor:pointer;accent-color:var(--ac)">
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="grp-chevron" id="chv_${gid}" style="color:#666;font-size:11px;transition:.15s;display:inline-block">▶</span>
            <div style="width:3px;height:34px;background:${col};border-radius:2px;flex:0 0 3px"></div>
            <div>
              <div style="font-weight:900;font-size:13px;color:#fff">${esc(company)}</div>
              <div style="font-size:10px;color:#666;margin-top:1px">${esc(contacts[0].sector||'')} · ${contacts.length} contacts</div>
            </div>
            <span style="background:${col}22;color:${col};border:1px solid ${col}44;border-radius:20px;padding:1px 8px;font-size:10px;font-weight:800;margin-left:4px">${contacts.length} contacts</span>
          </div>
        </td>
        <td style="font-size:11px;color:#888">
          ${dmContacts.length ? `<span style="color:#F5A623;font-size:10px;font-weight:700">★ ${dmContacts.length} décideur${dmContacts.length>1?'s':''}</span><br>` : ''}
          ${contacts.slice(0,2).map(c=>`<span style="color:#aaa">${esc(c.name||'À identifier')}</span>`).join(', ')}${contacts.length>2?` <span style="color:#555">+${contacts.length-2}</span>`:''}
        </td>
        <td>${scoreTag(bestScore)}</td>
        <td>${segTag(best.segment)}</td>
        <td style="font-size:11px;color:#777">${stages}</td>
        <td style="font-size:11px;color:#777">${esc((best.next_action||'').substring(0,40))}</td>
        <td onclick="event.stopPropagation()" style="white-space:nowrap">
          <button onclick="openEmailModal(${best.id})" style="background:none;border:none;cursor:pointer;color:#1A73E8;padding:3px 5px;font-size:13px" title="Email">📧</button>
          <button onclick="openContactForm(${best.id})" style="background:none;border:none;cursor:pointer;color:#888;padding:3px 5px;font-size:13px" title="Modifier">✏️</button>
        </td>
      </tr>`;

      // ── INDIVIDUAL CONTACT ROWS (hidden by default) ─────────────
      h += `<tr id="${gid}" style="display:none"><td colspan="8" style="padding:0;background:#111">
        <table style="width:100%;border-collapse:collapse">`;
      contacts.forEach(c => {
        const sel = G.bulkSel.has(c.id);
        h += `<tr onclick="openC(${c.id})" ${sel?'style="background:#E8500A11"':''} style="border-bottom:1px solid #1e1e1e;cursor:pointer" onmouseover="this.style.background='#1e1e1e'" onmouseout="this.style.background='${sel?'#E8500A11':'transparent'}'">
          <td style="width:30px;padding:8px 10px" onclick="event.stopPropagation()">
            <input type="checkbox" class="tbl-cb" data-id="${c.id}" ${sel?'checked':''} onchange="toggleBulkSelect(${c.id},this.checked)" style="cursor:pointer;accent-color:var(--ac)">
          </td>
          <td style="padding:8px 10px 8px 48px;width:220px">
            <div style="display:flex;align-items:center;gap:6px">
              <div style="width:2px;height:24px;background:${col};border-radius:2px;opacity:.5"></div>
              <div style="font-size:11.5px;color:#bbb;font-weight:600">↳ ${esc(c.name||'À identifier')}</div>
            </div>
            <div style="font-size:10px;color:#555;margin-left:14px">${esc((c.title||'').substring(0,40))}</div>
          </td>
          <td style="padding:8px 10px">
            ${c.decision_maker?'<span style="color:#F5A623;font-size:10px;font-weight:800">★ Décideur</span><br>':''}
            ${c.email?`<span style="font-size:10.5px;color:#888">${esc(c.email)}</span>`:'<span style="font-size:10px;color:#444">Email non renseigné</span>'}
          </td>
          <td style="padding:8px 10px">${scoreTag(c.score)}</td>
          <td style="padding:8px 10px">${segTag(c.segment)}</td>
          <td style="padding:8px 10px;font-size:11px;color:#777">${SL[c.stage]||c.stage||'Prospect'}</td>
          <td style="padding:8px 10px">${atTag(c.action_type)}<div style="font-size:10px;color:#555;margin-top:1px">${esc((c.next_action||'').substring(0,40))}</div></td>
          <td style="padding:8px 10px;white-space:nowrap" onclick="event.stopPropagation()">
            ${quickBtns(c)}
            <button onclick="openContactForm(${c.id})" style="background:none;border:none;cursor:pointer;color:#666;padding:2px 4px;font-size:12px" title="Modifier">✏️</button>
            <button onclick="openEmailModal(${c.id})" style="background:none;border:none;cursor:pointer;color:#1A73E8;padding:2px 4px;font-size:12px" title="Email">📧</button>
          </td>
        </tr>`;
      });
      h += `</table></td></tr>`;

      // Store IDs for bulk checkbox
      h += `<script>var contacts${best.id}=[${contacts.map(c=>c.id).join(',')}];</script>`;

    } else {
      // ── SINGLE CONTACT ROW (normal) ─────────────────────────────
      const c = contacts[0];
      const sel = G.bulkSel.has(c.id);
      h += `<tr onclick="openC(${c.id})" ${sel?'class="selected"':''}>
        <td onclick="event.stopPropagation()"><input type="checkbox" class="tbl-cb" data-id="${c.id}" ${sel?'checked':''} onchange="toggleBulkSelect(${c.id},this.checked)" style="cursor:pointer;accent-color:var(--ac)"></td>
        <td><div style="display:flex;align-items:center;gap:6px"><div style="width:3px;height:30px;background:${col};border-radius:2px;flex:0 0 3px"></div><div><div style="font-weight:800;font-size:12.5px">${esc(c.company)}</div><div style="font-size:10.5px;color:var(--mu)">${esc(c.sector||'')}</div></div></div></td>
        <td>${c.decision_maker?'<span class="dm-dot"></span>':''}${esc(c.name)}<div style="font-size:10.5px;color:var(--mu)">${esc((c.title||'').substring(0,35))}${(c.title||'').length>35?'…':''}</div></td>
        <td>${scoreTag(c.score)}</td>
        <td>${segTag(c.segment)}</td>
        <td style="font-size:11.5px;color:var(--mu)">${SL[c.stage]||c.stage||'Prospect'}</td>
        <td>${atTag(c.action_type)}<div style="font-size:10.5px;color:var(--mu);margin-top:2px">${esc((c.next_action||'').substring(0,42))}${(c.next_action||'').length>42?'…':''}</div></td>
        <td onclick="event.stopPropagation()" style="white-space:nowrap">
          ${quickBtns(c)}
          <button onclick="openContactForm(${c.id})" style="background:none;border:none;cursor:pointer;color:var(--mu);padding:3px 5px;border-radius:4px;font-size:13px" title="Modifier">✏️</button>
          <button onclick="openEmailModal(${c.id})" style="background:none;border:none;cursor:pointer;color:#1A73E8;padding:3px 5px;border-radius:4px;font-size:13px" title="Email">📧</button>
        </td>
      </tr>`;
    }
  });

  const total = list.length;
  const companies_count = sorted.length;
  h += `</tbody></table>
    <div style="padding:10px 16px;font-size:11px;color:#555;border-top:1px solid #eee">
      ${companies_count} entreprise${companies_count>1?'s':''} · ${total} contact${total>1?'s':''}
      ${sorted.filter(([,c])=>c.length>1).length ? ` · <span style="color:#888">${sorted.filter(([,c])=>c.length>1).length} avec plusieurs contacts <span style="color:#666">(cliquez ▶ pour déplie)</span></span>` : ''}
    </div>
  </div>`;
  return h;
}

function toggleGroup(gid) {
  const row = document.getElementById(gid);
  const chv = document.getElementById('chv_'+gid);
  if(!row) return;
  const open = row.style.display !== 'none';
  row.style.display = open ? 'none' : 'table-row';
  if(chv) { chv.style.transform = open ? '' : 'rotate(90deg)'; chv.style.color = open ? '#666' : 'var(--ac)'; }
}

// ════════════════════════════════════════════════════════════════ EXPORT
function exportCSV(filter='') {
  let url = '/api/contacts/export';
  window.open(url,'_blank');
}

// ════════════════════════════════════════════════════════════════ KEYBOARD
document.addEventListener('keydown', e => {
  if(e.key==='Escape') {
    document.getElementById('doverlay').classList.remove('show');
    document.getElementById('overlay').classList.remove('show');
    document.getElementById('form-overlay').classList.remove('show');
    document.getElementById('form-drawer').classList.remove('open');
    document.getElementById('email-overlay').style.display='none';
    G.selId=null;G_emailContactId=null;
  }
  if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) {
    e.preventDefault();
    document.getElementById('search').focus();
  }
  if(e.key==='n'&&e.metaKey) { e.preventDefault(); openContactForm(); }
});

// Load users when settings view opens
const _origSetView = setView;
function setView(v, sector) {
  G.view = v;
  if(sector) G.sector = sector;
  document.querySelectorAll('.sb-item').forEach(el => el.classList.toggle('active', el.dataset.v===v));
  document.getElementById('view-title').textContent = v==='sector' ? G.sector : (VIEW_TITLES[v]||v);
  render();
  if(v==='settings') setTimeout(loadUsers, 50);
}

// ════════════════════════════════════════════════════════════════ EMAIL SUIVI

let G_emailLogs = [];
let G_emailStats = {};
let G_emailContactId = null;

async function loadEmailSuivi() {
  const data = await apiFetch('/api/emails/suivi');
  if(!data) return;
  G_emailLogs = data.logs || [];
  G_emailStats = data.stats || {};
  // Mettre à jour badge sidebar
  const due = G_emailStats.relances_dues || 0;
  const bdg = document.getElementById('bdg-relances');
  if(bdg) bdg.textContent = due > 0 ? due : (G_emailStats.total || 0);
  document.getElementById('content').innerHTML = rEmailSuivi();
}

function rEmailSuivi() {
  const s = G_emailStats;
  const logs = G_emailLogs;
  const td = today();

  // Séparer en groupes
  const overdue  = logs.filter(l => l.overdue);
  const dueToday = logs.filter(l => l.due_today && !l.overdue);
  const upcoming = logs.filter(l => l.status==='En attente' && l.relance_date > td);
  const done     = logs.filter(l => l.status==='Répondu' || l.status==='Sans suite');
  const relanced = logs.filter(l => l.status==='Relancé');

  let h = `<div class="page-wrap">`;

  // KPI Cards
  h += `<div class="growth-grid" style="margin-bottom:24px">
    <div class="g-kpi" style="border-left:4px solid #E8500A">
      <div class="kpi-val" style="color:#E8500A">${overdue.length + dueToday.length}</div>
      <div class="kpi-lbl">Relances urgentes</div>
      <div class="kpi-sub">${overdue.length} en retard · ${dueToday.length} aujourd'hui</div>
    </div>
    <div class="g-kpi" style="border-left:4px solid #1A73E8">
      <div class="kpi-val" style="color:#1A73E8">${s.total||0}</div>
      <div class="kpi-lbl">Emails envoyés</div>
      <div class="kpi-sub">Total suivi</div>
    </div>
    <div class="g-kpi" style="border-left:4px solid #0F9D58">
      <div class="kpi-val" style="color:#0F9D58">${s.repondus||0}</div>
      <div class="kpi-lbl">Réponses reçues</div>
      <div class="kpi-sub">Taux : ${s.taux_reponse||0}%</div>
    </div>
    <div class="g-kpi" style="border-left:4px solid #7B2FBE">
      <div class="kpi-val" style="color:#7B2FBE">${upcoming.length}</div>
      <div class="kpi-lbl">Relances à venir</div>
      <div class="kpi-sub">En attente de réponse</div>
    </div>
  </div>`;

  // Bouton enregistrer un email + filtre statut
  h += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:12px;flex-wrap:wrap">
    <div style="display:flex;gap:8px;align-items:center">
      <button class="btn btn-g" onclick="openEmailModalFromList()">📧 Enregistrer un email</button>
      <span style="color:#555;font-size:12px">${s.total||0} emails tracés</span>
    </div>
    <div style="display:flex;gap:6px">
      <button class="tb-btn-s" onclick="filterEmailSuivi('all')" id="ef-all" style="background:#333">Tous (${logs.length})</button>
      <button class="tb-btn-s" onclick="filterEmailSuivi('urgent')" id="ef-urgent" style="background:#E8500A22;color:#E8500A;border-color:#E8500A44">⚠️ Urgent (${overdue.length + dueToday.length})</button>
      <button class="tb-btn-s" onclick="filterEmailSuivi('attente')" id="ef-attente">En attente (${s.en_attente||0})</button>
      <button class="tb-btn-s" onclick="filterEmailSuivi('repondu')" id="ef-repondu" style="color:#0F9D58">✓ Répondus (${s.repondus||0})</button>
    </div>
  </div>`;

  // Section relances urgentes
  if(overdue.length > 0) {
    h += `<div class="card" style="border-left:4px solid #E8500A;margin-bottom:16px">
      <h3 style="color:#E8500A;margin:0 0 12px">🔴 Relances EN RETARD (${overdue.length})</h3>`;
    overdue.forEach(l => { h += emailRow(l, 'overdue'); });
    h += `</div>`;
  }

  // Section aujourd'hui
  if(dueToday.length > 0) {
    h += `<div class="card" style="border-left:4px solid #F5A623;margin-bottom:16px">
      <h3 style="color:#F5A623;margin:0 0 12px">🟡 À relancer AUJOURD'HUI (${dueToday.length})</h3>`;
    dueToday.forEach(l => { h += emailRow(l, 'today'); });
    h += `</div>`;
  }

  // Tableau complet
  h += `<div class="card" id="email-table-wrap">
    <h3 style="margin:0 0 16px;font-size:14px;color:#aaa">Tous les emails suivis</h3>
    <table class="data-tbl" style="width:100%">
      <thead><tr>
        <th>Entreprise</th><th>Objet</th><th>Envoyé le</th>
        <th>Relance</th><th>Statut</th><th>Actions</th>
      </tr></thead>
      <tbody id="email-tbody">`;

  if(logs.length === 0) {
    h += `<tr><td colspan="6" style="text-align:center;color:#555;padding:32px">
      Aucun email enregistré — cliquez sur "📧 Enregistrer un email" pour commencer
    </td></tr>`;
  } else {
    logs.forEach(l => { h += emailTr(l); });
  }

  h += `</tbody></table></div></div>`;
  return h;
}

function emailRow(l, type) {
  const bgMap = { overdue:'#E8500A11', today:'#F5A62311' };
  const dateStr = l.date ? l.date.split(' ')[0] : '—';
  const relStr = l.relance_date || '—';
  return `<div style="background:${bgMap[type]||'#fff1'};border-radius:8px;padding:12px 16px;margin-bottom:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    <div style="flex:1;min-width:180px">
      <div style="font-weight:700;font-size:13px">${esc(l.company)}</div>
      <div style="color:#888;font-size:11px">${esc(l.contact_name||'')} · ${esc(l.sector||'')}</div>
    </div>
    <div style="flex:2;min-width:200px">
      <div style="font-size:12.5px;color:#ddd">${esc(l.subject||'(sans objet)')}</div>
      <div style="color:#666;font-size:11px;margin-top:2px">${esc(l.note||'').substring(0,80)}</div>
    </div>
    <div style="flex:0 0 90px;text-align:center">
      <div style="font-size:11px;color:#777">Envoyé</div>
      <div style="font-size:12px;font-weight:700">${dateStr}</div>
    </div>
    <div style="flex:0 0 90px;text-align:center">
      <div style="font-size:11px;color:#777">Relance</div>
      <div style="font-size:12px;font-weight:700;color:${type==='overdue'?'#E8500A':type==='today'?'#F5A623':'#ddd'}">${relStr}</div>
    </div>
    <div style="display:flex;gap:6px;flex:0 0 auto">
      ${statusBadge(l.status)}
      <button class="tb-btn-s" style="background:#1A73E822;color:#1A73E8;border-color:#1A73E844" onclick="markEmailStatus(${l.id},'Relancé')">🔄 Relancé</button>
      <button class="tb-btn-s" style="background:#0F9D5822;color:#0F9D58;border-color:#0F9D5844" onclick="markEmailStatus(${l.id},'Répondu')">✓ Répondu</button>
    </div>
  </div>`;
}

function emailTr(l) {
  const dateStr = l.date ? l.date.split(' ')[0] : '—';
  const relStr = l.relance_date || '—';
  const overdueClass = l.overdue ? 'color:#E8500A;font-weight:700' : l.due_today ? 'color:#F5A623;font-weight:700' : '';
  return `<tr>
    <td><div style="font-weight:700;font-size:12.5px">${esc(l.company)}</div><div style="color:#666;font-size:11px">${esc(l.contact_name||'')}</div></td>
    <td style="font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(l.subject||'')}">${esc(l.subject||'(sans objet)')}</td>
    <td style="font-size:12px;white-space:nowrap">${dateStr}</td>
    <td style="font-size:12px;white-space:nowrap;${overdueClass}">${relStr}${l.overdue?' ⚠️':l.due_today?' 📅':''}</td>
    <td>${statusBadge(l.status)}</td>
    <td style="white-space:nowrap">
      <button class="tb-btn-s" style="font-size:10px;padding:2px 6px" onclick="markEmailStatus(${l.id},'Relancé')">🔄</button>
      <button class="tb-btn-s" style="font-size:10px;padding:2px 6px;color:#0F9D58" onclick="markEmailStatus(${l.id},'Répondu')">✓</button>
      <button class="tb-btn-s" style="font-size:10px;padding:2px 6px;color:#666" onclick="markEmailStatus(${l.id},'Sans suite')">✕</button>
    </td>
  </tr>`;
}

function statusBadge(status) {
  const map = {
    'En attente': 'background:#1A73E822;color:#1A73E8;border:1px solid #1A73E844',
    'Relancé':    'background:#F5A62322;color:#F5A623;border:1px solid #F5A62344',
    'Répondu':    'background:#0F9D5822;color:#0F9D58;border:1px solid #0F9D5844',
    'Sans suite': 'background:#78909C22;color:#78909C;border:1px solid #78909C44',
  };
  const s = status || 'En attente';
  return `<span style="font-size:10px;padding:2px 8px;border-radius:20px;${map[s]||''};white-space:nowrap">${s}</span>`;
}

function filterEmailSuivi(type) {
  const td = today();
  let filtered;
  if(type==='urgent')  filtered = G_emailLogs.filter(l => l.overdue || l.due_today);
  else if(type==='attente') filtered = G_emailLogs.filter(l => l.status==='En attente');
  else if(type==='repondu') filtered = G_emailLogs.filter(l => l.status==='Répondu');
  else filtered = G_emailLogs;
  const tbody = document.getElementById('email-tbody');
  if(!tbody) return;
  tbody.innerHTML = filtered.length
    ? filtered.map(l => emailTr(l)).join('')
    : `<tr><td colspan="6" style="text-align:center;color:#555;padding:20px">Aucun email dans cette catégorie</td></tr>`;
}

// Ouvrir modal depuis la liste contacts (avec contact sélectionné)
function openEmailModal(cid) {
  const c = G.contacts.find(x => x.id === cid);
  if(!c) return;
  G_emailContactId = cid;
  document.getElementById('em-company').textContent = c.company;
  document.getElementById('em-contact').textContent = c.name || 'À identifier';
  const t = today();
  document.getElementById('em-date').value = t;
  // Relance J+7 par défaut
  const rel = new Date(); rel.setDate(rel.getDate()+7);
  document.getElementById('em-relance').value = rel.toISOString().split('T')[0];
  document.getElementById('em-subject').value = '';
  document.getElementById('em-note').value = '';
  document.getElementById('email-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('em-subject').focus(), 100);
}

// Ouvrir modal depuis la vue suivi (choisir contact)
function openEmailModalFromList() {
  // On prend le premier Strategic non contacté
  const c = G.contacts.find(x => x.segment==='Strategic' && x.stage==='Prospect');
  if(c) openEmailModal(c.id);
  else if(G.contacts.length > 0) openEmailModal(G.contacts[0].id);
}

function closeEmailModal(e) {
  if(e && e.target !== document.getElementById('email-overlay')) return;
  document.getElementById('email-overlay').style.display = 'none';
  G_emailContactId = null;
}

async function saveEmailLog() {
  if(!G_emailContactId) return;
  const subject = document.getElementById('em-subject').value.trim();
  if(!subject) { toast('Veuillez saisir l\'objet de l\'email','error'); return; }
  const date = document.getElementById('em-date').value;
  const relance = document.getElementById('em-relance').value;
  const note = document.getElementById('em-note').value.trim();
  const dateStr = date ? new Date(date).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');

  const res = await apiFetch(`/api/contacts/${G_emailContactId}/log`, {
    method:'POST',
    body: JSON.stringify({
      type: 'Email',
      date: dateStr,
      subject,
      relance_date: relance,
      note,
      result: `Email envoyé: ${subject}`,
      status: 'En attente'
    })
  });
  if(res) {
    closeEmailModal();
    toast(`📧 Email enregistré — relance le ${relance || 'non définie'}`, 'success');
    // Mettre à jour next_action_date si relance définie
    if(relance) {
      await apiPatch(G_emailContactId, { action_type:'Email', next_action_date: relance, next_action: `Relance: ${subject}` });
      G.contacts = G.contacts.map(c => c.id===G_emailContactId ? {...c, next_action_date:relance, action_type:'Email'} : c);
    }
    // Si on est dans la vue suivi, recharger
    if(G.view === 'email-suivi') loadEmailSuivi();
  }
}

async function markEmailStatus(logId, newStatus) {
  const res = await apiFetch(`/api/emails/log/${logId}`, {
    method:'PATCH',
    body: JSON.stringify({ status: newStatus })
  });
  if(res) {
    // Mettre à jour localement
    const idx = G_emailLogs.findIndex(l => l.id === logId);
    if(idx !== -1) {
      G_emailLogs[idx].status = newStatus;
      G_emailLogs[idx].due_today = false;
      G_emailLogs[idx].overdue = false;
    }
    toast(`Statut mis à jour : ${newStatus}`, 'success');
    if(G.view === 'email-suivi') document.getElementById('content').innerHTML = rEmailSuivi();
  }
}

// ════════════════════════════════════════════════════════════════ TASKS VIEW
let G_tasks = [];
let _taskEditId = null;

async function loadTasks() {
  const [tasks, stats] = await Promise.all([
    apiFetch('/api/tasks'),
    apiFetch('/api/tasks/stats')
  ]);
  G_tasks = tasks || [];
  const el = document.getElementById('content');
  if(!el) return;

  const td = today();
  const open = G_tasks.filter(t => !t.done);
  const overdue = open.filter(t => t.due_date && t.due_date < td);
  const dueToday = open.filter(t => t.due_date === td);
  const upcoming = open.filter(t => !t.due_date || t.due_date > td);
  const done = G_tasks.filter(t => t.done).slice(0, 20);

  const priorityOrder = {HIGH:0, MEDIUM:1, LOW:2};
  const sort = arr => [...arr].sort((a,b) => (priorityOrder[a.priority]||1)-(priorityOrder[b.priority]||1));

  let h = `<div class="tasks-header">
    <div class="task-kpi"><div class="tk-v" style="color:var(--r)">${overdue.length}</div><div class="tk-l">En retard</div></div>
    <div class="task-kpi"><div class="tk-v" style="color:var(--y)">${dueToday.length}</div><div class="tk-l">Pour aujourd'hui</div></div>
    <div class="task-kpi"><div class="tk-v">${upcoming.length}</div><div class="tk-l">À venir</div></div>
    <div class="task-kpi"><div class="tk-v" style="color:var(--g)">${done.length}</div><div class="tk-l">Complétées (récent)</div></div>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <h3 style="font-size:14px;font-weight:800">Toutes les tâches</h3>
    <button class="task-add-btn" onclick="openTaskForm()">➕ Nouvelle tâche</button>
  </div>`;

  function rGroup(label, arr, color='var(--mu)') {
    if(!arr.length) return '';
    let g = `<div class="task-group"><div class="task-group-label"><span style="color:${color}">${label}</span><span>${arr.length}</span></div>`;
    sort(arr).forEach(t => {
      const dueCls = t.due_date < td ? 'overdue' : t.due_date === td ? 'today' : '';
      const dueLabel = t.due_date ? (t.due_date < td ? `⚠ ${t.due_date}` : t.due_date) : '';
      const priClr = {HIGH:'var(--r)',MEDIUM:'var(--y)',LOW:'var(--g)'}[t.priority]||'var(--mu)';
      const contactLink = t.contact_company ? `<span class="task-contact" onclick="event.stopPropagation();openC(${t.contact_id})">${esc(t.contact_company)}</span>` : '';
      g += `<div class="task-item${t.done?' done':''}">
        <div class="task-check${t.done?' chk':''}" onclick="toggleTask(${t.id})"></div>
        <div class="task-body">
          <div class="task-title">${esc(t.title)}</div>
          <div class="task-meta">
            <span class="tag" style="background:${priClr}22;color:${priClr};font-size:9px;padding:1px 6px;border-radius:8px">${t.priority}</span>
            <span style="font-size:11px;color:var(--mu)">${esc(t.type)}</span>
            ${contactLink}
            ${dueLabel ? `<span class="task-due ${dueCls}">${dueLabel}</span>` : ''}
            ${t.notes ? `<span style="font-size:11px;color:var(--mu);font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px">${esc(t.notes)}</span>` : ''}
          </div>
        </div>
        <div class="task-actions">
          <button class="task-btn" onclick="openTaskForm(${t.id})">✏</button>
          <button class="task-btn del" onclick="deleteTask(${t.id})">🗑</button>
        </div>
      </div>`;
    });
    return g + '</div>';
  }

  h += rGroup('🔴 En retard', overdue, 'var(--r)');
  h += rGroup('🟡 Aujourd\'hui', dueToday, 'var(--y)');
  h += rGroup('📅 À venir', upcoming, 'var(--b)');
  h += rGroup('✅ Complétées', done, 'var(--g)');
  if(!G_tasks.length) h += `<div class="empty"><div class="ei">✅</div><h3>Aucune tâche</h3><p>Créez votre première tâche pour organiser vos actions.</p></div>`;
  el.innerHTML = h;
}

async function toggleTask(id) {
  const task = G_tasks.find(t => t.id === id);
  if(!task) return;
  const r = await apiFetch(`/api/tasks/${id}`, {method:'PATCH', body:JSON.stringify({done: !task.done})});
  if(r) { toast(r.done ? 'Tâche complétée ✓' : 'Tâche réouverte', 'success'); loadTasks(); updateNotifBadge(); }
}

async function deleteTask(id) {
  if(!confirm('Supprimer cette tâche ?')) return;
  const r = await apiFetch(`/api/tasks/${id}`, {method:'DELETE'});
  if(r?.ok) { toast('Supprimé', 'success'); loadTasks(); updateNotifBadge(); }
}

function openTaskForm(id=null) {
  _taskEditId = id;
  const overlay = document.getElementById('task-overlay');
  const title = document.getElementById('task-form-title');
  const tfDate = document.getElementById('tf-date');
  // Populate contact dropdown
  const sel = document.getElementById('tf-contact');
  sel.innerHTML = '<option value="">— Aucun —</option>' +
    [...G.contacts].sort((a,b)=>a.company.localeCompare(b.company)).map(c =>
      `<option value="${c.id}">${esc(c.company)}${c.name?' — '+esc(c.name):''}</option>`
    ).join('');
  if(id) {
    const t = G_tasks.find(x => x.id === id);
    if(!t) return;
    title.textContent = 'Modifier la tâche';
    document.getElementById('tf-title').value = t.title;
    document.getElementById('tf-type').value = t.type;
    document.getElementById('tf-priority').value = t.priority;
    document.getElementById('tf-date').value = t.due_date;
    document.getElementById('tf-contact').value = t.contact_id || '';
    document.getElementById('tf-notes').value = t.notes;
    document.getElementById('tf-id').value = t.id;
  } else {
    title.textContent = 'Nouvelle tâche';
    document.getElementById('tf-title').value = '';
    document.getElementById('tf-type').value = '✅ Tâche';
    document.getElementById('tf-priority').value = 'MEDIUM';
    tfDate.value = today();
    document.getElementById('tf-contact').value = '';
    document.getElementById('tf-notes').value = '';
    document.getElementById('tf-id').value = '';
  }
  overlay.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:900;align-items:center;justify-content:center';
}

function closeTaskForm(e) {
  if(e && e.target !== document.getElementById('task-overlay')) return;
  document.getElementById('task-overlay').style.display = 'none';
}

async function saveTask() {
  const title = document.getElementById('tf-title').value.trim();
  if(!title) { toast('Titre obligatoire','error'); return; }
  const id = document.getElementById('tf-id').value;
  const payload = {
    title, type: document.getElementById('tf-type').value,
    priority: document.getElementById('tf-priority').value,
    due_date: document.getElementById('tf-date').value,
    contact_id: document.getElementById('tf-contact').value || null,
    notes: document.getElementById('tf-notes').value,
  };
  const r = id
    ? await apiFetch(`/api/tasks/${id}`, {method:'PATCH', body:JSON.stringify(payload)})
    : await apiFetch('/api/tasks', {method:'POST', body:JSON.stringify(payload)});
  if(r?.id || r?.title) {
    toast(id ? 'Tâche mise à jour ✓' : 'Tâche créée ✓', 'success');
    document.getElementById('task-overlay').style.display = 'none';
    if(G.view === 'tasks') loadTasks();
    updateNotifBadge();
  }
}


// ════════════════════════════════════════════════════════════════ NOTIFICATIONS BELL
async function updateNotifBadge() {
  const data = await apiFetch('/api/notifications');
  if(!data) return;
  const badge = document.getElementById('notif-count');
  const taskBdg = document.getElementById('bdg-tasks');
  if(badge) {
    badge.textContent = data.total;
    badge.style.display = data.total > 0 ? 'block' : 'none';
  }
  if(taskBdg) taskBdg.textContent = (data.overdue_tasks + data.today_tasks) || '—';
}


// ════════════════════════════════════════════════════════════════ CHART.JS CHARTS
let _growthCharts = {};

function destroyCharts(ids) {
  ids.forEach(id => {
    if(_growthCharts[id]) { _growthCharts[id].destroy(); delete _growthCharts[id]; }
  });
}

function initGrowthCharts(data) {
  if(!data || typeof Chart === 'undefined') return;
  destroyCharts(['ch-pipeline','ch-activity','ch-sector','ch-trend']);

  const STAGE_COLORS = {
    Prospect:'#9B9A97',Contacted:'#1A73E8',Meeting:'#7B2FBE',
    Proposal:'#F5A623',Negotiation:'#E8500A',Signed:'#0F9D58',Deployed:'#0F9D58'
  };

  // Pipeline by stage (bar)
  const pStages = Object.keys(data.by_stage || {});
  const pVals = pStages.map(s => Math.round((data.by_stage[s]||0)/1000));
  const ctx1 = document.getElementById('ch-pipeline');
  if(ctx1) {
    _growthCharts['ch-pipeline'] = new Chart(ctx1, {
      type:'bar',
      data:{labels:pStages.map(s=>s==='Signed'?'Signé':s==='Meeting'?'RDV':s==='Proposal'?'Proposition':s==='Negotiation'?'Négo':s),
            datasets:[{data:pVals,backgroundColor:pStages.map(s=>STAGE_COLORS[s]||'#ccc'),borderRadius:6}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
        scales:{y:{ticks:{callback:v=>v+'k€'},grid:{color:'#f0f0ef'}},x:{grid:{display:false}}}}
    });
  }

  // Activity by type (doughnut)
  const contacts = G.contacts;
  const actMap = {};
  contacts.forEach(c => { actMap[c.action_type||'Autre'] = (actMap[c.action_type||'Autre']||0)+1; });
  const aLabels = Object.keys(actMap);
  const aVals = aLabels.map(k=>actMap[k]);
  const ACT_COLORS = ['#E8500A','#1A73E8','#0F9D58','#7B2FBE','#F5A623','#E91E8C','#00ACC1'];
  const ctx2 = document.getElementById('ch-activity');
  if(ctx2 && aLabels.length) {
    _growthCharts['ch-activity'] = new Chart(ctx2, {
      type:'doughnut',
      data:{labels:aLabels,datasets:[{data:aVals,backgroundColor:ACT_COLORS,borderWidth:2,borderColor:'#fff'}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{size:11},boxWidth:12}}},cutout:'65%'}
    });
  }

  // Revenue by sector (horizontal bar)
  const secData = data.by_sector || {};
  const sLabels = Object.keys(secData).slice(0,6);
  const sVals = sLabels.map(k=>Math.round(secData[k]/1000));
  const ctx3 = document.getElementById('ch-sector');
  if(ctx3 && sLabels.length) {
    _growthCharts['ch-sector'] = new Chart(ctx3, {
      type:'bar',
      data:{labels:sLabels,datasets:[{data:sVals,backgroundColor:'#E8500A',borderRadius:6}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
        scales:{x:{ticks:{callback:v=>v+'k€'},grid:{color:'#f0f0ef'}},y:{grid:{display:false}}}}
    });
  }

  // Activity trend (line chart, last 30 days)
  const trend = data.activity_trend || [];
  const tLabels = trend.map(d=>d.date.slice(5));
  const tVals = trend.map(d=>d.count);
  const ctx4 = document.getElementById('ch-trend');
  if(ctx4) {
    _growthCharts['ch-trend'] = new Chart(ctx4, {
      type:'line',
      data:{labels:tLabels,datasets:[{data:tVals,borderColor:'#E8500A',backgroundColor:'rgba(232,80,10,0.08)',fill:true,tension:.35,pointRadius:tVals.map(v=>v>0?3:0),pointBackgroundColor:'#E8500A'}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
        scales:{y:{ticks:{stepSize:1},grid:{color:'#f0f0ef'},min:0},x:{grid:{display:false},ticks:{maxTicksLimit:10,font:{size:10}}}}}
    });
  }
}

async function loadGrowthDashboard() {
  const [metrics, forecast] = await Promise.all([
    apiFetch('/api/metrics'),
    apiFetch('/api/forecast'),
  ]);
  const el = document.getElementById('content');
  if(!el) return;

  const contacts = G.contacts;
  const goals = forecast || {};
  const pipeline = goals.pipeline_total || 0;
  const caTarget = goals.ca_target || 150000;
  const signed = goals.signed_revenue || 0;
  const pct = Math.min(100, Math.round(signed / caTarget * 100));

  // Stage counts
  const stageMap = {};
  contacts.forEach(c => { stageMap[c.stage||'Prospect'] = (stageMap[c.stage||'Prospect']||0)+1; });
  const STAGES_ORDER = ['Prospect','Contacted','Meeting','Proposal','Negotiation','Signed','Deployed'];
  const stageFunnelMax = Math.max(...STAGES_ORDER.map(s=>stageMap[s]||0), 1);

  el.innerHTML = `
  <div class="growth-kpis">
    <div class="growth-kpi"><div class="gk-l">Pipeline pondéré</div><div class="gk-v" style="color:var(--ac)">${fmtEur(pipeline)}</div><div class="gk-sub">${contacts.length} contacts</div></div>
    <div class="growth-kpi"><div class="gk-l">CA Signé</div><div class="gk-v" style="color:var(--g)">${fmtEur(signed)}</div>
      <div class="progress-bar-wrap"><div class="progress-bar-fill green" style="width:${pct}%"></div></div>
      <div class="gk-sub">${pct}% de l'objectif ${fmtEur(caTarget)}</div>
    </div>
    <div class="growth-kpi"><div class="gk-l">Strategic</div><div class="gk-v">${contacts.filter(c=>c.segment==='Strategic').length}</div><div class="gk-sub">comptes prioritaires</div></div>
    <div class="growth-kpi"><div class="gk-l">Score moyen</div><div class="gk-v">${contacts.length?Math.round(contacts.reduce((s,c)=>s+(c.score||0),0)/contacts.length):0}</div><div class="gk-sub">sur 100 pts</div></div>
    <div class="growth-kpi"><div class="gk-l">Signés / Déployés</div><div class="gk-v" style="color:var(--g)">${contacts.filter(c=>c.stage==='Signed'||c.stage==='Deployed').length}</div><div class="gk-sub">conventions actives</div></div>
    <div class="growth-kpi"><div class="gk-l">Emails valides</div><div class="gk-v">${contacts.filter(c=>c.email_status==='valid'||c.email_status==='Verified').length}</div><div class="gk-sub">contacts joignables</div></div>
  </div>

  <div class="chart-grid">
    <div class="chart-card"><h3>Pipeline par stade (k€ pondéré)</h3><div class="chart-wrap"><canvas id="ch-pipeline"></canvas></div></div>
    <div class="chart-card"><h3>Répartition prochaines actions</h3><div class="chart-wrap"><canvas id="ch-activity"></canvas></div></div>
    <div class="chart-card"><h3>Valeur pipeline par secteur (k€)</h3><div class="chart-wrap-sm"><canvas id="ch-sector"></canvas></div></div>
    <div class="chart-card"><h3>Activité commerciale — 30 derniers jours</h3><div class="chart-wrap-sm"><canvas id="ch-trend"></canvas></div></div>
  </div>

  <div style="background:var(--w);border:1px solid var(--bd);border-radius:var(--r8);padding:16px;box-shadow:var(--sh)">
    <h3 style="font-size:11px;font-weight:800;color:var(--mu);text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px">Entonnoir pipeline</h3>
    ${STAGES_ORDER.map(s => {
      const n = stageMap[s]||0;
      if(!n&&s!=='Prospect') return '';
      const w = Math.round(n/stageFunnelMax*100);
      const isWin = s==='Signed'||s==='Deployed';
      return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:7px">
        <div style="width:100px;font-size:11.5px;color:var(--mu);text-align:right;flex-shrink:0">${SL[s]||s}</div>
        <div style="flex:1;background:var(--bg);border-radius:4px;height:24px;overflow:hidden">
          <div style="width:${w}%;height:100%;background:${isWin?'var(--g)':'var(--ac)'};border-radius:4px;display:flex;align-items:center;padding-left:8px;font-size:11px;font-weight:800;color:${w>15?'#fff':'transparent'};min-width:20px;transition:.4s">${n}</div>
        </div>
        <div style="width:30px;font-size:12px;font-weight:800;color:${isWin?'var(--g)':'var(--tx)'}">${n}</div>
      </div>`;
    }).join('')}
  </div>`;

  setTimeout(() => initGrowthCharts(forecast), 50);
}


// ════════════════════════════════════════════════════════════════ CSV IMPORT MODAL
let _importFile = null;

function openImportModal() {
  const overlay = document.getElementById('import-overlay');
  overlay.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:900;align-items:center;justify-content:center';
  document.getElementById('import-preview').style.display = 'none';
  document.getElementById('import-result').style.display = 'none';
  document.getElementById('import-btn').style.display = 'none';
  _importFile = null;
}

function closeImportModal(e) {
  if(e && e.target !== document.getElementById('import-overlay')) return;
  document.getElementById('import-overlay').style.display = 'none';
}

function handleImportDrop(e) {
  e.preventDefault();
  document.getElementById('import-drop-zone').style.borderColor = '#ddd';
  const file = e.dataTransfer.files[0];
  if(file) processImportFile(file);
}

function handleImportFile(input) {
  const file = input.files[0];
  if(file) processImportFile(file);
}

function processImportFile(file) {
  _importFile = file;
  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    const lines = text.split('\n').filter(l=>l.trim());
    if(!lines.length) { toast('Fichier vide','error'); return; }
    const headers = lines[0].split(',').map(h=>h.replace(/"/g,'').trim());
    const rows = lines.slice(1, 6);
    const prev = document.getElementById('import-preview');
    prev.style.display = 'block';
    prev.innerHTML = `<div style="font-size:11px;font-weight:700;color:var(--mu);margin-bottom:6px">Aperçu (${lines.length-1} lignes détectées)</div>
    <div style="overflow-x:auto"><table style="width:100%;font-size:11px;border-collapse:collapse">
      <thead><tr>${headers.map(h=>`<th style="background:var(--bg);padding:5px 8px;text-align:left;border:1px solid var(--bd);font-weight:700">${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(row=>`<tr>${row.split(',').map(c=>`<td style="padding:4px 8px;border:1px solid var(--bd)">${esc(c.replace(/"/g,'').trim())}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
    document.getElementById('import-btn').style.display = 'block';
  };
  reader.readAsText(file, 'utf-8');
}

async function doImport() {
  if(!_importFile) { toast('Sélectionnez un fichier','error'); return; }
  const btn = document.getElementById('import-btn');
  btn.textContent = 'Import en cours…'; btn.disabled = true;
  const fd = new FormData();
  fd.append('file', _importFile);
  try {
    const r = await fetch('/api/import/contacts', {method:'POST', body: fd});
    const data = await r.json();
    const res = document.getElementById('import-result');
    res.style.display = 'block';
    if(data.ok) {
      res.innerHTML = `<div style="background:#e6f4ea;border:1px solid #0F9D58;border-radius:6px;padding:10px 12px;font-size:12px;color:#0F9D58;font-weight:700">✓ ${data.created} contact(s) importé(s) avec succès${data.errors?.length?` — ${data.errors.length} erreur(s)`:''}</div>`;
      // Reload contacts
      const contacts = await apiFetch('/api/contacts');
      if(contacts) {
        G.contacts = contacts;
        updSidebar();
        buildSectorSidebar();
      }
      toast(`${data.created} contacts importés ✓`,'success');
      setTimeout(() => closeImportModal(), 2000);
    } else {
      res.innerHTML = `<div style="background:#fce8e6;border:1px solid #D93025;border-radius:6px;padding:10px 12px;font-size:12px;color:#D93025">${esc(data.error||'Erreur')}</div>`;
    }
  } catch(e) {
    toast('Erreur lors de l\'import','error');
  } finally {
    btn.textContent = '⬆ Importer'; btn.disabled = false;
  }
}

// ════════════════════════════════════════════════════════════════ EMAIL TEMPLATES (DB)
let G_dbTemplates = [];

async function loadDbTemplates() {
  G_dbTemplates = await apiFetch('/api/email/templates') || [];
}

async function saveDbTemplate(payload, id=null) {
  if(id) return apiFetch(`/api/email/templates/${id}`, {method:'PATCH', body:JSON.stringify(payload)});
  return apiFetch('/api/email/templates', {method:'POST', body:JSON.stringify(payload)});
}

async function deleteDbTemplate(id) {
  if(!confirm('Supprimer ce template ?')) return;
  const r = await apiFetch(`/api/email/templates/${id}`, {method:'DELETE'});
  if(r?.ok) { toast('Supprimé','success'); await loadDbTemplates(); if(G.view==='templates') render(); }
}

VIEW_TITLES['tasks'] = '✅ Tâches & Activités';

async function init() {
  try {
    const [contacts, strat, planState] = await Promise.all([
      apiFetch('/api/contacts'),
      apiFetch('/api/strategic'),
      apiFetch('/api/plan/state'),
    ]);
    if(!contacts) return;
    G.contacts = contacts;
    ALL_TEMPLATES = strat.templates || [];
    ALL_SCRIPTS   = strat.scripts   || [];
    ALL_SECTORS   = strat.sectors   || [];
    ALL_PLAN      = strat.plan      || [];
    ALL_KPIS      = strat.kpis      || {targets:[]};
    G.planState   = planState       || {};

    const uname = document.getElementById('sb-username').textContent.trim();
    document.getElementById('sb-av').textContent = uname.charAt(0).toUpperCase();

    document.getElementById('bdg-tpl').textContent = ALL_TEMPLATES.length;
    document.getElementById('bdg-scr').textContent = ALL_SCRIPTS.length;
    document.getElementById('bdg-total').textContent = G.contacts.length;
    const newCount = G.contacts.filter(c=>c.alert==='🔴 NOUVEAU').length;
    document.getElementById('bdg-new').textContent = newCount || '0';
    const partCount = G.contacts.filter(c=>c.segment==='Partner').length;
    document.getElementById('bdg-part').textContent = partCount || '0';

    const now = new Date();
    document.getElementById('sb-date').textContent = now.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
    document.getElementById('d-next-date').value = new Date(Date.now()+3*86400000).toISOString().split('T')[0];

    buildSectorSidebar();
    updSidebar();
    buildFilters();
    render();
    updateNotifBadge();
    setInterval(updateNotifBadge, 60000);
    // Pre-load metrics in background for instant Growth Dashboard
    apiFetch('/api/metrics').then(m => { G.metrics = m; });
    // Pre-load relances badge
    apiFetch('/api/emails/suivi').then(d => {
      if(!d) return;
      const bdg = document.getElementById('bdg-relances');
      if(bdg) { const due = d.stats?.relances_dues || 0; bdg.textContent = due > 0 ? due : (d.stats?.total || 0); }
    });
  } catch(e) {
    console.error('Erreur init:', e);
  } finally {
    document.getElementById('loading-screen').style.display = 'none';
  }
}

init();
