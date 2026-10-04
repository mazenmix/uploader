// MX File final layout helper — category folders in the sidebar
(() => {
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];

  const typeGroup=file=>{
    const name=String(file?.name||''), ext=(name.split('.').pop()||'').toLowerCase(), type=file?.contentType||'';
    if(type.startsWith('image/')||['png','jpg','jpeg','gif','webp','svg','heic'].includes(ext))return'images';
    if(type.startsWith('video/')||['mp4','mov','webm','mkv','avi'].includes(ext))return'videos';
    if(type.startsWith('audio/')||['mp3','wav','m4a','aac','ogg','flac'].includes(ext))return'audio';
    if(['apk','exe','msi','dmg','pkg','bat','cmd','appimage'].includes(ext))return'apps';
    if(type.includes('pdf')||type.startsWith('text/')||['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','rtf','csv'].includes(ext))return'documents';
    return'other';
  };

  async function getCounts(){
    const blank={images:0,videos:0,audio:0,documents:0,apps:0,other:0};
    try{
      const token=sessionStorage.getItem('mx_admin_token')||'';
      if(!token)return blank;
      const r=await fetch('/api/files?view=files',{cache:'no-store',headers:{Authorization:`Bearer ${token}`}});
      if(!r.ok)return blank;
      const data=await r.json();
      for(const f of data.files||[]) blank[typeGroup(f)]++;
    }catch{}
    return blank;
  }

  function clickCategory(key){
    const filter=document.querySelector(`.filter[data-filter="${key}"]`);
    if(filter){filter.click();return;}
    document.querySelector(`.side-item[data-category="${key}"]`)?.click();
  }

  async function renderSidebarFolders(){
    const sidebar=$('.sidebar');
    if(!sidebar)return;
    let wrap=$('.drive-side-folders',sidebar);
    if(!wrap){
      const head=document.createElement('div');
      head.className='drive-category-head';
      head.innerHTML='<span>FOLDERS</span><button type="button" class="drive-new-folder" title="New folder">＋</button>';
      wrap=document.createElement('div');
      wrap.className='drive-side-folders';
      const nav=$('.drive-nav',sidebar);
      if(nav){nav.insertAdjacentElement('afterend',head);head.insertAdjacentElement('afterend',wrap)}
      else sidebar.append(head,wrap);
      $('.drive-new-folder',head)?.addEventListener('click',()=>document.querySelector('[data-quick="folder"]')?.click());
    }
    const counts=await getCounts();
    const items=[
      ['Photos','images'],['Videos','videos'],['Music','audio'],['Documents','documents'],['Apps','apps'],['Others','other']
    ];
    wrap.innerHTML='';
    for(const [label,key] of items){
      const b=document.createElement('button');
      b.type='button'; b.className='drive-side-folder'; b.dataset.folderType=key;
      b.innerHTML=`<span class="folder-ico"></span><span>${label}</span><small>${counts[key]||0}</small>`;
      b.addEventListener('click',()=>clickCategory(key));
      wrap.appendChild(b);
    }
  }

  function tidyLegacyFolderHead(){
    const old=$('.side-section-head');
    if(old) old.style.display='none';
    const list=$('#folderList');
    if(list && !list.previousElementSibling?.classList.contains('drive-real-folders-head')){
      const h=document.createElement('div');
      h.className='drive-real-folders-head';
      h.innerHTML='<span>MY FOLDERS</span><button type="button" title="New folder">＋</button>';
      h.querySelector('button').addEventListener('click',()=>document.querySelector('[data-quick="folder"]')?.click());
      list.insertAdjacentElement('beforebegin',h);
    }
  }

  async function init(){
    await renderSidebarFolders();
    tidyLegacyFolderHead();
    const fileList=$('#fileList');
    if(fileList){
      let timer=0;
      new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(renderSidebarFolders,300)}).observe(fileList,{childList:true,subtree:false});
    }
    document.addEventListener('click',e=>{
      if(e.target.closest('[data-quick="folder"],.folder-delete')) setTimeout(()=>{renderSidebarFolders();tidyLegacyFolderHead()},500);
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
