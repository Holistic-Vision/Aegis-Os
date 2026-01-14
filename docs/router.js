export const routes = new Map();

export function route(path, handler){
  routes.set(path, handler);
}

export function navigate(path){
  history.pushState({}, "", path);
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
  const path = currentPath();
  const handler = routes.get(path) || routes.get("/404");
  await handler();
  // navbar active
  qsa(".navitem").forEach(el => {
    const href = el.getAttribute("href").replace(/\/+$/, "") || "/";
    el.classList.toggle("active", href === path);
  });
}

window.addEventListener("popstate", render);
