import { requireAdmin } from "../_lib/auth.js";
import { addActivity, findObjectById, json, objectName, readJsonObject, writeJsonObject } from "../_lib/files.js";

function cleanId(value){return String(value||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80)}
function token(){return crypto.randomUUID().replace(/-/g,"")+crypto.randomUUID().replace(/-/g,"").slice(0,8)}
function expiryFor(duration){
  const now=Date.now();
  if(duration==="1h")return new Date(now+60*60*1000).toISOString();
  if(duration==="24h")return new Date(now+24*60*60*1000).toISOString();
  if(duration==="7d")return new Date(now+7*24*60*60*1000).toISOString();
  if(duration==="never")return "";
  return null;
}
async function cleanExpired(bucket){
  const page=await bucket.list({prefix:"_mx/shares/",limit:200});
  const now=Date.now(),dead=[];
  for(const obj of page.objects){
    const record=await readJsonObject(bucket,obj.key,null);
    if(record?.expiresAt&&Date.parse(record.expiresAt)<=now)dead.push(obj.key);
  }
  if(dead.length)await bucket.delete(dead);
}

export async function onRequestPost({request,env}){
  const denied=requireAdmin(request,env);
  if(denied)return denied;
  if(!env.FILES)return json({error:"R2 binding FILES is not configured."},500);
  try{
    const body=await request.json(),id=cleanId(body.id),duration=String(body.duration||"24h"),expiresAt=expiryFor(duration);
    if(!id)return json({error:"File id is required."},400);
    if(expiresAt===null)return json({error:"Invalid duration."},400);
    const object=await findObjectById(env.FILES,id);
    if(!object)return json({error:"File not found."},404);
    await cleanExpired(env.FILES);
    const shareToken=token(),record={token:shareToken,id,name:objectName(object),createdAt:new Date().toISOString(),expiresAt,duration};
    await writeJsonObject(env.FILES,`_mx/shares/${shareToken}.json`,record);
    await addActivity(env.FILES,"file.shared",{id,name:record.name,duration,expiresAt});
    return json({ok:true,url:`${new URL(request.url).origin}/s/${shareToken}`,expiresAt,duration});
  }catch(error){return json({error:error?.message||String(error)},500)}
}
