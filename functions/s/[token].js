import { findObjectById, objectName, readJsonObject } from "../_lib/files.js";

function cleanToken(value){return String(value||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,120)}
function previewable(type,name){return /^(image|video|audio)\//i.test(type)||/^application\/pdf$/i.test(type)||/\.(png|jpe?g|gif|webp|svg|mp4|webm|mov|mp3|wav|m4a|ogg|pdf)$/i.test(name)}
function dispositionName(name){const ascii=name.replace(/[^\x20-\x7E]/g,"_").replace(/["\\]/g,"_");return`filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`}

export async function onRequest(context){
  const {request,env,params}=context;
  if(!["GET","HEAD"].includes(request.method))return new Response("Method Not Allowed",{status:405});
  if(!env.FILES)return new Response("Storage unavailable",{status:503});

  const token=cleanToken(params.token);
  if(!token)return new Response("Share link not found",{status:404});
  const record=await readJsonObject(env.FILES,`_mx/shares/${token}.json`,null);
  if(!record?.id)return new Response("Share link not found",{status:404});
  if(record.expiresAt&&Date.now()>Date.parse(record.expiresAt))return new Response("This share link has expired.",{status:410});

  const objectMeta=await findObjectById(env.FILES,record.id);
  if(!objectMeta)return new Response("File not found",{status:404});
  const meta=objectMeta.customMetadata||{};
  if(meta.expiresAt&&Date.now()>Date.parse(meta.expiresAt))return new Response("This file has expired.",{status:410});

  const name=objectName(objectMeta),url=new URL(request.url),forceDownload=url.searchParams.get("download")==="1";
  const range=request.headers.get("Range");
  const object=request.method==="HEAD"?await env.FILES.head(objectMeta.key):await env.FILES.get(objectMeta.key,range?{range:request.headers}:undefined);
  if(!object)return new Response("File not found",{status:404});

  if(request.method==="GET"&&context.waitUntil){
    context.waitUntil((async()=>{
      const id=record.id,key=`_mx/stats/${id}.json`,stats=await readJsonObject(env.FILES,key,{downloads:0});
      stats.downloads=Number(stats.downloads||0)+1;stats.lastAccessed=new Date().toISOString();
      await env.FILES.put(key,JSON.stringify(stats),{httpMetadata:{contentType:"application/json; charset=utf-8"},customMetadata:{downloads:String(stats.downloads),lastAccessed:stats.lastAccessed}});
    })());
  }

  const headers=new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag",object.httpEtag);
  headers.set("Accept-Ranges","bytes");
  headers.set("X-Content-Type-Options","nosniff");
  headers.set("Cache-Control","private, no-store");
  const type=object.httpMetadata?.contentType||"application/octet-stream";
  headers.set("Content-Disposition",`${!forceDownload&&previewable(type,name)?"inline":"attachment"}; ${dispositionName(name)}`);

  let status=200;
  if(request.method==="GET"&&object.range&&range){
    const offset=object.range.offset??0,length=object.range.length??object.size;
    headers.set("Content-Range",`bytes ${offset}-${offset+length-1}/${object.size}`);
    headers.set("Content-Length",String(length));status=206;
  }else headers.set("Content-Length",String(object.size));

  return new Response(request.method==="HEAD"?null:object.body,{status,headers});
}
