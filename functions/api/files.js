import { requireAdmin } from "../_lib/auth.js";
import { fileRecord, isSystemKey, isTrashKey, json, readJsonObject } from "../_lib/files.js";

async function listAll(bucket){const objects=[];let cursor;do{const page=await bucket.list({limit:1000,cursor,include:["httpMetadata","customMetadata"]});objects.push(...page.objects);cursor=page.truncated?page.cursor:undefined;}while(cursor);return objects;}

export async function onRequestGet({request,env}){
  const denied=requireAdmin(request,env);if(denied)return denied;if(!env.FILES)return json({error:"R2 binding FILES is not configured."},500);
  try{
    const url=new URL(request.url),view=url.searchParams.get("view")||"files",objects=await listAll(env.FILES);
    const stats=new Map(objects.filter(o=>o.key.startsWith("_mx/stats/")).map(o=>{const id=o.key.split("/")[2]?.replace(/\.json$/,'')||'';return[id,{downloads:Number(o.customMetadata?.downloads||0),lastAccessed:o.customMetadata?.lastAccessed||''}];}));
    const live=objects.filter(o=>!isSystemKey(o.key)).map(o=>({...fileRecord(o),...(stats.get(o.key.split("/",1)[0])||{downloads:0,lastAccessed:''})}));
    const trash=objects.filter(o=>isTrashKey(o.key)).map(o=>({...fileRecord(o),...(stats.get(o.key.split("/")[2])||{downloads:0,lastAccessed:''})}));
    const files=view==="trash"?trash:live,used=live.reduce((sum,file)=>sum+file.size,0),folderObjects=objects.filter(o=>o.key.startsWith("_mx/folders/")&&o.key.endsWith(".json")),folders=[];
    for(const object of folderObjects.slice(0,200)){const value=await readJsonObject(env.FILES,object.key,null);if(value?.name)folders.push(value);}folders.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    return json({files:files.sort((a,b)=>new Date(b.uploaded)-new Date(a.uploaded)),folders,storage:{used,freeTierReference:10*1024*1024*1024,count:live.length,trashCount:trash.length}});
  }catch(error){return json({error:error?.message||String(error)},500);}
}
