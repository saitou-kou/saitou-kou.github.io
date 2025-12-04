// イベント一覧を読み込み、表を作成するスクリプト
(function(){
  async function loadEvents(){
    const res = await fetch('events.txt');
    if(!res.ok) throw new Error('events.txt を取得できません: '+res.status);
    const text = await res.text();
    // 更新時刻を取得して表示
    const lastModified = res.headers.get('Last-Modified');
    if(lastModified){
      const date = new Date(lastModified);
      const formatted = date.toLocaleString('ja-JP', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tokyo'});
      const updateEl = document.getElementById('last-update');
      if(updateEl) updateEl.textContent = `最終更新: ${formatted}`;
    }
    return parseEvents(text);
  }

  // Load Japanese holidays from external API (holidays-jp.github.io)
  // Falls back to holidays.txt if available; API is tried first.
  async function loadHolidays(){
    let map = {};
    // Try external API first
    try{
      const res = await fetch('https://holidays-jp.github.io/api/v1/date.json');
      if(res.ok){
        const data = await res.json();
        // data is { "YYYY-MM-DD": "祝日名", ... }
        if(data && typeof data === 'object'){
          map = data;
          console.log('祝日データを外部APIから読み込みました');
          return map;
        }
      }
    }catch(err){
      console.log('外部API から祝日データ取得に失敗: ', err.message);
    }
    // Fallback to local holidays.txt if API fails
    try{
      const res = await fetch('holidays.txt');
      if(!res.ok) return {};
      const text = await res.text();
      const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l && !l.startsWith('#'));
      for(const line of lines){
        const parts = line.split(',');
        if(parts.length === 0) continue;
        const date = parts[0].trim();
        const name = parts.slice(1).join(',').trim() || '';
        map[date] = name || '(祝日)';
      }
      if(Object.keys(map).length > 0){
        console.log('祝日データをローカルファイル (holidays.txt) から読み込みました');
      }
      return map;
    }catch(err){
      console.log('holidays.txt 読み込み失敗');
      return {};
    }
  }

  // line: イベント名,開催日,開催時間,所要時間(分),URL,可用性マーク,団体名,場所
  function parseEvents(text){
    const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l && !l.startsWith('#'));
    const events = [];
    for(const line of lines){
      const parts = line.split(',');
      if(parts.length < 3) continue;
      const name = parts[0].trim();
      const dateRaw = parts[1].trim();
      const timeRaw = parts[2].trim();
      const durationStr = parts[3] ? parts[3].trim() : '0';
      const duration = Math.max(0, parseInt(durationStr, 10) || 0); // 分単位
      const url = parts[4] ? parts[4].trim() : '';
      const status = parts[5] ? parts[5].trim() : '';
      const organization = parts[6] ? parts[6].trim() : '';
      const location = parts[7] ? parts[7].trim() : '';
      const date = normalizeDate(dateRaw);
      const time = normalizeTime(timeRaw);
      if(!date || !time) continue;
      events.push({name,date,time,duration,url,status,organization,location});
    }
    return events;
  }

  function normalizeDate(s){
    // 1) YYYY-MM-DD
    if(/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) return toYMD(new Date(s));
    // 2) M/D or MM/DD or M/D/YYYY
    const m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if(m){
      const y = m[3] ? (m[3].length===2 ? ('20'+m[3]) : m[3]) : (new Date()).getFullYear();
      const mm = String(m[1]).padStart(2,'0');
      const dd = String(m[2]).padStart(2,'0');
      return `${y}-${mm}-${dd}`;
    }
    // try Date parse
    const d = new Date(s);
    if(!isNaN(d)) return toYMD(d);
    return null;
  }

  function normalizeTime(s){
    // H:MM or HH:MM
    const m = s.match(/^(\d{1,2}):(\d{1,2})$/);
    if(!m) return null;
    const hh = String(Math.min(23,parseInt(m[1],10))).padStart(2,'0');
    const mm = String(Math.min(59,parseInt(m[2],10))).padStart(2,'0');
    return `${hh}:${mm}`;
  }

  function toYMD(d){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd}`;
  }

  function formatHeaderDate(ymd){
    const [y,m,d] = ymd.split('-');
    return `${Number(m)}/${Number(d)}`;
  }

  function weekdayLabel(ymd){
    const [y,m,d] = ymd.split('-').map(x=>parseInt(x,10));
    const dt = new Date(y, m-1, d);
    const w = dt.getDay();
    const labels = ['日','月','火','水','木','金','土'];
    return labels[w];
  }

  // Build table for a given list of dates (Y-M-D strings) — shows those dates as columns
  function buildTableForDates(events, dates){
    // グループ化: eventName -> [{date,time,url,status,duration,organization,location},...]
    const grouped = new Map();
    for(const e of events){
      if(!grouped.has(e.name)) grouped.set(e.name, []);
      grouped.get(e.name).push({date:e.date,time:e.time,url:e.url,status:e.status,duration:e.duration,organization:e.organization,location:e.location});
    }
    
    // 団体名、場所、イベント名で降順ソート
    const sortedEntries = Array.from(grouped.entries()).sort((a, b) => {
      const orgA = a[1][0].organization || '';
      const orgB = b[1][0].organization || '';
      const locA = a[1][0].location || '';
      const locB = b[1][0].location || '';
      const nameA = a[0];
      const nameB = b[0];
      
      // 団体名で降順
      if(orgA !== orgB) return orgB.localeCompare(orgA, 'ja');
      // 場所で降順
      if(locA !== locB) return locB.localeCompare(locA, 'ja');
      // イベント名で降順
      return nameB.localeCompare(nameA, 'ja');
    });

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const thr = document.createElement('tr');
    const thOrg = document.createElement('th'); thOrg.textContent = '団体名'; thOrg.className = 'organization'; thr.appendChild(thOrg);
    const thLoc = document.createElement('th'); thLoc.textContent = '場所'; thLoc.className = 'location'; thr.appendChild(thLoc);
    const thName = document.createElement('th'); thName.textContent = 'イベント名'; thName.className = 'name'; thr.appendChild(thName);
    for(const d of dates){
      const th = document.createElement('th');
      th.className = 'date';
      th.dataset.date = d;
      // date and weekday lines
      const wrapper = document.createElement('div'); wrapper.className = 'hdr';
      const spanDate = document.createElement('span'); spanDate.className = 'hd-date'; spanDate.textContent = formatHeaderDate(d);
      const spanWeek = document.createElement('span'); spanWeek.className = 'hd-weekday';
      const wk = weekdayLabel(d);
      spanWeek.textContent = wk;
      if(wk === '日') spanWeek.classList.add('weekday-sun');
      if(wk === '土') spanWeek.classList.add('weekday-sat');
      // holiday highlight (if holidaysAll contains this date)
      if(holidaysAll && holidaysAll[d]){
        spanWeek.classList.add('holiday');
        th.classList.add('holiday');
        spanWeek.title = holidaysAll[d];
      }
      wrapper.appendChild(spanDate);
      wrapper.appendChild(spanWeek);
      th.appendChild(wrapper);
      thr.appendChild(th);
    }
    thead.appendChild(thr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for(const [name,occurs] of sortedEntries){
      const tr = document.createElement('tr');
      const tdName = document.createElement('td');
      tdName.className = 'name';
      
      // イベント名リンク
      if(occurs[0] && occurs[0].url){
        const a = document.createElement('a'); a.href = occurs[0].url; a.target = '_blank'; a.className='event-link'; a.textContent = name; tdName.appendChild(a);
      }else{
        tdName.textContent = name;
      }
      
      // 団体名と場所を取得
      const org = occurs[0].organization || '';
      const loc = occurs[0].location || '';
      
      // 団体名列
      const tdOrg = document.createElement('td');
      tdOrg.className = 'organization';
      tdOrg.textContent = org || '';
      tr.appendChild(tdOrg);
      
      // 場所列
      const tdLoc = document.createElement('td');
      tdLoc.className = 'location';
      tdLoc.textContent = loc || '';
      tr.appendChild(tdLoc);
      
      tr.appendChild(tdName);
      // map date -> [{time,status,duration,url},...]
      const map = {};
      for(const o of occurs){
        map[o.date] = map[o.date] || [];
        map[o.date].push({time:o.time,status:o.status,duration:o.duration,url:o.url});
      }
      for(const d of dates){
        const td = document.createElement('td');
        td.dataset.date = d;
        if(map[d]){
          const btn = document.createElement('button');
          btn.className = 'dot';
          btn.textContent = '〇';
          btn.dataset.event = name;
          btn.dataset.date = d;
          btn.dataset.times = JSON.stringify(map[d]);
          // store duration from first occurrence for this event+date combo
          const firstEvent = eventsAll.find(e => e.name === name && e.date === d);
          btn.dataset.duration = firstEvent ? firstEvent.duration : 0;
          btn.addEventListener('click', onDotClick);
          td.appendChild(btn);
        }else{
          const span = document.createElement('span');
          span.className = 'dot empty';
          span.textContent = '';
          td.appendChild(span);
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    return {table,dates};
  }

  // state for inserted hour columns per date
  const hourState = {}; // date -> {count: number, headerInserted: bool}

  function insertHourColumnsForDate(date, table){
    if(hourState[date] && hourState[date].headerInserted) return; // already inserted
    const thead = table.querySelector('thead tr');
    // find header th index for the date (accounting for name+org+loc = 3 fixed columns)
    let dateThIndex = -1;
    Array.from(thead.children).forEach((th,i)=>{ if(th.dataset && th.dataset.date===date) dateThIndex = i; });
    if(dateThIndex === -1) return;
    // insert 24 header th after dateThIndex
    for(let h=0;h<24;h++){
      const th = document.createElement('th'); th.className = 'hour-col'; th.dataset.hour = h; th.textContent = h;
      const ref = thead.children[dateThIndex+1 + h] || null;
      thead.insertBefore(th, ref);
    }
    // for each tbody row, insert 24 placeholder td after the corresponding date cell
    const tbody = table.querySelector('tbody');
    Array.from(tbody.children).forEach(tr=>{
      // find the td that has dataset.date === date
      let dateTd = null;
      Array.from(tr.children).forEach(td=>{ if(td.dataset && td.dataset.date===date) dateTd = td; });
      if(!dateTd) return;
      // insert 24 empty td after dateTd
      for(let h=0;h<24;h++){
        const td = document.createElement('td'); td.className = 'hour-placeholder hour-cell'; td.dataset.hour = h; td.textContent = '';
        const ref = dateTd.nextSibling;
        tr.insertBefore(td, ref);
      }
    });
    hourState[date] = {count:0, headerInserted:true, table};
  }

  function removeHourColumnsForDateIfUnused(date){
    const s = hourState[date];
    if(!s) return;
    if(s.count>0) return; // still used
    const table = s.table;
    const thead = table.querySelector('thead tr');
    // remove the 24 header th after date header (accounting for fixed columns)
    let dateThIndex = -1;
    Array.from(thead.children).forEach((th,i)=>{ if(th.dataset && th.dataset.date===date) dateThIndex = i; });
    if(dateThIndex===-1) return;
    for(let h=0;h<24;h++){
      const rem = thead.children[dateThIndex+1];
      if(rem && rem.classList.contains('hour-col')) rem.remove();
    }
    // remove placeholders from each tbody row
    const tbody = table.querySelector('tbody');
    Array.from(tbody.children).forEach(tr=>{
      // remove consecutive hour-placeholder tds after the date td
      let dateTdIndex = -1;
      Array.from(tr.children).forEach((td,i)=>{ if(td.dataset && td.dataset.date===date) dateTdIndex = i; });
      if(dateTdIndex===-1) return;
      // after dateTdIndex, remove up to 24 placeholders
      for(let h=0;h<24;h++){
        const cand = tr.children[dateTdIndex+1];
        if(cand && cand.classList && cand.classList.contains('hour-placeholder')) cand.remove();
      }
      // also if this row had expansion marker, remove it
      const marker = tr.querySelector('[data-expanded-for]');
      if(marker) marker.removeAttribute('data-expanded-for');
    });
    delete hourState[date];
  }

  function collapseAllOtherDates(activeDate, table){
    for(const d of Object.keys(hourState)){
      if(d === activeDate) continue;
      const s = hourState[d];
      if(!s || !s.expanded) continue;
      // clear placeholders for all rows
      const tbody = table.querySelector('tbody');
      Array.from(tbody.children).forEach(row=>{
        let dateTdIndex = -1;
        Array.from(row.children).forEach((td,i)=>{ if(td.dataset && td.dataset.date===d) dateTdIndex = i; });
        if(dateTdIndex===-1) return;
        for(let h=0;h<24;h++){
          const cand = row.children[dateTdIndex+1];
          if(cand && cand.classList && cand.classList.contains('hour-placeholder')) cand.textContent = '';
        }
      });
      s.expanded = false;
      s.count = 0;
      removeHourColumnsForDateIfUnused(d);
    }
  }

  // Duration popup display
  let currentDurationPopup = null;
  function showDurationPopup(e){
    const cell = e.target;
    const duration = parseInt(cell.dataset.duration || '0', 10);
    if(duration === 0) return; // no popup for 0 duration
    hideDurationPopup();
    const popup = document.createElement('div');
    popup.className = 'duration-popup';
    popup.textContent = `${duration}分`;
    document.body.appendChild(popup);
    const rect = cell.getBoundingClientRect();
    popup.style.left = (rect.left + rect.width / 2 - popup.offsetWidth / 2) + 'px';
    popup.style.top = (rect.top - popup.offsetHeight - 5) + 'px';
    currentDurationPopup = popup;
  }
  function hideDurationPopup(){
    if(currentDurationPopup){
      currentDurationPopup.remove();
      currentDurationPopup = null;
    }
  }
  function toggleDurationPopup(e){
    const cell = e.target;
    const duration = parseInt(cell.dataset.duration || '0', 10);
    if(duration === 0) return;
    if(currentDurationPopup && currentDurationPopup.parentNode){
      hideDurationPopup();
    }else{
      showDurationPopup(e);
    }
  }

  function onDotClick(e){
    const btn = e.currentTarget;
    const tr = btn.closest('tr');
    const table = tr.closest('table');
    const date = btn.dataset.date;

    // If the date is already expanded (global), collapse it for all rows
    if(hourState[date] && hourState[date].expanded){
      // clear placeholders for all rows and remove header/columns
      const tbody = table.querySelector('tbody');
      Array.from(tbody.children).forEach(row=>{
        let dateTdIndex = -1;
        Array.from(row.children).forEach((td,i)=>{ if(td.dataset && td.dataset.date===date) dateTdIndex = i; });
        if(dateTdIndex===-1) return;
        for(let h=0;h<24;h++){
          const cand = row.children[dateTdIndex+1];
          if(cand && cand.classList && cand.classList.contains('hour-placeholder')) cand.textContent = '';
        }
      });
      // mark collapsed and remove columns
      hourState[date].expanded = false;
      hourState[date].count = 0;
      removeHourColumnsForDateIfUnused(date);
      return;
    }

    // collapse any other expanded date so only one date is expanded globally
    collapseAllOtherDates(date, table);
    // expanding: ensure hour columns exist
    insertHourColumnsForDate(date, table);
    // fill each row that has times for this date
    const tbody = table.querySelector('tbody');
    let usedRows = 0;
    Array.from(tbody.children).forEach(row=>{
      // find the cell for the date
      let dateTd = null; let dateTdIndex = -1;
      Array.from(row.children).forEach((td,i)=>{ if(td.dataset && td.dataset.date===date){ dateTd = td; dateTdIndex = i; } });
      if(!dateTd) return;
      // check if this cell has a button with times
      const btnInCell = dateTd.querySelector('button.dot');
      if(!btnInCell) return;
      let times = [];
      try{
        times = JSON.parse(btnInCell.dataset.times || '[]');
      }catch(e){
        times = [];
      }
      if(!Array.isArray(times) || times.length===0) return;
      // Normalize times array to objects: {time,status,duration,url}
      const normalized = [];
      for(const item of times){
        if(!item) continue;
        if(typeof item === 'string'){
          // may be comma-separated list
          const parts = item.split(/\s*,\s*/).filter(Boolean);
          for(const p of parts) normalized.push({time: p, status: ''});
          continue;
        }
        if(typeof item === 'object'){
          // if item looks like {time:..., status:...}
          if(item.time) normalized.push({time: item.time, status: item.status || '', duration: item.duration || undefined, url: item.url || undefined});
          else {
            // maybe {"09:50": {}} or similar; try to extract keys
            const keys = Object.keys(item);
            if(keys.length===1 && /^\d{1,2}:\d{2}$/.test(keys[0])){
              normalized.push({time: keys[0], status: (item[keys[0]] && item[keys[0]].vacancyType) || ''});
            }else{
              // fallback: stringify
              normalized.push({time: String(item), status: ''});
            }
          }
          continue;
        }
        // fallback
        normalized.push({time: String(item), status: ''});
      }
      if(normalized.length===0) return;
      const timesObj = normalized;
      const duration = parseInt(btnInCell.dataset.duration || (timesObj[0] && timesObj[0].duration) || '0', 10);
      // build hour map: hour -> [{time,status,duration,url}, ...]
      const hm = {};
      for(const item of timesObj){
        const t = item.time;
        const status = item.status || '';
        const durl = item.url || null;
        const dur = item.duration || duration;
        const h = parseInt(t.split(':')[0],10);
        if(Number.isNaN(h)) continue;
        hm[h] = hm[h] || [];
        hm[h].push({time:t,status:status,duration:dur,url:durl});
      }
      // Build a map of all time slots with their durations for highlighting
      const durationRanges = []; // array of {startHour, endHour}
      for(const item of timesObj){
        const t = item.time;
        const dur = item.duration || duration;
        const [hStr, mStr] = t.split(':');
        const startH = parseInt(hStr, 10);
        const startM = parseInt(mStr, 10);
        const endH = Math.ceil((startH * 60 + startM + dur) / 60);
        durationRanges.push({startHour: startH, endHour: endH});
      }
      
      for(let h=0;h<24;h++){
        const cell = row.children[dateTdIndex+1 + h];
        if(cell && cell.classList && cell.classList.contains('hour-placeholder')){
          // clear cell contents and any old listeners
          cell.innerHTML = '';
          cell.className = 'hour-placeholder hour-cell';
          
          if(hm[h]){
            // 時間順にソート
            hm[h].sort((a, b) => {
              const timeA = a.time || '';
              const timeB = b.time || '';
              return timeA.localeCompare(timeB);
            });
            // for each time in this hour, add a colored span
            for(const it of hm[h]){
              const span = document.createElement('span');
              span.className = 'time-status';
              const st = (it.status || '').toString().trim();
              const s = st.replace(/\s+/g, '').toUpperCase();
              // map status char/text to class (be generous with matching)
              if(s === '〇' || s === '○' || s === '\u3007' || s === 'O' || s === 'AVAILABLE' || s.indexOf('AVAILABLE') !== -1){
                span.classList.add('status-available');
              }else if(s === '△' || s === 'Δ' || s.indexOf('FEW') !== -1 || s.indexOf('LIMIT') !== -1 || s === 'SOME'){
                span.classList.add('status-limited');
              }else if(s === '×' || s === 'X' || s.indexOf('SOLD') !== -1 || s.indexOf('FULL') !== -1 || s === 'NONE'){
                span.classList.add('status-soldout');
              }else{
                span.classList.add('status-unknown');
              }
              span.textContent = it.time;
              cell.appendChild(span);
              // add spacing between multiple times
              if(hm[h].length > 1 && hm[h].indexOf(it) < hm[h].length - 1){
                cell.appendChild(document.createTextNode(', '));
              }
            }
            // add duration metadata and interactivity
            cell.dataset.duration = duration;
            cell.title = duration > 0 ? `所要時間: ${duration}分` : '所要時間: 不明';
            cell.classList.add('event-cell');
            cell.addEventListener('mouseenter', showDurationPopup);
            cell.addEventListener('mouseleave', hideDurationPopup);
            cell.addEventListener('click', toggleDurationPopup);
          }
          
          // highlight cell if within any duration range
          let inRange = false;
          for(const range of durationRanges){
            if(h >= range.startHour && h < range.endHour){
              inRange = true;
              break;
            }
          }
          if(inRange){
            cell.classList.add('event-duration');
          }
        }
      }
      usedRows++;
    });
    hourState[date].count = usedRows;
    hourState[date].expanded = true;
  }

  // helpers for month rendering
  function datesForMonth(year, month){
    // month: 0-based (JavaScript Date)
    const d = new Date(year, month+1, 0); // last day of month
    const days = d.getDate();
    const arr = [];
    for(let i=1;i<=days;i++){
      const dt = new Date(year, month, i);
      arr.push(toYMD(dt));
    }
    return arr;
  }

  // render month view
  let eventsAll = [];
  let holidaysAll = {};
  let currentYear = (new Date()).getFullYear();
  let currentMonth = (new Date()).getMonth(); // 0-based
  let filterOrgs = new Set();
  let filterLocs = new Set();

  function getFilteredEvents(){
    let filtered = eventsAll;
    if(filterOrgs.size > 0){
      filtered = filtered.filter(e => filterOrgs.has(e.organization));
    }
    if(filterLocs.size > 0){
      filtered = filtered.filter(e => filterLocs.has(e.location));
    }
    return filtered;
  }

  function updateFilterOptions(){
    // 団体名の一覧を取得
    const orgs = new Set();
    for(const e of eventsAll){
      if(e.organization) orgs.add(e.organization);
    }
    
    // 団体名チェックボックスリストを更新
    const orgDropdown = document.getElementById('filter-org-dropdown');
    orgDropdown.innerHTML = '';
    const orgSorted = Array.from(orgs).sort((a,b)=>a.localeCompare(b,'ja'));
    orgSorted.forEach(org=>{
      const label = document.createElement('label');
      label.style.display = 'block';
      label.style.padding = '4px 8px';
      label.style.cursor = 'pointer';
      label.style.fontSize = '13px';
      label.addEventListener('mouseenter', ()=>label.style.background='#f0f0f0');
      label.addEventListener('mouseleave', ()=>label.style.background='transparent');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = org;
      cb.checked = filterOrgs.has(org);
      cb.addEventListener('change', ()=>{
        if(cb.checked) filterOrgs.add(org);
        else filterOrgs.delete(org);
        updateLocationFilterOptions(); // 場所フィルタを更新
        renderMonth(currentYear, currentMonth);
        updateFilterButtonLabels();
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + org));
      orgDropdown.appendChild(label);
    });
    
    // 場所フィルタを更新
    updateLocationFilterOptions();
  }
  
  function updateLocationFilterOptions(){
    // 団体名フィルタが選択されている場合は、その団体に属する場所のみを表示
    let availableLocs = new Set();
    if(filterOrgs.size > 0){
      // 選択された団体に属する場所のみ
      for(const e of eventsAll){
        if(e.organization && filterOrgs.has(e.organization) && e.location){
          availableLocs.add(e.location);
        }
      }
    }else{
      // 全ての場所
      for(const e of eventsAll){
        if(e.location) availableLocs.add(e.location);
      }
    }
    
    // 場所チェックボックスリストを更新
    const locDropdown = document.getElementById('filter-loc-dropdown');
    locDropdown.innerHTML = '';
    const locSorted = Array.from(availableLocs).sort((a,b)=>a.localeCompare(b,'ja'));
    
    // 現在選択されている場所のうち、利用可能でないものをクリア
    const locsToRemove = [];
    for(const loc of filterLocs){
      if(!availableLocs.has(loc)){
        locsToRemove.push(loc);
      }
    }
    locsToRemove.forEach(loc => filterLocs.delete(loc));
    
    locSorted.forEach(loc=>{
      const label = document.createElement('label');
      label.style.display = 'block';
      label.style.padding = '4px 8px';
      label.style.cursor = 'pointer';
      label.style.fontSize = '13px';
      label.addEventListener('mouseenter', ()=>label.style.background='#f0f0f0');
      label.addEventListener('mouseleave', ()=>label.style.background='transparent');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = loc;
      cb.checked = filterLocs.has(loc);
      cb.addEventListener('change', ()=>{
        if(cb.checked) filterLocs.add(loc);
        else filterLocs.delete(loc);
        renderMonth(currentYear, currentMonth);
        updateFilterButtonLabels();
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + loc));
      locDropdown.appendChild(label);
    });
  }
  
  function updateFilterButtonLabels(){
    const orgBtn = document.getElementById('filter-org-btn');
    const locBtn = document.getElementById('filter-loc-btn');
    orgBtn.textContent = `団体名${filterOrgs.size > 0 ? ' (' + filterOrgs.size + ')' : ''} ▼`;
    locBtn.textContent = `場所${filterLocs.size > 0 ? ' (' + filterLocs.size + ')' : ''} ▼`;
  }

  function renderMonth(year, month){
    const container = document.getElementById('table-container');
    container.innerHTML = '';
    const dates = datesForMonth(year, month);
    const filtered = getFilteredEvents();
    const {table} = buildTableForDates(filtered, dates);
    container.appendChild(table);
    // update month label
    const label = document.getElementById('month-label');
    label.textContent = `${year}年${month+1}月`;
  }

  // wire controls
  function wireControls(){
    document.getElementById('prev-month').addEventListener('click', ()=>{
      currentMonth -= 1;
      if(currentMonth < 0){ currentMonth = 11; currentYear -= 1; }
      renderMonth(currentYear, currentMonth);
    });
    document.getElementById('next-month').addEventListener('click', ()=>{
      currentMonth += 1;
      if(currentMonth > 11){ currentMonth = 0; currentYear += 1; }
      renderMonth(currentYear, currentMonth);
    });
    document.getElementById('reload-events').addEventListener('click', async ()=>{
      try{
        eventsAll = await loadEvents();
        holidaysAll = await loadHolidays();
        updateFilterOptions();
        renderMonth(currentYear, currentMonth);
      }catch(err){
        alert('読み込みエラー: '+err.message);
      }
    });
    
    // 団体名フィルタのドロップダウン制御
    const orgBtn = document.getElementById('filter-org-btn');
    const orgDropdown = document.getElementById('filter-org-dropdown');
    orgBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const isVisible = orgDropdown.style.display === 'block';
      document.getElementById('filter-loc-dropdown').style.display = 'none';
      orgDropdown.style.display = isVisible ? 'none' : 'block';
    });
    
    // 場所フィルタのドロップダウン制御
    const locBtn = document.getElementById('filter-loc-btn');
    const locDropdown = document.getElementById('filter-loc-dropdown');
    locBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const isVisible = locDropdown.style.display === 'block';
      orgDropdown.style.display = 'none';
      locDropdown.style.display = isVisible ? 'none' : 'block';
    });
    
    // ドロップダウン外クリックで閉じる
    document.addEventListener('click', ()=>{
      orgDropdown.style.display = 'none';
      locDropdown.style.display = 'none';
    });
    orgDropdown.addEventListener('click', (e)=>e.stopPropagation());
    locDropdown.addEventListener('click', (e)=>e.stopPropagation());
    
    // フィルタリセットボタン
    document.getElementById('filter-reset').addEventListener('click', ()=>{
      filterOrgs.clear();
      filterLocs.clear();
      updateFilterOptions();
      updateFilterButtonLabels();
      renderMonth(currentYear, currentMonth);
    });
  }

  // initial load and render
  (async function(){
    try{
      eventsAll = await loadEvents();
      holidaysAll = await loadHolidays();
      updateFilterOptions();
      wireControls();
      renderMonth(currentYear, currentMonth);
    }catch(err){
      const container = document.getElementById('table-container');
      container.innerHTML = `<p class="note">エラー: ${err.message}</p>`;
    }
  })();

})();
