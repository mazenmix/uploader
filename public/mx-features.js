const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];

const fileList=$('#fileList');
const filterBar=$('#filterBar');
const viewTitle=$('#viewTitle');
const activityView=$('#activityView');
const detailSection=$('#detailSection');
const toastWrap=$('#toastWrap');
const filesNav=$('[data-topview="files"]');
const globalSearch=$('#globalSearch');
const uploadQueue=$('#uploadQueue');
const fileInput=$('#fileInput');
const dropZone=$('#dropZone');

let filesMap=new Map();
let pins=new Set();
let pinOrder=new Map();
let customMode='';
let refreshPromise=null;
let lastRefresh=0;
let decorating=false;
let draggingId='';
let tooltipTimer=0;
let tooltipPoint={x:0,y:0};

function authHeaders(extra={}){return{...extra,Authorization:`Bearer ${sessionStorage.getItem('mx_admin_token')||''}`}}
async function api(path,options={}){
  const response=await fetch(path,{...options,cache:'no-store',headers:authHeaders(options.headers||{})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`);
  return data;
}
function toast(message,type='success'){
  if(!toastWrap)return;
  const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;toastWrap.appendChild(el);setTimeout(()=>el.remove(),3300)
}
function esc(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function extOf(name){return(String(name||'').split('.').pop()||'').toLowerCase()}
function typeGroup(file){const ext=extOf(file.name),type=file.contentType||'';if(type.startsWith('image/')||['png','jpg','jpeg','gif','webp','svg','heic'].includes(ext))return'images';if(type.startsWith('video/')||['mp4','mov','webm','mkv','avi'].includes(ext))return'videos';if(type.startsWith('audio/')||['mp3','wav','m4a','aac','ogg','flac'].includes(ext))return'audio';if(['apk','exe','msi','dmg','pkg','bat','cmd','appimage'].includes(ext))return'apps';if(type.includes('pdf')||type.startsWith('text/')||['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','rtf','csv'].includes(ext))return'documents';return'other'}
function iconFor(file){return({images:'IMG',videos:'▶',audio:'♪',documents:'DOC',apps:'FILE',other:'FILE'})[typeGroup(file)]}
function formatBytes(bytes){if(!Number.isFinite(Number(bytes))||Number(bytes)<=0)return'0 B';const n=Number(bytes),u=['B','KB','MB','GB','TB'],i=Math.min(Math.floor(Math.log(n)/Math.log(1024)),u.length-1),v=n/1024**i;return`${v>=10||i===0?v.toFixed(0):v.toFixed(1)} ${u[i]}`}
function formatDate(value){const d=new Date(value);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(d)}
async function copyText(text){try{await navigator.clipboard.writeText(text)}catch{const area=document.createElement('textarea');area.value=text;document.body.appendChild(area);area.select();document.execCommand('copy');area.remove()}}

function localRecent(){try{return JSON.parse(localStorage.getItem('mx_recent_files')||'{}')||{}}catch{return{}}}
function markRecent(id){if(!id)return;const data=localRecent();data[id]=Date.now();const entries=Object.entries(data).sort((a,b)=>b[1]-a[1]).slice(0,100);localStorage.setItem('mx_recent_files',JSON.stringify(Object.fromEntries(entries)))}
function recentScore(file){const local=Number(localRecent()[file.id]||0),opened=Date.parse(file.lastAccessed||'')||0,uploaded=Date.parse(file.uploaded||'')||0;return Math.max(local,opened,uploaded)}

async function refreshData(force=false){
  if(refreshPromise)return refreshPromise;
  if(!force&&Date.now()-lastRefresh<900&&filesMap.size)return;
  refreshPromise=(async()=>{
    const [fileResult,pinResult]=await Promise.allSettled([api('/api/files?view=files'),api('/api/pin')]);
    if(fileResult.status==='fulfilled')filesMap=new Map((fileResult.value.files||[]).map(file=>[file.id,file]));
    if(pinResult.status==='fulfilled'){
      const records=pinResult.value.pins||[];pins=new Set(records.map(p=>p.id));pinOrder=new Map(records.map((p,i)=>[p.id,i]));
    }
    lastRefresh=Date.now();
  })().finally(()=>refreshPromise=null);
  return refreshPromise;
}

function addPinnedFilter(){
  if(!filterBar||$('.mx-pinned-filter',filterBar))return;
  const all=$('.filter[data-filter="all"]',filterBar),button=document.createElement('button');
  button.type='button';button.className='filter mx-pinned-filter';button.innerHTML='<span>★</span> Pinned';
  all?.insertAdjacentElement('afterend',button);
  button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();enterCustomMode('pinned')});
}
addPinnedFilter();

function rowHtml(file,mode){
  const marker=mode==='recent'?'<span class="mx-recent-mark">Recent</span>':'';
  return`<div class="file-row" data-id="${esc(file.id)}" data-mx-custom="${esc(mode)}"><input class="select-box" type="checkbox" hidden><div class="file-main"><div class="file-icon">${iconFor(file)}</div><div class="file-copy"><div class="file-name">${esc(file.name)}</div><div class="file-sub">${esc(extOf(file.name).toUpperCase()||'FILE')}${marker}</div></div></div><div class="file-size">${formatBytes(Number(file.size)||0)}</div><div class="file-date">${formatDate(file.uploaded)}</div><div class="file-downloads">${Number(file.downloads||0)} ↓</div><div class="file-actions"><button class="icon-btn" data-action="preview" title="Preview">◉</button><button class="icon-btn" data-action="download" title="Download">⇩</button><button class="icon-btn" data-action="copy" title="Copy link">🔗</button><button class="icon-btn" data-action="share" title="Share">⌯</button><button class="icon-btn" data-action="qr" title="QR code">▦</button><button class="icon-btn" data-action="edit" title="Details">✎</button><button class="icon-btn" data-action="trash" title="Delete">•••</button></div></div>`
}
function customFiles(mode){
  const all=[...filesMap.values()];
  if(mode==='pinned')return all.filter(f=>pins.has(f.id)).sort((a,b)=>(pinOrder.get(a.id)??9999)-(pinOrder.get(b.id)??9999));
  return all.sort((a,b)=>recentScore(b)-recentScore(a)).slice(0,40);
}
function setCustomUi(mode){
  if(!fileList)return;
  if(activityView)activityView.hidden=true;
  fileList.hidden=false;
  if(detailSection)detailSection.hidden=true;
  if(filterBar)filterBar.hidden=false;
  $$('.side-item').forEach(b=>b.classList.toggle('active',mode==='recent'&&b.dataset.category==='recent'));
  $$('.filter').forEach(b=>b.classList.toggle('active',mode==='pinned'&&b.classList.contains('mx-pinned-filter')));
  if(viewTitle)viewTitle.textContent=mode==='pinned'?'Pinned files':'Recent';
}
function renderCustomMode(){
  if(!customMode||!fileList)return;
  setCustomUi(customMode);
  const list=customFiles(customMode);
  if(!list.length){fileList.innerHTML=`<div class="empty-state" data-mx-custom="${esc(customMode)}">${customMode==='pinned'?'No pinned files yet. Tap ★ beside a file name.':'No recent files yet.'}</div>`;return}
  fileList.innerHTML=list.map(file=>rowHtml(file,customMode)).join('');
  decorateRows();
}
async function enterCustomMode(mode){
  customMode=mode;
  filesNav?.click();
  await refreshData(true).catch(()=>{});
  renderCustomMode();
}
function customStillRendered(){
  if(!customMode||!fileList)return false;
  const child=fileList.firstElementChild;
  return Boolean(child?.dataset?.mxCustom===customMode);
}

function decorateRows(){
  if(decorating||!fileList)return;decorating=true;
  try{
    for(const row of $$('.file-row',fileList)){
      const id=row.dataset.id;if(!id)continue;
      row.draggable=true;
      row.classList.toggle('mx-pinned-row',pins.has(id));
      const copy=$('.file-copy',row),name=$('.file-name',row);
      if(copy&&name&&!$('.mx-name-line',copy)){
        const line=document.createElement('div');line.className='mx-name-line';name.before(line);line.appendChild(name);
        const pin=document.createElement('button');pin.type='button';pin.className='mx-pin';pin.dataset.pinId=id;pin.title='Pin file';pin.setAttribute('aria-label','Pin file');pin.textContent='★';line.prepend(pin);
      }
      const pin=$('.mx-pin',row);if(pin){pin.classList.toggle('pinned',pins.has(id));pin.title=pins.has(id)?'Unpin file':'Pin file';pin.setAttribute('aria-label',pin.title)}
      const file=filesMap.get(id);if(file)row.dataset.mxKnown='1';
    }
    sortPinnedRows();
  }finally{decorating=false}
}
function sortPinnedRows(){
  if(customMode||!fileList||!pins.size)return;
  const rows=$$('.file-row',fileList);if(rows.length<2)return;
  const desired=[...rows.filter(r=>pins.has(r.dataset.id)),...rows.filter(r=>!pins.has(r.dataset.id))];
  if(desired.every((row,i)=>rows[i]===row))return;
  const frag=document.createDocumentFragment();desired.forEach(row=>frag.appendChild(row));fileList.appendChild(frag)
}

const listObserver=fileList?new MutationObserver(async()=>{
  if(customMode&&!customStillRendered()){await refreshData().catch(()=>{});renderCustomMode();return}
  if(!customMode){
    const unknown=$$('.file-row',fileList).some(row=>!filesMap.has(row.dataset.id));
    if(unknown)await refreshData(true).catch(()=>{});
    decorateRows();
  }
}):null;
if(fileList)listObserver.observe(fileList,{childList:true,subtree:true});
refreshData().then(decorateRows).catch(()=>{});

/* Pinned files */
document.addEventListener('click',async event=>{
  const button=event.target.closest('.mx-pin');if(!button)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  const id=button.dataset.pinId;if(!id)return;
  const next=!pins.has(id);
  next?pins.add(id):pins.delete(id);decorateRows();
  if(customMode==='pinned'&&!next)button.closest('.file-row')?.remove();
  try{
    await api('/api/pin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,pinned:next})});
    toast(next?'Pinned to top':'Unpinned');await refreshData(true).catch(()=>{});if(customMode)renderCustomMode();else decorateRows();
  }catch(error){next?pins.delete(id):pins.add(id);decorateRows();toast(error.message,'error')}
},true);

/* Smart Recent: uploaded + opened + downloaded, newest interaction first. */
document.addEventListener('click',event=>{
  const recent=event.target.closest('[data-category="recent"]');
  if(recent&&event.isTrusted){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();enterCustomMode('recent');return}
  if(event.isTrusted&&event.target.closest('[data-topview], [data-category]:not([data-category="recent"]), [data-folder], .filter:not(.mx-pinned-filter)'))customMode='';
},true);
document.addEventListener('click',event=>{
  const row=event.target.closest('.file-row');if(!row)return;
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(!action||['preview','download'].includes(action))markRecent(row.dataset.id);
});

/* Drag a file straight onto a folder. */
document.addEventListener('dragstart',event=>{
  const row=event.target.closest?.('.file-row');if(!row)return;draggingId=row.dataset.id||'';if(!draggingId)return;row.classList.add('mx-dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',draggingId)
});
document.addEventListener('dragend',event=>{event.target.closest?.('.file-row')?.classList.remove('mx-dragging');draggingId='';$$('.mx-drop-target').forEach(x=>x.classList.remove('mx-drop-target'))});
function folderTarget(node){return node?.closest?.('[data-folder], .side-item[data-category="all"]')}
document.addEventListener('dragover',event=>{if(!draggingId)return;const target=folderTarget(event.target);if(!target)return;event.preventDefault();event.dataTransfer.dropEffect='move';$$('.mx-drop-target').forEach(x=>x.classList.remove('mx-drop-target'));(target.closest('.folder-row')||target).classList.add('mx-drop-target')});
document.addEventListener('drop',async event=>{
  if(!draggingId)return;const target=folderTarget(event.target);if(!target)return;event.preventDefault();const id=draggingId,folder=target.dataset.folder||'';draggingId='';$$('.mx-drop-target').forEach(x=>x.classList.remove('mx-drop-target'));
  try{await api('/api/manage?action=update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,folder})});toast(folder?`Moved to ${folder}`:'Moved to All Files');await refreshData(true);if(customMode)renderCustomMode();else($('.nav-btn.active[data-topview]')||filesNav)?.click()}catch(error){toast(error.message,'error')}
});

/* Micro-feedback and smooth deletion. */
document.addEventListener('click',event=>{
  const copy=event.target.closest('[data-action="copy"],#copyBtn');if(!copy)return;
  const old=copy.innerHTML;setTimeout(()=>{copy.classList.add('mx-copy-ok');copy.innerHTML='✓';setTimeout(()=>{copy.classList.remove('mx-copy-ok');copy.innerHTML=old},850)},40)
});
async function deleteFile(id,row){
  const file=filesMap.get(id),name=file?.name||$('.file-name',row)?.textContent||'this file';
  if(!confirm(`Move ${name} to Trash?`))return;
  row?.classList.add('mx-removing');
  try{
    await api('/api/manage?action=trash',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
    filesMap.delete(id);pins.delete(id);setTimeout(()=>row?.remove(),230);toast('Moved to Trash');
    await refreshData(true).catch(()=>{});if(customMode)renderCustomMode();else setTimeout(()=>($('.nav-btn.active[data-topview]')||filesNav)?.click(),240)
  }catch(error){row?.classList.remove('mx-removing');toast(error.message,'error')}
}
document.addEventListener('click',event=>{
  const trash=event.target.closest('[data-action="trash"]');
  const detailDelete=event.target.closest('#deleteBtn');
  if(!trash&&!detailDelete)return;
  const row=trash?.closest('.file-row')||$('.file-row.selected',fileList);if(!row)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();deleteFile(row.dataset.id,row)
},true);

/* Temporary share links — 1h / 24h / 7d / never. */
const shareMenu=document.createElement('div');shareMenu.className='mx-share-menu';shareMenu.innerHTML='<div class="mx-share-title">Share link expires</div><button class="mx-share-option" data-duration="1h"><span>1 hour</span><span>Temporary</span></button><button class="mx-share-option" data-duration="24h"><span>24 hours</span><span>Recommended</span></button><button class="mx-share-option" data-duration="7d"><span>7 days</span><span>Long share</span></button><button class="mx-share-option" data-duration="never"><span>Never</span><span>Permanent</span></button>';document.body.appendChild(shareMenu);
let shareId='';
function showShareMenu(target,id){shareId=id;const rect=target.getBoundingClientRect(),w=220,left=Math.max(9,Math.min(innerWidth-w-9,rect.right-w)),estimated=205,top=rect.bottom+7+estimated>innerHeight?Math.max(9,rect.top-estimated-7):rect.bottom+7;shareMenu.style.left=`${left}px`;shareMenu.style.top=`${top}px`;shareMenu.classList.add('open')}
function closeShareMenu(){shareMenu.classList.remove('open');shareId=''}
document.addEventListener('click',event=>{
  const share=event.target.closest('[data-action="share"],#shareBtn');if(!share)return;
  const row=share.closest('.file-row')||$('.file-row.selected',fileList);if(!row)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();showShareMenu(share,row.dataset.id)
},true);
shareMenu.addEventListener('click',async event=>{
  const option=event.target.closest('[data-duration]');if(!option||!shareId)return;const id=shareId,duration=option.dataset.duration;$$('.mx-share-option',shareMenu).forEach(b=>b.disabled=true);option.querySelector('span:first-child').textContent='Creating…';
  try{const result=await api('/api/share',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,duration})});await copyText(result.url);markRecent(id);toast(`${duration==='never'?'Permanent':duration} share link copied`);closeShareMenu()}catch(error){toast(error.message,'error')}finally{shareMenu.innerHTML='<div class="mx-share-title">Share link expires</div><button class="mx-share-option" data-duration="1h"><span>1 hour</span><span>Temporary</span></button><button class="mx-share-option" data-duration="24h"><span>24 hours</span><span>Recommended</span></button><button class="mx-share-option" data-duration="7d"><span>7 days</span><span>Long share</span></button><button class="mx-share-option" data-duration="never"><span>Never</span><span>Permanent</span></button>'}
});
document.addEventListener('pointerdown',event=>{if(!shareMenu.contains(event.target)&&!event.target.closest('[data-action="share"],#shareBtn'))closeShareMenu()});

/* Rich file tooltip without adding permanent UI. */
const tooltip=document.createElement('div');tooltip.className='mx-file-tooltip';document.body.appendChild(tooltip);
function hideTooltip(){clearTimeout(tooltipTimer);tooltip.classList.remove('show')}
function showTooltip(row){const file=filesMap.get(row.dataset.id);if(!file)return;tooltip.innerHTML=`<strong>${esc(file.name)}</strong><div class="mx-tip-grid"><span>Type</span><span>${esc((extOf(file.name)||typeGroup(file)).toUpperCase())}</span><span>Size</span><span>${formatBytes(file.size)}</span><span>Uploaded</span><span>${esc(formatDate(file.uploaded))}</span><span>Downloads</span><span>${Number(file.downloads||0).toLocaleString()}</span></div>`;const w=290,x=Math.min(innerWidth-w-10,Math.max(10,tooltipPoint.x+14)),y=Math.min(innerHeight-150,Math.max(10,tooltipPoint.y+15));tooltip.style.left=`${x}px`;tooltip.style.top=`${y}px`;tooltip.classList.add('show')}
document.addEventListener('mousemove',event=>{tooltipPoint={x:event.clientX,y:event.clientY}});
document.addEventListener('mouseover',event=>{if(matchMedia('(pointer:coarse)').matches)return;const row=event.target.closest('.file-row');if(!row||row.contains(event.relatedTarget))return;clearTimeout(tooltipTimer);tooltipTimer=setTimeout(()=>showTooltip(row),520)});
document.addEventListener('mouseout',event=>{const row=event.target.closest('.file-row');if(row&&!row.contains(event.relatedTarget))hideTooltip()});

/* Upload speed + ETA, derived from the existing progress updates. */
let uploadCandidates=[];
function rememberUploads(fileListLike){for(const file of [...(fileListLike||[])])uploadCandidates.push({name:file.name,size:file.size,bound:false})}
fileInput?.addEventListener('change',()=>rememberUploads(fileInput.files),true);
dropZone?.addEventListener('drop',event=>rememberUploads(event.dataTransfer?.files),true);
function rateText(rate){if(!Number.isFinite(rate)||rate<=0)return'—';if(rate>=1024**3)return`${(rate/1024**3).toFixed(1)} GB/s`;if(rate>=1024**2)return`${(rate/1024**2).toFixed(1)} MB/s`;return`${Math.max(1,rate/1024).toFixed(0)} KB/s`}
function etaText(seconds){if(!Number.isFinite(seconds)||seconds<0)return'—';if(seconds<60)return`${Math.max(1,Math.ceil(seconds))}s left`;const m=Math.ceil(seconds/60);return`${m}m left`}
function bindQueueItem(item){if(item.dataset.mxTelemetryBound==='1')return;const name=$('.queue-name',item)?.textContent||'',candidate=uploadCandidates.find(x=>!x.bound&&x.name===name);if(!candidate)return;candidate.bound=true;item.dataset.mxTelemetryBound='1';item._mxTelemetry={size:candidate.size,start:performance.now()}}
function enhanceQueue(){if(!uploadQueue)return;for(const item of $$('.queue-item',uploadQueue)){bindQueueItem(item);const state=item._mxTelemetry,meta=$('.queue-meta',item);if(!state||!meta)continue;const text=meta.textContent.trim();if(/(?:KB|MB|GB)\/s/.test(text))continue;const match=text.match(/^(\d+(?:\.\d+)?)%$/);if(!match)continue;const p=Number(match[1]);if(!(p>0&&p<100))continue;const elapsed=(performance.now()-state.start)/1000,done=state.size*p/100,rate=done/Math.max(.2,elapsed),eta=(state.size-done)/Math.max(1,rate);meta.classList.add('mx-telemetry');meta.innerHTML=`<b>${Math.round(p)}%</b> · ${rateText(rate)} · ${etaText(eta)}`}}
if(uploadQueue)new MutationObserver(enhanceQueue).observe(uploadQueue,{childList:true,subtree:true,characterData:true});

/* Ctrl+K command palette */
const palette=document.createElement('div');palette.className='mx-command-backdrop';palette.innerHTML='<div class="mx-command" role="dialog" aria-modal="true" aria-label="MX File commands"><div class="mx-command-search"><span>⌕</span><input type="text" autocomplete="off" spellcheck="false" placeholder="Search files or type a command…"><kbd>ESC</kbd></div><div class="mx-command-results"></div></div>';document.body.appendChild(palette);
const paletteInput=$('input',palette),paletteResults=$('.mx-command-results',palette);
function paletteItem({icon,label,sub='',type,id='',danger=false,tail=''}){return`<button class="mx-command-item${danger?' danger':''}" data-cmd-type="${esc(type)}" ${id?`data-cmd-id="${esc(id)}"`:''}><span class="ico">${icon}</span><span><strong>${esc(label)}</strong>${sub?`<small>${esc(sub)}</small>`:''}</span><em>${esc(tail)}</em></button>`}
function renderPalette(){
  const q=paletteInput.value.trim().toLowerCase(),all=[...filesMap.values()];let html='';
  if(q.startsWith('trash ')){
    const term=q.slice(6).trim(),matches=all.filter(f=>!term||f.name.toLowerCase().includes(term)).slice(0,14);html='<div class="mx-command-group">Delete to Trash</div>'+matches.map(f=>paletteItem({icon:'🗑',label:f.name,sub:formatBytes(f.size),type:'trash-file',id:f.id,danger:true,tail:'Trash'})).join('');
  }else{
    const commands=[
      {icon:'⇧',label:'Upload files',sub:'Choose files from this device',type:'upload',tail:'Action'},
      {icon:'＋',label:'New folder',sub:'Create a folder',type:'folder',tail:'Action'},
      {icon:'★',label:'Pinned files',sub:'Show your favorites',type:'pinned',tail:'View'},
      {icon:'🗑',label:'Trash',sub:'Open deleted files',type:'trash',tail:'View'},
      {icon:'◷',label:'Activity',sub:'Open activity history',type:'activity',tail:'View'},
      {icon:'⚙',label:'Settings',sub:'Open MX File settings',type:'settings',tail:'Action'}
    ].filter(c=>!q||`${c.label} ${c.sub}`.toLowerCase().includes(q));
    if(commands.length)html+='<div class="mx-command-group">Commands</div>'+commands.map(paletteItem).join('');
    const matches=all.filter(f=>!q||`${f.name} ${f.id} ${f.folder||''}`.toLowerCase().includes(q)).sort((a,b)=>(pins.has(b.id)?1:0)-(pins.has(a.id)?1:0)||recentScore(b)-recentScore(a)).slice(0,12);
    if(matches.length)html+='<div class="mx-command-group">Files</div>'+matches.map(f=>paletteItem({icon:pins.has(f.id)?'★':iconFor(f),label:f.name,sub:`${formatBytes(f.size)}${f.folder?` · ${f.folder}`:''}`,type:'file',id:f.id,tail:'Open'})).join('');
  }
  paletteResults.innerHTML=html||'<div class="mx-command-empty">No matching files or commands.</div>';
}
async function openPalette(){await refreshData(true).catch(()=>{});palette.classList.add('open');paletteInput.value='';renderPalette();setTimeout(()=>paletteInput.focus(),20)}
function closePalette(){palette.classList.remove('open');paletteInput.blur()}
async function revealFile(id){customMode='';closePalette();markRecent(id);filesNav?.click();if(globalSearch){globalSearch.value=id;globalSearch.dispatchEvent(new Event('input',{bubbles:true}))}let tries=0;const timer=setInterval(()=>{const row=fileList?.querySelector(`.file-row[data-id="${CSS.escape(id)}"]`);if(row){clearInterval(timer);row.click();row.scrollIntoView({behavior:'smooth',block:'center'})}else if(++tries>14)clearInterval(timer)},70)}
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();palette.classList.contains('open')?closePalette():openPalette()}else if(event.key==='Escape'&&palette.classList.contains('open'))closePalette();else if(event.key==='Enter'&&palette.classList.contains('open')&&document.activeElement===paletteInput){event.preventDefault();$('.mx-command-item',paletteResults)?.click()}});
palette.addEventListener('pointerdown',event=>{if(event.target===palette)closePalette()});
paletteInput.addEventListener('input',renderPalette);
paletteResults.addEventListener('click',event=>{
  const item=event.target.closest('[data-cmd-type]');if(!item)return;const type=item.dataset.cmdType,id=item.dataset.cmdId;
  if(type==='file')return revealFile(id);
  if(type==='trash-file'){closePalette();return deleteFile(id,fileList?.querySelector(`.file-row[data-id="${CSS.escape(id)}"]`))}
  closePalette();
  if(type==='upload')fileInput?.click();
  else if(type==='folder')$('[data-quick="folder"]')?.click();
  else if(type==='pinned')enterCustomMode('pinned');
  else if(type==='trash')$('[data-topview="trash"]')?.click();
  else if(type==='activity')$('[data-topview="activity"]')?.click();
  else if(type==='settings')$('[data-quick="settings"]')?.click();
});

/* Keep metadata fresh after tab focus without adding polling or visual noise. */
window.addEventListener('focus',()=>refreshData(true).then(()=>{if(customMode)renderCustomMode();else decorateRows()}).catch(()=>{}));
