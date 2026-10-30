/* Adds phone handoff without changing index.html or its navigation handlers. */
'use strict';
(() => {
 let selected=null;
 const root=new URL('../',document.currentScript.src);
 const style=document.createElement('style');style.textContent='#detail-description{white-space:pre-line}#event-phone-handoff{margin-top:28px;padding-top:24px;border-top:1px solid #ccc}#event-phone-handoff .handoff-qr{display:block;width:240px;max-width:100%;height:auto;background:#fff}#event-phone-handoff .handoff-url{overflow-wrap:anywhere;font-size:18px}#event-phone-handoff .event-guide{display:block;max-width:100%;height:auto;margin-top:20px}';document.head.append(style);
 const panel=document.createElement('section');panel.id='event-phone-handoff';document.querySelector('#view-detail .detail-card').append(panel);
 function render(){
  const e=(window.OLG_EVENTS||[]).find(e=>e.id===selected);panel.replaceChildren();if(!e)return;
  const es=document.documentElement.lang==='es';
  const h=document.createElement('h3');h.textContent=es?'Lleve los detalles a su teléfono':'Take the details to your phone';
  const p=document.createElement('p');p.textContent=es?'Escanee para ver enlaces, videos y formularios. Los botones Atrás e Inicio permanecen disponibles en este kiosco.':'Scan for links, videos and forms. Back and Home remain available on this kiosk.';
  const qr=document.createElement('img');qr.className='handoff-qr';qr.src=new URL('events/qr/'+e.id+'.png',root).href;qr.alt=es?'Código QR de la página del evento':'QR code for this event page';
  const url=document.createElement('p');url.className='handoff-url';url.textContent='commsolg.github.io/olg-kiosk/events/'+e.id+'/';panel.append(h,p,qr,url);
  for(const guide of e.gallery||[]){const caption=document.createElement('p');caption.textContent=es?guide.captionEs:guide.caption;const img=document.createElement('img');img.className='event-guide';img.src=new URL(guide.image,root).href;img.alt=caption.textContent;panel.append(caption,img);}
 }
 document.addEventListener('click',event=>{const card=event.target.closest('[data-event]');if(card){selected=card.dataset.event;render();}if(event.target.closest('#language-toggle'))render();});
})();
