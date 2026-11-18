import { requireAdmin } from "../_lib/auth.js";
import { addActivity, createId, json, sanitizeFilename, sanitizeFolder, isSystemKey, objectName, objectId } from "../_lib/files.js";
const MAX_FILE_SIZE=10*1024*1024*1024;
export async function onRequest(context){const{request,env}=context,denied=requireAdmin(request,env);if(denied)return denied;if(!env.FILES)return json({error:"R2 binding FILES is not configured."},500);const url=new URL(request.url),action=url.searchParams.get("action");try{

if(request.method==="POST"&&action==="create"){
  const body=await request.json(),name=sanitizeFilename(body.name),folder=sanitizeFolder(body.folder),type=String(body.type||"application/octet-stream").slice(0,150),size=Number(body.size||0);
  if(!Number.isFinite(size)||size<=0)return json({error:"Invalid file size."},400);
  if(size>MAX_FILE_SIZE)return json({error:"This build accepts files up to 10 GiB."},413);
  let existing=null;
  if(body.checkConflict===true||body.replaceId){
    const objects=[];let cursor;
    do{const page=await env.FILES.list({limit:1000,cursor,include:["httpMetadata","customMetadata"]});objects.push(...page.objects.filter(o=>!isSystemKey(o.key)&&(o.customMetadata?.folder||"")===folder));cursor=page.truncated?page.cursor:undefined;}while(cursor);
    const normalized=name.toLowerCase(),matches=objects.filter(o=>objectName(o).toLowerCase()===normalized).sort((a,b)=>new Date(b.uploaded)-new Date(a.uploaded));
    if(body.replaceId){
      existing=matches.find(o=>objectId(o)===body.replaceId);
      if(!existing||existing.etag!==body.replaceEtag)return json({error:"The existing file changed. Please retry the upload."},409);
    }else if(matches.length){
      const occupied=new Set(objects.map(o=>objectName(o).toLowerCase()));
      const dot=name.lastIndexOf("."),ext=dot>0?name.slice(dot):"",stem=dot>0?name.slice(0,dot):name;
      let n=1,suggestedName;
      do{const suffix=" ("+n+++ ")";suggestedName=stem.slice(0,Math.max(1,180-ext.length-suffix.length))+suffix+ext;}while(occupied.has(suggestedName.toLowerCase()));
      return json({conflict:{id:objectId(matches[0]),name:objectName(matches[0]),size:matches[0].size,etag:matches[0].etag,suggestedName}});
    }
  }
  const id=existing?objectId(existing):createId(),key=existing?existing.key:id+"/"+name;
  const customMetadata=existing?{...(existing.customMetadata||{}),originalName:objectName(existing),folder}:{originalName:name,createdAt:new Date().toISOString(),public:"1",folder};
  const upload=await env.FILES.createMultipartUpload(key,{httpMetadata:{...(existing?.httpMetadata||{}),contentType:type},customMetadata});
  return json({id,key,uploadId:upload.uploadId,directUrl:url.origin+"/f/"+(customMetadata.alias||id)});
}
if(request.method==="PUT"&&action==="part"){const key=url.searchParams.get("key"),uploadId=url.searchParams.get("uploadId"),partNumber=Number(url.searchParams.get("partNumber"));if(!key||!uploadId||!Number.isInteger(partNumber)||partNumber<1||!request.body)return json({error:"Missing upload part parameters."},400);const upload=env.FILES.resumeMultipartUpload(key,uploadId);return json(await upload.uploadPart(partNumber,request.body))}
if(request.method==="POST"&&action==="complete"){const key=url.searchParams.get("key"),uploadId=url.searchParams.get("uploadId");if(!key||!uploadId)return json({error:"Missing upload completion parameters."},400);const body=await request.json(),parts=Array.isArray(body.parts)?body.parts:[];if(!parts.length)return json({error:"No uploaded parts were supplied."},400);parts.sort((a,b)=>a.partNumber-b.partNumber);const upload=env.FILES.resumeMultipartUpload(key,uploadId),object=await upload.complete(parts),id=key.split("/",1)[0];await addActivity(env.FILES,"file.uploaded",{id,name:key.split("/").slice(1).join("/"),size:object.size});return json({ok:true,id,key:object.key,size:object.size,etag:object.httpEtag,directUrl:`${url.origin}/f/${object.customMetadata?.alias||id}`})}
if(request.method==="DELETE"&&action==="abort"){const key=url.searchParams.get("key"),uploadId=url.searchParams.get("uploadId");if(!key||!uploadId)return json({error:"Missing abort parameters."},400);await env.FILES.resumeMultipartUpload(key,uploadId).abort();return new Response(null,{status:204})}
return json({error:"Unsupported upload action."},405)}catch(error){return json({error:error?.message||String(error)},500)}}
