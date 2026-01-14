const BASE_PATH = (() => {
  try{
    const host = location.hostname || "";
    const p = (location.pathname || "/");
    const seg = p.split("/").filter(Boolean)[0] || "";
    if(host.endsWith("github.io") && seg) return "/" + seg;
  }catch(e){}
  return "";
})();

function withBase(path){
  if(!path) return BASE_PATH || "/";
  if(BASE_PATH && path.startsWith("/") && !path.startsWith(BASE_PATH + "/") && path !== BASE_PATH){
    return BASE_PATH + path;
  }
  return path;
}

function stripBase(pathname){
  if(!BASE_PATH) return pathname;
  if(pathname === BASE_PATH) return "/";
  if(pathname.startsWith(BASE_PATH + "/")) return pathname.slice(BASE_PATH.length) || "/";
  return pathname;
}

function normalizeInitialPath(){
  try{
    const raw = location.pathname || "/";
    const normalized = stripBase(raw) || "/";
    const n = normalized.replace(/\/+$/, "") || "/";
    if(n === "/" || n === ""){
      history.replaceState({}, "", withBase("/home"));
      return "/home";
    }
    return n;
  }catch(e){
    try{ history.replaceState({}, "", withBase("/home")); }catch(_){}
    return "/home";
  }
}


export const routes = new Map();

export function route(path, handler){
  routes.set(path, handler);
}

export function navigate(path){
  history.pushState({}, "", withBase(path));
  render();
}

export function currentPath(){
  const url = new URL(location.href);
  return url.pathname.replace(/\/+$/, "") || "/";
}

export function qs(sel, root=document){ return root.querySelector(sel); }
export function qsa(sel, root=document){ return [...root.querySelectorAll(sel)]; }

export function onLinkNav(e){
  const a = e.target.closest("a[data-nav]");
  if(!a) return;
  e.preventDefault();
  navigate(a.getAttribute("href"));
}

export async function render(){
  const path = normalizeInitialPath();
  const handler = routes.get(path) || routes.get("/404");
  await handler();
  // navbar active
  qsa(".navitem").forEach(el => {
    const href = el.getAttribute("href").replace(/\/+$/, "") || "/";
    el.classList.toggle("active", href === path);
  });
}

window.addEventListener("popstate", render);