import {el} from '../utils/dom.js';
import {createBrand,installBrandIcon} from './brand.js';
import {createContactBlock} from './contact.js';
export const NAV_ITEMS=[{to:'/',label:'首页',match:'/'},{to:'/gallery',label:'数字展厅',match:'/gallery'},{to:'/studio',label:'Studio',match:'/studio'}];
export function buildV5Shell(){
  installBrandIcon();
  const nav=el('nav',{class:'v5-nav',id:'v5Nav','aria-label':'主导航'},...NAV_ITEMS.map(item=>el('a',{class:'v5-nav-link',href:'#'+item.to,'data-match':item.match},item.label)));
  const topbar=el('header',{class:'v5-topbar'},createBrand({href:'#/'}),nav);
  const outlet=el('main',{class:'v5-page',id:'v5Outlet'});
  const footer=el('footer',{class:'v5-footer'},el('div',{class:'ex-footer-row'},createBrand({size:'small'}),el('span',{class:'ex-footer-credit'},'琼剧数字手办 · 非商业文化展示'),createContactBlock()));
  return {shell:el('div',{class:'v5-shell'},topbar,outlet,footer),outlet,nav,topbar,footer};
}
export function syncNavActive(nav,pattern){
  for(const a of nav.querySelectorAll('.v5-nav-link')){
    const on=a.dataset.match===pattern||(a.dataset.match==='/'&&pattern==='/work/:id');
    if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  }
}
