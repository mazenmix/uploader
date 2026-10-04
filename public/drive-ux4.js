// MX Drive UX polish — 2026-10-04
(() => {
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];

  function init(){
    const title=$('#viewTitle');
    const filterBar=$('#filterBar');
    const detail=$('#detailSection');
    const closeDetail=$('#closeDetail');

    // Rename normal files view to My Drive without disturbing Recent/Pinned modes.
    const normalizeTitle=()=>{
      if(!title)return;
      const t=title.textContent.trim();
      if(t==='Your files'||t==='My Files') title.textContent='My Drive';
    };
    normalizeTitle();
    if(title) new MutationObserver(normalizeTitle).observe(title,{childList:true,characterData:true,subtree:true});

    // Match sidebar wording to Google Drive-style terminology.
    const renameNav=()=>{
      const txt=$('.drive-nav-btn[data-drive-view="files"] .txt');
      if(txt) txt.textContent='My Drive';
      const legacy=$('.side-item[data-category="all"] b');
      if(legacy) legacy.textContent='My Drive';
    };
    renameNav();
    setTimeout(renameNav,100);

    // Compact Type dropdown replaces the row of category pills.
    if(filterBar && !$('.drive-filter-dropdown')){
      const wrap=document.createElement('div');
      wrap.className='drive-filter-dropdown';
      wrap.innerHTML=`<button type="button" class="drive-filter-trigger" aria-expanded="false"><span>Type</span><span class="chev">▼</span></button><div class="drive-filter-menu" role="menu"></div>`;
      filterBar.insertAdjacentElement('afterend',wrap);
      const menu=$('.drive-filter-menu',wrap), trigger=$('.drive-filter-trigger',wrap);
      const options=[
        ['all','All'],['pinned','Pinned'],['images','Images'],['videos','Videos'],['audio','Audio'],['documents','Documents'],['apps','Apps'],['other','Other']
      ];
      const select=(key)=>{
        if(key==='pinned') $('.mx-pinned-filter')?.click();
        else $(`.filter[data-filter="${key}"]`)?.click();
        $$('.drive-filter-option',menu).forEach(b=>b.classList.toggle('active',b.dataset.key===key));
        wrap.classList.remove('open'); trigger.setAttribute('aria-expanded','false');
      };
      for(const [key,label] of options){
        const b=document.createElement('button');
        b.type='button'; b.className='drive-filter-option'+(key==='all'?' active':''); b.dataset.key=key;
        b.innerHTML=`<span>${label}</span><span class="tick">✓</span>`;
        b.addEventListener('click',()=>select(key));
        menu.appendChild(b);
      }
      trigger.addEventListener('click',e=>{
        e.stopPropagation();
        const open=!wrap.classList.contains('open');
        wrap.classList.toggle('open',open); trigger.setAttribute('aria-expanded',String(open));
      });
      document.addEventListener('click',e=>{
        if(!wrap.contains(e.target)){wrap.classList.remove('open');trigger.setAttribute('aria-expanded','false')}
      });
      document.addEventListener('click',e=>{
        const f=e.target.closest?.('.filter');
        if(!f)return;
        let key=f.dataset.filter||'';
        if(f.classList.contains('mx-pinned-filter'))key='pinned';
        if(key) $$('.drive-filter-option',menu).forEach(b=>b.classList.toggle('active',b.dataset.key===key));
      },true);
    }

    // Clicking blank space anywhere outside the drawer closes it.
    document.addEventListener('click',e=>{
      if(!detail || detail.hidden || detail.contains(e.target)) return;
      if(e.target.closest?.('.file-row,button,a,input,select,textarea,label,.drive-filter-dropdown')) return;
      closeDetail?.click();
    });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
