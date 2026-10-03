/* MX File reactive state bridge.
   Loads before the app so every API mutation can update the UI immediately. */
(()=>{
  const nativeFetch=window.fetch.bind(window);
  const liveFiles=new Map();
  const trashFiles=new Map();
  let detailId='';
  let detailName='';

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];

  function parseJsonBody(body){
    if(typeof body!=='string')return{};
    try{return JSON.parse(body)||{}}catch{return{}}
  }
  function safeUrl(input){
    try{return new URL(typeof input==='string'?input:input?.url||'',location.origin)}catch{return null}
  }
  function methodOf(input,init){return String(init?.method||input?.method||'GET').toUpperCase()}

  function rememberFiles(data,view){
    const target=view==='trash'?trashFiles:liveFiles;
    target.clear();
    for(const file of data?.files||[])if(file?.id)target.set(file.id,file);
  }

  function stopPreviewMedia(){
    const box=$('#previewBox');
    if(!box)return;
    for(const media of $$('video,audio',box)){
      try{media.pause()}catch{}
      media.removeAttribute('src');
      $$('source',media).forEach(s=>s.removeAttribute('src'));
      try{media.load()}catch{}
    }
    $$('img,iframe',box).forEach(el=>el.removeAttribute('src'));
    box.replaceChildren();
  }

  function closeDetailNow(){
    const detail=$('#detailSection');
    if(!detail||detail.hidden)return;
    stopPreviewMedia();
    detail.classList.add('mx-live-closing');
    const finish=()=>{
      detail.hidden=true;
      detail.classList.remove('mx-live-closing');
      const title=$('#previewTitle');if(title)title.textContent='File';
      const inspector=$('#inspectorContent');if(inspector)inspector.replaceChildren();
      detailId='';detailName='';
    };
    matchMedia('(prefers-reduced-motion: reduce)').matches?finish():setTimeout(finish,170);
  }

  function removeRows(id){
    if(!id)return;
    const rows=$$(`.file-row[data-id="${CSS.escape(id)}"]`);
    for(const row of rows){
      row.classList.add('mx-live-removing');
      setTimeout(()=>row.remove(),210);
    }
  }

  function bumpCounter(selector,delta){
    const el=$(selector);if(!el)return;
    const n=Number(el.textContent||0);if(!Number.isFinite(n))return;
    el.textContent=String(Math.max(0,n+delta));
    el.classList.remove('mx-live-flash');void el.offsetWidth;el.classList.add('mx-live-flash');
  }

  function currentDetailMatches(id,record){
    if(!id)return false;
    if(detailId===id)return true;
    const title=$('#previewTitle')?.textContent?.trim()||'';
    if(record?.name&&title===record.name)return true;
    const media=$('#previewBox img,#previewBox video,#previewBox audio,#previewBox iframe');
    const src=media?.getAttribute('src')||'';
    if(src&&src.includes(`/f/${id}`))return true;
    return false;
  }

  function reconcileDetail(){
    const detail=$('#detailSection');
    if(!detail||detail.hidden)return;
    if(detailId&&!liveFiles.has(detailId)&&!trashFiles.has(detailId))closeDetailNow();
    else if(detailId&&!liveFiles.has(detailId)&&$('#viewTitle')?.textContent?.trim()!=='Trash')closeDetailNow();
  }

  function applyMutation(action,body){
    const id=String(body?.id||'');
    const live=liveFiles.get(id);
    const trash=trashFiles.get(id);

    if(action==='trash'){
      const record=live||trash;
      if(currentDetailMatches(id,record))closeDetailNow();
      removeRows(id);
      if(live){liveFiles.delete(id);trashFiles.set(id,{...live,trashedAt:new Date().toISOString()});bumpCounter('#countAll',-1);bumpCounter('#trashCount',1)}
      return;
    }
    if(action==='purge'){
      const record=trash||live;
      if(currentDetailMatches(id,record))closeDetailNow();
      removeRows(id);trashFiles.delete(id);bumpCounter('#trashCount',-1);return;
    }
    if(action==='restore'){
      removeRows(id);
      if(trash){trashFiles.delete(id);liveFiles.set(id,{...trash,trashedAt:''});bumpCounter('#trashCount',-1);bumpCounter('#countAll',1)}
      if(currentDetailMatches(id,trash))closeDetailNow();
      return;
    }
    if(action==='update'&&id){
      const record=liveFiles.get(id);
      if(record){
        if(Object.prototype.hasOwnProperty.call(body,'name'))record.name=body.name;
        if(Object.prototype.hasOwnProperty.call(body,'folder'))record.folder=body.folder;
        if(Object.prototype.hasOwnProperty.call(body,'alias'))record.alias=body.alias;
        liveFiles.set(id,record);
      }
      if(detailId===id&&body.name){const title=$('#previewTitle');if(title)title.textContent=body.name}
    }
  }

  window.fetch=async function(input,init={}){
    const url=safeUrl(input),method=methodOf(input,init),body=parseJsonBody(init?.body);
    const response=await nativeFetch(input,init);
    if(!url||!response.ok)return response;

    if(method==='GET'&&url.pathname==='/api/files'){
      response.clone().json().then(data=>{
        rememberFiles(data,url.searchParams.get('view')==='trash'?'trash':'files');
        queueMicrotask(reconcileDetail);
      }).catch(()=>{});
      return response;
    }

    if(url.pathname==='/api/manage'&&method==='POST'){
      const action=url.searchParams.get('action')||'';
      queueMicrotask(()=>{
        applyMutation(action,body);
        document.dispatchEvent(new CustomEvent('mx:mutation',{detail:{action,body}}));
      });
    }
    if(url.pathname==='/api/empty-trash'&&method==='POST'){
      queueMicrotask(()=>{
        for(const id of [...trashFiles.keys()])removeRows(id);
        trashFiles.clear();
        const c=$('#trashCount');if(c)c.textContent='0';
        if($('#viewTitle')?.textContent?.trim()==='Trash')closeDetailNow();
      });
    }
    if(url.pathname==='/api/activity-clear'&&method==='POST'){
      queueMicrotask(()=>{const v=$('#activityView');if(v)v.innerHTML='<div class="empty-state">No activity yet.</div>'});
    }
    return response;
  };

  /* Track exactly which file owns the current preview. */
  document.addEventListener('click',event=>{
    const row=event.target.closest?.('.file-row[data-id]');
    if(row&&!event.target.closest?.('.select-box')){
      const action=event.target.closest?.('[data-action]')?.dataset.action||'';
      if(!['trash','restore','purge','copy','share','qr','download'].includes(action)){
        detailId=row.dataset.id||'';
        detailName=row.querySelector('.file-name')?.textContent?.trim()||'';
      }
    }
    if(event.target.closest?.('#closeDetail')){detailId='';detailName=''}
  },true);

  /* Hard guarantee: deleting from the Preview always targets the previewed file,
     even if another script lost the selected-row state. */
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('#deleteBtn');if(!button)return;
    if(!detailId)return; // let the original handler work if no reliable preview id exists
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const record=liveFiles.get(detailId);
    const name=record?.name||detailName||$('#previewTitle')?.textContent?.trim()||'this file';
    if(!confirm(`Move ${name} to Trash?`))return;
    button.disabled=true;
    nativeFetch('/api/manage?action=trash',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${sessionStorage.getItem('mx_admin_token')||''}`},body:JSON.stringify({id:detailId})})
      .then(async response=>{
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`);
        applyMutation('trash',{id:detailId});
        const wrap=$('#toastWrap');if(wrap){const t=document.createElement('div');t.className='toast success';t.textContent='Moved to Trash';wrap.appendChild(t);setTimeout(()=>t.remove(),3000)}
      })
      .catch(error=>{const wrap=$('#toastWrap');if(wrap){const t=document.createElement('div');t.className='toast error';t.textContent=error.message||'Delete failed';wrap.appendChild(t);setTimeout(()=>t.remove(),3400)}})
      .finally(()=>{button.disabled=false});
  },true);

  /* Reconcile after any list redraw. This kills stale previews even if a legacy handler
     re-rendered the list after the mutation. */
  const list=$('#fileList');
  if(list)new MutationObserver(()=>queueMicrotask(reconcileDetail)).observe(list,{childList:true,subtree:true});
})();
