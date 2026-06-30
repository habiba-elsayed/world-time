
const COUNTRIES = [
  ["United States","US","America/New_York"],["United Kingdom","GB","Europe/London"],
  ["France","FR","Europe/Paris"],["Germany","DE","Europe/Berlin"],["Japan","JP","Asia/Tokyo"],
  ["China","CN","Asia/Shanghai"],["India","IN","Asia/Kolkata"],["Australia","AU","Australia/Sydney"],
  ["Brazil","BR","America/Sao_Paulo"],["Canada","CA","America/Toronto"],["Russia","RU","Europe/Moscow"],
  ["South Africa","ZA","Africa/Johannesburg"],["United Arab Emirates","AE","Asia/Dubai"],
  ["Egypt","EG","Africa/Cairo"],["Mexico","MX","America/Mexico_City"],["Italy","IT","Europe/Rome"],
  ["Spain","ES","Europe/Madrid"],["South Korea","KR","Asia/Seoul"],["Singapore","SG","Asia/Singapore"],
  ["Indonesia","ID","Asia/Jakarta"],["Saudi Arabia","SA","Asia/Riyadh"],["Turkey","TR","Europe/Istanbul"],
  ["Nigeria","NG","Africa/Lagos"],["Argentina","AR","America/Argentina/Buenos_Aires"],
  ["New Zealand","NZ","Pacific/Auckland"],["Thailand","TH","Asia/Bangkok"],["Vietnam","VN","Asia/Ho_Chi_Minh"],
  ["Philippines","PH","Asia/Manila"],["Pakistan","PK","Asia/Karachi"],["Bangladesh","BD","Asia/Dhaka"],
  ["Norway","NO","Europe/Oslo"],["Netherlands","NL","Europe/Amsterdam"],["Switzerland","CH","Europe/Zurich"],
  ["Poland","PL","Europe/Warsaw"],["Portugal","PT","Europe/Lisbon"],["Ireland","IE","Europe/Dublin"],
  ["Kenya","KE","Africa/Nairobi"],["Morocco","MA","Africa/Casablanca"],["Chile","CL","America/Santiago"],
  ["Colombia","CO","America/Bogota"],["Peru","PE","America/Lima"],["Malaysia","MY","Asia/Kuala_Lumpur"],
  ["Hong Kong","HK","Asia/Hong_Kong"],["Iceland","IS","Atlantic/Reykjavik"],["Finland","FI","Europe/Helsinki"],
  ["Denmark","DK","Europe/Copenhagen"],["Austria","AT","Europe/Vienna"],["Belgium","BE","Europe/Brussels"],
  ["Czech Republic","CZ","Europe/Prague"],["Ukraine","UA","Europe/Kyiv"],["Qatar","QA","Asia/Qatar"],
  ["Kuwait","KW","Asia/Kuwait"],["Iraq","IQ","Asia/Baghdad"],["Iran","IR","Asia/Tehran"],
  ["Ethiopia","ET","Africa/Addis_Ababa"],["Ghana","GH","Africa/Accra"],["Algeria","DZ","Africa/Algiers"],
  ["Tunisia","TN","Africa/Tunis"],["Jordan","JO","Asia/Amman"],["Lebanon","LB","Asia/Beirut"],
  ["Cuba","CU","America/Havana"],["Venezuela","VE","America/Caracas"],["Ecuador","EC","America/Guayaquil"],
  ["Bolivia","BO","America/La_Paz"],["Uruguay","UY","America/Montevideo"],["Paraguay","PY","America/Asuncion"],
  ["Sri Lanka","LK","Asia/Colombo"],["Nepal","NP","Asia/Kathmandu"],["Myanmar","MM","Asia/Yangon"],
  ["Cambodia","KH","Asia/Phnom_Penh"],["Mongolia","MN","Asia/Ulaanbaatar"],["Kazakhstan","KZ","Asia/Almaty"],
  ["Taiwan","TW","Asia/Taipei"],["Fiji","FJ","Pacific/Fiji"],["Papua New Guinea","PG","Pacific/Port_Moresby"],
  ["Croatia","HR","Europe/Zagreb"],["Romania","RO","Europe/Bucharest"],["Hungary","HU","Europe/Budapest"],
  ["Serbia","RS","Europe/Belgrade"],["Bulgaria","BG","Europe/Sofia"]
];

function flagEmoji(code){
  return code.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt()));
}

let localTz;
try { localTz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch(e){ localTz = "UTC"; }
const localEntry = COUNTRIES.find(c => c[2] === localTz);

let active = [];
const defaults = ["United States","United Kingdom","Japan","United Arab Emirates"];
if (localEntry && !defaults.includes(localEntry[0])) active.push(localEntry[0]);
defaults.forEach(n => { if (!active.includes(n)) active.push(n); });
active = active.slice(0,5);

const cardsEl = document.getElementById('cards');
const stripEl = document.getElementById('strip');
const stripUtcEl = document.getElementById('strip-utc');
const searchInput = document.getElementById('search-input');
const suggestionsEl = document.getElementById('suggestions');
const addForm = document.getElementById('add-form');

function getTimeData(tz){
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(now).reduce((a,p)=>{a[p.type]=p.value; return a;},{});
  const hour = parseInt(parts.hour,10) % 24;
  const minute = parseInt(parts.minute,10);
  const second = parseInt(parts.second,10);

  const dateStr = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', month: 'short', day: 'numeric'
  }).format(now);

  // offset via diff trick
  const utcMs = now.getTime() + (now.getTimezoneOffset()*60000);
  const tzString = now.toLocaleString('en-US', {timeZone: tz});
  const tzDate = new Date(tzString);
  const offsetMin = Math.round((tzDate.getTime() - new Date(utcMs).getTime())/60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const offH = String(Math.floor(abs/60)).padStart(2,'0');
  const offM = String(abs%60).padStart(2,'0');
  const offsetStr = `UTC${sign}${offH}:${offM}`;

  return {hour, minute, second, dateStr, offsetStr,
    timeStr: `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`};
}

function dayInfo(hour){
  if (hour >= 6 && hour < 18) return {label:'Daylight', color:'#FF9A4D'};
  if (hour >= 4 && hour < 6) return {label:'Dawn', color:'#FF9A4D'};
  if (hour >= 18 && hour < 20) return {label:'Dusk', color:'#FF9A4D'};
  return {label:'Night', color:'#6E8BFF'};
}

function buildStripHours(){
  stripEl.querySelectorAll('.strip-hour').forEach(e=>e.remove());
  [0,3,6,9,12,15,18,21].forEach(h=>{
    const el = document.createElement('div');
    el.className = 'strip-hour';
    el.style.left = (h/24*100) + '%';
    el.textContent = String(h).padStart(2,'0');
    stripEl.appendChild(el);
  });
}
buildStripHours();

// Card/marker DOM nodes are built once per country and kept alive across
// ticks — only their text/position gets patched every second, so nothing
// re-animates, reflows, or jumps while the clock runs.
const cardNodes = new Map();   // name -> {card, clockTime, secs, date, offset, swatch, daylabel}
const markerNodes = new Map(); // name -> {marker, pinLabel}

function buildCard(name, code){
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-top">
      <div class="card-place">
        <span class="flag">${flagEmoji(code)}</span>
        <span class="name">${name}</span>
      </div>
      <button class="remove-btn" aria-label="Remove ${name}" data-name="${name}">✕</button>
    </div>
    <div class="clock"><span class="clock-time"></span><span class="secs">:<span class="clock-secs"></span></span></div>
    <div class="date"></div>
    <div class="card-foot">
      <span class="offset"></span>
      <span class="daypart"><span class="swatch"></span><span class="daylabel"></span></span>
    </div>
  `;
  card.querySelector('.remove-btn').addEventListener('click', () => {
    active = active.filter(n => n !== name);
    syncDom();
  });
  return {
    card,
    clockTime: card.querySelector('.clock-time'),
    secs: card.querySelector('.clock-secs'),
    date: card.querySelector('.date'),
    offset: card.querySelector('.offset'),
    swatch: card.querySelector('.swatch'),
    daylabel: card.querySelector('.daylabel')
  };
}

function buildMarker(name, code){
  const marker = document.createElement('div');
  marker.className = 'strip-marker';
  marker.innerHTML = `
    <span class="pin-label"></span>
    <span class="dot"></span>
    <span class="stem"></span>
  `;
  return { marker, pinLabel: marker.querySelector('.pin-label') };
}

// Rebuilds the DOM only when the set of active countries changes
// (add/remove) — never on a plain time tick.
function syncDom(){
  if (active.length === 0){
    cardsEl.innerHTML = '<div class="empty-state">No clocks yet — add a country above to start watching the world turn.</div>';
    cardNodes.clear();
  } else {
    if (cardsEl.querySelector('.empty-state')) cardsEl.innerHTML = '';
    [...cardNodes.keys()].forEach(name => {
      if (!active.includes(name)){
        cardNodes.get(name).card.remove();
        cardNodes.delete(name);
      }
    });
    active.forEach(name => {
      const entry = COUNTRIES.find(c => c[0] === name);
      if (!entry) return;
      if (!cardNodes.has(name)){
        const nodes = buildCard(name, entry[1]);
        cardNodes.set(name, nodes);
        cardsEl.appendChild(nodes.card);
      } else {
        cardsEl.appendChild(cardNodes.get(name).card);
      }
    });
  }

  [...markerNodes.keys()].forEach(name => {
    if (!active.includes(name)){
      markerNodes.get(name).marker.remove();
      markerNodes.delete(name);
    }
  });
  active.forEach(name => {
    const entry = COUNTRIES.find(c => c[0] === name);
    if (!entry) return;
    if (!markerNodes.has(name)){
      const nodes = buildMarker(name, entry[1]);
      markerNodes.set(name, nodes);
      stripEl.appendChild(nodes.marker);
    }
  });

  tick();
}

// Patches values only — runs every second, causes no layout movement.
function tick(){
  active.forEach(name => {
    const entry = COUNTRIES.find(c => c[0] === name);
    if (!entry) return;
    const [cName, code, tz] = entry;
    const t = getTimeData(tz);
    const dp = dayInfo(t.hour);

    const c = cardNodes.get(name);
    if (c){
      if (c.clockTime.textContent !== t.timeStr) c.clockTime.textContent = t.timeStr;
      const secStr = String(t.second).padStart(2,'0');
      if (c.secs.textContent !== secStr) c.secs.textContent = secStr;
      if (c.date.textContent !== t.dateStr) c.date.textContent = t.dateStr;
      if (c.offset.textContent !== t.offsetStr) c.offset.textContent = t.offsetStr;
      if (c.daylabel.textContent !== dp.label) c.daylabel.textContent = dp.label;
      if (c.swatch.style.background !== dp.color) c.swatch.style.background = dp.color;
    }

    const m = markerNodes.get(name);
    if (m){
      const pct = ((t.hour + t.minute/60) / 24) * 100;
      m.marker.style.left = pct + '%';
      const pinText = `${flagEmoji(code)} ${t.timeStr}`;
      if (m.pinLabel.textContent !== pinText) m.pinLabel.textContent = pinText;
    }
  });

  const utcNow = new Intl.DateTimeFormat('en-US', {timeZone:'UTC', hour:'2-digit', minute:'2-digit', hour12:false}).format(new Date());
  const utcStr = `UTC ${utcNow}`;
  if (stripUtcEl.textContent !== utcStr) stripUtcEl.textContent = utcStr;
}

// --- search / suggestions ---
let highlightIdx = -1;
let currentMatches = [];

function showSuggestions(query){
  const q = query.trim().toLowerCase();
  currentMatches = COUNTRIES.filter(c => !active.includes(c[0]) && c[0].toLowerCase().includes(q));
  if (q === '') currentMatches = currentMatches.slice(0,8);
  highlightIdx = -1;
  suggestionsEl.innerHTML = '';

  if (currentMatches.length === 0){
    suggestionsEl.innerHTML = `<div class="empty">No matching country${q ? ` for "${query}"` : ''}.</div>`;
    suggestionsEl.classList.add('open');
    return;
  }

  currentMatches.slice(0,40).forEach((c, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role','option');
    btn.innerHTML = `<span class="flag">${flagEmoji(c[1])}</span> ${c[0]} <span class="tz">${c[2].split('/').pop().replace(/_/g,' ')}</span>`;
    btn.addEventListener('click', () => addCountry(c[0]));
    suggestionsEl.appendChild(btn);
  });
  suggestionsEl.classList.add('open');
}

function addCountry(name){
  if (!active.includes(name)) active.push(name);
  searchInput.value = '';
  suggestionsEl.classList.remove('open');
  syncDom();
}

searchInput.addEventListener('input', () => showSuggestions(searchInput.value));
searchInput.addEventListener('focus', () => showSuggestions(searchInput.value));
searchInput.addEventListener('keydown', (e) => {
  const opts = suggestionsEl.querySelectorAll('button');
  if (e.key === 'ArrowDown'){
    e.preventDefault();
    highlightIdx = Math.min(highlightIdx+1, opts.length-1);
    opts.forEach((o,i)=>o.classList.toggle('active', i===highlightIdx));
    opts[highlightIdx]?.scrollIntoView({block:'nearest'});
  } else if (e.key === 'ArrowUp'){
    e.preventDefault();
    highlightIdx = Math.max(highlightIdx-1, 0);
    opts.forEach((o,i)=>o.classList.toggle('active', i===highlightIdx));
    opts[highlightIdx]?.scrollIntoView({block:'nearest'});
  } else if (e.key === 'Escape'){
    suggestionsEl.classList.remove('open');
  }
});

addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (highlightIdx >= 0 && currentMatches[highlightIdx]){
    addCountry(currentMatches[highlightIdx][0]);
  } else if (currentMatches.length === 1){
    addCountry(currentMatches[0][0]);
  } else if (currentMatches.length > 0){
    addCountry(currentMatches[0][0]);
  }
});

document.addEventListener('click', (e) => {
  if (!document.querySelector('.add-bar').contains(e.target)){
    suggestionsEl.classList.remove('open');
  }
});

syncDom();
setInterval(tick, 1000);
