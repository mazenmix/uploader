import { requireAdmin } from "../_lib/auth.js";
import { findObjectById, json, readJsonObject, writeJsonObject } from "../_lib/files.js";

function cleanId(value){return String(value||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80)}

async function listPins(bucket){
  const pins=[];
  let cursor;
  do{
    const page=await bucket.list({prefix:"_mx/pins/",limit:1000,cursor});
    for(const object of page.objects){
      const record=await readJsonObject(bucket,object.key,null);
      if(record?.id)pins.push(record);
    }
    cursor=page.truncated?page.cursor:undefined;
  }while(cursor);
  return pins.sort((a,b)=>new Date(b.pinnedAt||0)-new Date(a.pinnedAt||0));
}

export async function onRequest({request,env}){
  const denied=requireAdmin(request,env);
  if(denied)return denied;
  if(!env.FILES)return json({error:"R2 binding FILES is not configured."},500);

  try{
    if(request.method==="GET")return json({pins:await listPins(env.FILES)});

    if(request.method==="POST"){
      const body=await request.json(),id=cleanId(body.id),pinned=Boolean(body.pinned);
      if(!id)return json({error:"File id is required."},400);
      const object=await findObjectById(env.FILES,id);
      if(!object)return json({error:"File not found."},404);
      const key=`_mx/pins/${id}.json`;
      if(pinned){
        const record={id,pinnedAt:new Date().toISOString()};
        await writeJsonObject(env.FILES,key,record);
        return json({ok:true,pinned:true,record});
      }
      await env.FILES.delete(key);
      return json({ok:true,pinned:false});
    }

    return json({error:"Method not allowed."},405);
  }catch(error){return json({error:error?.message||String(error)},500)}
}
