import { requireAdmin } from "../_lib/auth.js";
import { json } from "../_lib/files.js";

async function listActivityKeys(bucket){
  const keys=[];
  let cursor;
  do{
    const page=await bucket.list({prefix:"_mx/activity/",limit:1000,cursor});
    keys.push(...page.objects.map(object=>object.key));
    cursor=page.truncated?page.cursor:undefined;
  }while(cursor);
  return keys;
}

export async function onRequestPost({request,env}){
  const denied=requireAdmin(request,env);
  if(denied)return denied;
  if(!env.FILES)return json({error:"R2 binding FILES is not configured."},500);

  try{
    const keys=await listActivityKeys(env.FILES);
    for(let i=0;i<keys.length;i+=1000){
      await env.FILES.delete(keys.slice(i,i+1000));
    }
    return json({ok:true,deleted:keys.length});
  }catch(error){
    return json({error:error?.message||String(error)},500);
  }
}
