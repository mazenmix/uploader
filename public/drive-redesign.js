// MX File — Drive-style layout controller (visual composition only)
(() => {
  const $ = (s,r=document) => r.querySelector(s);
  const $$ = (s,r=document) => [...r.querySelectorAll(s)];

  function run(){
    const topbar=$('.topbar'), topActions=$('.top-actions'), workspace=$('.workspace'), sidebar=$('.sidebar'), content=$('.content-area');
    if(!topbar||!topActions||!workspace||!sidebar||!content||document.body.dataset.driveRedesign==='1') return;
    document.body.dataset.driveRedesign='1';

    // Put the compact upload control into the navigation rail.
    const dropZone=$('#dropZone');
    if(dropZone) sidebar.prepend(dropZone);
    const selectBtn=$('#selectBtn');
    if(selectBtn) selectBtn.textContent='Upload';

    // Right side of top bar: view, sort, storage, avatar.
    const topTools=document.createElement('div');
    topTools.className='drive-top-tools';
    const contentTools=$('.content-tools');
    const storage=$('.storage-card');
    const profile=$('#profileBtn');
    if(contentTools) topTools.appendChild(contentTools);
    if(storage) topTools.appendChild(storage);
    if(profile) topTools.appendChild(profile);
    topbar.appendChild(topTools);

    // Drive-style navigation. Each item delegates to the app's existing controls.
    const nav=document.createElement('nav');
    nav.className='drive-nav';
    const items=[
      ['files','▢','My Files',()=>$('.nav-btn[data-topview="files"]')?.click()],
      ['shared','♧','Shared',()=>$('.nav-btn[data-topview="shared"]')?.click()],
      ['recent','◷','Recent',()=>$('.side-item[data-category="recent"]')?.click()],
      ['starred','☆','Starred',()=>$('.mx-pinned-filter')?.click()],
      ['trash','♲','Trash',()=>$('.nav-btn[data-topview="trash"]')?.click()]
    ];
    items.forEach(([key,ico,label,action],i)=>{
      const b=document.createElement('button');
      b.type='button'; b.className='drive-nav-btn'+(i===0?' active':''); b.dataset.driveView=key;
      b.innerHTML=`<span class="ico">${ico}</span><span class="txt">${label}</span>`;
      b.addEventListener('click',()=>{ $$('.drive-nav-btn').forEach(x=>x.classList.toggle('active',x===b)); action(); });
      nav.appendChild(b);
    });
    dropZone?.insertAdjacentElement('afterend',nav);

    // Storage summary at the bottom of the sidebar mirrors the live top meter.
    const mini=document.createElement('div');
    mini.className='drive-sidebar-storage';
    mini.innerHTML='<div class="storage-label"><span>☁</span><strong>Storage</strong></div><div class="storage-mini"><i></i></div><small>0 B / 10 GB</small>';
    nav.insertAdjacentElement('afterend',mini);
    const syncStorage=()=>{
      const used=$('#storageUsed')?.textContent||'0 B', pct=$('#storagePercent')?.textContent||'0%';
      $('small',mini).textContent=`${used} / 10 GB · ${pct}`;
      $('i',mini).style.width=pct.replace('<','') || '0%';
    };
    syncStorage();
    const storageUsed=$('#storageUsed'), storagePct=$('#storagePercent');
    if(storageUsed) new MutationObserver(syncStorage).observe(storageUsed,{childList:true,characterData:true,subtree:true});
    if(storagePct) new MutationObserver(syncStorage).observe(storagePct,{childList:true,characterData:true,subtree:true});

    // Main folder cards, populated with real file counts and real user folders.
    const folderGrid=document.createElement('section');
    folderGrid.className='main-folder-grid'; folderGrid.id='mainFolderGrid';
    const head=$('.content-head');
    head?.insertAdjacentElement('afterend',folderGrid);

    const filesHeading=document.createElement('div');
    filesHeading.className='drive-files-heading'; filesHeading.innerHTML='<h2>Files</h2>';
    const bulk=$('#bulkBar'), fileList=$('#fileList');
    if(bulk) bulk.insertAdjacentElement('beforebegin',filesHeading); else fileList?.insertAdjacentElement('beforebegin',filesHeading);

    const typeGroup=f=>{
      const name=String(f?.name||''), ext=(name.split('.').pop()||'').toLowerCase(), type=f?.contentType||'';
      if(type.startsWith('image/')||['png','jpg','jpeg','gif','webp','svg','heic'].includes(ext))return'images';
      if(type.startsWith('video/')||['mp4','mov','webm','mkv','avi'].includes(ext))return'videos';
      if(type.startsWith('audio/')||['mp3','wav','m4a','aac','ogg','flac'].includes(ext))return'audio';
      if(['apk','exe','msi','dmg','pkg','bat','cmd','appimage'].includes(ext))return'apps';
      if(type.includes('pdf')||type.startsWith('text/')||['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','rtf','csv'].includes(ext))return'documents';
      return'other';
    };
    const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const card=(name,count,action)=>{
      const b=document.createElement('button'); b.type='button'; b.className='main-folder-card';
      b.innerHTML=`<span class="main-folder-icon"></span><span class="main-folder-copy"><strong>${esc(name)}</strong><small>${count} item${count===1?'':'s'}</small></span><span class="main-folder-more">⋮</span>`;
      b.addEventListener('click',action); return b;
    };
    async function refreshFolderCards(){
      try{
        const token=sessionStorage.getItem('mx_admin_token')||'';
        if(!token) return;
        const r=await fetch('/api/files?view=files',{cache:'no-store',headers:{Authorization:`Bearer ${token}`}});
        if(!r.ok) return;
        const d=await r.json(), files=d.files||[], folders=d.folders||[];
        folderGrid.innerHTML='';
        const cats=[['Photos','images'],['Videos','videos'],['Music','audio'],['Documents','documents'],['Apps','apps'],['Others','other']];
        cats.forEach(([label,key])=>{
          const count=files.filter(f=>typeGroup(f)===key).length;
          folderGrid.appendChild(card(label,count,()=>document.querySelector(`.filter[data-filter="${key}"]`)?.click()));
        });
        folders.slice(0,2).forEach(f=>{
          const name=typeof f==='string'?f:f.name, count=files.filter(x=>x.folder===name).length;
          folderGrid.appendChild(card(name,count,()=>document.querySelector(`#folderList [data-folder="${CSS.escape(name)}"]`)?.click()));
        });
      }catch{}
    }
    refreshFolderCards();
    const listObserver=fileList?new MutationObserver(()=>{ clearTimeout(window.__mxDriveFolderTimer); window.__mxDriveFolderTimer=setTimeout(refreshFolderCards,250); }):null;
    if(fileList) listObserver.observe(fileList,{childList:true});

    // Keep the primary title matching the new visual language.
    const title=$('#viewTitle');
    const normalizeTitle=()=>{ if(title?.textContent.trim()==='Your files') title.textContent='My Files'; };
    normalizeTitle();
    if(title) new MutationObserver(normalizeTitle).observe(title,{childList:true,characterData:true,subtree:true});

    // Reflect legacy navigation state in the new rail.
    document.addEventListener('click',e=>{
      const t=e.target.closest?.('[data-topview], [data-category], .mx-pinned-filter'); if(!t) return;
      let key='files';
      if(t.matches('[data-topview="shared"]'))key='shared';
      else if(t.matches('[data-topview="trash"]'))key='trash';
      else if(t.matches('[data-category="recent"]'))key='recent';
      else if(t.matches('.mx-pinned-filter'))key='starred';
      $$('.drive-nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.driveView===key));
    });

    // New Folder remains available as a clean keyboard shortcut: Ctrl/Cmd + Shift + N.
    document.addEventListener('keydown',e=>{
      if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='n'){
        e.preventDefault(); document.querySelector('[data-quick="folder"]')?.click();
      }
    });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run,{once:true}); else run();
})();
