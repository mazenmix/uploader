export function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function sanitizeFilename(input) {
  const value = String(input || "file").replace(/[\\/\0]/g, "_").replace(/\s+/g, " ").trim().slice(0, 180);
  return value || "file";
}
export function sanitizeFolder(input) { return String(input || "").replace(/[\\/\0]/g, "_").replace(/\s+/g, " ").trim().slice(0, 80); }
export function sanitizeAlias(input) { return String(input || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64); }
export function createId() { return crypto.randomUUID().replace(/-/g, "").slice(0, 10); }
export function isSystemKey(key) { return String(key || "").startsWith("_mx/"); }
export function isTrashKey(key) { return String(key || "").startsWith("_mx/trash/"); }
export async function findObjectById(bucket, id) { const cleanId=String(id||"").replace(/[^a-zA-Z0-9_-]/g,""); if(!cleanId)return null; const result=await bucket.list({prefix:`${cleanId}/`,limit:2,include:["httpMetadata","customMetadata"]}); return result.objects.find(o=>!isSystemKey(o.key))||null; }
export async function findTrashObjectById(bucket,id){const cleanId=String(id||"").replace(/[^a-zA-Z0-9_-]/g,"");if(!cleanId)return null;const result=await bucket.list({prefix:`_mx/trash/${cleanId}/`,limit:2,include:["httpMetadata","customMetadata"]});return result.objects[0]||null;}
export function objectName(object){if(object.customMetadata?.originalName)return object.customMetadata.originalName;const parts=object.key.split("/");return parts[parts.length-1]||"file";}
export function objectId(object){const parts=object.key.split("/");if(isTrashKey(object.key))return parts[2]||"";return parts[0]||"";}
export function fileRecord(object){const meta=object.customMetadata||{};return{id:objectId(object),key:object.key,name:objectName(object),size:object.size,uploaded:object.uploaded,contentType:object.httpMetadata?.contentType||"application/octet-stream",folder:meta.folder||"",alias:meta.alias||"",expiresAt:meta.expiresAt||"",isPublic:meta.public!=="0",passwordProtected:Boolean(meta.passwordHash),trashedAt:meta.trashedAt||"",url:`/f/${meta.alias||objectId(object)}`};}
export async function readJsonObject(bucket,key,fallback=null){const object=await bucket.get(key);if(!object)return fallback;try{return JSON.parse(await object.text());}catch{return fallback;}}
export async function writeJsonObject(bucket,key,value){await bucket.put(key,JSON.stringify(value),{httpMetadata:{contentType:"application/json; charset=utf-8"}});}
export async function hashText(value){const data=new TextEncoder().encode(String(value||""));const digest=await crypto.subtle.digest("SHA-256",data);return[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");}
export async function addActivity(bucket,action,detail={}){const item={id:crypto.randomUUID(),action,detail,at:new Date().toISOString()};await writeJsonObject(bucket,`_mx/activity/${Date.now()}-${item.id}.json`,item);return item;}
export async function updateObjectMetadata(bucket,object,changes={},newName=null){const source=await bucket.get(object.key);if(!source)throw new Error("File body not found.");const id=objectId(object),name=sanitizeFilename(newName||objectName(object)),targetKey=`${id}/${name}`,customMetadata={...(source.customMetadata||{}),...changes,originalName:name};Object.keys(customMetadata).forEach(k=>{if(customMetadata[k]===undefined||customMetadata[k]===null||customMetadata[k]==="")delete customMetadata[k];else customMetadata[k]=String(customMetadata[k]);});await bucket.put(targetKey,source.body,{httpMetadata:source.httpMetadata,customMetadata});if(targetKey!==object.key)await bucket.delete(object.key);return{key:targetKey,customMetadata};}
