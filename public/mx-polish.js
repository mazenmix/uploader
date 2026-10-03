const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];

const fileList=$('#fileList');
const activityView=$('#activityView');
const viewTitle=$('#viewTitle');
const contentTools=$('.content-tools');
const toastWrap=$('#toastWrap');

function toast(message,type='success'){
  if(!toastWrap)return;
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.textContent=message;
  toastWrap.appendChild(el);
  setTimeout(()=>el.remove(),3400);
}

const trashSvg=`<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function polishRows(root=document){
  $$('.file-name',root).forEach(name=>{
    const full=name.textContent?.trim()||'';
    if(full)name.title=full;
  });

  $$('[data-action="trash"]',root).forEach(button=>{
    if(button.dataset.mxTrashIcon==='1')return;
    button.dataset.mxTrashIcon='1';
    button.innerHTML=trashSvg;
    button.title='Delete';
    button.setAttribute('aria-label','Move file to Trash');
  });

  $$('.file-row',root).forEach(row=>{
    if(row.dataset.mxAnimated==='1')return;
    row.dataset.mxAnimated='1';
    row.classList.add('mx-enter');
    setTimeout(()=>row.classList.remove('mx-enter'),260);
  });
}

if(fileList){
  new MutationObserver(()=>polishRows(fileList)).observe(fileList,{childList:true,subtree:true});
  polishRows(fileList);
}

const clearActivity=document.createElement('button');
clearActivity.type='button';
clearActivity.id='clearActivityBtn';
clearActivity.className='mx-clear-activity-btn';
clearActivity.innerHTML='🗑 Clear';
contentTools?.appendChild(clearActivity);

function isActivityView(){return viewTitle?.textContent?.trim()==='Activity'}
function syncActivityButton(){clearActivity.classList.toggle('visible',isActivityView())}

async function clearActivityLog(){
  if(!isActivityView())return;
  const hasItems=activityView&&!activityView.querySelector('.empty-state')&&activityView.children.length>0;
  if(!hasItems){toast('Activity is already empty');return}
  if(!confirm('Clear all activity history?'))return;

  clearActivity.disabled=true;
  const previous=clearActivity.innerHTML;
  clearActivity.textContent='Clearing…';
  try{
    const token=sessionStorage.getItem('mx_admin_token')||'';
    const response=await fetch('/api/activity-clear',{method:'POST',headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`);

    if(activityView)activityView.innerHTML='<div class="empty-state">No activity yet.</div>';
    toast(data.deleted?`Activity cleared · ${data.deleted} removed`:'Activity cleared');

    /* Re-query through the app immediately so there is never a manual-refresh step. */
    setTimeout(()=>document.querySelector('[data-topview="activity"]')?.click(),40);
  }catch(error){
    toast(error.message||'Could not clear activity','error');
  }finally{
    clearActivity.disabled=false;
    clearActivity.innerHTML=previous;
  }
}

clearActivity.addEventListener('click',clearActivityLog);

if(viewTitle){
  new MutationObserver(syncActivityButton).observe(viewTitle,{childList:true,subtree:true,characterData:true});
  syncActivityButton();
}

document.addEventListener('click',event=>{
  if(event.target.closest('[data-topview],[data-category],[data-folder]')){
    setTimeout(()=>{syncActivityButton();polishRows(fileList||document)},0);
  }
});

/* Refresh stale views automatically when the browser/tab comes back into focus.
   Existing create/rename/move/delete/upload actions already refresh themselves; this covers
   changes that happened while the tab was in the background, without a manual F5. */
let lastSoftRefresh=0;
function softRefresh(){
  const now=Date.now();
  if(now-lastSoftRefresh<2500)return;
  if(document.hidden)return;
  const modal=$('.modal-backdrop:not(.hidden)');
  const detail=$('#detailSection');
  if(modal||detail?.hidden===false)return;
  const active=$('.nav-btn.active[data-topview]');
  if(!active)return;
  lastSoftRefresh=now;
  active.click();
}

window.addEventListener('focus',()=>setTimeout(softRefresh,120));
window.addEventListener('online',()=>setTimeout(softRefresh,120));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(softRefresh,120)});
