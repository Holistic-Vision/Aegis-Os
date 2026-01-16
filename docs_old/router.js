// AEGIS simple SPA router (GitHub Pages compatible)
// - supports deep links via 404.html -> ?p=...
// - intercepts internal links and uses History API
// - provides: route, render, navigate, onLinkNav
// - exports helpers:
//    - qs(sel, root?) : DOM querySelector helper
//    - qsp(search?)    : querystring -> object

const routes = [];
let started = false;

// DOM helper
export function qs(sel, root = document){
  try { return root.querySelector(sel); } catch(e){ return null; }
}

// Querystring helper (used by router and can be used by modules)
export function qsp(search = location.search){
  const out = {};
  try {
    const sp = new URLSearchParams(search.startsWith('?') ? search : ('?' + search));
    for (const [k, v] of sp.entries()) {
      if (out[k] === undefined) out[k] = v;
      else if (Array.isArray(out[k])) out[k].push(v);
      else out[k] = [out[k], v];
    }
  } catch (e) {}
  return out;
}

export function qsa(sel, root = document){
  try { return Array.from(root.querySelectorAll(sel)); } catch(e){ return []; }
}

function detectBase(){
  // GitHub Pages project site: /<repo>/
  const path = location.pathname || "/";
  const parts = path.split("/").filter(Boolean);
  // If hosted at domain root (custom domain), base is "/"
  if (parts.length === 0) return "/";
  // Heuristic: if index is served under repo folder, keep first segment as base
  // Example: /Aegis-Os/ or /Aegis-Os/home
  return "/" + parts[0] + "/";
}

const BASE = detectBase();

function stripBase(pathname){
  if (BASE === "/") return pathname || "/";
  if (pathname.startsWith(BASE)) return "/" + pathname.slice(BASE.length);
  // also accept without trailing slash in BASE
  const baseNoTrail = BASE.endsWith("/") ? BASE.slice(0,-1) : BASE;
  if (pathname.startsWith(baseNoTrail)) return "/" + pathname.slice(baseNoTrail.length);
  return pathname || "/";
}

function withBase(path){
  if (!path.startsWith("/")) path = "/" + path;
  if (BASE === "/") return path;
  const baseNoTrail = BASE.endsWith("/") ? BASE.slice(0,-1) : BASE;
  return baseNoTrail + path;
}

function parseParams(pattern, path){
  const pParts = pattern.split("/").filter(Boolean);
  const aParts = path.split("/").filter(Boolean);
  if (pParts.length !== aParts.length) return null;
  const params = {};
  for (let i=0;i<pParts.length;i++){
    const pp = pParts[i];
    const ap = aParts[i];
    if (pp.startsWith(":")) params[pp.slice(1)] = decodeURIComponent(ap);
    else if (pp !== ap) return null;
  }
  return params;
}

export function route(pattern, handler){
  routes.push({ pattern, handler });
}

function normalizeInitialPath(){
  // Support deep-link redirect from 404.html: ?p=/home
  const q = qsp();
  if (q.p){
    const target = String(q.p);
    // clean URL: replaceState without query param (keep other params if needed later)
    history.replaceState({}, "", withBase(target));
    return target;
  }
  return stripBase(location.pathname);
}

export async function render(){
  const path = normalizeInitialPath();
  const query = qsp();
  for (const r of routes){
    const params = parseParams(r.pattern, path);
    if (params){
      await r.handler({ path, params, query });
      return;
    }
  }
  // Not found => redirect to home (SPA)
  await navigate("/home", true);
}

export async function navigate(path, replace=false){
  // Keep absolute URLs untouched
  if (!path) return;
  if (/^https?:\/\//i.test(path)){
    location.href = path;
    return;
  }
  if (!path.startsWith("/")) path = "/" + path;
  const url = withBase(path);
  if (replace) history.replaceState({}, "", url);
  else history.pushState({}, "", url);
  await render();
}

export function onLinkNav(){
  if (started) return;
  started = true;

  // Click interception for internal links
  document.addEventListener("click", (ev)=>{
    const a = ev.target && ev.target.closest ? ev.target.closest("a") : null;
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (!href || href.startsWith("#")) return;
    // only same-origin relative links
    if (href.startsWith("http://") || href.startsWith("https://")) return;
    // allow opt-out
    if (a.hasAttribute("data-external")) return;
    // ignore downloads
    if (a.hasAttribute("download")) return;

    ev.preventDefault();
    // Normalize: if href is like "./home" or "home"
    let p = href;
    if (p.startsWith(".")) p = p.replace(/^\.+/, "");
    if (!p.startsWith("/")) p = "/" + p;
    navigate(p);
  }, { passive: false });

  window.addEventListener("popstate", ()=>{ render(); });
}
