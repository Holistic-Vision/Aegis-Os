

function installNavDelegation(){
  const handler = (ev)=>{
    try{
      const a = ev.target && ev.target.closest ? ev.target.closest("a[data-nav],button[data-nav]") : null;
      if(!a) return;
      const href = a.getAttribute("href") || a.getAttribute("data-href") || "";
      if(!href) return;
      ev.preventDefault();
      ev.stopPropagation();
      go(href);
    }catch(e){}
  };
  document.addEventListener("click", handler, true);
  document.addEventListener("pointerup", handler, true);
  document.addEventListener("touchend", handler, true);
}


function purgeSexSpecificFlags(profile){
  profile = profile || {};
  profile.flags = profile.flags || {};
  const sex = (profile.sex||"").toLowerCase();

  if(sex !== "female"){
    delete profile.flags.pregnant;
    delete profile.flags.menopause;
    delete profile.flags.postpartum;
  }
  if(sex !== "male"){
    delete profile.flags.andropause;
  }
  return profile;
}

let APP_VERSION = "0.8.5";
import { route, render, qs, onLinkNav, navigate } from "./router.js";
import { loadDB, saveDB, addCheckin, addJournal, exportDB, importDB, upsertReminder, deleteReminder } from "./db.js";
import { chat, setApiKey, clearApiKey } from "./ai.js";

const i18nCache = new Map();

async function t(key){
  const db = loadDB();
  const lang = db.profile?.lang || "fr";
  if(!i18nCache.has(lang)){
    const res = await fetch(`./i18n/${lang}.json`);
    i18nCache.set(lang, await res.json());
  }
  return i18nCache.get(lang)[key] || key;
}

function setTheme(theme){
  document.documentElement.setAttribute("data-theme", theme);
  const db = loadDB();
  db.profile.theme = theme;
  saveDB(db);
}

function setLang(lang){
  const db = loadDB();
  db.profile.lang = lang;
  saveDB(db);
  i18nCache.delete(lang);
}

function fmtDate(d){
  return new Intl.DateTimeFormat(undefined, {weekday:"short", year:"numeric", month:"short", day:"2-digit"}).format(d);
}

function uid(){
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
}

function layout(contentHtml){
  return `
  <div class="topbar">
    <div class="row">
      <div class="brand">
        <div class="logo" aria-hidden="true"></div>
        <div>
          <h1>${escapeHtml(get("appName"))}</h1>
          <div class="subtitle">${escapeHtml(get("tagline"))}</div>
        </div>
      </div>
      <div class="row" style="justify-content:flex-end">
        <button class="btn ghost" id="themeBtn">☼</button>
        <button class="btn ghost" id="langBtn">🌐</button>
      </div>
    </div>
  </div>
  <div class="app" id="view">${contentHtml}</div>
  <nav class="navbar">
    <div class="wrap">
      ${navItem("/", "navHome")}
      ${navItem("/mind", "navMind")}
      ${navItem("/journal", "navJournal")}
      ${navItem("/chat", "navChat")}
      ${navItem("/settings", "navSettings")}
    </div>
  </nav>`;
}

function navItem(href, labelKey){
  return `<a class="navitem" data-nav href="${href}">${escapeHtml(get(labelKey))}</a>`;
}

function get(key){ return window.__i18n?.[key] || key; }


async function loadVersion(){
  try{
    const r = await fetch("version.json", {cache:"no-store"});
    if(r.ok){
      const j = await r.json();
      if(j && j.version) APP_VERSION = j.version;
    }
  }catch(e){}
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function loadI18n(){
  const db = loadDB();
  const lang = db.profile?.lang || "fr";
  const res = await fetch(`./i18n/${lang}.json`);
  window.__i18n = await res.json();
}

async function ensureConsent(){
  const db = loadDB();
  if(db.profile.consentAcceptedAt) return true;

  const html = layout(`
    <div class="grid">
      <div class="card">
        <h2>${escapeHtml(get("medicalDisclaimerTitle"))}</h2>
        <p class="small">${escapeHtml(get("medicalDisclaimer"))}</p>
        <div class="notice small" style="margin-top:10px">
          <b>Privacy-first:</b> ${escapeHtml(get("dataStoredLocal"))}
        </div>
        <hr />
        <button class="btn primary" id="acceptBtn">${escapeHtml(get("consent"))}</button>
        <div class="small" style="margin-top:10px">
          <a data-nav href="/legal/privacy">Politique de confidentialité</a> ·
          <a data-nav href="/legal/terms">Conditions</a>
        </div>
      </div>
    </div>
  `);
  document.getElementById("root").innerHTML = html;
  qs("#acceptBtn").addEventListener("click", () => {
    const db2 = loadDB();
    db2.profile.consentAcceptedAt = new Date().toISOString();
    saveDB(db2);
    navigate("/");
  });
  return false;
}

function bindTopbar(){
  // Important: do NOT capture db once, otherwise theme can only toggle one way.
  qs("#themeBtn")?.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || loadDB().profile?.theme || "dark";
    const next = (cur === "dark") ? "light" : "dark";
    setTheme(next);
    // Optional: reflect icon immediately
    try{ qs("#themeBtn").textContent = (next === "dark") ? "☼" : "☾"; }catch(e){}
  });

  qs("#langBtn")?.addEventListener("click", () => {
    const db = loadDB();
    const next = (db.profile.lang === "fr") ? "en" : "fr";
    setLang(next);
    location.reload();
  });
}


route("/", async () => {
  if(!(await ensureConsent())) return;
  const db = loadDB();
  const last = db.checkins[db.checkins.length-1];

  const html = layout(`
    <div class="grid">
      <div class="card">
        <h2>${escapeHtml(get("today"))} · ${escapeHtml(fmtDate(new Date()))}</h2>
        <div class="row">
          <div class="kpi"><div class="small">${escapeHtml(get("mood"))}</div><b>${escapeHtml(last?.mood ?? "—")}</b></div>
          <div class="kpi"><div class="small">${escapeHtml(get("energy"))}</div><b>${escapeHtml(last?.energy ?? "—")}</b></div>
          <div class="kpi"><div class="small">${escapeHtml(get("sleep"))}</div><b>${escapeHtml(last?.sleep ?? "—")}</b></div>
          <div class="kpi"><div class="small">${escapeHtml(get("stress"))}</div><b>${escapeHtml(last?.stress ?? "—")}</b></div>
        </div>
        <hr />
        <div class="row">
          <a class="btn primary" data-nav href="/mind">${escapeHtml(get("quickCheckin"))}</a>
          <a class="btn" data-nav href="/insights">${escapeHtml(get("navInsights"))}</a>
          <a class="btn" data-nav href="/library">${escapeHtml(get("navLibrary"))}</a>
          <a class="btn" data-nav href="/armor">${escapeHtml(get("navArmor"))}</a>
          <a class="btn" data-nav href="/holistic">${escapeHtml(get("navHolistic"))}</a>
          <a class="btn" data-nav href="/pelvic">${escapeHtml(get("navPelvic"))}</a>
        </div>
        <div class="small" style="margin-top:10px">
          <span class="pill">v${APP_VERSION}</span> · PWA GitHub Pages · stockage local
        </div>
      </div>

      <div class="card">
        <h2>Phrase du jour</h2>
        <p class="small" id="quote"></p>
        <div class="row">
          <button class="btn" id="newQuote">Nouvelle</button>
          <a class="btn ghost" data-nav href="/library#quotes">Bibliothèque</a>
        </div>
      </div>

      <div class="card">
        <h2>${escapeHtml(get("reminders"))}</h2>
        <div class="small">Notifications navigateur (limitées sur certains mobiles). Pour un SaaS public, prévoir un backend push.</div>
        <div class="row" style="margin-top:10px">
          <button class="btn" id="notifBtn">${escapeHtml(get("enableNotif"))}</button>
          <a class="btn ghost" data-nav href="/account">Compte</a> <a class="btn ghost" data-nav href="/settings#reminders">Gérer</a>
        </div>
      </div>

      <div class="card footerlinks">
        <a data-nav href="/legal/privacy">Confidentialité</a>
        <a data-nav href="/legal/terms">Conditions</a>
        <a data-nav href="/account">Compte</a>
        <a data-nav href="/support">${escapeHtml(get("navSupport"))}</a>
      </div>
    </div>
  `);

  qs("#root").innerHTML = html;
  bindTopbar();

  // quotes
  const quotes = await fetch("./modules/quotes.json").then(r=>r.json()).catch(()=>[]);
  const q = quotes[Math.floor(Math.random()*Math.max(1,quotes.length))] || {text:"Respire. Observe. Ajuste.", source:"AEGIS"};
  qs("#quote").textContent = `${q.text} — ${q.source}`;
  qs("#newQuote").addEventListener("click", () => location.reload());

  qs("#notifBtn").addEventListener("click", async () => {
    if(!("Notification" in window)) return alert("Notifications non supportées.");
    const p = await Notification.requestPermission();
    if(p === "granted"){
      new Notification("AEGIS", {body:"Notifications activées."});
    }
  });
});

route("/home", async () => {
  if(!(await ensureConsent())) return;
  const db = loadDB();
  const last = db.checkins[db.checkins.length-1];

  const html = layout(`
    <div class="grid">
      <div class="card">
        <h2>${escapeHtml(get("today"))} · ${escapeHtml(fmtDate(new Date()))}</h2>
        <div class="row">
          <div class="kpi"><div class="small">${escapeHtml(get("mood"))}</div><b>${escapeHtml(last?.mood ?? "—")}</b></div>
          <div class="kpi"><div class="small">${escapeHtml(get("energy"))}</div><b>${escapeHtml(last?.energy ?? "—")}</b></div>
          <div class="kpi"><div class="small">${escapeHtml(get("sleep"))}</div><b>${escapeHtml(last?.sleep ?? "—")}</b></div>
          <div class="kpi"><div class="small">${escapeHtml(get("stress"))}</div><b>${escapeHtml(last?.stress ?? "—")}</b></div>
        </div>
        <hr />
        <div class="row">
          <a class="btn primary" data-nav href="/mind">${escapeHtml(get("quickCheckin"))}</a>
          <a class="btn" data-nav href="/insights">${escapeHtml(get("navInsights"))}</a>
          <a class="btn" data-nav href="/library">${escapeHtml(get("navLibrary"))}</a>
          <a class="btn" data-nav href="/armor">${escapeHtml(get("navArmor"))}</a>
          <a class="btn" data-nav href="/holistic">${escapeHtml(get("navHolistic"))}</a>
          <a class="btn" data-nav href="/pelvic">${escapeHtml(get("navPelvic"))}</a>
        </div>
        <div class="small" style="margin-top:10px">
          <span class="pill">v${APP_VERSION}</span> · PWA GitHub Pages · stockage local
        </div>
      </div>

      <div class="card">
        <h2>Phrase du jour</h2>
        <p class="small" id="quote"></p>
        <div class="row">
          <button class="btn" id="newQuote">Nouvelle</button>
          <a class="btn ghost" data-nav href="/library#quotes">Bibliothèque</a>
        </div>
      </div>

      <div class="card">
        <h2>${escapeHtml(get("reminders"))}</h2>
        <div class="small">Notifications navigateur (limitées sur certains mobiles). Pour un SaaS public, prévoir un backend push.</div>
        <div class="row" style="margin-top:10px">
          <button class="btn" id="notifBtn">${escapeHtml(get("enableNotif"))}</button>
          <a class="btn ghost" data-nav href="/account">Compte</a> <a class="btn ghost" data-nav href="/settings#reminders">Gérer</a>
        </div>
      </div>

      <div class="card footerlinks">
        <a data-nav href="/legal/privacy">Confidentialité</a>
        <a data-nav href="/legal/terms">Conditions</a>
        <a data-nav href="/account">Compte</a>
        <a data-nav href="/support">${escapeHtml(get("navSupport"))}</a>
      </div>
    </div>
  `);

  qs("#root").innerHTML = html;
  bindTopbar();

  // quotes
  const quotes = await fetch("./modules/quotes.json").then(r=>r.json()).catch(()=>[]);
  const q = quotes[Math.floor(Math.random()*Math.max(1,quotes.length))] || {text:"Respire. Observe. Ajuste.", source:"AEGIS"};
  qs("#quote").textContent = `${q.text} — ${q.source}`;
  qs("#newQuote").addEventListener("click", () => location.reload());

  qs("#notifBtn").addEventListener("click", async () => {
    if(!("Notification" in window)) return alert("Notifications non supportées.");
    const p = await Notification.requestPermission();
    if(p === "granted"){
      new Notification("AEGIS", {body:"Notifications activées."});
    }
  });
});

route("/mind", async () => {
  if(!(await ensureConsent())) return;
  const db = loadDB();
  const html = layout(`
    <div class="grid">
      <div class="card">
        <h2>${escapeHtml(get("quickCheckin"))}</h2>
        <div class="grid" style="margin-top:8px">
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:none; padding:0">
            <label class="small">${escapeHtml(get("mood"))}</label>
            <select id="mood" class="input">
              ${["Très bas","Bas","Neutre","Bon","Très bon"].map(v=>`<option>${v}</option>`).join("")}
            </select>
          </div>
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:none; padding:0">
            <label class="small">${escapeHtml(get("energy"))}</label>
            <select id="energy" class="input">
              ${["Épuisé","Fatigué","OK","En forme","Très en forme"].map(v=>`<option>${v}</option>`).join("")}
            </select>
          </div>
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:none; padding:0">
            <label class="small">${escapeHtml(get("sleep"))}</label>
            <select id="sleep" class="input">
              ${["< 5h","5–6h","6–7h","7–8h","> 8h"].map(v=>`<option>${v}</option>`).join("")}
            </select>
          </div>
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:none; padding:0">
            <label class="small">${escapeHtml(get("stress"))}</label>
            <select id="stress" class="input">
              ${["Très élevé","Élevé","Moyen","Bas","Très bas"].map(v=>`<option>${v}</option>`).join("")}
            </select>
          </div>
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:none; padding:0">
            <label class="small">${escapeHtml(get("notes"))}</label>
            <textarea id="notes" class="input" placeholder="Déclencheurs, pensées, douleurs, victoires…"></textarea>
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn primary" id="saveBtn">${escapeHtml(get("save"))}</button>
          <a class="btn ghost" data-nav href="/journal">Journal</a>
        </div>
      </div>

      
      <div class="card">
        <h2>${escapeHtml(get("snapshot"))}</h2>
        <div class="small">Ces infos aident à adapter les routines en mode “sécurité”. Elles sont enregistrées avec le check-in du jour.</div>
        <hr />
        <div class="grid">
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:none; padding:0">
            <label class="small">${escapeHtml(get("pregnant"))}</label>
            <select id="sPregnant" class="input">
              <option value="false">${escapeHtml(get("none"))}</option>
              <option value="true">Oui</option>
            </select>
          </div>
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:none; padding:0">
            <label class="small">${escapeHtml(get("menopause"))}</label>
            <select id="sMenopause" class="input">
              <option value="false">${escapeHtml(get("none"))}</option>
              <option value="true">Oui</option>
            </select>
          </div>
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:none; padding:0">
            <label class="small">${escapeHtml(get("andropause"))}</label>
            <select id="sAndropause" class="input">
              <option value="false">${escapeHtml(get("none"))}</option>
              <option value="true">Oui</option>
            </select>
          </div>
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:none; padding:0">
            <label class="small">${escapeHtml(get("smokerType"))}</label>
            <select id="sSmokerType" class="input">
              <option value="none">${escapeHtml(get("none"))}</option>
              <option value="cig">${escapeHtml(get("cigarettes"))}</option>
              <option value="vape">${escapeHtml(get("vape"))}</option>
              <option value="both">${escapeHtml(get("both"))}</option>
            </select>
          </div>
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:none; padding:0">
            <label class="small">${escapeHtml(get("smokerPerDay"))}</label>
            <input class="input" id="sSmokerPerDay" inputmode="numeric" placeholder="0" />
          </div>
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:none; padding:0">
            <label class="small">${escapeHtml(get("cardiac"))}</label>
            <select id="sCardiac" class="input">
              <option value="false">${escapeHtml(get("none"))}</option>
              <option value="true">Oui</option>
            </select>
          </div>
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:none; padding:0">
            <label class="small">${escapeHtml(get("restIssues"))}</label>
            <select id="sRestIssues" class="input">
              <option value="false">${escapeHtml(get("none"))}</option>
              <option value="true">Oui</option>
            </select>
          </div>
        </div>
      </div>

<div class="card">
        <h2>Outils</h2>
        <div class="row">
          <a class="btn" data-nav href="/modules/breath">Respiration</a>
          <a class="btn" data-nav href="/modules/meditation">Méditation</a>
          <a class="btn" data-nav href="/modules/values">Boussole (valeurs)</a>
        </div>
        <p class="small" style="margin-top:10px">Modules “Mind” inspirés : journal, observation, auto-régulation. Aucun conseil médical.</p>
      </div>
    </div>
  `);
  qs("#root").innerHTML = html;
  bindTopbar();

  qs("#saveBtn").addEventListener("click", () => {
    addCheckin({
      ts: new Date().toISOString(),
      mood: qs("#mood").value,
      energy: qs("#energy").value,
      sleep: qs("#sleep").value,
      stress: qs("#stress").value,
      notes: qs("#notes").value,
      snapshot: {
        pregnant: (qs("#sPregnant").value === "true"),
        menopause: (qs("#sMenopause").value === "true"),
        andropause: (qs("#sAndropause").value === "true"),
        smokerType: qs("#sSmokerType").value,
        smokerPerDay: (()=>{ const n=parseInt(qs("#sSmokerPerDay").value,10); return Number.isFinite(n)?n:0; })(),
        cardiacIssues: (qs("#sCardiac").value === "true"),
        restIssues: (qs("#sRestIssues").value === "true")
      }
    });
    navigate("/");
  });
});

route("/journal", async () => {
  if(!(await ensureConsent())) return;
  const db = loadDB();
  const rows = [...db.journal].reverse().slice(0,30).map(j => `
    <tr>
      <td>${escapeHtml(new Date(j.ts).toLocaleString())}</td>
      <td><b>${escapeHtml(j.title||"—")}</b><div class="small">${escapeHtml((j.body||"").slice(0,140))}${(j.body||"").length>140?"…":""}</div></td>
      <td class="small">${escapeHtml((j.tags||[]).join(", "))}</td>
    </tr>
  `).join("");

  const html = layout(`
    <div class="grid">
      <div class="card">
        <h2>Journal</h2>
        <div class="small">Écris pour clarifier. Exportable. Local par défaut.</div>
        <hr />
        <label class="small">Titre</label>
        <input class="input" id="jTitle" placeholder="Ex: Aujourd’hui, j’ai compris que…" />
        <div style="height:8px"></div>
        <label class="small">Texte</label>
        <textarea class="input" id="jBody" placeholder="Décrire. Nommer. Observer. Ajuster."></textarea>
        <div style="height:8px"></div>
        <label class="small">Tags (séparés par des virgules)</label>
        <input class="input" id="jTags" placeholder="stress, gratitude, décision" />
        <div class="row" style="margin-top:10px">
          <button class="btn primary" id="jSave">Enregistrer</button>
          <a class="btn ghost" data-nav href="/chat">Assistant IA</a>
        </div>
      </div>
      <div class="card">
        <h2>Entrées récentes</h2>
        <table class="table">
          <thead><tr><th>Date</th><th>Contenu</th><th>Tags</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="3" class="small">Aucune entrée.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `);
  qs("#root").innerHTML = html;
  bindTopbar();

  qs("#jSave").addEventListener("click", () => {
    addJournal({
      ts: new Date().toISOString(),
      title: qs("#jTitle").value.trim(),
      body: qs("#jBody").value.trim(),
      tags: qs("#jTags").value.split(",").map(s=>s.trim()).filter(Boolean)
    });
    navigate("/journal");
  });
});

route("/chat", async () => {
  if(!(await ensureConsent())) return;
  const html = layout(`
    <div class="grid">
      <div class="card">
        <h2>Assistant IA</h2>
        <div class="notice small">${escapeHtml(get("chatKeyNotice"))}</div>
        <div class="row" style="margin-top:10px">
          <button class="btn" id="setKey">${escapeHtml(get("setApiKey"))}</button>
          <button class="btn ghost" id="clrKey">${escapeHtml(get("clearApiKey"))}</button>
        </div>
        <hr />
        <div id="chatLog" class="small" style="white-space:pre-wrap"></div>
        <div style="height:10px"></div>
        <textarea id="chatInput" class="input" placeholder="Demande: plan du jour, méditation, routine, explications…"></textarea>
        <div class="row" style="margin-top:10px">
          <button class="btn primary" id="send">Envoyer</button>
          <a class="btn ghost" data-nav href="/library">Sources</a>
        </div>
        <p class="small" style="margin-top:10px">
          Garde-fous: pas de diagnostic, pas de prescription, pas de conseils médicaux. L’assistant peut proposer des routines générales et des ressources.
        </p>
      </div>
    </div>
  `);
  qs("#root").innerHTML = html;
  bindTopbar();

  const log = qs("#chatLog");
  function append(role, text){
    log.textContent += `${role.toUpperCase()}: ${text}\n\n`;
  }

  qs("#setKey").addEventListener("click", () => {
    const key = prompt("Colle ta clé API (stockée localement) :");
    if(key) setApiKey(key.trim());
  });
  qs("#clrKey").addEventListener("click", () => {
    clearApiKey();
    alert("Clé supprimée.");
  });

  qs("#send").addEventListener("click", async () => {
    const user = qs("#chatInput").value.trim();
    if(!user) return;
    qs("#chatInput").value = "";
    append("user", user);
    try{
      const system = "Tu es AEGIS. Tu proposes des routines générales (bien-être, sport, méditation, hygiène de vie) sans donner de diagnostic, sans prescrire, sans posologie médicale. Si l'utilisateur mentionne une maladie, allergie, blessure ou symptôme, tu réponds avec prudence, tu encourages à consulter un professionnel et tu restes sur des recommandations générales et de sécurité.";
      const text = await chat([
        {role:"system", content: system},
        {role:"user", content: user}
      ]);
      append("aegis", text);
    }catch(e){
      if(String(e.message).includes("NO_API_KEY")){
        append("aegis", "Clé IA manquante. Clique sur “Définir ma clé IA”.");
      }else{
        append("aegis", "Erreur IA: " + e.message);
      }
    }
  });
});


route("/data/recipes", async () => {
  if(!(await ensureConsent())) return;
  const db = loadDB();
  const prof = db.profile||{};
  const diet = (prof.diet||"").toLowerCase();
  const allergies = new Set((prof.allergies||[]).map(x=>String(x).toLowerCase()));
  const intoler = new Set((prof.intolerances||[]).map(x=>String(x).toLowerCase()));
  const avoid = new Set((prof.avoid||[]).map(x=>String(x).toLowerCase()));

  const pack = await fetch("./modules/data/recipes.json").then(r=>r.json()).catch(()=>({title:"Recettes",items:[]}));
  const items = (pack.items||[]).filter(it=>{
    const a=(it.allergens||[]).map(x=>String(x).toLowerCase());
    if(a.some(x=>allergies.has(x) || intoler.has(x))) return false;
    const title=(it.title||"").toLowerCase();
    if([...avoid].some(w=>w && title.includes(w))) return false;
    if(diet==="vegan" && (title.includes("poulet")||title.includes("œuf")||title.includes("oeuf"))) return false;
    if(diet==="vegetarian" && title.includes("poulet")) return false;
    return true;
  });

  const html = layout(`
    <div class="grid">
      <div class="card">
        <h2>${escapeHtml(pack.title||"Recettes")}</h2>
        <div class="small">Filtré par ton profil (régime/allergies/intolérances/évictions).</div>
        <hr/>
        ${(items||[]).map(it=>`
          <div class="card" style="margin:12px 0">
            <h3>${escapeHtml(it.title)}</h3>
            <div class="small">⏱ ${escapeHtml(String(it.time_min||""))} min · ${(it.tags||[]).map(t=>`<span class="pill" style="margin-left:6px">${escapeHtml(t)}</span>`).join("")}</div>
            <hr/>
            <div class="small"><b>Ingrédients</b></div>
            <ul class="small">${(it.ingredients||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>
            <div class="small"><b>Étapes</b></div>
            <ol class="small">${(it.steps||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ol>
            ${it.notes?`<div class="small"><b>Notes</b> — ${escapeHtml(it.notes)}</div>`:""}
          </div>
        `).join("")}
        ${items.length===0?`<div class="small">Aucune recette compatible avec ton profil actuel.</div>`:""}
      </div>
    </div>
  `);
  render(html);
});

route("/data/workouts", async () => {
  if(!(await ensureConsent())) return;
  const db = loadDB();
  const flags = db.profile?.flags || {};
  const pack = await fetch("./modules/data/workouts.json").then(r=>r.json()).catch(()=>({title:"Séances",items:[]}));
  const safeItems = (pack.items||[]).filter(it=>{
    const contra = (it.contra||[]).join(" ").toLowerCase();
    if(flags.pregnant && contra.includes("grossesse:off")) return false;
    if(flags.heart && contra.includes("cardiaque:off")) return false;
    return true;
  });

  const html = layout(`
    <div class="grid">
      <div class="card">
        <h2>${escapeHtml(pack.title||"Séances")}</h2>
        <div class="small">Masque automatiquement les séances “off” selon tes flags (grossesse / cardiaque).</div>
        <hr/>
        ${(safeItems||[]).map(it=>`
          <div class="card" style="margin:12px 0">
            <h3>${escapeHtml(it.title)}</h3>
            <div class="small">Type: ${escapeHtml(it.type||"")} · Niveau: ${escapeHtml(it.level||"")}</div>
            <hr/>
            <ul class="small">${(it.blocks||[]).map(b=>`<li>${escapeHtml(b.name)} — ${escapeHtml(b.reps|| (b.duration_s?Math.round(b.duration_s/60)+" min":""))} ${b.details?`(${escapeHtml(b.details)})`:""}</li>`).join("")}</ul>
          </div>
        `).join("")}
      </div>
    </div>
  `);
  render(html);
});

route("/data/groceries", async () => {
  if(!(await ensureConsent())) return;
  const pack = await fetch("./modules/data/groceries.json").then(r=>r.json()).catch(()=>({title:"Courses",default_stores:[],suggestions:[]}));
  const db = loadDB();
  db.groceries = db.groceries || {stores: pack.default_stores||[], items: []};
  saveDB(db);

  const html = layout(`
    <div class="grid">
      <div class="card">
        <h2>${escapeHtml(pack.title||"Courses")}</h2>
        <div class="small">${escapeHtml(pack.help||"")}</div>
        <hr/>
        <div class="row">
          <input id="g_item" class="input" placeholder="Ajouter un produit (ex: Œufs)" />
          <button class="btn" id="g_add">Ajouter</button>
        </div>
        <div class="small" style="margin-top:8px">Suggestions: ${(pack.suggestions||[]).map(s=>`<button class="btn ghost" data-sug="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join(" ")}</div>
        <hr/>
        <div id="g_table"></div>
      </div>
    </div>
  `);
  render(html);

  const $=qs;
  function rerender(){
    const db=loadDB();
    const stores=db.groceries.stores||[];
    const items=db.groceries.items||[];
    const header = `<tr><th>Produit</th>${stores.map(s=>`<th>${escapeHtml(s.name)}</th>`).join("")}</tr>`;
    const rows = items.map((it,idx)=>{
      const cells = stores.map(s=>{
        const v = (it.prices||{})[s.id] ?? "";
        return `<td><input class="input" data-p="${idx}:${escapeHtml(s.id)}" value="${escapeHtml(String(v))}" placeholder="€" style="min-width:80px" /></td>`;
      }).join("");
      return `<tr><td>${escapeHtml(it.name)}</td>${cells}</tr>`;
    }).join("");
    const totals = stores.map(s=>{
      let sum=0;
      for(const it of items){
        const v=parseFloat(((it.prices||{})[s.id]??"").toString().replace(",","."));
        if(!isNaN(v)) sum+=v;
      }
      return `<td><b>${sum.toFixed(2)} €</b></td>`;
    }).join("");
    const footer = `<tr><td><b>Total</b></td>${totals}</tr>`;
    const table = `<div style="overflow:auto"><table class="table">${header}${rows}${footer}</table></div>`;
    $("#g_table").innerHTML = table;

    document.querySelectorAll("[data-p]").forEach(inp=>{
      inp.oninput = (e)=>{
        const [i, sid] = e.target.getAttribute("data-p").split(":");
        const db=loadDB();
        const it=db.groceries.items[parseInt(i,10)];
        it.prices = it.prices || {};
        it.prices[sid]=e.target.value;
        saveDB(db);
        rerender();
      };
    });
  }

  qs("#g_add").onclick=()=>{
    const name=qs("#g_item").value.trim();
    if(!name) return;
    const db=loadDB();
    db.groceries.items.push({name, prices:{}});
    saveDB(db);
    qs("#g_item").value="";
    rerender();
  };

  document.querySelectorAll("[data-sug]").forEach(b=>{
    b.onclick=()=>{
      qs("#g_item").value=b.getAttribute("data-sug");
      qs("#g_add").click();
    };
  });

  rerender();
});


route("/profile", async () => {
  if(!(await ensureConsent())) return;
  const db = loadDB();
  db.profile = purgeSexSpecificFlags(db.profile || {});
  db.profile.flags = db.profile.flags || {};
  db.profile.allergies = db.profile.allergies || [];
  db.profile.intolerances = db.profile.intolerances || [];
  db.profile.avoid = db.profile.avoid || [];
  db.profile.injuries = db.profile.injuries || [];
  db.profile.preferences = db.profile.preferences || {};
  db.profile.sleep = db.profile.sleep || {};

  const diets = ["","omnivore","vegetarian","vegan","pescatarian","keto","lowcarb","mediterranean","halal","kosher"];
  const sex = (db.profile.sex||"").toLowerCase();

  const sexBlock = (() => {
    if(sex==="female"){
      return `
        <hr/>
        <div class="small"><b>Spécifique Femme</b></div>
        <label class="small"><input type="checkbox" id="f_preg" /> Enceinte</label><br/>
        <label class="small"><input type="checkbox" id="f_post" /> Post-partum</label><br/>
        <label class="small"><input type="checkbox" id="f_meno" /> Ménopause / péri-ménopause</label>
      `;
    }
    if(sex==="male"){
      return `
        <hr/>
        <div class="small"><b>Spécifique Homme</b></div>
        <label class="small"><input type="checkbox" id="f_andro" /> Andropause (repère)</label>
      `;
    }
    return `
      <hr/>
      <div class="small"><b>Spécificités</b></div>
      <div class="small">Définis d’abord le sexe dans Compte pour afficher les options femme/homme.</div>
    `;
  })();

  const html = layout(`
    <div class="grid">
      <div class="card">
        <h2>Profil</h2>
        <div class="small">Filtrage des contenus selon tes choix. Non-médical.</div>
        <hr/>
        <div class="small"><b>Régime</b></div>
        <select id="diet" class="input">
          ${diets.map(d=>`<option value="${escapeHtml(d)}">${escapeHtml(d||"—")}</option>`).join("")}
        </select>

        <div class="small" style="margin-top:10px"><b>Allergies (mots-clés)</b></div>
        <input id="allergies" class="input" placeholder="ex: oeuf, arachide" />
        <div class="small" style="margin-top:10px"><b>Intolérances</b></div>
        <input id="intoler" class="input" placeholder="ex: lactose, gluten" />
        <div class="small" style="margin-top:10px"><b>À éviter</b></div>
        <input id="avoid" class="input" placeholder="ex: poisson, porc" />

        <hr/>
        <div class="small"><b>Préférences</b></div>
        <label class="small"><input type="checkbox" id="p_spicy" /> J’aime épicé</label><br/>
        <label class="small"><input type="checkbox" id="p_fast" /> Recettes rapides (≤20 min)</label><br/>
        <label class="small"><input type="checkbox" id="p_budget" /> Budget serré</label>

        <div class="small" style="margin-top:10px"><b>Sommeil (repères)</b></div>
        <div class="row" style="gap:10px">
          <input id="sleep_start" class="input" placeholder="Heure coucher (ex 23:30)" style="flex:1" />
          <input id="sleep_end" class="input" placeholder="Heure lever (ex 07:00)" style="flex:1" />
        </div>
        <div class="small" style="margin-top:10px"><b>Rythme de travail</b></div>
        <select id="work_rhythm" class="input">
          <option value="">—</option>
          <option value="day">Jour</option>
          <option value="night">Nuit</option>
          <option value="mixed">Variable</option>
        </select>

        <hr/>
        <div class="small"><b>Prudence (général)</b></div>
        <label class="small"><input type="checkbox" id="f_heart" /> Cardiaque (prudence)</label><br/>
        <label class="small"><input type="checkbox" id="f_smoke" /> Fumeur / vape</label><br/>
        <label class="small"><input type="checkbox" id="f_joint" /> Douleurs articulaires (prudence impact)</label>

        ${sexBlock}

        <hr/>
        <div class="small"><b>Blessures / inconforts (mots-clés)</b></div>
        <input id="injuries" class="input" placeholder="ex: épaule, poignet, genou" />

        <div class="small" style="margin-top:10px"><b>Localisation</b></div>
        <label class="small"><input type="checkbox" id="loc_ok" /> J’accepte l’usage de la localisation (optionnel)</label>

        <hr/>
        <button class="btn" id="saveProf">Enregistrer</button>
        <div class="small" style="margin-top:8px">Ensuite: Bibliothèque → Contenus → Recettes / Séances / Courses.</div>
      </div>
    </div>
  `);
  render(html);

  const p = loadDB().profile || {};
  qs("#diet").value = p.diet||"";
  qs("#allergies").value = (p.allergies||[]).join(", ");
  qs("#intoler").value = (p.intolerances||[]).join(", ");
  qs("#avoid").value = (p.avoid||[]).join(", ");
  qs("#injuries").value = (p.injuries||[]).join(", ");
  qs("#p_spicy").checked = !!(p.preferences||{}).spicy;
  qs("#p_fast").checked = !!(p.preferences||{}).fast;
  qs("#p_budget").checked = !!(p.preferences||{}).budget;
  qs("#sleep_start").value = (p.sleep||{}).start || "";
  qs("#sleep_end").value = (p.sleep||{}).end || "";
  qs("#work_rhythm").value = p.workRhythm || "";
  qs("#f_heart").checked = !!(p.flags||{}).heart;
  qs("#f_smoke").checked = !!(p.flags||{}).smoker;
  qs("#f_joint").checked = !!(p.flags||{}).jointPain;
  qs("#loc_ok").checked = !!p.locConsent;

  const flags = p.flags||{};
  const elPreg = document.getElementById("f_preg"); if(elPreg) elPreg.checked = !!flags.pregnant;
  const elPost = document.getElementById("f_post"); if(elPost) elPost.checked = !!flags.postpartum;
  const elMeno = document.getElementById("f_meno"); if(elMeno) elMeno.checked = !!flags.menopause;
  const elAndro = document.getElementById("f_andro"); if(elAndro) elAndro.checked = !!flags.andropause;

  qs("#saveProf").onclick=()=>{
    const db=loadDB();
    db.profile=db.profile||{};
    db.profile.flags = db.profile.flags || {};
    db.profile.preferences = db.profile.preferences || {};
    db.profile.sleep = db.profile.sleep || {};

    db.profile.diet = qs("#diet").value;
    db.profile.allergies = qs("#allergies").value.split(",").map(s=>s.trim()).filter(Boolean);
    db.profile.intolerances = qs("#intoler").value.split(",").map(s=>s.trim()).filter(Boolean);
    db.profile.avoid = qs("#avoid").value.split(",").map(s=>s.trim()).filter(Boolean);
    db.profile.injuries = qs("#injuries").value.split(",").map(s=>s.trim()).filter(Boolean);

    db.profile.preferences.spicy = qs("#p_spicy").checked;
    db.profile.preferences.fast = qs("#p_fast").checked;
    db.profile.preferences.budget = qs("#p_budget").checked;

    db.profile.sleep.start = qs("#sleep_start").value.trim();
    db.profile.sleep.end = qs("#sleep_end").value.trim();
    db.profile.workRhythm = qs("#work_rhythm").value;

    db.profile.locConsent = qs("#loc_ok").checked;

    db.profile.flags.heart = qs("#f_heart").checked;
    db.profile.flags.smoker = qs("#f_smoke").checked;
    db.profile.flags.jointPain = qs("#f_joint").checked;

    const sp = document.getElementById("f_preg"); if(sp) db.profile.flags.pregnant = sp.checked;
    const s2 = document.getElementById("f_post"); if(s2) db.profile.flags.postpartum = s2.checked;
    const s3 = document.getElementById("f_meno"); if(s3) db.profile.flags.menopause = s3.checked;
    const s4 = document.getElementById("f_andro"); if(s4) db.profile.flags.andropause = s4.checked;

    db.profile = purgeSexSpecificFlags(db.profile);
    saveDB(db);
    go("/library");
  };
});

route("/library", async () => {
  if(!(await ensureConsent())) return;
  const lib = await fetch("./modules/library.json").then(r=>r.json()).catch(()=>({sections:[]}));
  const sections = (lib.sections||[]).map(s => `
    <div class="card">
      <h2 id="${escapeHtml(s.id)}">${escapeHtml(s.title)}</h2>
      <div class="small">${escapeHtml(s.desc||"")}</div>
      <hr />
      <ul class="small">
        ${(s.items||[]).map(it => {
          const url = it.url || it.href || it.path || "#";
          const label = it.label || it.title || url;
          const isInternal = typeof url==="string" && url.startsWith("/");
          const attrs = isInternal ? 'data-nav' : 'target="_blank" rel="noopener"';
          return `<li><a ${attrs} href="${escapeHtml(url)}">${escapeHtml(label)}</a>${it.desc?`<div class="small">${escapeHtml(it.desc)}</div>`:""}</li>`;
        }).join("")}
      </ul>
    </div>
  `).join("");

  const html = layout(`
    <div class="grid">
      <div class="card">
        <h2>Bibliothèque & sources</h2>
        <div class="small">Liens officiels, articles, ressources (à compléter). Cette page sert aussi de “transparence”.</div>
      </div>
      ${sections}
    </div>
  `);
  qs("#root").innerHTML = html;
  bindTopbar();
});

route("/armor", async () => moduleHub("Armor (Sport)", "armor"));
route("/holistic", async () => moduleHub("Holistic", "holistic"));
route("/pelvic", async () => moduleHub("Pelvic", "pelvic"));

async function moduleHub(title, key){
  if(!(await ensureConsent())) return;
  const data = await fetch(`./modules/${key}.json`).then(r=>r.json()).catch(()=>({cards:[]}));
  const cards = (data.cards||[]).map(c => `
    <div class="card">
      <h2>${escapeHtml(c.title)}</h2>
      <div class="small">${escapeHtml(c.desc||"")}</div>
      <hr />
      <div class="row">
        ${(c.links||[]).map(l => `<a class="btn" data-nav href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a>`).join("")}
      </div>
    </div>
  `).join("");

  const html = layout(`
    <div class="grid">
      <div class="card">
        <h2>${escapeHtml(title)}</h2>
        <div class="small">Hub de modules. Tout est modulaire, évolutif.</div>
      </div>
      ${cards || `<div class="card"><div class="small">Aucun module pour l’instant.</div></div>`}
    </div>
  `);
  qs("#root").innerHTML = html;
  bindTopbar();
}



route("/account", async () => {
  if(!(await ensureConsent())) return;
  const db = loadDB();
  db.profile = purgeSexSpecificFlags(db.profile || {});
  const p = db.profile;

  const html = layout(`
    <div class="grid">
      <div class="card">
        <h2>Compte (local)</h2>
        <div class="small">MVP: pas de serveur. Données stockées sur cet appareil. Tu peux exporter/importer.</div>
        <hr/>
        <div class="small"><b>Nom / pseudo</b></div>
        <input id="acc_name" class="input" placeholder="Ex: Sébastien" />
        <div class="small" style="margin-top:10px"><b>Email (optionnel)</b></div>
        <input id="acc_email" class="input" placeholder="ex: moi@mail.com" />
        <div class="row" style="margin-top:10px; gap:10px">
          <div style="flex:1">
            <div class="small"><b>Âge</b></div>
            <input id="acc_age" class="input" inputmode="numeric" placeholder="ex: 43" />
          </div>
          <div style="flex:1">
            <div class="small"><b>Sexe</b></div>
            <select id="acc_sex" class="input">
              <option value="">—</option>
              <option value="female">Femme</option>
              <option value="male">Homme</option>
              <option value="other">Autre / non précisé</option>
            </select>
          </div>
        </div>

        <div class="row" style="margin-top:10px; gap:10px">
          <div style="flex:1">
            <div class="small"><b>Taille (cm)</b></div>
            <input id="acc_height" class="input" inputmode="numeric" placeholder="ex: 180" />
          </div>
          <div style="flex:1">
            <div class="small"><b>Poids (kg)</b></div>
            <input id="acc_weight" class="input" inputmode="decimal" placeholder="ex: 92" />
          </div>
        </div>

        <div class="small" style="margin-top:10px"><b>Objectif principal</b></div>
        <select id="acc_goal" class="input">
          <option value="">—</option>
          <option value="fatloss">Perte de graisse</option>
          <option value="maintenance">Entretien</option>
          <option value="muscle">Prise de muscle</option>
          <option value="mobility">Mobilité / posture</option>
          <option value="sleep">Sommeil / récupération</option>
          <option value="stress">Stress / esprit</option>
        </select>

        <div class="small" style="margin-top:10px"><b>Niveau d'activité</b></div>
        <select id="acc_activity" class="input">
          <option value="">—</option>
          <option value="low">Faible</option>
          <option value="moderate">Modéré</option>
          <option value="high">Élevé</option>
        </select>

        <div class="small" style="margin-top:10px"><b>Matériel dispo (optionnel)</b></div>
        <input id="acc_equipment" class="input" placeholder="ex: tapis, haltères, élastiques" />

        <hr/>
        <button class="btn" id="acc_save">Enregistrer</button>
        <div class="small" style="margin-top:8px">Régime / allergies / flags prudence: Profil.</div>
      </div>
    </div>
  `);
  render(html);

  qs("#acc_name").value = p.name || "";
  qs("#acc_email").value = p.email || "";
  qs("#acc_age").value = p.age || "";
  qs("#acc_sex").value = p.sex || "";
  qs("#acc_height").value = p.heightCm || "";
  qs("#acc_weight").value = p.weightKg || "";
  qs("#acc_goal").value = p.goal || "";
  qs("#acc_activity").value = p.activityLevel || "";
  qs("#acc_equipment").value = (p.equipment||[]).join(", ");

  qs("#acc_save").onclick = () => {
    const db = loadDB();
    db.profile = db.profile || {};
    db.profile.name = qs("#acc_name").value.trim();
    db.profile.email = qs("#acc_email").value.trim();
    db.profile.age = qs("#acc_age").value.trim();
    db.profile.sex = qs("#acc_sex").value;
    db.profile.heightCm = qs("#acc_height").value.trim();
    db.profile.weightKg = qs("#acc_weight").value.trim();
    db.profile.goal = qs("#acc_goal").value;
    db.profile.activityLevel = qs("#acc_activity").value;
    db.profile.equipment = qs("#acc_equipment").value.split(",").map(s=>s.trim()).filter(Boolean);

    db.profile = purgeSexSpecificFlags(db.profile);
    saveDB(db);
    go("/settings");
  };
});

route("/settings", async () => {
  if(!(await ensureConsent())) return;
  const db = loadDB();
  const remRows = (db.reminders||[]).map(r => `
    <tr>
      <td><b>${escapeHtml(r.label)}</b><div class="small">${escapeHtml(r.timeHHMM)} · ${escapeHtml((r.days||[]).join(","))}</div></td>
      <td><button class="btn ghost" data-del="${escapeHtml(r.id)}">Supprimer</button></td>
    </tr>
  `).join("");

  const html = layout(`
    <div class="grid">
      <div class="card">
        <h2>${escapeHtml(get("navSettings"))}</h2>
        <div class="small">${escapeHtml(get("dataStoredLocal"))}</div>
        <hr />
        <div class="row">
          <button class="btn" id="exportBtn">${escapeHtml(get("export"))}</button>
          <label class="btn ghost">
            ${escapeHtml(get("import"))}
            <input type="file" id="importFile" accept="application/json" style="display:none" />
          </label>
        </div>
      </div>

      <div class="card" id="reminders">
        <h2>${escapeHtml(get("reminders"))}</h2>
        <div class="small">MVP: stockage + UI. Exécution fiable sur mobile nécessite une stratégie native/Tasker ou un backend push.</div>
        <hr />
        <div class="grid">
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:none; padding:0">
            <label class="small">Libellé</label>
            <input class="input" id="rLabel" placeholder="Ex: Hydratation" />
          </div>
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:none; padding:0">
            <label class="small">Heure (HH:MM)</label>
            <input class="input" id="rTime" placeholder="08:30" />
          </div>
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:none; padding:0">
            <label class="small">Jours (0=dimanche…6=samedi)</label>
            <input class="input" id="rDays" placeholder="1,2,3,4,5" />
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn primary" id="addRem">Ajouter</button>
        </div>
        <hr />
        <table class="table">
          <tbody>${remRows || `<tr><td class="small">Aucun rappel.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `);
  qs("#root").innerHTML = html;
  bindTopbar();

  qs("#exportBtn").addEventListener("click", exportDB);
  qs("#importFile").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if(!file) return;
    await importDB(file);
    alert("Import OK. Rechargement.");
    location.reload();
  });

  qs("#addRem").addEventListener("click", () => {
    const label = qs("#rLabel").value.trim();
    const time = qs("#rTime").value.trim();
    const days = qs("#rDays").value.split(",").map(s=>parseInt(s.trim(),10)).filter(n=>Number.isFinite(n) && n>=0 && n<=6);
    if(!label || !/^\d\d:\d\d$/.test(time)) return alert("Renseigne label + heure HH:MM.");
    upsertReminder({id: uid(), label, timeHHMM: time, days, enabled:true});
    navigate("/settings");
  });

  document.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      deleteReminder(btn.getAttribute("data-del"));
      navigate("/settings");
    });
  });
});


route("/insights", async () => {
  if(!(await ensureConsent())) return;
  const db = loadDB();
  const checkins = db.checkins || [];

  function countUnlocks(list){
    let c=0;
    for(const x of list){
      const arr = x.overrides || [];
      for(const o of arr){ if(o && o.type==="hiit_unlock") c++; }
    }
    return c;
  }

  function scoreMap(v){
    const m = new Map([
      ["Très bas",1],["Bas",2],["Neutre",3],["Bon",4],["Très bon",5],
      ["Épuisé",1],["Fatigué",2],["OK",3],["En forme",4],["Très en forme",5],
      ["< 5h",1],["5–6h",2],["6–7h",3],["7–8h",4],["> 8h",5],
      ["Très élevé",1],["Élevé",2],["Moyen",3],["Bas",4],["Très bas",5]
    ]);
    return m.get(v) ?? null;
  }

  function withinDays(days){
    const t = Date.now() - days*24*3600*1000;
    return checkins.filter(c => Date.parse(c.ts) >= t);
  }

  function avg(list, key){
    const vals = list.map(x => scoreMap(x[key])).filter(n=>typeof n==="number");
    if(!vals.length) return "—";
    const a = vals.reduce((s,n)=>s+n,0)/vals.length;
    return a.toFixed(2);
  }

  function smokeAvg(list){
    const vals = list.map(x => x.snapshot?.smokerPerDay).filter(n=>typeof n==="number");
    if(!vals.length) return "—";
    const a = vals.reduce((s,n)=>s+n,0)/vals.length;
    return a.toFixed(1);
  }

  function flagsRecent(list){
    const last = list[list.length-1];
    const s = last?.snapshot;
    if(!s) return "—";
    const parts = [];
    if(s.pregnant) parts.push(get("pregnant"));
    if(s.menopause) parts.push(get("menopause"));
    if(s.andropause) parts.push(get("andropause"));
    if(s.cardiacIssues) parts.push(get("cardiac"));
    if(s.restIssues) parts.push(get("restIssues"));
    if(s.smokerType && s.smokerType!=="none") parts.push(get("smoker")+": "+s.smokerType+" ("+ (s.smokerPerDay??0)+"/j)");
    return parts.length ? parts.join(" · ") : get("none");
  }

  const d1 = withinDays(1);
  const d7 = withinDays(7);
  const d30 = withinDays(30);

  const html = layout(`
    <div class="grid">
      <div class="card">
        <h2>${escapeHtml(get("insightsTitle"))}</h2>
        <div class="small">Synthèse issue des check-ins (sans interprétation médicale).</div>
      </div>

      <div class="card">
        <h2>${escapeHtml(get("daily"))}</h2>
        <div class="row">
          <div class="kpi"><div class="small">${escapeHtml(get("mood"))}</div><b>${escapeHtml(avg(d1,"mood"))}</b></div>
          <div class="kpi"><div class="small">${escapeHtml(get("energy"))}</div><b>${escapeHtml(avg(d1,"energy"))}</b></div>
          <div class="kpi"><div class="small">${escapeHtml(get("sleep"))}</div><b>${escapeHtml(avg(d1,"sleep"))}</b></div>
          <div class="kpi"><div class="small">${escapeHtml(get("stress"))}</div><b>${escapeHtml(avg(d1,"stress"))}</b></div>
        </div>
        <div class="small" style="margin-top:8px"><b>Snapshot:</b> ${escapeHtml(flagsRecent(d1))}</div>
      </div>

      <div class="card">
        <h2>${escapeHtml(get("weekly"))}</h2>
        <div class="row">
          <div class="kpi"><div class="small">${escapeHtml(get("mood"))}</div><b>${escapeHtml(avg(d7,"mood"))}</b></div>
          <div class="kpi"><div class="small">${escapeHtml(get("energy"))}</div><b>${escapeHtml(avg(d7,"energy"))}</b></div>
          <div class="kpi"><div class="small">${escapeHtml(get("sleep"))}</div><b>${escapeHtml(avg(d7,"sleep"))}</b></div>
          <div class="kpi"><div class="small">${escapeHtml(get("stress"))}</div><b>${escapeHtml(avg(d7,"stress"))}</b></div>
        </div>
        <div class="small" style="margin-top:8px"><b>${escapeHtml(get("smokerPerDay"))}:</b> ${escapeHtml(smokeAvg(d7))}</div>
        <div class="small"><b>${escapeHtml(get("unlockLog"))}:</b> ${countUnlocks(d7)} (7j)</div>
      </div>

      <div class="card">
        <h2>${escapeHtml(get("monthly"))}</h2>
        <div class="row">
          <div class="kpi"><div class="small">${escapeHtml(get("mood"))}</div><b>${escapeHtml(avg(d30,"mood"))}</b></div>
          <div class="kpi"><div class="small">${escapeHtml(get("energy"))}</div><b>${escapeHtml(avg(d30,"energy"))}</b></div>
          <div class="kpi"><div class="small">${escapeHtml(get("sleep"))}</div><b>${escapeHtml(avg(d30,"sleep"))}</b></div>
          <div class="kpi"><div class="small">${escapeHtml(get("stress"))}</div><b>${escapeHtml(avg(d30,"stress"))}</b></div>
        </div>
        <div class="small" style="margin-top:8px"><b>${escapeHtml(get("smokerPerDay"))}:</b> ${escapeHtml(smokeAvg(d30))}</div>
        <div class="small"><b>${escapeHtml(get("unlockLog"))}:</b> ${countUnlocks(d30)} (30j)</div>
      </div>

      <div class="card">
        <h2>Note</h2>
        <div class="small">Si “cardiaque”, “enceinte” ou “repos difficile” est activé, AEGIS doit proposer par défaut des routines plus douces et rappeler de demander un avis professionnel en cas de doute.</div>
      </div>
    </div>
  `);

  qs("#root").innerHTML = html;
  bindTopbar();
});


route("/armor/mobility", async () => {
  if(!(await ensureConsent())) return;
  const db = loadDB();
  const risk = riskLevel(db);
  const html = layout(`
    <div class="grid">
      
      <div class="card">
        <h2>Mobilité (doux)</h2>
        <div class="small">Objectif : délier, relâcher, améliorer amplitude. 8–12 minutes.</div>
        <hr />
        <ol class="small">
          <li>Cou/épaules : cercles lents 1 min</li>
          <li>Colonne : cat-cow 1–2 min</li>
          <li>Hanches : rotations 1–2 min</li>
          <li>Chevilles : mobilité 1 min</li>
          <li>Squat assisté (tenu) 3×20–30s</li>
          <li>Étirement psoas 2×30s / côté</li>
        </ol>
        <div class="badge" style="margin-top:8px">Adapté si prudence = HIGH</div>
      </div>

      <div class="card">
        <h2>Retour</h2>
        <a class="btn ghost" data-nav href="/armor">← Armor</a>
      </div>
    </div>
  `);
  qs("#root").innerHTML = html;
  bindTopbar();
});


route("/armor/breath", async () => {
  if(!(await ensureConsent())) return;
  const db = loadDB();
  const risk = riskLevel(db);
  const html = layout(`
    <div class="grid">
      
      <div class="card">
        <h2>Respiration (récup/stress)</h2>
        <div class="small">Objectif : calmer le système, améliorer repos. 5–10 minutes.</div>
        <hr />
        <ol class="small">
          <li>Cohérence : 5s inspire / 5s expire × 5 min</li>
          <li>Alternative : 4-6 (4s inspire / 6s expire) × 5 min</li>
          <li>Fin : 1 min respiration naturelle + scan corporel</li>
        </ol>
        <div class="badge" style="margin-top:8px">Si vertiges/douleur : stop</div>
      </div>

      <div class="card">
        <h2>Retour</h2>
        <a class="btn ghost" data-nav href="/armor">← Armor</a>
      </div>
    </div>
  `);
  qs("#root").innerHTML = html;
  bindTopbar();
});


route("/armor/hiit", async () => {
  if(!(await ensureConsent())) return;
  const db = loadDB();
  const risk = riskLevel(db);
  const unlocked = isHiiTUnlocked(db);

  if(risk==="high" && !unlocked){
    const html = layout(`
      <div class="grid">
        <div class="card">
          <h2>HIIT (intensif)</h2>
          <div class="badge warn">${escapeHtml(get("unlockBlocked"))}</div>
          <div class="small" style="margin-top:10px">Retourne sur Armor pour débloquer temporairement (override 24h) si nécessaire.</div>
          <div style="margin-top:12px">
            <a class="btn ghost" data-nav href="/armor">← Armor</a>
          </div>
        </div>
      </div>
    `);
    qs("#root").innerHTML = html;
    bindTopbar();
    return;
  }

  const html = layout(`
    <div class="grid">
      
      <div class="card">
        <h2>HIIT (intensif)</h2>
        ${risk==="high" ? `<div class="badge warn">Désactivé par défaut (prudence HIGH).</div>` : ``}
        <div class="small" style="margin-top:8px">Format 12 minutes (si OK): 30s effort / 30s repos × 12.</div>
        <hr />
        <ol class="small">
          <li>Jumping jacks (ou step jacks)</li>
          <li>Squat</li>
          <li>Mountain climbers (ou marche rapide sur place)</li>
          <li>Pompes (ou inclinées)</li>
          <li>Fentes alternées</li>
          <li>Gainage</li>
        </ol>
        <div class="small" style="margin-top:8px">Arrêter si douleur thoracique, malaise, essoufflement anormal.</div>
      </div>

      <div class="card">
        <h2>Retour</h2>
        <a class="btn ghost" data-nav href="/armor">← Armor</a>
      </div>
    </div>
  `);
  qs("#root").innerHTML = html;
  bindTopbar();
});

route("/support", async () => {
  if(!(await ensureConsent())) return;
  const html = layout(`
    <div class="grid">
      <div class="card">
        <h2>${escapeHtml(get("navSupport"))}</h2>
        <div class="small">${escapeHtml(get("supportText"))}</div>
        <hr />
        <div class="row">
          <a class="btn primary" href="#" target="_blank" rel="noopener">Stripe Checkout (à configurer)</a>
          <a class="btn" href="#" target="_blank" rel="noopener">PayPal (option)</a>
        </div>
        <p class="small" style="margin-top:10px">
          GitHub Pages est statique. Les abonnements et comptes se font via un fournisseur externe (Stripe) et/ou un backend serverless (Cloudflare/Netlify/Supabase).<br/><br/><b>Parrainage:</b> en mode simple, tu actives “allow promotion codes” sur un Payment Link et le filleul saisit un code promo lors du paiement. En mode pro, un backend crée la Checkout Session et applique automatiquement une réduction + metadata de parrainage.
        </p>
      </div>
    </div>
  `);
  qs("#root").innerHTML = html;
  bindTopbar();
});

route("/legal/privacy", async () => {
  const txt = await fetch("./legal/privacy.md").then(r=>r.text());
  qs("#root").innerHTML = layout(markdownToHtml(txt));
  bindTopbar();
});
route("/legal/terms", async () => {
  const txt = await fetch("./legal/terms.md").then(r=>r.text());
  qs("#root").innerHTML = layout(markdownToHtml(txt));
  bindTopbar();
});

route("/modules/breath", async () => simpleMarkdownPage("modules/breath.md"));
route("/modules/meditation", async () => simpleMarkdownPage("modules/meditation.md"));
route("/modules/values", async () => simpleMarkdownPage("modules/values.md"));


// Data Hub (recipes/workouts/groceries)
route("/data/recipes", async () => renderRecipes());
route("/data/workouts", async () => renderWorkouts());
route("/data/groceries", async () => renderGroceries());


async function renderRecipes(){
  if(!(await ensureConsent())) return;
  const db = loadDB();
  const profile = db.profile || {};
  const prefs = (profile.prefs||{});
  const allergies = new Set((prefs.allergies||[]).map(x=>String(x).toLowerCase()));
  const intolerances = new Set((prefs.intolerances||[]).map(x=>String(x).toLowerCase()));
  const diet = String(prefs.diet||"omnivore");
  const avoid = new Set((prefs.avoidFoods||[]).map(x=>String(x).toLowerCase()));

  const data = await fetch("./data/recipes.json").then(r=>r.json()).catch(()=>({items:[]}));
  const items = (data.items||[]).filter(it=>{
    // diet match
    if(it.diets && Array.isArray(it.diets) && it.diets.length){
      if(!it.diets.includes("any") && !it.diets.includes(diet)) return false;
    }
    // avoid/allergen exclusion
    const a = new Set(((it.allergens||[]).map(x=>String(x).toLowerCase())));
    const i = new Set(((it.intolerances||[]).map(x=>String(x).toLowerCase())));
    for(const x of allergies){ if(a.has(x)) return false; }
    for(const x of intolerances){ if(i.has(x)) return false; }
    const tags = (it.tags||[]).map(x=>String(x).toLowerCase());
    for(const x of avoid){ if(tags.includes(x)) return false; }
    return true;
  });

  const chips = `
    <div class="row" style="gap:8px; flex-wrap:wrap">
      <span class="pill">Diet: ${escapeHtml(diet)}</span>
      ${(prefs.allergies||[]).length?`<span class="pill">Allergies: ${escapeHtml((prefs.allergies||[]).join(", "))}</span>`:""}
      ${(prefs.intolerances||[]).length?`<span class="pill">Intolérances: ${escapeHtml((prefs.intolerances||[]).join(", "))}</span>`:""}
      ${(prefs.avoidFoods||[]).length?`<span class="pill">Éviter: ${escapeHtml((prefs.avoidFoods||[]).join(", "))}</span>`:""}
    </div>
  `;

  const cards = items.map(it=>{
    const ing = (it.ingredients||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("");
    const steps = (it.steps||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("");
    const meta = [
      it.timeMin?`${it.timeMin} min`:"", it.kcal?`${it.kcal} kcal`:"", (it.proteinG!=null)?`${it.proteinG}g prot`:""
    ].filter(Boolean).join(" • ");
    return `
      <div class="card">
        <div class="row" style="justify-content:space-between; gap:10px">
          <div>
            <h3 style="margin:0">${escapeHtml(it.title||"Recette")}</h3>
            <div class="small">${escapeHtml(meta)}</div>
          </div>
          <button class="btn" data-add-recipe="${escapeHtml(it.id||"")}">Ajouter au journal</button>
        </div>
        ${it.note?`<p class="small">${escapeHtml(it.note)}</p>`:""}
        <div class="grid">
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:1px solid rgba(255,255,255,.08)">
            <div class="small"><b>Ingrédients</b></div>
            <ul class="small">${ing}</ul>
          </div>
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:1px solid rgba(255,255,255,.08)">
            <div class="small"><b>Étapes</b></div>
            <ol class="small">${steps}</ol>
          </div>
        </div>
      </div>
    `;
  }).join("");

  qs("#root").innerHTML = layout(`
    <div class="card">
      <h2>Recettes</h2>
      <p class="small">Filtrées automatiquement selon ton profil (régime, allergies, intolérances, aliments à éviter).</p>
      ${chips}
      <div class="hr"></div>
      <div class="row" style="gap:10px; flex-wrap:wrap">
        <a class="btn" href="/settings">Modifier le profil</a>
        <a class="btn" href="/library">Bibliothèque</a>
      </div>
    </div>
    ${cards || `<div class="card"><p class="small">Aucune recette ne correspond à tes filtres.</p></div>`}
  `);
  bindTopbar();

  // add-to-journal
  document.querySelectorAll("[data-add-recipe]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-add-recipe");
      const it = (data.items||[]).find(x=>String(x.id)===String(id));
      if(!it) return;
      addJournal({ts: Date.now(), title: `Recette: ${it.title}`, body: (it.ingredients||[]).join("\n"), tags:["recette", diet]});
      toast("Ajouté au journal.");
    });
  });
}

async function renderWorkouts(){
  if(!(await ensureConsent())) return;
  const db = loadDB();
  const health = (db.profile && db.profile.health) ? db.profile.health : {};
  const flags = {
    pregnant: !!health.pregnant,
    cardiac: !!health.cardiacIssues,
    rest: !!health.restIssues
  };

  const data = await fetch("./data/workouts.json").then(r=>r.json()).catch(()=>({items:[]}));
  const items = (data.items||[]).filter(it=>{
    if(it.level === "hiit" && (flags.pregnant || flags.cardiac)) return false;
    return true;
  });

  const cards = items.map(it=>{
    const ex = (it.exercises||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("");
    const meta = [
      it.durationMin?`${it.durationMin} min`:"", it.level?it.level.toUpperCase():""
    ].filter(Boolean).join(" • ");
    return `
      <div class="card">
        <div class="row" style="justify-content:space-between; gap:10px">
          <div>
            <h3 style="margin:0">${escapeHtml(it.title||"Séance")}</h3>
            <div class="small">${escapeHtml(meta)}</div>
          </div>
          <button class="btn" data-add-workout="${escapeHtml(it.id||"")}">Log séance</button>
        </div>
        ${it.note?`<p class="small">${escapeHtml(it.note)}</p>`:""}
        <div class="small"><b>Exercices</b></div>
        <ol class="small">${ex}</ol>
      </div>
    `;
  }).join("");

  qs("#root").innerHTML = layout(`
    <div class="card">
      <h2>Séances</h2>
      <p class="small">Les séances sont filtrées selon tes indicateurs “sécurité” (grossesse, cardiaque...).</p>
      <div class="row" style="gap:10px; flex-wrap:wrap">
        <a class="btn" href="/settings">Modifier le profil</a>
        <a class="btn" href="/armor">Armor (Fitness)</a>
      </div>
    </div>
    ${cards || `<div class="card"><p class="small">Aucune séance disponible.</p></div>`}
  `);
  bindTopbar();

  document.querySelectorAll("[data-add-workout]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-add-workout");
      const it = (data.items||[]).find(x=>String(x.id)===String(id));
      if(!it) return;
      addTraining({ts: Date.now(), planId: id, done: true, notes: it.title});
      toast("Séance enregistrée.");
    });
  });
}

async function renderGroceries(){
  if(!(await ensureConsent())) return;
  const db = loadDB();
  const prefs = (db.profile && db.profile.prefs) ? db.profile.prefs : {};
  const loc = prefs.location || {mode:"none", zip:"", city:""};
  const data = await fetch("./data/groceries.json").then(r=>r.json()).catch(()=>({stores:[], items:[]}));

  qs("#root").innerHTML = layout(`
    <div class="card">
      <h2>Liste de courses</h2>
      <p class="small">
        MVP (sans backend) : comparaison par <b>prix saisis</b> (ou import ticket plus tard).
        Le “temps réel” nécessite des APIs magasins / partenaires ou un backend.
      </p>
      <div class="row" style="gap:10px; flex-wrap:wrap">
        <a class="btn" href="/settings">Profil & localisation</a>
        <button class="btn" id="btnBasketReset">Reset panier</button>
      </div>
      <div class="hr"></div>
      <div class="small">
        Localisation : <b>${escapeHtml(loc.mode||"none")}</b>
        ${loc.zip?` • ${escapeHtml(loc.zip)} ${escapeHtml(loc.city||"")}`:""}
      </div>
    </div>

    <div class="card">
      <h3>Panier (comparatif)</h3>
      <p class="small">Ajoute des articles et renseigne les prix par magasin pour obtenir un total comparé.</p>
      <div id="basket"></div>
    </div>
  `);
  bindTopbar();

  // simple local basket
  if(!db.basket){ db.basket = {items:[], stores:(data.stores||[]) }; saveDB(db); }
  const basket = db.basket;

  const renderBasket = ()=>{
    const stores = basket.stores || [];
    const items = basket.items || [];
    const header = `
      <div class="row" style="gap:8px; flex-wrap:wrap; margin-bottom:8px">
        <button class="btn" id="btnAddItem">Ajouter article</button>
        <button class="btn" id="btnAddStore">Ajouter magasin</button>
      </div>
    `;
    const tableRows = items.map((it, idx)=>{
      const priceInputs = stores.map((s, si)=>{
        const val = (it.prices && it.prices[s.id]!=null) ? it.prices[s.id] : "";
        return `<input class="input" data-price="${idx}:${s.id}" placeholder="${escapeHtml(s.name)}" value="${escapeHtml(val)}" style="width:110px">`;
      }).join("");
      return `
        <div class="card" style="background:transparent; border:1px solid rgba(255,255,255,.08)">
          <div class="row" style="justify-content:space-between; gap:10px">
            <div><b>${escapeHtml(it.label)}</b> <span class="small">x${escapeHtml(String(it.qty||1))}</span></div>
            <button class="btn" data-del-item="${idx}">Suppr</button>
          </div>
          <div class="row" style="gap:8px; flex-wrap:wrap; margin-top:8px">${priceInputs}</div>
        </div>
      `;
    }).join("");

    const totals = stores.map(s=>{
      let sum=0;
      for(const it of items){
        const p = it.prices ? Number(it.prices[s.id]) : NaN;
        if(!isNaN(p)) sum += p * Number(it.qty||1);
      }
      return {name:s.name, total:sum};
    });
    const best = totals.length? totals.reduce((a,b)=> a.total<=b.total?a:b ) : null;

    const totalsUI = totals.map(t=>`<span class="pill">${escapeHtml(t.name)}: ${isFinite(t.total)?t.total.toFixed(2):"—"}€</span>`).join(" ");
    const bestUI = best? `<div class="small" style="margin-top:10px">Meilleur total: <b>${escapeHtml(best.name)}</b></div>` : "";

    qs("#basket").innerHTML = header + (tableRows || `<p class="small">Panier vide.</p>`) + `<div class="hr"></div><div class="row" style="gap:8px; flex-wrap:wrap">${totalsUI}</div>${bestUI}`;

    // bind
    qs("#btnAddItem")?.addEventListener("click", ()=>{
      const label = prompt("Article (ex: Poulet 1kg) :");
      if(!label) return;
      const qty = Number(prompt("Quantité :", "1")||"1");
      basket.items.push({label, qty:isNaN(qty)?1:qty, prices:{}});
      saveDB(db); renderBasket();
    });
    qs("#btnAddStore")?.addEventListener("click", ()=>{
      const name = prompt("Nom du magasin :", "Carrefour");
      if(!name) return;
      const id = "s_" + Math.random().toString(36).slice(2,9);
      basket.stores.push({id, name});
      saveDB(db); renderBasket();
    });
    document.querySelectorAll("[data-del-item]").forEach(b=>{
      b.addEventListener("click", ()=>{
        const i = Number(b.getAttribute("data-del-item"));
        basket.items.splice(i,1);
        saveDB(db); renderBasket();
      });
    });
    document.querySelectorAll("[data-price]").forEach(inp=>{
      inp.addEventListener("change", ()=>{
        const [idx, sid] = inp.getAttribute("data-price").split(":");
        const i = Number(idx);
        const v = String(inp.value).replace(",", ".");
        const num = v==="" ? null : Number(v);
        if(!basket.items[i].prices) basket.items[i].prices = {};
        if(num===null || isNaN(num)) delete basket.items[i].prices[sid];
        else basket.items[i].prices[sid]=num;
        saveDB(db); renderBasket();
      });
    });
  };

  qs("#btnBasketReset")?.addEventListener("click", ()=>{
    if(confirm("Réinitialiser le panier (local) ?")){
      basket.items=[]; saveDB(db); renderBasket();
    }
  });

  renderBasket();
}


route("/404", async () => {
  qs("#root").innerHTML = layout(`<div class="card"><h2>404</h2><p class="small">Page introuvable.</p></div>`);
  bindTopbar();
});

async function simpleMarkdownPage(path){
  if(!(await ensureConsent())) return;
  const txt = await fetch(`./${path}`).then(r=>r.text());
  qs("#root").innerHTML = layout(markdownToHtml(txt));
  bindTopbar();
}

function markdownToHtml(md){
  // tiny markdown: headings + lists + paragraphs
  const esc = escapeHtml;
  let out = md.split("\n").map(line => {
    if(line.startsWith("# ")){ return `<div class="card"><h2>${esc(line.slice(2))}</h2>`; }
    if(line.startsWith("## ")){ return `<h3>${esc(line.slice(3))}</h3>`; }
    if(line.startsWith("- ")){ return `<li class="small">${esc(line.slice(2))}</li>`; }
    if(line.trim()===""){ return ""; }
    return `<p class="small">${esc(line)}</p>`;
  }).join("\n");
  // wrap lists
  out = out.replace(/(<li[\s\S]*?<\/li>)/g, (m)=>m);
  out = out.replace(/(?:^|\n)(<li[\s\S]*?<\/li>(?:\n<li[\s\S]*?<\/li>)*)/g, (m, g1)=>`\n<ul>${g1}</ul>\n`);
  // close first card if any
  if(out.includes('<div class="card"><h2>') && !out.trim().endsWith("</div>")) out += "\n</div>";
  return `<div class="grid"><div class="card">${out}</div></div>`;
}

async function boot(){
  await loadI18n();
  const db = loadDB();
  setTheme(db.profile?.theme || "dark");


  // capture referral from URL (e.g., ?ref=AEG-ABC123)
  try{
    const u = new URL(location.href);
    const ref = u.searchParams.get("ref");
    if(ref){
      const db2 = loadDB();
      db2.profile.referredBy = db2.profile.referredBy || ref;
      saveDB(db2);
      // keep ref in URL? remove to avoid re-processing
      u.searchParams.delete("ref");
      history.replaceState({}, "", u.toString());
    }
  }catch(e){}

  // register SW
  if("serviceWorker" in navigator){
    try{ await navigator.serviceWorker.register("./sw.js"); }catch(e){}
  }

  document.addEventListener("click", onLinkNav);
  await render();
}

boot();
  // prefs values
  const dietEl = qs("#sDiet"); if(dietEl) dietEl.value = prefs.diet || "omnivore";
  const alEl = qs("#sAllergies"); if(alEl) alEl.value = (prefs.allergies||[]).join(", ");
  const inEl = qs("#sIntolerances"); if(inEl) inEl.value = (prefs.intolerances||[]).join(", ");
  const avEl = qs("#sAvoidFoods"); if(avEl) avEl.value = (prefs.avoidFoods||[]).join(", ");
  const lm = qs("#sLocMode"); if(lm) lm.value = loc.mode || "none";
  const z = qs("#sZip"); if(z) z.value = loc.zip || "";
  const c = qs("#sCity"); if(c) c.value = loc.city || "";

  const splitCSV = (s)=> String(s||"").split(",").map(x=>x.trim()).filter(Boolean);

  dietEl && dietEl.addEventListener("change", ()=>{ prefs.diet = dietEl.value; saveDB(db); });
  alEl && alEl.addEventListener("change", ()=>{ prefs.allergies = splitCSV(alEl.value); saveDB(db); });
  inEl && inEl.addEventListener("change", ()=>{ prefs.intolerances = splitCSV(inEl.value); saveDB(db); });
  avEl && avEl.addEventListener("change", ()=>{ prefs.avoidFoods = splitCSV(avEl.value); saveDB(db); });
  lm && lm.addEventListener("change", ()=>{ loc.mode = lm.value; saveDB(db); });
  z && z.addEventListener("change", ()=>{ loc.zip = z.value.trim(); saveDB(db); });
  c && c.addEventListener("change", ()=>{ loc.city = c.value.trim(); saveDB(db); });


