// Application integration only. Final artwork belongs to the independent Logo workspace.
import { el } from '../utils/dom.js';

export const BRAND = {
  name: 'FORMA',
  image: null, // Approved local SVG, transparent PNG or WebP; e.g. ./assets/brand/forma-light.svg
  favicon: null,
  lockup: 'wordmark', // both | wordmark | symbol (always falls back to readable text)
};

// Existing V5 mark, unchanged. Never an unapproved replacement design.
const LEGACY_MARK = `<svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
  <circle cx="20" cy="19" r="14.2" stroke="currentColor" stroke-width="1.4" opacity=".92"/>
  <path d="M20 8.4v11.2M20 19.6l-5.4 4.6M20 19.6l5.4 4.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".82"/>
  <path d="M13.6 28.2h12.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".62"/>
  <path d="M6.6 33.4h26.8" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity=".4"/>
</svg>`;

export function createBrand({size='nav',lockup=BRAND.lockup,href=null,version='',image=BRAND.image}={}) {
  const text=el('span',{class:'v5-brand-text'},BRAND.name);
  if(version)text.append(el('span',{class:'v5-brand-ver'},version));
  const mark=el('span',{class:'v5-brand-mark','aria-hidden':'true'});
  const node=el(href?'a':'span',{class:'v5-brand',href,'data-brand-size':size,'data-brand-state':'idle','aria-label':href?'FORMA 首页':'FORMA'},mark,text);
  if(image){
    const img=el('img',{src:image,alt:'',decoding:'async',draggable:false});
    img.addEventListener('error',()=>{mark.hidden=true;text.hidden=false;node.dataset.brandFallback='text';});
    mark.append(img);
  }else mark.innerHTML=LEGACY_MARK;
  mark.hidden=lockup==='wordmark';
  text.hidden=lockup==='symbol'&&!!image;
  return node;
}

// Optional future animation hook; no animation, delay, loader or navigation dependency.
export function setBrandState(node,state='idle') {
  node.dataset.brandState=['idle','loading','ready','pressed'].includes(state)?state:'idle';
  node.dispatchEvent(new CustomEvent('forma:brand-state',{detail:{state:node.dataset.brandState,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches}}));
}

export function installBrandIcon(){
  if(!BRAND.favicon)return;
  const icon=document.querySelector('link[rel="icon"]')||el('link',{rel:'icon'});
  icon.href=BRAND.favicon;document.head.append(icon);
}
