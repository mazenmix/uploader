const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];

const style=document.createElement('style');
style.textContent=`
.empty-trash-btn{display:none;min-height:39px;padding:0 14px;border:1px solid rgba(255,82,97,.55);border-radius:10px;background:linear-gradient(180deg,rgba(255,82,97,.16),rgba(255,82,97,.07));color:#ff7b87;font-weight:800;white-space:nowrap}
.empty-trash-btn:hover{border-color:rgba(255,82,97,.78);background:linear-gradient(180deg,rgba(255,82,97,.23),rgba(255,82,97,.1));box-shadow:0 0 18px rgba(255,82,97,.1)}
.empty-trash-btn.visible{display:inline-flex;align-items:center;justify-content:center;gap:7px}
@media(max-width:760px){.empty-trash-btn{width:100%;min-height:43px}.content-tools{flex-wrap:wrap}.empty-trash-btn.visible{order:10}}
`;
document.head.appendChild(style);

const tools=$('.content-tools');
const button=document.createElement('button');
button.className='empty-trash-btn';
button.type='button';
button.innerHTML='🗑 Empty Trash';
tools?.appendChild(button);

function isTrashView(){return $('#viewTitle')?.textContent?.trim()==='Trash'}
function syncVisibility(){button.classList.toggle('visible',isTrashView())}

async function emptyTrash(){
  const count=Number($('#trashCount')?.textContent||0);
  if(!count){return}
  const ok=confirm(`Empty Trash?\n\nThis will permanently delete ${count} item${count===1?'':'s'}. This cannot be undone.`);
  if(!ok)return;

  button.disabled=true;
  const old=button.innerHTML;
  button.textContent='Emptying…';
  try{
    const token=sessionStorage.getItem('mx_admin_token')||'';
    const response=await fetch('/api/empty-trash',{method:'POST',headers:{Authorization:`Bearer ${token}`}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`);

    const list=$('#fileList');
    if(list)list.innerHTML='<div class="empty-state">Trash is empty.</div>';
    const counter=$('#trashCount');if(counter)counter.textContent='0';
    const detail=$('#detailSection');if(detail)detail.hidden=true;

    const toastWrap=$('#toastWrap');
    if(toastWrap){const t=document.createElement('div');t.className='toast success';t.textContent=`Trash emptied${data.deleted?` · ${data.deleted} deleted`:''}`;toastWrap.appendChild(t);setTimeout(()=>t.remove(),3200)}

    setTimeout(()=>document.querySelector('[data-topview="trash"]')?.click(),0);
  }catch(error){
    const toastWrap=$('#toastWrap');
    if(toastWrap){const t=document.createElement('div');t.className='toast error';t.textContent=error.message;toastWrap.appendChild(t);setTimeout(()=>t.remove(),3600)}
  }finally{
    button.disabled=false;
    button.innerHTML=old;
  }
}

button.addEventListener('click',emptyTrash);

document.addEventListener('click',e=>{
  if(e.target.closest('[data-topview], [data-category], [data-folder]'))setTimeout(syncVisibility,0);
});

new MutationObserver(syncVisibility).observe($('#viewTitle'),{childList:true,subtree:true,characterData:true});
syncVisibility();
