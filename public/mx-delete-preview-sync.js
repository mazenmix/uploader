const fileList=document.querySelector('#fileList');
const detailSection=document.querySelector('#detailSection');
const previewBox=document.querySelector('#previewBox');
const previewTitle=document.querySelector('#previewTitle');
const inspectorContent=document.querySelector('#inspectorContent');
const downloadBtn=document.querySelector('#downloadBtn');

function stopPreviewMedia(){
  if(!previewBox)return;
  previewBox.querySelectorAll('video,audio').forEach(media=>{
    try{media.pause()}catch{}
    media.removeAttribute('src');
    try{media.load()}catch{}
  });
  previewBox.querySelectorAll('iframe,img').forEach(el=>el.removeAttribute('src'));
}

function closeDeletedPreview(){
  stopPreviewMedia();
  if(detailSection)detailSection.hidden=true;
  if(previewBox)previewBox.innerHTML='';
  if(previewTitle)previewTitle.textContent='File';
  if(inspectorContent)inspectorContent.innerHTML='';
  if(downloadBtn){downloadBtn.href='#';downloadBtn.removeAttribute('download')}
}

if(fileList){
  const observer=new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.removedNodes){
        if(!(node instanceof Element))continue;
        const removedDeletingRow=node.matches?.('.file-row.mx-removing')
          ? node
          : node.querySelector?.('.file-row.mx-removing');
        if(!removedDeletingRow)continue;
        closeDeletedPreview();
        return;
      }
    }
  });
  observer.observe(fileList,{childList:true,subtree:true});
}
