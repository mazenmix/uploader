// MX File — Drive redesign hotfix controller 2026-10-04
(() => {
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];

  function install(){
    const fileList=$('#fileList');
    const bulkBar=$('#bulkBar');
    const bulkCount=$('#bulkCount');
    if(!fileList) return;

    // Real table header. It lives outside #fileList so dashboard renders cannot wipe it.
    let head=$('.drive-table-head');
    if(!head){
      head=document.createElement('div');
      head.className='drive-table-head';
      head.innerHTML='<span>Name</span><span>Size</span><span>Modified</span><span>Actions</span>';
      fileList.parentNode.insertBefore(head,fileList);
    }

    // Hide the bulk bar whenever selection count is zero.
    function syncBulk(){
      if(!bulkBar||!bulkCount) return;
      const n=parseInt((bulkCount.textContent||'0').replace(/\D/g,''),10)||0;
      bulkBar.hidden=n===0;
    }
    syncBulk();
    if(bulkCount) new MutationObserver(syncBulk).observe(bulkCount,{childList:true,characterData:true,subtree:true});

    // Defensive row repair: third-party/polish scripts can reshuffle widths; normalize after every render.
    function normalizeRows(){
      for(const row of $$('.file-row',fileList)){
        const name=$('.file-name',row);
        const copy=$('.file-copy',row);
        const main=$('.file-main',row);
        if(main){main.style.minWidth='0';main.style.width='100%'}
        if(copy){copy.style.minWidth='0';copy.style.maxWidth='100%'}
        if(name){
          name.style.whiteSpace='nowrap';
          name.style.overflow='hidden';
          name.style.textOverflow='ellipsis';
          name.style.wordBreak='normal';
          name.style.overflowWrap='normal';
          name.style.writingMode='horizontal-tb';
        }
      }
    }
    normalizeRows();
    new MutationObserver(()=>requestAnimationFrame(()=>{normalizeRows();syncBulk()})).observe(fileList,{childList:true,subtree:true});

    // Header only belongs to normal list/table mode. Hide for grid and empty activity views.
    function syncHead(){
      head.hidden=fileList.hidden || fileList.classList.contains('grid-layout');
    }
    syncHead();
    new MutationObserver(syncHead).observe(fileList,{attributes:true,attributeFilter:['class','hidden']});

    // When a selection checkbox becomes visible, give the name cell a little breathing room.
    fileList.addEventListener('change',syncBulk,true);
    document.addEventListener('click',()=>setTimeout(syncBulk,0),true);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
