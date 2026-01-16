import { loadDB, saveDB } from "./db.js";

export function getAIConfig(){
  const db = loadDB();
  return db.ai || {provider:"openai", apiKey:null, model:"gpt-4.1-mini"};
}

export function setApiKey(key){
  const db = loadDB();
  db.ai = db.ai || {};
  db.ai.apiKey = key;
  saveDB(db);
}

export function clearApiKey(){
  const db = loadDB();
  db.ai = db.ai || {};
  db.ai.apiKey = null;
  saveDB(db);
}

export async function chat(messages){
  const { apiKey, model } = getAIConfig();
  if(!apiKey) throw new Error("NO_API_KEY");
  // NOTE: client-side key storage; acceptable for personal use, not for public SaaS.
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":`Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.6
    })
  });
  if(!res.ok){
    const txt = await res.text();
    throw new Error("AI_HTTP_" + res.status + " " + txt.slice(0,200));
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}
