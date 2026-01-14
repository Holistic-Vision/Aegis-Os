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
  const db = loadDB();
  qs("#themeBtn")?.addEventListener("click", () => {
    const next = (db.profile.theme === "dark") ? "light" : "dark";
    setTheme(next);
  });
  qs("#langBtn")?.addEventListener("click", () => {
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
          <span class="pill">v0.1</span> · PWA GitHub Pages · stockage local
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

route("/library", async () => {
  if(!(await ensureConsent())) return;
  const lib = await fetch("./modules/library.json").then(r=>r.json()).catch(()=>({sections:[]}));
  const sections = (lib.sections||[]).map(s => `
    <div class="card">
      <h2 id="${escapeHtml(s.id)}">${escapeHtml(s.title)}</h2>
      <div class="small">${escapeHtml(s.desc||"")}</div>
      <hr />
      <ul class="small">
        ${(s.items||[]).map(it => `<li><a href="${escapeHtml(it.url)}" target="_blank" rel="noopener">${escapeHtml(it.label)}</a></li>`).join("")}
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

  function genReferral(){
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "AEG-";
    for(let i=0;i<6;i++) s += chars[Math.floor(Math.random()*chars.length)];
    return s;
  }

  const html = layout(`
    <div class="grid">
      <div class="card">
        <h2>${escapeHtml(get("accountTitle"))}</h2>
        <div class="small">MVP: compte local (pas de serveur). Pour un vrai SaaS: auth + backend.</div>
        <hr />
        <label class="small">${escapeHtml(get("email"))}</label>
        <input class="input" id="email" placeholder="name@email.com" value="${escapeHtml(db.profile.email||"")}" />
        <div style="height:8px"></div>
        <label class="small">${escapeHtml(get("referral"))}</label>
        <input class="input" id="referredBy" placeholder="AEG-XXXXXX" value="${escapeHtml(db.profile.referredBy||"")}" />
        <div class="small" style="margin-top:8px">${escapeHtml(get("referralExplain"))}</div>
        <hr />
        <h3 style="margin:0 0 8px 0">Profil & sécurité</h3>
        <div class="grid">
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:none; padding:0">
            <label class="small">${escapeHtml(get("pregnant"))}</label>
            <select id="pregnant" class="input">
              <option value="false">${escapeHtml(get("none"))}</option>
              <option value="true">Oui</option>
            </select>
          </div>
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:none; padding:0">
            <label class="small">${escapeHtml(get("menopause"))}</label>
            <select id="menopause" class="input">
              <option value="false">${escapeHtml(get("none"))}</option>
              <option value="true">Oui</option>
            </select>
          </div>
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:none; padding:0">
            <label class="small">${escapeHtml(get("andropause"))}</label>
            <select id="andropause" class="input">
              <option value="false">${escapeHtml(get("none"))}</option>
              <option value="true">Oui</option>
            </select>
          </div>
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:none; padding:0">
            <label class="small">${escapeHtml(get("smokerType"))}</label>
            <select id="smokerType" class="input">
              <option value="none">${escapeHtml(get("none"))}</option>
              <option value="cig">${escapeHtml(get("cigarettes"))}</option>
              <option value="vape">${escapeHtml(get("vape"))}</option>
              <option value="both">${escapeHtml(get("both"))}</option>
            </select>
          </div>
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:none; padding:0">
            <label class="small">${escapeHtml(get("smokerPerDay"))}</label>
            <input class="input" id="smokerPerDay" inputmode="numeric" placeholder="0" />
          </div>
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:none; padding:0">
            <label class="small">${escapeHtml(get("cardiac"))}</label>
            <select id="cardiac" class="input">
              <option value="false">${escapeHtml(get("none"))}</option>
              <option value="true">Oui</option>
            </select>
          </div>
          <div class="card" style="grid-column: span 12; background:transparent; box-shadow:none; border:none; padding:0">
            <label class="small">${escapeHtml(get("restIssues"))}</label>
            <select id="restIssues" class="input">
              <option value="false">${escapeHtml(get("none"))}</option>
              <option value="true">Oui</option>
            </select>
          </div>
        </div>

        <hr />
        <div class="row">
          <div class="kpi">
            <div class="small">${escapeHtml(get("myReferral"))}</div>
            <b id="myRef">${escapeHtml(db.profile.referralCode||"—")}</b>
            <div class="small" style="margin-top:6px">${escapeHtml(get("referralLink"))}: <span id="myLink">—</span></div>
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn primary" id="saveAcc">${escapeHtml(get("createAccount"))}</button>
          <a class="btn ghost" data-nav href="/support">${escapeHtml(get("navSupport"))}</a>
        </div>
      </div>
    </div>
  `);
  qs("#root").innerHTML = html;
  bindTopbar();

  // init health fields
  const h = (db.profile.health || {});
  qs("#pregnant").value = String(!!h.pregnant);
  qs("#menopause").value = String(!!h.menopause);
  qs("#andropause").value = String(!!h.andropause);
  qs("#smokerType").value = h.smokerType || "none";
  qs("#smokerPerDay").value = String(h.smokerPerDay ?? 0);
  qs("#cardiac").value = String(!!h.cardiacIssues);
  qs("#restIssues").value = String(!!h.restIssues);

  function updateLink(){
    const db3 = loadDB();
    const code = db3.profile.referralCode;
    const link = code ? `${location.origin}${location.pathname}?ref=${code}` : "—";
    qs("#myLink").textContent = link;
  }
  updateLink();

  qs("#saveAcc").addEventListener("click", () => {
    const db2 = loadDB();
    db2.profile.email = qs("#email").value.trim();
    db2.profile.referredBy = qs("#referredBy").value.trim() || null;
    if(!db2.profile.referralCode) db2.profile.referralCode = genReferral();
    db2.profile.health = db2.profile.health || {};
    db2.profile.health.pregnant = (qs("#pregnant").value === "true");
    db2.profile.health.menopause = (qs("#menopause").value === "true");
    db2.profile.health.andropause = (qs("#andropause").value === "true");
    db2.profile.health.smokerType = qs("#smokerType").value;
    db2.profile.health.smokerPerDay = parseInt(qs("#smokerPerDay").value,10);
    if(!Number.isFinite(db2.profile.health.smokerPerDay)) db2.profile.health.smokerPerDay = 0;
    db2.profile.health.cardiacIssues = (qs("#cardiac").value === "true");
    db2.profile.health.restIssues = (qs("#restIssues").value === "true");
    saveDB(db2);
    qs("#myRef").textContent = db2.profile.referralCode;
    updateLink();
    alert("Compte local mis à jour.");
  });
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
