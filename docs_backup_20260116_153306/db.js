const KEY = "aegis.db.v0_1";

export function loadDB(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return seedDB();
    const db = JSON.parse(raw);
    return migrateDB(db);
  }catch(e){
    return seedDB();
  }
}


function migrateDB(db){
  if(!db || typeof db !== "object") return seedDB();
  if(!db.profile) db.profile = seedDB().profile;
  if(!db.profile.prefs){
    db.profile.prefs = { diet:"omnivore", allergies:[], intolerances:[], avoidFoods:[], location:{mode:"none", zip:"", city:""} };
  }else{
    db.profile.prefs.diet = db.profile.prefs.diet || "omnivore";
    db.profile.prefs.allergies = Array.isArray(db.profile.prefs.allergies)?db.profile.prefs.allergies:[];
    db.profile.prefs.intolerances = Array.isArray(db.profile.prefs.intolerances)?db.profile.prefs.intolerances:[];
    db.profile.prefs.avoidFoods = Array.isArray(db.profile.prefs.avoidFoods)?db.profile.prefs.avoidFoods:[];
    if(!db.profile.prefs.location) db.profile.prefs.location = {mode:"none", zip:"", city:""};
    db.profile.prefs.location.mode = db.profile.prefs.location.mode || "none";
    db.profile.prefs.location.zip = db.profile.prefs.location.zip || "";
    db.profile.prefs.location.city = db.profile.prefs.location.city || "";
  }
  if(!db.basket){
    db.basket = {items:[], stores:[{id:"carrefour", name:"Carrefour"},{id:"leclerc", name:"E.Leclerc"},{id:"auchan", name:"Auchan"}]};
  }
  // ensure arrays
  db.checkins = Array.isArray(db.checkins)?db.checkins:[];
  db.journal = Array.isArray(db.journal)?db.journal:[];
  db.training = Array.isArray(db.training)?db.training:[];
  db.pelvic = Array.isArray(db.pelvic)?db.pelvic:[];
  db.nutrition = Array.isArray(db.nutrition)?db.nutrition:[];
  db.reminders = Array.isArray(db.reminders)?db.reminders:[];
  return db;
}

export function saveDB(db){
  localStorage.setItem(KEY, JSON.stringify(db));
}

export function seedDB(){
  return {
    version: "0.1",
    createdAt: new Date().toISOString(),
    profile: {
      displayName: "Utilisateur",
      email: "",
      referralCode: null,
      referredBy: null,
      lang: (navigator.language||"fr").startsWith("fr") ? "fr" : "en",
      theme: "dark",
      consentAcceptedAt: null,
      health: {
        pregnant: false,
        menopause: false,
        andropause: false,
        smokerType: "none",
        smokerPerDay: 0,
        cardiacIssues: false,
        restIssues: false
      },
      prefs: {
        diet: "omnivore",
        allergies: [],
        intolerances: [],
        avoidFoods: [],
        location: { mode: "none", zip: "", city: "" }
      },
      overrides: {
        hiitUnlockedUntil: null,
        hiitUnlockLog: []
      }
    },
    ai: {
      provider: "openai",
      apiKey: null,
      model: "gpt-4.1-mini" // placeholder; user can change
    },
    checkins: [],   // {ts, mood, energy, sleep, stress, notes}
    journal: [],    // {ts, title, body, tags[]}
    training: [],   // {ts, planId, done, notes}
    pelvic: [],     // {ts, planId, done, notes}
    nutrition: [],  // {ts, planId, notes}
    reminders: []   // {id, label, timeHHMM, days:[0..6], enabled}
  };
}

export function addCheckin(entry){
  const db = loadDB();
  db.checkins.push(entry);
  saveDB(db);
  return db;
}

export function addJournal(entry){
  const db = loadDB();
  db.journal.push(entry);
  saveDB(db);
  return db;
}

export function upsertReminder(rem){
  const db = loadDB();
  const idx = db.reminders.findIndex(r => r.id === rem.id);
  if(idx >= 0) db.reminders[idx] = rem;
  else db.reminders.push(rem);
  saveDB(db);
  return db;
}

export function deleteReminder(id){
  const db = loadDB();
  db.reminders = db.reminders.filter(r => r.id !== id);
  saveDB(db);
  return db;
}

export function exportDB(){
  const db = loadDB();
  const blob = new Blob([JSON.stringify(db, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `aegis_export_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importDB(file){
  const text = await file.text();
  const parsed = JSON.parse(text);
  localStorage.setItem(KEY, JSON.stringify(parsed));
  return parsed;
}
