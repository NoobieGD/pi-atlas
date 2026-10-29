// API addresses live in memory only. Reload the published config for every connection attempt.
export async function loadPublicConfig(){
 if(window.PI_STANDALONE)return window.PI_CONFIG||{};
 const url=new URL('config.js',document.baseURI);
 url.searchParams.set('fresh',Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
 const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Could not load API configuration (HTTP '+response.status+').');
 const text=await response.text();
 const match=text.match(/window\.PI_CONFIG\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
 if(!match)throw Error('Invalid config.js: use window.PI_CONFIG = followed by a JSON object.');
 // Existing config.js files use JavaScript's unquoted object keys. Preserve strings verbatim.
 const json=match[1].replace(/("(?:\\.|[^"\\])*")|([A-Za-z_$][\w$]*)(\s*:)/g,(token,quoted,key,colon)=>quoted||JSON.stringify(key)+colon);
 const config=JSON.parse(json);
 if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Invalid API configuration.');
 window.PI_CONFIG=config;
 return config;
}
