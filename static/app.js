(async function(){
"use strict";
/* ===== Chargement des données depuis le back-end Flask =====
   L'ancienne version lisait le JSON directement depuis des balises
   <script type="application/json"> intégrées dans la page (fichier unique
   auto-porté). Ici, les mêmes données sont servies par l'API Flask et
   chargées en parallèle au démarrage ; le reste du programme (rendu,
   graphiques, carte, explorateur...) est inchangé et continue de
   travailler sur les mêmes variables WH / RAW / C / GEO. */
const API='';
async function getJSON(url){const r=await fetch(API+url,{credentials:'same-origin'});if(!r.ok)throw new Error(url+' -> HTTP '+r.status);return r.json();}
let WH,RAW,GEO;
try{
  [WH,RAW,GEO]=await Promise.all([
    getJSON('/api/warehouse'),
    getJSON('/api/content'),
    getJSON('/api/geo').catch(()=>null),
  ]);
}catch(err){
  document.getElementById('app').innerHTML='<div class="empty" style="margin:40px">Impossible de charger les données depuis le serveur ('+esc0(err&&err.message||err)+'). Vérifiez que le back-end Flask est bien démarré.</div>';
  function esc0(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
  throw err;
}
let C=RAW.content;
/* ===== Valeurs par défaut du contenu éditorial =====
   Ces champs peuvent ne pas exister encore dans la base (contenu importé
   avant l'ajout de cette fonctionnalité) : on les complète ici en mémoire
   pour que (a) l'affichage ne soit jamais vide et (b) ces champs deviennent
   éditables comme les autres dès la première sauvegarde (elle enverra la
   version complétée au serveur). */
C.brand=Object.assign({name:'TransparenceRDC',full:"Initiative pour la Transparence des Industries Extractives",tagline:'',tagline_short:'Entrepôt de données ITIE'},C.brand||{});
C.footer=Object.assign({note:'',note_short:'Données publiques ITIE · 2007–2024'},C.footer||{});
C.nav_hidden=Array.isArray(C.nav_hidden)?C.nav_hidden:[];
C.intros=Object.assign({
  explorer:"Filtrez chaque table sur autant de colonnes que voulu simultanément (année, entreprise, flux, régie, entité perceptrice, province, état, produit…), combinez les critères, triez, et lisez les totaux exacts de la sélection.",
  viz:"Choisissez une table, une dimension, une mesure et un type de graphique. Idéal pour explorer visuellement n'importe quelle donnée de l'entrepôt.",
  geo:"Explorez les données ITIE par province et territoire de la République Démocratique du Congo.",
  model:"L'entrepôt suit un schéma en étoile : des tables de faits (mesures) reliées à des tables de dimensions (contexte).",
  dict:"Description complète de chaque table et de chaque colonne de l'entrepôt de données.",
  qualite:"Complétude, doublons et anomalies détectées et traitées lors de l'intégration.",
  reports:"Rapports annuels, thématiques, contextuels, forestiers, d'avancement et de validation publiés par l'ITIE-RDC.",
},C.intros||{});
const DS=WH.datasets, AGG=WH.agg, O=WH.officiel2023, STATS=WH.stats;

/* ===== Référentiels canoniques (provinces / entreprises / flux / entités
   perceptrices) =====
   L'entrepôt contient de nombreuses variantes d'un même libellé (casse,
   accents, tirets, codes ISO, anciennes orthographes) : ex. « HAUT KATANGA »,
   « Haut-Katanga » et « CD-HK » désignent la même province, ce qui
   fragmentait les filtres et faussait les agrégations (audit qualité,
   sept. 2026). L'entrepôt contient déjà un référentiel de correspondance
   pour entreprises/flux/entités perceptrices (table `ref_canoniques`,
   6 166 lignes) qui n'était simplement pas branché à l'interface ; les
   provinces sont canonicalisées à partir de la même liste que la carte
   (`GEO.prov_ref`, source unique des 26 provinces de la RDC).
   Principe : on ne réécrit JAMAIS la valeur brute stockée (traçabilité des
   déclarations officielles) — seules les vues d'agrégation et les listes de
   filtres regroupent les variantes sous leur libellé canonique. */
function stripAccents(s){return String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'');}
function normKey(s){return stripAccents(s).toUpperCase().replace(/[-_]/g,' ').replace(/\s+/g,' ').trim();}
// Corrections ponctuelles de fautes de frappe à fort volume, non couvertes
// par la simple normalisation casse/accents/tirets ci-dessus.
const PROVINCE_ALIASES={'Tanganyka':'Tanganyika'};
// colonne "table.colonne" -> dimension du référentiel à appliquer. Limité
// aux tables de faits/dimensions/contextuelles bien identifiées (pas aux
// annexes brutes, dont les en-têtes de colonnes sont trop hétérogènes pour
// un rattachement fiable et automatique).
const CANON_COLS={
  'fait_reconciliation_flux.flux_libelle':'flux','fait_reconciliation_flux.regie_libelle':'entité perceptrice',
  'fait_reconciliation_entreprise.entreprise':'entreprise','fait_depense_sociale.entreprise':'entreprise',
  'ctx_depense_environnementale.SOCIETE':'entreprise','ctx_effectif.Société':'entreprise','ctx_depense_sociale.SOCIETE':'entreprise',
  'ctx_pret_subvention.SOCIETE':'entreprise','ctx_participation_publique.entreprise':'entreprise','ctx_structure_capital.SOCIETE':'entreprise',
  'ctx_transaction_troc.SOCIETE':'entreprise','ctx_paiement_infranational.Régie':'entité perceptrice','ctx_paiement_infranational.Flux':'flux',
  'ctx_exportation.SOCIETE':'entreprise','ctx_production.SOCIETE':'entreprise','ctx_propriete.SOCIETE':'entreprise',
  'ctx_paiement_infranational_detail.entreprise':'entreprise','ctx_paiement_infranational_detail.flux':'flux',
  'ctx_paiement_infranational_detail.percepteur':'entité perceptrice','ctx_paiement_infranational_detail.province':'province',
  'cadrage_2024_paiements.entreprise':'entreprise','cadrage_2024_paiements.percepteur':'entité perceptrice',
  'ref_entites_infranationales.province':'province',
  'ent_revenus_flux.Flux harmonisé':'flux','ent_revenus_flux.Entité perceptrice harmonisée':'entité perceptrice',
  'ent_revenus_entite.Entité perceptrice harmonisée':'entité perceptrice','ent_production.Entreprise':'entreprise',
  'ent_exportations.Entreprise':'entreprise','ent_depenses_sociales.Entreprise':'entreprise',
};
function canonDimFor(tableName,col){return CANON_COLS[tableName+'.'+col]||null;}
const CANON_LOOKUP={entreprise:new Map(),'entité perceptrice':new Map(),flux:new Map(),province:new Map()};
(function buildCanon(){
  const rc=DS.ref_canoniques;
  if(rc){
    const di=rc.cols.indexOf('dimension'),bi=rc.cols.indexOf('libelle_brut'),ci=rc.cols.indexOf('nom_canonique');
    if(di>=0&&bi>=0&&ci>=0)rc.rows.forEach(r=>{const map=CANON_LOOKUP[r[di]];if(map)map.set(normKey(r[bi]),r[ci]);});
  }
  if(GEO&&GEO.prov_ref){
    Object.entries(GEO.prov_ref).forEach(([iso,name])=>{CANON_LOOKUP.province.set(normKey(iso),name);CANON_LOOKUP.province.set(normKey(name),name);});
  }
  Object.entries(PROVINCE_ALIASES).forEach(([raw,can])=>CANON_LOOKUP.province.set(normKey(raw),can));
})();
function canonicalize(dim,raw){
  const map=CANON_LOOKUP[dim];if(!map||raw==null||raw==='')return raw;
  const hit=map.get(normKey(raw));
  return hit!=null?hit:raw; // variante non référencée : conservée telle quelle (traçabilité de la déclaration d'origine)
}

const $=(s,r)=>(r||document).querySelector(s),$$=(s,r)=>[...(r||document).querySelectorAll(s)];
const NS='http://www.w3.org/2000/svg';
const svgEl=(n,a)=>{const e=document.createElementNS(NS,n);for(const k in a)e.setAttribute(k,a[k]);return e;};
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const css=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const PALETTE=()=>['--sky','--red','--amber','--teal','--violet','--green','--blue','--yellow'].map(css);
function fmtUSD(n){if(n==null||isNaN(n))return '—';const a=Math.abs(n);
  if(a>=1e9)return (n/1e9).toFixed(a>=1e10?1:2).replace('.',',')+' Md$';
  if(a>=1e6)return (n/1e6).toFixed(a>=1e8?0:1).replace('.',',')+' M$';
  if(a>=1e3)return Math.round(n/1e3)+' k$';return String(Math.round(n));}
const fmtN=n=>(typeof n==='number'?n:Number(n)).toLocaleString('fr-FR');
function fmtCell(v,type){if(v==null||v==='')return '';if(type==='num'&&typeof v==='number')return Number.isInteger(v)?fmtN(v):v.toLocaleString('fr-FR',{maximumFractionDigits:2});return String(v);}
function getPath(o,p){return p.split('.').reduce((a,k)=>a==null?a:a[k],o);}
function assignPath(o,p,v){const ks=p.split('.');let x=o;for(let i=0;i<ks.length-1;i++){if(x[ks[i]]==null)x[ks[i]]={};x=x[ks[i]];}x[ks[ks.length-1]]=v;}

/* ===== data helpers ===== */
function colIndex(name,col){return DS[name].cols.indexOf(col);}
function yearCol(name){const cs=DS[name].cols;
  let c=cs.find(x=>/^ann[eé]es?$/i.test(x));if(c)return c;         // Année / Années / annee
  if(cs.includes('exercice_id'))return 'exercice_id';
  c=cs.find(x=>/ann[eé]e/i.test(x));return c||null;}
function yearVal(v){if(v==null)return null;const m=String(v).match(/(19|20)\d{2}/);return m?+m[0]:null;}
function isPct(col){return /pourcent|%|taux|pct|part/i.test(col);}
function isIdCol(col){return /^(rid|id)$|_id$|identifi|code|numero|n°|register|iso\d/i.test(col);}
function isYearLikeCol(name,col){if(/^ann[eé]es?$/i.test(col))return true;const yc=yearCol(name);return !!yc&&yc===col;}
// colonnes numériques qu'il est licite de sommer : ni identifiant, ni année/exercice
// (additionner une année ou un code n'a pas de sens analytique — cf. audit qualité)
function isSummableNumCol(name,col){return !isIdCol(col)&&!isYearLikeCol(name,col);}
function aggregate(name,groupCol,measureCol,agg,filterYear){
  const d=DS[name],gi=d.cols.indexOf(groupCol),mi=measureCol?d.cols.indexOf(measureCol):-1,yc=yearCol(name),yi=yc?d.cols.indexOf(yc):-1;
  const gdim=canonDimFor(name,groupCol);
  const map=new Map();
  for(const r of d.rows){
    if(filterYear&&yi>=0&&yearVal(r[yi])!==+filterYear)continue;
    const gv=r[gi];
    const k=(gv==null||gv==='')?'(vide)':String(gdim?canonicalize(gdim,gv):gv);
    let a=map.get(k);if(!a){a={sum:0,count:0,n:0,min:Infinity,max:-Infinity};map.set(k,a);}
    a.count++;                                   // total rows in group
    if(mi>=0){const raw=r[mi];if(raw!==null&&raw!==''){const v=Number(raw);if(!isNaN(v)){a.sum+=v;a.n++;if(v<a.min)a.min=v;if(v>a.max)a.max=v;}}}
  }
  // avg divides by count of NON-NULL measured values (a.n), not all rows
  return [...map.entries()].map(([label,a])=>({label,value:agg==='count'?a.count:agg==='avg'?(a.n?a.sum/a.n:0):agg==='min'?(a.min===Infinity?0:a.min):agg==='max'?(a.max===-Infinity?0:a.max):a.sum,n:a.n}));
}
function numericStats(name,col){const i=colIndex(name,col);let sum=0,n=0,min=Infinity,max=-Infinity,nn=0;const seen=new Set();
  for(const r of DS[name].rows){const v=r[i];if(v!=null&&v!=='')seen.add(String(v));const x=Number(v);if(v!=null&&v!==''&&!isNaN(x)){sum+=x;n++;if(x<min)min=x;if(x>max)max=x;}else if(v==null||v==='')nn++;}
  return {sum,avg:n?sum/n:0,min:n?min:0,max:n?max:0,count:n,distinct:seen.size,nulls:nn};}

/* ===== chart engine ===== */
function baseSvg(W,H,desc){const s=svgEl('svg',{viewBox:`0 0 ${W} ${H}`,width:W,height:H,class:'c',role:'img'});
  if(desc){s.setAttribute('aria-label',desc);const t=svgEl('title',{});t.textContent=desc;s.appendChild(t);}return s;}
function isYearSeq(data){return data.length>1&&data.every(d=>/^\d{4}$/.test(String(d.label)));}
function cBar(host,data,color,horizontal){
  data=data.slice().sort((a,b)=>b.value-a.value);
  color=color||css('--sky');
  if(horizontal||data.length>7){
    data=data.slice(0,14);const rowH=30,W=640,labelW=Math.min(230,Math.max(120,...data.map(d=>d.label.length*6.6))),P={t:6,r:96},iw=W-labelW-P.r,H=P.t*2+data.length*rowH,max=Math.max(...data.map(d=>d.value),1);
    const s=baseSvg(W,H);
    data.forEach((d,i)=>{const cy=P.t+i*rowH,bw=Math.max(2,iw*d.value/max);let lab=d.label;if(lab.length>34)lab=lab.slice(0,33)+'…';
      const tl=svgEl('text',{class:'barlabel',x:0,y:cy+rowH/2+4});tl.textContent=lab;s.appendChild(tl);
      s.appendChild(svgEl('rect',{x:labelW,y:cy+6,width:bw,height:rowH-13,rx:3,fill:color,opacity:.9}));
      const tv=svgEl('text',{class:'barval',x:labelW+bw+7,y:cy+rowH/2+4});tv.textContent=fmtSmart(d.value);s.appendChild(tv);});
    host.innerHTML='';host.appendChild(s);return;
  }
  const W=Math.max(420,data.length*74),H=250,P={l:48,r:14,t:14,b:44},iw=W-P.l-P.r,ih=H-P.t-P.b,bw=iw/data.length*.62;
  const dmax=Math.max(0,...data.map(d=>d.value)),dmin=Math.min(0,...data.map(d=>d.value)),span=(dmax-dmin)||1;
  const y0=P.t+ih*(dmax/span);                              // pixel position of value 0
  const s=baseSvg(W,H,host&&host.getAttribute('aria-label'));
  for(let g=0;g<=4;g++){const gy=P.t+ih*g/4,val=dmax-span*g/4;s.appendChild(svgEl('line',{class:'gridline',x1:P.l,y1:gy,x2:W-P.r,y2:gy}));const t=svgEl('text',{class:'axis',x:P.l-7,y:gy+3,'text-anchor':'end'});t.textContent=fmtSmart(val);s.appendChild(t);}
  if(dmin<0)s.appendChild(svgEl('line',{x1:P.l,y1:y0,x2:W-P.r,y2:y0,stroke:css('--ink-faint'),'stroke-width':1}));
  data.forEach((d,i)=>{const cx=P.l+iw*(i+.5)/data.length,h=ih*Math.abs(d.value)/span,yy=d.value>=0?y0-h:y0;
    s.appendChild(svgEl('rect',{x:cx-bw/2,y:yy,width:bw,height:Math.max(0,h),rx:3,fill:d.value<0?css('--red'):color,opacity:.9}));
    const t=svgEl('text',{class:'axis',x:cx,y:H-24,'text-anchor':'middle'});let lb=String(d.label);if(lb.length>10)lb=lb.slice(0,9)+'…';t.textContent=lb;s.appendChild(t);
    const tv=svgEl('text',{class:'barval',x:cx,y:(d.value>=0?yy-5:yy+h+11),'text-anchor':'middle'});tv.textContent=fmtSmart(d.value);s.appendChild(tv);});
  host.innerHTML='';host.appendChild(s);
}
function cLine(host,data,area,color,color2,k1,k2){
  color=color||css('--sky');k1=k1||'value';
  const W=Math.max(480,data.length*46),H=250,P={l:48,r:16,t:14,b:30},iw=W-P.l-P.r,ih=H-P.t-P.b;
  const max=Math.max(...data.map(d=>Math.max(d[k1]||0,k2?d[k2]||0:0)),1)*1.08;
  const x=i=>P.l+iw*(i/(data.length-1||1)),y=v=>P.t+ih*(1-v/max);
  const s=baseSvg(W,H);
  for(let g=0;g<=4;g++){const gy=P.t+ih*g/4;s.appendChild(svgEl('line',{class:'gridline',x1:P.l,y1:gy,x2:W-P.r,y2:gy}));const t=svgEl('text',{class:'axis',x:P.l-7,y:gy+3,'text-anchor':'end'});t.textContent=fmtSmart(max*(1-g/4));s.appendChild(t);}
  // break the line where a year is missing in a yearly series (no false continuity)
  const yearly=isYearSeq(data);
  const gapAfter=i=>yearly&&i<data.length-1&&(+data[i+1].label-+data[i].label>1);
  if(area){let ap='',open=false;data.forEach((d,i)=>{if(!open){ap+=`M ${x(i)} ${P.t+ih} L ${x(i)} ${y(d[k1])}`;open=true;}else ap+=` L ${x(i)} ${y(d[k1])}`;if(gapAfter(i)||i===data.length-1){ap+=` L ${x(i)} ${P.t+ih} Z `;open=false;}});s.appendChild(svgEl('path',{d:ap,fill:color,opacity:.13}));}
  if(k2){let l2='',pen=false;data.forEach((d,i)=>{if((d[k2]||0)>0){l2+=(pen?' L ':'M ')+x(i)+' '+y(d[k2]);pen=true;}if(gapAfter(i))pen=false;});if(l2)s.appendChild(svgEl('path',{d:l2,fill:'none',stroke:color2||css('--red'),'stroke-width':2,'stroke-dasharray':'4 4'}));}
  let lp='',pen=false;data.forEach((d,i)=>{lp+=(pen?' L ':'M ')+x(i)+' '+y(d[k1]);pen=true;if(gapAfter(i))pen=false;});s.appendChild(svgEl('path',{d:lp,fill:'none',stroke:color,'stroke-width':2.5}));
  data.forEach((d,i)=>{s.appendChild(svgEl('circle',{cx:x(i),cy:y(d[k1]),r:3,fill:color}));const t=svgEl('text',{class:'axis',x:x(i),y:H-9,'text-anchor':'middle'});t.textContent=d.label!=null?d.label:d.annee;s.appendChild(t);
    if(gapAfter(i)){const gx=(x(i)+x(i+1))/2;s.appendChild(svgEl('line',{x1:gx,y1:P.t,x2:gx,y2:P.t+ih,stroke:css('--ink-faint'),'stroke-width':1,'stroke-dasharray':'2 3',opacity:.6}));}});
  host.innerHTML='';host.appendChild(s);
}
function cDonut(host,data){
  data=data.slice().sort((a,b)=>b.value-a.value);if(data.length>7){const rest=data.slice(6).reduce((a,d)=>a+d.value,0);data=data.slice(0,6).concat([{label:'Autres',value:rest}]);}
  const tot=data.reduce((a,d)=>a+d.value,0)||1,R=68,r0=40,cx=95,cy=95;let ang=-Math.PI/2;const cols=PALETTE();
  const s=baseSvg(360,190);
  data.forEach((d,i)=>{const a2=ang+2*Math.PI*d.value/tot;const large=(a2-ang)>Math.PI?1:0;
    const x1=cx+R*Math.cos(ang),y1=cy+R*Math.sin(ang),x2=cx+R*Math.cos(a2),y2=cy+R*Math.sin(a2);
    const xi2=cx+r0*Math.cos(a2),yi1=cy+r0*Math.sin(ang),xi1=cx+r0*Math.cos(ang),yi2=cy+r0*Math.sin(a2);
    s.appendChild(svgEl('path',{d:`M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${r0} ${r0} 0 ${large} 0 ${xi1} ${yi1} Z`,fill:cols[i%cols.length]}));ang=a2;});
  data.forEach((d,i)=>{const yy=26+i*23;s.appendChild(svgEl('rect',{x:205,y:yy-10,width:11,height:11,rx:2,fill:cols[i%cols.length]}));const t=svgEl('text',{class:'axis',x:222,y:yy});t.textContent=`${d.label.length>16?d.label.slice(0,15)+'…':d.label} · ${(d.value/tot*100).toFixed(1)}%`;s.appendChild(t);});
  host.innerHTML='';host.appendChild(s);
}
function cTreemap(host,data){
  // treemap needs non-negative part-to-whole values
  let items=data.filter(d=>Number(d.value)>0).sort((a,b)=>b.value-a.value).slice(0,20).map((d,i)=>({label:d.label,value:+d.value,ci:i}));
  if(!items.length){host.innerHTML='<div class="empty">Aucune valeur positive à répartir (le treemap requiert des parts positives).</div>';return;}
  const tot=items.reduce((a,d)=>a+d.value,0)||1;
  const W=680,H=300,cols=PALETTE();const s=baseSvg(W,H);
  const area=W*H;items.forEach(it=>it.a=it.value/tot*area);
  let idx=0,cursorY=0;
  while(idx<items.length&&cursorY<H-1){
    let rowSum=0,row=[],bestRatio=Infinity;
    while(idx<items.length){
      row.push(items[idx]);rowSum+=items[idx].a;const rh=rowSum/W;let worst=0;
      for(const it of row){const w=it.a/rh;worst=Math.max(worst,Math.max(w/rh,rh/w));}
      if(worst>bestRatio){row.pop();rowSum-=items[idx].a;break;}bestRatio=worst;idx++;
    }
    if(!row.length){row=[items[idx]];rowSum=items[idx].a;idx++;}
    const rh=Math.min(rowSum/W,H-cursorY);let cx=0;
    row.forEach(it=>{const w=rowSum?it.a/rowSum*W:0;
      s.appendChild(svgEl('rect',{x:cx,y:cursorY,width:Math.max(0,w-2),height:Math.max(0,rh-2),rx:3,fill:cols[it.ci%cols.length]}));
      if(w>54&&rh>28){const t=svgEl('text',{class:'tm-label',x:cx+7,y:cursorY+18});t.textContent=it.label.length>Math.floor(w/7)?it.label.slice(0,Math.floor(w/7))+'…':it.label;s.appendChild(t);
        const tv=svgEl('text',{class:'tm-val',x:cx+7,y:cursorY+33});tv.textContent=fmtSmart(it.value);s.appendChild(tv);}
      cx+=w;});
    cursorY+=rh;
  }
  host.innerHTML='';host.appendChild(s);
}
function cHistogram(host,name,col){
  const i=colIndex(name,col);
  const vals=DS[name].rows.map(r=>r[i]).filter(v=>v!==null&&v!=='').map(Number).filter(v=>!isNaN(v)); // exclude nulls, don't coerce to 0
  if(!vals.length){host.innerHTML='<div class="empty">Aucune valeur numérique.</div>';return;}
  const min=Math.min(...vals),max=Math.max(...vals),bins=12,step=(max-min)/bins||1;
  const buckets=Array.from({length:bins},(_,b)=>({label:fmtSmart(min+b*step),value:0,lo:min+b*step}));
  vals.forEach(v=>{let b=Math.min(bins-1,Math.floor((v-min)/step));buckets[b].value++;});
  cBar(host,buckets,css('--violet'),false);
}
function fmtSmart(v){if(v==null||isNaN(v))return '—';const a=Math.abs(v);if(a>=1e9)return (v/1e9).toFixed(1).replace('.',',')+'Md';if(a>=1e6)return (v/1e6).toFixed(a>=1e8?0:1).replace('.',',')+'M';if(a>=1e3)return (v/1e3).toFixed(a>=1e5?0:1).replace('.',',')+'k';return Number.isInteger(v)?fmtN(v):v.toLocaleString('fr-FR',{maximumFractionDigits:1});}

/* ===== KPI + highlight (reusable) ===== */
function kpiRow(){const K=C.kpi_labels;const items=[['exercices',STATS.nb_exercices],['orgs',STATS.nb_orgs],['flux',STATS.nb_flux],['rapports',C.reports.length],['recon',STATS.nb_recon],['social',STATS.nb_social]];
  const KPIDEF={exercices:"Exercices civils couverts par au moins un rapport (source : dim_exercice).",orgs:"Organisations du référentiel (source : dim_organisation).",flux:"Flux/taxes distincts (source : dim_flux).",rapports:"Rapports ITIE-RDC référencés.",recon:"Lignes de réconciliation portant au moins une mesure réelle.",social:"Lignes de dépenses sociales déclarées (source : fait_depense_sociale)."};
  return `<div class="kpis">`+items.map(([k,v])=>`<div class="kpi" title="${esc(KPIDEF[k]||'')}"><div class="v">${fmtN(v)}</div><div class="l" data-edit="kpi_labels.${k}">${esc(K[k])}</div></div>`).join('')+`</div>`;}
function highlight(){return `<div class="hl">
  <div class="htop"><h3>Recettes du secteur extractif — ${O._year||'2023'}</h3><span class="hbadge">${fmtN(O.entites)} entreprises du périmètre (minier + pétrolier)</span></div>
  <div class="hg">
    <div class="hc y"><div class="big">${fmtUSD(O.total)}</div><div class="cap">Total revenus extractifs</div></div>
    <div class="hc"><div class="big">${fmtUSD(O.mines)}</div><div class="cap">Secteur minier</div></div>
    <div class="hc"><div class="big">${fmtUSD(O.petrole)}</div><div class="cap">Hydrocarbures</div></div>
  </div>
  <div class="hsub">
    <div class="m"><div class="n">${fmtN(O.cobalt_t)}</div><div class="t">Cobalt (t)</div></div>
    <div class="m"><div class="n">${fmtN(O.cuivre_t)}</div><div class="t">Cuivre (t)</div></div>
    <div class="m"><div class="n">${fmtN(O.diamant_c)}</div><div class="t">Diamant (ct)</div></div>
    <div class="m"><div class="n">${fmtN(O.petrole_bbl)}</div><div class="t">Pétrole (bbl)</div></div>
  </div></div>`;}

/* ===== MODULES ===== */
function mOverview(){return `
  <div class="phead"><div class="eyebrow">Tableau de bord</div><h1>Vue d'ensemble</h1>
    <p data-edit="overview.intro">${esc(C.overview.intro)}</p></div>
  ${kpiRow()}
  ${highlight()}
  <div class="grid2">
    <div class="card"><div class="ch"><h3>Recettes de l'État par exercice</h3><span class="badge">${AGG.serie_etat.length?AGG.serie_etat[0].annee+'–'+AGG.serie_etat[AGG.serie_etat.length-1].annee:''}</span></div><div class="sub">Millions USD · réconciliées</div><div class="chart" id="ov1"></div></div>
    <div class="card"><div class="ch"><h3>Répartition des revenus ${O._year||'2023'}</h3><span class="badge">Secteurs</span></div><div class="sub">Mines vs hydrocarbures</div><div class="chart" id="ov2"></div></div>
    <div class="card"><div class="ch"><h3>Principales entreprises ${O._topyear||'2023'}</h3><span class="badge">Top 10</span></div><div class="sub">Recettes perçues par l'État, USD</div><div class="chart" id="ov3"></div></div>
    <div class="card"><div class="ch"><h3>Dépenses sociales par exercice</h3><span class="badge">${AGG.social&&AGG.social.length?AGG.social[0].annee+'–'+AGG.social[AGG.social.length-1].annee:''}</span></div><div class="sub">Total annuel, USD</div><div class="chart" id="ov4"></div></div>
  </div>`;}
function drawOverview(){
  cLine($('#ov1'),AGG.serie_etat.map(d=>({label:d.annee,value:d.etat,ese:d.ese})),true,css('--sky'),css('--red'),'value','ese');
  cDonut($('#ov2'),[{label:'Mines',value:O.mines},{label:'Hydrocarbures',value:O.petrole}]);
  cBar($('#ov3'),AGG.top2023.map(d=>({label:d.nom,value:d.etat})),css('--sky'),true);
  cBar($('#ov4'),AGG.social.map(d=>({label:String(d.annee),value:d.montant})),css('--red'),false);
}

/* Explorer */
let exState={ds:'fait_reconciliation_flux',page:0,sort:null,dir:1,q:'',filters:{},panel:true};
let exTableQ='';
function mExplorer(){
  const groups={faits:[],contextuel:[],dimensions:[],annexe:[]};
  const tq=exTableQ.toLowerCase();
  Object.entries(DS).forEach(([k,d])=>{if(k.startsWith('_'))return;if(tq&&!(d.label||'').toLowerCase().includes(tq)&&!k.toLowerCase().includes(tq))return;(groups[d.cat]||(groups[d.cat]=[])).push([k,d]);});
  const list=cat=>(groups[cat]||[]).map(([k,d])=>`<div class="dsitem ${exState.ds===k?'on':''}" data-ds="${k}" role="button" tabindex="0" aria-pressed="${exState.ds===k}"><span>${esc(d.label)}</span><span class="n">${fmtN(d.rows.length)}</span></div>`).join('');
  const grp=(cat,title)=>groups[cat]&&groups[cat].length?`<div class="dg">${title} <span style="opacity:.5">(${groups[cat].length})</span></div>${list(cat)}`:'';
  const nT=Object.keys(DS).filter(k=>!k.startsWith('_')).length, nR=Object.entries(DS).filter(([k])=>!k.startsWith('_')).reduce((a,[,d])=>a+d.rows.length,0);
  return `<div class="phead"><div class="eyebrow">Explorateur</div><h1>Explorateur de données</h1><p data-edit="intros.explorer">${esc(C.intros.explorer)}</p><p><b>${nT} tables</b> dont les <b>annexes complètes ITIE 2022 & 2023</b> · ${fmtN(nR)} lignes.</p></div>
  <div class="expl">
    <div class="dslist">
      <div class="dstsearch"><input id="exTableQ" placeholder="🔍 Trouver une table / annexe…" value="${esc(exTableQ)}"></div>
      ${grp('faits','Tables de faits')}
      ${grp('contextuel','Données contextuelles')}
      ${grp('dimensions','Dimensions')}
      ${grp('annexe','Annexes ITIE 2022 & 2023')}
      ${Object.keys(groups).filter(c=>!['faits','contextuel','dimensions','annexe'].includes(c)).map(c=>grp(c,c)).join('')}
    </div>
    <div class="exmain" id="exMain"></div>
  </div>`;}

// distinct values of a column (cached)
const _distinctCache={};
function exDistinct(ds,i){const key=ds+'#'+i;if(_distinctCache[key])return _distinctCache[key];
  const d=DS[ds];const dim=canonDimFor(ds,d.cols[i]);
  const m=new Map();for(const r of d.rows){const raw=r[i];const v=(raw==null||raw==='')?'∅':String(dim?canonicalize(dim,raw):raw);m.set(v,(m.get(v)||0)+1);}
  const arr=[...m.entries()].sort((a,b)=>b[1]-a[1]);_distinctCache[key]=arr;return arr;}

function exApply(){const d=DS[exState.ds];let rows=d.rows;
  const yc=yearCol(exState.ds),yi=yc?d.cols.indexOf(yc):-1;
  if(globalYear&&yi>=0)rows=rows.filter(r=>yearVal(r[yi])===+globalYear);
  const q=(exState.q||'').toLowerCase();
  if(q)rows=rows.filter(r=>r.some(v=>String(v==null?'':v).toLowerCase().includes(q)));
  const F=exState.filters;
  for(const k in F){const i=+k,f=F[k];if(!f)continue;
    if(f.type==='cat'){const dim=canonDimFor(exState.ds,d.cols[i]);
      if(f.vals&&f.vals.length){const set=new Set(f.vals);rows=rows.filter(r=>{const raw=r[i];const v=(raw==null||raw==='')?'∅':String(dim?canonicalize(dim,raw):raw);return set.has(v);});}
      if(f.q){const qq=f.q.toLowerCase();rows=rows.filter(r=>String(r[i]==null?'':r[i]).toLowerCase().includes(qq));}}
    else if(f.type==='num'){if(f.min!=null)rows=rows.filter(r=>{const v=Number(r[i]);return !isNaN(v)&&v>=f.min;});
      if(f.max!=null)rows=rows.filter(r=>{const v=Number(r[i]);return !isNaN(v)&&v<=f.max;});}}
  return rows;}

function exActiveCount(){let n=0;const F=exState.filters;for(const k in F){const f=F[k];if(!f)continue;if(f.type==='cat'&&((f.vals&&f.vals.length)||f.q))n++;if(f.type==='num'&&(f.min!=null||f.max!=null))n++;}return n;}

function renderExplorer(){
  const host=$('#exMain');if(!host)return;const d=DS[exState.ds];
  const yc=yearCol(exState.ds);
  let rows=exApply();
  if(exState.sort!=null){const si=exState.sort,ty=d.types[si];rows=rows.slice().sort((a,b)=>{let x=a[si],y=b[si];if(ty==='num'){x=Number(x);y=Number(y);if(isNaN(x))x=-Infinity;if(isNaN(y))y=-Infinity;return (x-y)*exState.dir;}return String(x==null?'':x).localeCompare(String(y==null?'':y),'fr')*exState.dir;});}
  const per=25,tot=rows.length,pages=Math.max(1,Math.ceil(tot/per));if(exState.page>=pages)exState.page=0;
  const pageRows=rows.slice(exState.page*per,exState.page*per+per);
  const canEdit=editing;
  const th=d.cols.map((c,i)=>`<th scope="col" data-si="${i}" tabindex="0" role="button" aria-sort="${exState.sort===i?(exState.dir>0?'ascending':'descending'):'none'}" title="Trier">${esc(c)}${exState.sort===i?`<span class="ar" aria-hidden="true">${exState.dir>0?'▲':'▼'}</span>`:''}</th>`).join('')+(canEdit?'<th scope="col">—</th>':'');
  const body=pageRows.map(r=>{const ridx=d.rows.indexOf(r);
    return `<tr data-rowidx="${ridx}">${r.map((v,i)=>`<td class="${d.types[i]==='num'?'num':''}" ${canEdit?`contenteditable="true" data-ecol="${i}"`:''} title="${esc(v)}">${esc(fmtCell(v,d.types[i]))}</td>`).join('')}${canEdit?`<td><button class="rm-del" data-erowdel="${ridx}" title="Supprimer cette ligne">✕</button></td>`:''}</tr>`;
  }).join('');
  // live aggregates over filtered rows: sum of each numeric column
  const numCols=d.cols.map((c,i)=>({c,i})).filter(o=>d.types[o.i]==='num' && isSummableNumCol(exState.ds,o.c));
  const sums=numCols.map(o=>{let s=0,n=0;for(const r of rows){const v=Number(r[o.i]);if(!isNaN(v)){s+=v;n++;}}return {c:o.c,s,n};}).filter(o=>o.n>0).slice(0,6);
  const nActive=exActiveCount();
  host.innerHTML=`
    <div class="extoolbar">
      <div class="desc">${esc(d.desc)}</div>
      <div class="exsearch"><span class="si">⌕</span><input id="exQ" placeholder="Recherche plein-texte…" value="${esc(exState.q)}"></div>
      <button class="btn ${exState.panel?'primary':''}" id="exToggle">⚙ Filtres par colonne${nActive?` (${nActive})`:''}</button>
      <button class="btn" id="exReset">Réinitialiser</button>
      <button class="btn" id="exCsv">↓ Export CSV (sélection)</button>
      ${canEdit?`<button class="btn" id="exAddRow">+ Ligne</button><button class="btn primary" id="exSaveTable">💾 Enregistrer cette table en base</button>`:''}
    </div>
    ${canEdit?`<div style="font-size:12px;color:var(--ink-soft);margin:-6px 0 10px">Mode édition : cliquez une cellule pour la modifier, <b>✕</b> pour supprimer une ligne, <b>+ Ligne</b> pour en ajouter une, puis <b>Enregistrer cette table en base</b> pour publier ces changements sur le serveur.</div>`:''}
    <div id="exFilters" class="exfilters" style="display:${exState.panel?'grid':'none'}"></div>
    <div class="exsummary" id="exSummary"></div>
    <div class="gridwrap"><div class="gridscroll"><table class="dg"><thead><tr>${th}</tr></thead><tbody>${body||`<tr><td colspan="${d.cols.length+(canEdit?1:0)}"><div class="empty">Aucune ligne pour cette combinaison de filtres.</div></td></tr>`}</tbody></table></div>
      <div class="gridfoot"><div>${fmtN(tot)} ligne(s)${nActive||exState.q||(globalYear&&yc)?' filtrée(s) sur '+fmtN(d.rows.length):''} · ${d.cols.length} colonnes</div>
      <div class="pager"><button id="exFirst" ${exState.page===0?'disabled':''}>«</button><button id="exPrev" ${exState.page===0?'disabled':''}>‹</button><span>Page ${exState.page+1} / ${pages}</span><button id="exNext" ${exState.page>=pages-1?'disabled':''}>›</button><button id="exLast" ${exState.page>=pages-1?'disabled':''}>»</button></div></div>
    </div>`;
  if(canEdit)bindExplorerEdit(d);
  // summary
  const sum=$('#exSummary');
  sum.innerHTML=`<span class="sm-c">${fmtN(tot)} ligne(s) sélectionnée(s)</span>`+sums.map(o=>`<span class="sm-s"><span>Σ ${esc(o.c)}</span><b>${fmtSmart(o.s)}</b></span>`).join('');
  // filter panel
  if(exState.panel)renderExFilters();
  // sort/pager/search events
  const doSort=th=>{const i=+th.dataset.si;if(exState.sort===i)exState.dir*=-1;else{exState.sort=i;exState.dir=1;}renderExplorer();};
  $$('#exMain thead th[data-si]').forEach(th=>{th.addEventListener('click',()=>doSort(th));th.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();doSort(th);}});});
  $('#exQ').addEventListener('input',e=>{exState.q=e.target.value;exState.page=0;const v=e.target.value;renderExplorer();const inp=$('#exQ');if(inp){inp.focus();inp.setSelectionRange(v.length,v.length);}});
  $('#exToggle').onclick=()=>{exState.panel=!exState.panel;renderExplorer();};
  $('#exReset').onclick=()=>{exState.filters={};exState.q='';exState.page=0;renderExplorer();};
  $('#exFirst').onclick=()=>{exState.page=0;renderExplorer();};
  $('#exPrev').onclick=()=>{exState.page--;renderExplorer();};
  $('#exNext').onclick=()=>{exState.page++;renderExplorer();};
  $('#exLast').onclick=()=>{exState.page=pages-1;renderExplorer();};
  $('#exCsv').onclick=()=>exportCSV(exState.ds,rows);
  const tqi=$('#exTableQ');if(tqi&&!tqi._bound){tqi._bound=true;tqi.addEventListener('input',e=>{exTableQ=e.target.value;const v=e.target.value;$('#app').innerHTML=mExplorer();renderExplorer();const t=$('#exTableQ');if(t){t.focus();t.setSelectionRange(v.length,v.length);}});}
  if(editing)markEditable(true);
}

/* ===== Édition des données en mode admin (Explorateur) =====
   Chaque cellule devient éditable (contenteditable), les lignes peuvent
   être ajoutées/supprimées, et « Enregistrer cette table en base » publie
   la table complète via PUT /api/datasets/<nom> (déjà exposé par le
   back-end). C'est la voie recommandée pour « mettre à jour les données »
   depuis l'interface plutôt qu'en appelant l'API à la main. */
async function saveDatasetToServer(name,btn){
  const d=DS[name];const old=btn?btn.textContent:null;
  if(btn){btn.disabled=true;btn.textContent='Enregistrement…';}
  try{
    const r=await fetch('/api/datasets/'+encodeURIComponent(name),{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({label:d.label,cat:d.cat,desc:d.desc,cols:d.cols,types:d.types,rows:d.rows})});
    if(r.status===401){alert('Votre session administrateur a expiré : veuillez vous reconnecter.');return false;}
    if(!r.ok){const j=await r.json().catch(()=>({}));alert("Échec de l'enregistrement : "+(j.error||r.status));return false;}
    if(btn){btn.textContent='Enregistré ✓';setTimeout(()=>{btn.textContent=old;btn.disabled=false;},1400);}
    return true;
  }catch(e){alert("Échec de l'enregistrement : connexion au serveur impossible.");return false;}
  finally{if(btn&&btn.disabled&&btn.textContent==='Enregistrement…'){btn.disabled=false;btn.textContent=old;}}
}
function bindExplorerEdit(d){
  const host=$('#exMain');if(!host)return;
  host.querySelectorAll('td[contenteditable]').forEach(td=>{
    td.addEventListener('blur',()=>{
      const tr=td.closest('tr');const ridx=+tr.dataset.rowidx,ci=+td.dataset.ecol;
      if(ridx<0||!d.rows[ridx])return;
      let raw=td.textContent.trim();
      if(d.types[ci]==='num'){if(raw===''){d.rows[ridx][ci]=null;}else{const n=Number(raw.replace(/\s/g,'').replace(',','.'));d.rows[ridx][ci]=isNaN(n)?raw:n;}}
      else d.rows[ridx][ci]=raw===''?null:raw;
    });
    td.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();td.blur();}});
  });
  const addBtn=$('#exAddRow');if(addBtn)addBtn.onclick=()=>{d.rows.push(d.cols.map(()=>null));exState.sort=null;exState.page=Math.max(0,Math.ceil(d.rows.length/25)-1);renderExplorer();};
  host.querySelectorAll('[data-erowdel]').forEach(b=>b.addEventListener('click',()=>{
    const ridx=+b.dataset.erowdel;if(ridx<0||!d.rows[ridx])return;
    if(confirm('Supprimer définitivement cette ligne de « '+(d.label||exState.ds)+' » ?')){d.rows.splice(ridx,1);renderExplorer();}
  }));
  const saveBtn=$('#exSaveTable');if(saveBtn)saveBtn.onclick=()=>saveDatasetToServer(exState.ds,saveBtn);
}

function renderExFilters(){const host=$('#exFilters');if(!host)return;const d=DS[exState.ds];
  host.innerHTML=d.cols.map((c,i)=>{
    if(/^id$|_id$|row_hash|batch_id/i.test(c)&&d.types[i]!=='num')return '';
    const f=exState.filters[i]||{};
    if(d.types[i]==='num'){
      return `<div class="ffield"><div class="fname">${esc(c)} <span class="ftag">num</span></div>
        <div class="frange"><input type="number" class="fnum" data-i="${i}" data-b="min" placeholder="min" value="${f.min!=null?f.min:''}"><span>–</span><input type="number" class="fnum" data-i="${i}" data-b="max" placeholder="max" value="${f.max!=null?f.max:''}"></div></div>`;}
    const dv=exDistinct(exState.ds,i);const sel=new Set(f.vals||[]);
    const opts=dv.filter(([v])=>!f.fq||v.toLowerCase().includes(f.fq.toLowerCase())).slice(0,60);
    return `<div class="ffield"><div class="fname">${esc(c)} <span class="ftag">${fmtN(dv.length)} valeurs</span></div>
      ${dv.length>12?`<input class="fsearch" data-i="${i}" placeholder="chercher une valeur…" value="${esc(f.fq||'')}">`:''}
      <div class="fchecks">${opts.map(([v,n])=>`<label class="fchk"><input type="checkbox" data-i="${i}" data-v="${esc(v)}" ${sel.has(v)?'checked':''}><span>${esc(v.length>26?v.slice(0,26)+'…':v)}</span><i>${fmtN(n)}</i></label>`).join('')}${dv.length>60&&opts.length>=60?`<div class="fmore">… ${fmtN(dv.length-60)} autres — affinez avec la recherche</div>`:''}</div></div>`;
  }).join('');
  // events (delegated)
  host.querySelectorAll('.fnum').forEach(inp=>inp.addEventListener('input',e=>{const i=+e.target.dataset.i,b=e.target.dataset.b;const f=exState.filters[i]||(exState.filters[i]={type:'num'});f.type='num';const val=e.target.value===''?null:Number(e.target.value);f[b]=isNaN(val)?null:val;exState.page=0;refreshExResult();}));
  host.querySelectorAll('.fsearch').forEach(inp=>inp.addEventListener('input',e=>{const i=+e.target.dataset.i;const f=exState.filters[i]||(exState.filters[i]={type:'cat',vals:[]});f.type='cat';f.fq=e.target.value;const v=e.target.value;renderExFilters();const ni=$('#exFilters .fsearch[data-i="'+i+'"]');if(ni){ni.focus();ni.setSelectionRange(v.length,v.length);}}));
  host.querySelectorAll('.fchk input').forEach(cb=>cb.addEventListener('change',e=>{const i=+e.target.dataset.i,v=e.target.dataset.v;const f=exState.filters[i]||(exState.filters[i]={type:'cat',vals:[]});f.type='cat';f.vals=f.vals||[];
    if(e.target.checked){if(!f.vals.includes(v))f.vals.push(v);}else f.vals=f.vals.filter(x=>x!==v);exState.page=0;refreshExResult();}));
}
// refresh table+summary without rebuilding the whole filter panel (keeps focus/scroll)
function refreshExResult(){const d=DS[exState.ds];let rows=exApply();
  const nActive=exActiveCount();
  // update toggle count
  const tg=$('#exToggle');if(tg)tg.innerHTML='⚙ Filtres par colonne'+(nActive?` (${nActive})`:'');
  if(exState.sort!=null){const si=exState.sort,ty=d.types[si];rows=rows.slice().sort((a,b)=>{let x=a[si],y=b[si];if(ty==='num'){x=Number(x);y=Number(y);if(isNaN(x))x=-Infinity;if(isNaN(y))y=-Infinity;return (x-y)*exState.dir;}return String(x==null?'':x).localeCompare(String(y==null?'':y),'fr')*exState.dir;});}
  const per=25,tot=rows.length,pages=Math.max(1,Math.ceil(tot/per));if(exState.page>=pages)exState.page=0;
  const pageRows=rows.slice(exState.page*per,exState.page*per+per);
  const tb=$('#exMain tbody');if(tb)tb.innerHTML=pageRows.map(r=>`<tr>${r.map((v,i)=>`<td class="${d.types[i]==='num'?'num':''}" title="${esc(v)}">${esc(fmtCell(v,d.types[i]))}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${d.cols.length}"><div class="empty">Aucune ligne pour cette combinaison de filtres.</div></td></tr>`;
  const numCols=d.cols.map((c,i)=>({c,i})).filter(o=>d.types[o.i]==='num' && isSummableNumCol(exState.ds,o.c));
  const sums=numCols.map(o=>{let s=0,n=0;for(const r of rows){const v=Number(r[o.i]);if(!isNaN(v)){s+=v;n++;}}return {c:o.c,s,n};}).filter(o=>o.n>0).slice(0,6);
  const sum=$('#exSummary');if(sum)sum.innerHTML=`<span class="sm-c">${fmtN(tot)} ligne(s) sélectionnée(s)</span>`+sums.map(o=>`<span class="sm-s"><span>Σ ${esc(o.c)}</span><b>${fmtSmart(o.s)}</b></span>`).join('');
  const foot=$('#exMain .gridfoot > div:first-child');if(foot)foot.innerHTML=`${fmtN(tot)} ligne(s)${nActive||exState.q?' filtrée(s) sur '+fmtN(d.rows.length):''} · ${d.cols.length} colonnes`;
  const pg=$('#exMain .pager');if(pg)pg.innerHTML=`<button id="exFirst" ${exState.page===0?'disabled':''}>«</button><button id="exPrev" ${exState.page===0?'disabled':''}>‹</button><span>Page ${exState.page+1} / ${pages}</span><button id="exNext" ${exState.page>=pages-1?'disabled':''}>›</button><button id="exLast" ${exState.page>=pages-1?'disabled':''}>»</button>`;
  if(pg){$('#exFirst').onclick=()=>{exState.page=0;refreshExResult();};$('#exPrev').onclick=()=>{exState.page--;refreshExResult();};$('#exNext').onclick=()=>{exState.page++;refreshExResult();};$('#exLast').onclick=()=>{exState.page=pages-1;refreshExResult();};}
}
let downloadsNS=undefined;
async function saveFile(filename,text){
  const data='﻿'+text;
  if(downloadsNS===undefined){try{downloadsNS=await (window.claude&&claude.use?claude.use('downloads'):null);}catch(e){downloadsNS=null;}}
  if(downloadsNS){try{await downloadsNS.save({filename,data});return;}catch(e){}}
  // fallback (local file / owner context)
  try{const ext=(filename.split('.').pop()||'').toLowerCase();const mime=ext==='json'?'application/json':ext==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/csv';const blob=new Blob([data],{type:mime+';charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();a.remove();}
  catch(e){alert("Le téléchargement n'est pas disponible dans ce contexte.");}
}
function exportCSV(name,rows){
  const d=DS[name];const esc2=v=>{v=v==null?'':String(v);if(/^[=+\-@\t\r]/.test(v))v="'"+v;return /[",;\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
  const csv=[d.cols.join(';')].concat(rows.map(r=>r.map(esc2).join(';'))).join('\n');
  saveFile(name+'.csv',csv);
}

/* Visualisations */
let vizState={ds:'fait_reconciliation_entreprise',dim:'',measure:'',agg:'sum',type:'bar'};
function mViz(){
  const dsOpts=Object.entries(DS).map(([k,d])=>`<option value="${k}" ${vizState.ds===k?'selected':''}>${esc(d.label)}</option>`).join('');
  return `<div class="phead"><div class="eyebrow">Visualisations</div><h1>Générateur de visualisations</h1><p data-edit="intros.viz">${esc(C.intros.viz)}</p></div>
    <div class="vizbar">
      <div class="vf"><label>Table</label><select id="vzDs">${dsOpts}</select></div>
      <div class="vf"><label>Dimension (axe)</label><select id="vzDim"></select></div>
      <div class="vf"><label>Mesure</label><select id="vzMeasure"></select></div>
      <div class="vf"><label>Agrégation</label><select id="vzAgg">
        <option value="sum">Somme</option><option value="avg">Moyenne</option><option value="count">Nombre</option><option value="min">Minimum</option><option value="max">Maximum</option></select></div>
      <div class="vf"><label>&nbsp;</label><button class="btn" id="vzCsv">↓ Export</button></div>
    </div>
    <div class="chiptypes" id="vzTypes"></div>
    <div id="vzHint" style="font-size:12.5px;color:var(--amber);margin:-6px 0 12px;font-weight:600"></div>
    <div class="card"><div class="ch"><h3 id="vzTitle">Visualisation</h3></div><div class="chart" id="vzChart"></div></div>
    <div class="phead" style="margin-top:26px"><div class="eyebrow">Galerie</div><h1 style="font-size:20px">Analyses prêtes à l'emploi</h1></div>
    <div class="gallery">
      <div class="card"><div class="ch"><h3>Recettes vs paiements (écart)</h3></div><div class="sub">Réconciliation par exercice, USD</div><div class="chart" id="g1"></div></div>
      <div class="card"><div class="ch"><h3>Top flux de recettes 2023</h3></div><div class="sub">Perçu par l'État, USD</div><div class="chart" id="g2"></div></div>
      <div class="card"><div class="ch"><h3>Contributeurs sociaux (cumul)</h3></div><div class="sub">2015–2024, USD</div><div class="chart" id="g3"></div></div>
      <div class="card"><div class="ch"><h3>Production 2023 (part-à-tout)</h3></div><div class="sub">Valeur par substance</div><div class="chart" id="g4"></div></div>
      <div class="card"><div class="ch"><h3>Exportations par produit</h3><span class="badge">Contextuel</span></div><div class="sub">Valeur cumulée déclarée</div><div class="chart" id="g5"></div></div>
      <div class="card"><div class="ch"><h3>Effectifs par exercice</h3><span class="badge">Contextuel</span></div><div class="sub">Total employés déclarés</div><div class="chart" id="g6"></div></div>
    </div>`;}
function vizTypesFor(dimType){
  let types=[['bar','▊ Barres'],['hbar','▬ Barres H.'],['donut','◔ Secteurs'],['treemap','▦ Treemap'],['table','▤ Tableau']];
  if(dimType==='timeish')types=[['line','◟ Courbe'],['area','◣ Aire'],['bar','▊ Barres'],['table','▤ Tableau']];
  if(vizState.measure==='__count__'&&dimType==='num')types=[['hist','▥ Histogramme'],['bar','▊ Barres'],['table','▤ Tableau']];
  return types;
}
function fillViz(){
  const d=DS[vizState.ds];
  const dimSel=$('#vzDim'),mSel=$('#vzMeasure');
  dimSel.innerHTML=d.cols.map(c=>`<option value="${c}">${esc(c)}</option>`).join('');
  const yc=yearCol(vizState.ds);
  if(!vizState.dim||!d.cols.includes(vizState.dim))vizState.dim=yc||d.cols[0];
  dimSel.value=vizState.dim;
  // semantic guard: measures are numeric columns that are NOT identifiers
  const nums=d.cols.filter((c,i)=>d.types[i]==='num'&&!isIdCol(c));
  mSel.innerHTML=`<option value="__count__">Nombre de lignes</option>`+nums.map(c=>`<option value="${c}">${esc(c)}${isPct(c)?' (%)':''}</option>`).join('');
  if(!vizState.measure||(vizState.measure!=='__count__'&&!nums.includes(vizState.measure)))vizState.measure=nums.find(c=>/final|montant|valeur|recett|etat/i.test(c))||nums[0]||'__count__';
  mSel.value=vizState.measure;
  applyMeasureSemantics();
  renderVizTypes();
}
function applyMeasureSemantics(){
  // percentages should be averaged, not summed
  const aggSel=$('#vzAgg');if(!aggSel)return;
  const pct=vizState.measure!=='__count__'&&isPct(vizState.measure);
  const sumOpt=aggSel.querySelector('option[value="sum"]');if(sumOpt)sumOpt.disabled=pct;
  if(pct&&vizState.agg==='sum')vizState.agg='avg';
  aggSel.value=vizState.agg;
  const hint=$('#vzHint');if(hint)hint.textContent=pct?'Mesure en pourcentage : la somme est désactivée (utilisez moyenne, min ou max).':'';
}
function renderVizTypes(){
  const di=DS[vizState.ds].cols.indexOf(vizState.dim);const dtype=DS[vizState.ds].types[di];
  const yc=yearCol(vizState.ds);const dimType=(vizState.dim===yc)?'timeish':dtype;
  const types=vizTypesFor(dimType);
  if(!types.find(t=>t[0]===vizState.type))vizState.type=types[0][0];
  $('#vzTypes').innerHTML=types.map(([t,l])=>`<button class="ctype ${vizState.type===t?'on':''}" data-t="${t}">${l}</button>`).join('');
  $$('#vzTypes .ctype').forEach(b=>b.onclick=()=>{vizState.type=b.dataset.t;renderVizTypes();drawViz();});
  drawViz();
}
function drawViz(){
  const host=$('#vzChart');if(!host)return;const d=DS[vizState.ds];
  const measure=vizState.measure==='__count__'?null:vizState.measure;
  const agg=vizState.measure==='__count__'?'count':vizState.agg;
  $('#vzTitle').textContent=`${d.label} — ${agg==='count'?'nombre':agg} ${measure?'de '+measure:''} par ${vizState.dim}`;
  if(vizState.type==='hist'){cHistogram(host,vizState.ds,vizState.dim);return;}
  let data=aggregate(vizState.ds,vizState.dim,measure,agg,globalYear);
  if(vizState.type==='table'){
    data=data.sort((a,b)=>b.value-a.value).slice(0,200);
    host.innerHTML=`<div class="gridwrap"><div class="gridscroll"><table class="dg"><thead><tr><th>${esc(vizState.dim)}</th><th>${esc(agg)} ${measure?esc(measure):''}</th></tr></thead><tbody>${data.map(r=>`<tr><td>${esc(r.label)}</td><td class="num">${esc(fmtCell(r.value,'num'))}</td></tr>`).join('')}</tbody></table></div></div>`;return;
  }
  const yc=yearCol(vizState.ds);
  if(vizState.type==='line'||vizState.type==='area'){
    if(vizState.dim===yc)data=data.map(x=>({label:yearVal(x.label),value:x.value})).filter(x=>x.label).sort((a,b)=>a.label-b.label);
    else data=data.sort((a,b)=>String(a.label).localeCompare(String(b.label)));
    cLine(host,data,vizState.type==='area',css('--sky'));return;
  }
  if(vizState.type==='donut'){cDonut(host,data);return;}
  if(vizState.type==='treemap'){cTreemap(host,data);return;}
  cBar(host,data,css('--sky'),vizState.type==='hbar');
}
function drawGallery(){
  cLine($('#g1'),AGG.recon_year.map(d=>({label:d.annee,value:d.etat,soc:d.soc})),true,css('--sky'),css('--red'),'value','soc');
  cBar($('#g2'),AGG.flux2023.map(f=>({label:f.flux.replace(/\s*\(.*$/,''),value:f.etat})),css('--sky'),true);
  cBar($('#g3'),AGG.top_social.map(d=>({label:d.nom,value:d.total})),css('--amber'),true);
  cTreemap($('#g4'),[{label:'Cuivre',value:O.cuivre_val},{label:'Cobalt',value:O.cobalt_val},{label:'Diamant',value:O.diamant_val||O.diamant_c*10625},{label:'Pétrole',value:O.petrole*1e0}].filter(x=>x.value));
  if(AGG.export_produit)cBar($('#g5'),AGG.export_produit,css('--teal'),true);
  if(AGG.effectif_annee)cBar($('#g6'),AGG.effectif_annee.map(d=>({label:String(d.annee),value:d.value})),css('--violet'),false);
}
function bindViz(){
  $('#vzDs').onchange=e=>{vizState.ds=e.target.value;vizState.dim='';vizState.measure='';fillViz();};
  $('#vzDim').onchange=e=>{vizState.dim=e.target.value;renderVizTypes();};
  $('#vzMeasure').onchange=e=>{vizState.measure=e.target.value;applyMeasureSemantics();renderVizTypes();};
  $('#vzAgg').onchange=e=>{vizState.agg=e.target.value;drawViz();};
  $('#vzCsv').onclick=()=>{const measure=vizState.measure==='__count__'?null:vizState.measure;const agg=vizState.measure==='__count__'?'count':vizState.agg;const data=aggregate(vizState.ds,vizState.dim,measure,agg,globalYear);const csv=[[vizState.dim,agg].join(';')].concat(data.map(r=>[r.label,r.value].join(';'))).join('\n');saveFile('visualisation.csv',csv);};
  fillViz();drawGallery();
}

/* Model */
function mModel(){
  const cards=Object.entries(DS).filter(([k])=>!k.startsWith('_')).map(([k,d])=>`<div class="tc"><div class="tct"><h4>${esc(d.label)}</h4><span class="tag ${d.cat}">${d.cat==='faits'?'Fait':d.cat==='contextuel'?'Contextuel':'Dimension'}</span></div>
    <div class="tn">${esc(k)} · ${fmtN(d.rows.length)} lignes · ${d.cols.length} colonnes</div><p>${esc(d.desc)}</p>
    <div class="open" data-openex="${k}">Explorer cette table →</div></div>`).join('');
  const nT=Object.keys(DS).filter(k=>!k.startsWith('_')).length,nR=Object.entries(DS).filter(([k])=>!k.startsWith('_')).reduce((a,[,d])=>a+d.rows.length,0);
  return `<div class="phead"><div class="eyebrow">Architecture</div><h1>Modèle de données</h1><p data-edit="intros.model">${esc(C.intros.model)}</p><p>${fmtN(nR)} lignes réparties sur ${nT} tables.</p></div>
    <div class="schema" id="schemaSvg"></div>
    <div class="tablecat">${cards}</div>`;}
function drawSchema(){
  const host=$('#schemaSvg');if(!host)return;
  const W=920,H=420,s=baseSvg(W,H);s.setAttribute('width',W);s.setAttribute('height',H);
  const facts=[['fait_total_annuel',180,70],['fait_reconciliation_flux',180,150],['fait_reconciliation_entreprise',180,230],['fait_depense_sociale',180,310],['fait_indicateur',180,380]];
  const dims=[['dim_exercice',680,60],['dim_organisation',680,140],['dim_flux',680,220],['dim_indicateur',680,300],['dim_rapport',680,360],['dim_source',680,410]];
  const cx=470,cy=230;
  [...facts,...dims].forEach(([k,x,y])=>{s.appendChild(svgEl('line',{x1:x<cx?x+150:x,y1:y+15,x2:cx,y2:cy,stroke:css('--line'),'stroke-width':1.4}));});
  s.appendChild(svgEl('circle',{cx,cy,r:34,fill:css('--sky'),opacity:.14}));
  const ct=svgEl('text',{x:cx,y:cy+4,'text-anchor':'middle',fill:css('--sky'),'font-size':'12','font-weight':'700','font-family':'Poppins'});ct.textContent='ÉTOILE';s.appendChild(ct);
  const box=(k,x,y,fact)=>{const w=150,h=30;const g=svgEl('g',{});g.appendChild(svgEl('rect',{x:x,y:y,width:w,height:h,rx:7,fill:css('--panel'),stroke:fact?css('--red'):css('--sky'),'stroke-width':1.6}));
    const t=svgEl('text',{x:x+10,y:y+19,fill:css('--ink'),'font-size':'11.5','font-family':'IBM Plex Mono'});t.textContent=k;g.appendChild(t);s.appendChild(g);};
  facts.forEach(([k,x,y])=>box(k,x,y,true));dims.forEach(([k,x,y])=>box(k,x,y,false));
  host.innerHTML='';host.appendChild(s);
  $$('[data-openex]').forEach(el=>el.onclick=()=>{exState.ds=el.dataset.openex;exState.page=0;exState.sort=null;exState.q='';exState.filters={};go('explorer');});
}

/* Reports */
const CATS={rapport_itie:'Rapport annuel',thematique:'Thématique',forestier:'Secteur forestier',raa:'Avancement',validation:'Validation',annexe_donnees:'Annexe de données',summary_data:'Données récap.',contextuel:'Contextuel'};
let repFilter='all';
function mReports(){const cats=[...new Set(C.reports.map(r=>r.categorie))];
  const chips=`<div class="filters"><button class="chip ${repFilter==='all'?'on':''}" data-f="all">Tous</button>`+cats.map(c=>`<button class="chip ${repFilter===c?'on':''}" data-f="${c}">${esc(CATS[c]||c)}</button>`).join('')+`</div>`;
  return `<div class="phead"><div class="eyebrow">Documents</div><h1>Rapports &amp; publications</h1><p data-edit="intros.reports">${esc(C.intros.reports)}</p></div>${chips}<div class="reports" id="repList"></div>`;}
function renderReports(){const list=$('#repList');if(!list)return;
  const rs=C.reports.filter(r=>repFilter==='all'||r.categorie===repFilter).sort((a,b)=>String(b.annees_couvertes).localeCompare(String(a.annees_couvertes)));
  list.innerHTML=rs.map(r=>{const url=r.url&&r.url!=='#'?r.url:null;return `<div class="rep"><div class="yr">${esc(r.annees_couvertes||'')}</div><div><div class="t">${esc(r.titre)}</div><span class="cat">${esc(CATS[r.categorie]||r.categorie)}</span>${url?`<br><a class="dl" href="${esc(url)}" target="_blank" rel="noopener">↓ Télécharger (${esc((r.format||'pdf').toUpperCase())})</a>`:''}</div></div>`;}).join('')||`<div class="empty">Aucun rapport dans cette catégorie.</div>`;}

/* About */
function mAbout(){const A=C.about,B=C.brand,F=C.footer,CT=C.contact;return `<div class="phead"><div class="eyebrow">Informations</div><h1 data-edit="about.titre">${esc(A.titre)}</h1></div>
  <div class="about-grid">
    <div class="prose"><p data-edit="about.mission">${esc(A.mission)}</p><p data-edit="about.gouvernance">${esc(A.gouvernance)}</p><p data-edit="about.methodo">${esc(A.methodo)}</p>
      ${editing?`<div class="card" style="margin-top:16px"><h3 style="margin-bottom:10px">Identité du site (menu, en-tête, pied de page)</h3>
        <div style="font-size:14px;color:var(--ink-soft);line-height:2.1">
          <div>Nom court du site : <b data-edit="brand.name">${esc(B.name)}</b></div>
          <div>Nom complet (en-tête) : <b data-edit="brand.full">${esc(B.full)}</b></div>
          <div>Sous-titre du menu latéral : <b data-edit="brand.tagline_short">${esc(B.tagline_short)}</b></div>
          <div>Mention du pied de menu : <b data-edit="footer.note_short">${esc(F.note_short)}</b></div>
          <div>Note de bas de page (longue) : <b data-edit="footer.note">${esc(F.note)}</b></div>
        </div>
        <div style="font-size:11.5px;color:var(--ink-soft);margin-top:8px">Ces textes s'appliquent immédiatement après « Enregistrer &amp; publier » (menu, en-tête et pied de page).</div></div>`:''}
    </div>
    <div>
      <div class="card" style="margin-bottom:16px"><h3 style="margin-bottom:10px">Contact</h3>
        <div style="font-size:14px;color:var(--ink-soft);line-height:2"><div data-edit="contact.org">${esc(CT.org)}</div><div data-edit="contact.tel">${esc(CT.tel)}</div><div data-edit="contact.email">${esc(CT.email)}</div><div data-edit="contact.adresse">${esc(CT.adresse)}</div></div></div>
      <h3 style="font-size:15px;margin:0 0 10px">Sources des données</h3>
      <div class="srcs">${C.sources.map(s=>`<div class="src"><span class="d"></span><div><b>${esc(s.libelle)}</b><br><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a></div></div>`).join('')}</div>
    </div>
  </div>`;}

/* Qualité des données */
function countNeg(name,cols){let n=0;const d=DS[name];if(!d)return 0;const idx=cols.map(c=>d.cols.indexOf(c)).filter(i=>i>=0);for(const r of d.rows)for(const i of idx){const v=Number(r[i]);if(!isNaN(v)&&v<0){n++;break;}}return n;}
function businessRules(){
  const R=[];
  // effectifs: total = nationaux + etrangers
  const e=DS.ctx_effectif;
  if(e){const ti=e.cols.findIndex(c=>/total.*employ/i.test(c)),ni=e.cols.findIndex(c=>/^nationaux$/i.test(c)),xi=e.cols.findIndex(c=>/etrangers$/i.test(c));
    let tested=0,fail=0;for(const r of e.rows){const t=Number(r[ti]),n=Number(r[ni]),x=Number(r[xi]);if(!isNaN(t)&&!isNaN(n)&&!isNaN(x)){tested++;if(Math.abs(t-(n+x))>0.5)fail++;}}
    R.push(['Effectif : total = nationaux + étrangers',fail,tested,'incohérences']);}
  // pourcentage de vote/action <= 100
  const p=DS.ctx_propriete;
  if(p){const idx=p.cols.map((c,i)=>/pourcent/i.test(c)?i:-1).filter(i=>i>=0);let tested=0,fail=0;
    for(const r of p.rows)for(const i of idx){const v=Number(r[i]);if(!isNaN(v)){tested++;if(v>100)fail++;}}
    R.push(['Propriété : pourcentage ≤ 100 %',fail,tested,'hors bornes']);}
  // negatives
  const nExp=countNeg('ctx_exportation',['Valeur_totale','Quantite_totale']),nProd=countNeg('ctx_production',['Valeur_totale','Quantite_totale']);
  R.push(['Exportations : valeurs ≥ 0',nExp,DS.ctx_exportation?DS.ctx_exportation.rows.length:0,'négatives']);
  R.push(['Production : valeurs ≥ 0',nProd,DS.ctx_production?DS.ctx_production.rows.length:0,'négatives']);
  return R;
}
function mQualite(){
  const q=DS._qualite.rows;             // [table,label,cat,rows,cols,miss%]
  const totRows=Object.entries(DS).filter(([k])=>!k.startsWith('_')).reduce((a,[,d])=>a+d.rows.length,0);
  const avgMiss=(window.__missWeighted!=null?window.__missWeighted:(q.length?q.reduce((a,r)=>a+r[5],0)/q.length:0)).toFixed(1);
  const cl=WH.clean||{dedup:{},sentinels:{},dropped_cols:{}};
  const dupTot=Object.values(cl.dedup||{}).reduce((a,b)=>a+b,0);
  const sentTot=Object.values(cl.sentinels||{}).reduce((a,s)=>a+(String(s).match(/\d+/g)||[]).reduce((x,y)=>x+ +y,0),0);
  const negExp=countNeg('ctx_exportation',['Valeur_totale','Quantite_totale']), negProd=countNeg('ctx_production',['Valeur_totale','Quantite_totale']);
  return `<div class="phead"><div class="eyebrow">Gouvernance</div><h1>Qualité des données</h1><p data-edit="intros.qualite">${esc(C.intros.qualite)}</p><p>Dernière actualisation : <b>${esc(WH.generated||'2026')}</b>.</p></div>
  <div class="kpis">
    <div class="kpi"><div class="v">${Object.keys(DS).filter(k=>!k.startsWith('_')).length}</div><div class="l">Tables</div></div>
    <div class="kpi"><div class="v">${fmtN(totRows)}</div><div class="l">Lignes</div></div>
    <div class="kpi"><div class="v">${avgMiss}%</div><div class="l">Cellules manquantes (pondéré)</div></div>
    <div class="kpi"><div class="v">${fmtN(dupTot)}</div><div class="l">Doublons exacts retirés</div></div>
    <div class="kpi"><div class="v">${fmtN(sentTot)}</div><div class="l">Dates sentinelles 1900 → nulles</div></div>
    <div class="kpi"><div class="v">${negExp+negProd}</div><div class="l">Valeurs négatives signalées</div></div>
  </div>
  <div class="grid2">
    <div class="card"><div class="ch"><h3>Complétude par table</h3><span class="badge">% renseigné</span></div><div class="sub">100 % − taux de cellules manquantes</div><div class="chart" id="q1"></div></div>
    <div class="card"><div class="ch"><h3>Doublons exacts retirés par table</h3></div><div class="sub">Lignes identiques supprimées à l'intégration</div><div class="chart" id="q2"></div></div>
  </div>
  <div style="height:18px"></div>
  <div class="card"><div class="ch"><h3>Traitements de nettoyage appliqués</h3></div>
    <div class="gridwrap"><div class="gridscroll"><table class="dg"><thead><tr><th scope="col">Contrôle</th><th scope="col">Traitement</th><th scope="col">Portée</th></tr></thead><tbody>
      <tr><td>Doublons exacts</td><td>Suppression après contrôle</td><td class="num">${fmtN(dupTot)} lignes sur 11 tables contextuelles</td></tr>
      <tr><td>Dates sentinelles (01/01/1900)</td><td>Converties en valeurs nulles</td><td>naissance, mandat, acquisition, transfert</td></tr>
      <tr><td>Données personnelles</td><td>Colonnes ID national, contact et date de naissance retirées</td><td>registre de propriété effective</td></tr>
      <tr><td>Fusion de tables redondantes</td><td>Propriété effective + propriété réelle → table canonique</td><td>ctx_propriete</td></tr>
      <tr><td>Colonnes fantômes</td><td>Colonnes vides col32–col36 supprimées</td><td>ctx_exportation</td></tr>
      <tr><td>Cohérence des métadonnées</td><td>Rapports et sources synchronisés avec les tables dimension</td><td>dim_rapport, dim_source</td></tr>
      <tr><td>Valeurs négatives</td><td>Conservées et signalées (corrections potentielles)</td><td class="num">${negExp+negProd} lignes exportations/production</td></tr>
    </tbody></table></div></div>
  </div>
  <div style="height:18px"></div>
  <div class="card"><div class="ch"><h3>Contrôles de règles métier</h3><span class="badge">Au-delà de la complétude</span></div>
    <div class="sub">Unicité, bornes et cohérences testées sur les données</div>
    <div class="gridwrap"><div class="gridscroll"><table class="dg"><thead><tr><th scope="col">Règle</th><th scope="col">Lignes en échec</th><th scope="col">Lignes testées</th><th scope="col">Taux de conformité</th></tr></thead><tbody>
    ${businessRules().map(([rule,fail,tot,unit])=>{const ok=tot?(100*(tot-fail)/tot):100;const col=ok>=99?'var(--green)':ok>=90?'var(--amber)':'var(--red)';
      return `<tr><td>${esc(rule)}</td><td class="num" style="color:${fail?'var(--red)':'var(--ink-soft)'}">${fmtN(fail)} ${esc(unit)}</td><td class="num">${fmtN(tot)}</td><td class="num" style="color:${col};font-weight:600">${ok.toFixed(1)} %</td></tr>`;}).join('')}
    </tbody></table></div></div>
  </div>
  <div class="note-block" style="margin-top:16px;background:var(--panel-2);border:1px solid var(--line);border-left:3px solid var(--amber);border-radius:10px;padding:14px 18px;font-size:13px;color:var(--ink-soft)">
    <b>Limite connue :</b> un taux de cellules manquantes élevé (ex. réconciliation par flux, 52 %) reflète en partie des lignes <i>non déclarées</i> ou <i>non applicables</i> qui ne devraient pas être confondues avec le zéro. Les incohérences ci-dessus sont <b>signalées, pas corrigées</b> (ce sont des déclarations telles que publiées). La distinction fine (déclaré-zéro / non-déclaré / non-applicable / manquant / corrigé) et l'imposition des règles à la charge nécessitent le modèle d'états de l'entrepôt central — voir le plan d'architecture cible.</div>`;}
function drawQualite(){
  const q=DS._qualite.rows.slice().sort((a,b)=>a[5]-b[5]);
  cBar($('#q1'),q.map(r=>({label:r[1],value:+(100-r[5]).toFixed(1)})),css('--green'),true);
  const cl=WH.clean||{dedup:{}};
  const dd=Object.entries(cl.dedup||{}).map(([k,v])=>({label:(DS[k]?DS[k].label:k),value:v})).sort((a,b)=>b.value-a.value);
  cBar($('#q2'),dd,css('--red'),true);
}
/* Dictionnaire de données */
let dictQ='';
function mDict(){
  return `<div class="phead"><div class="eyebrow">Métadonnées</div><h1>Dictionnaire de données</h1><p data-edit="intros.dict">${esc(C.intros.dict)}</p><p>${fmtN(DS._dictionnaire.rows.length)} colonnes documentées sur ${Object.keys(DS).filter(k=>!k.startsWith('_')).length} tables.</p></div>
    <div class="extoolbar"><div class="exsearch"><span class="si">⌕</span><input id="dictQ" placeholder="Rechercher une table ou une colonne…" value="${esc(dictQ)}"></div><button class="btn" id="dictCsv">↓ Export CSV</button></div>
    <div class="gridwrap"><div class="gridscroll"><table class="dg" id="dictTable"></table></div></div>`;}
function renderDict(){
  const t=$('#dictTable');if(!t)return;const d=DS._dictionnaire;const q=dictQ.toLowerCase();
  let rows=d.rows.filter(r=>!q||r.some(v=>String(v).toLowerCase().includes(q)));
  t.innerHTML=`<thead><tr>${d.cols.map(c=>`<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0,500).map(r=>`<tr>${r.map((v,i)=>`<td class="${d.types[i]==='num'?'num':''}">${esc(fmtCell(v,d.types[i]))}</td>`).join('')}</tr>`).join('')}</tbody>`;
  const inp=$('#dictQ');if(inp)inp.oninput=e=>{dictQ=e.target.value;renderDict();const v=e.target.value;const el=$('#dictQ');el.focus();el.setSelectionRange(v.length,v.length);};
  const cb=$('#dictCsv');if(cb)cb.onclick=()=>exportCSV('_dictionnaire',rows);
}
/* Géographie — vraie carte choroplèthe interactive (SVG auto-suffisant) */
let mapInd='recettes', mapYear=null, mapLevels=new Set(['province','territoire','etd']), mapSel=null, mapEvo=false, mapSelPt=null, mapFs=false, mapEscBound=false;
function fsStyle(){const viz=$('#mapViz'),host=$('#mapHost'),svg=$('#mapSvg'),btn=$('#mapFull');if(!viz)return;
  if(mapFs){viz.style.cssText='position:fixed;inset:0;z-index:99999;background:var(--bg);padding:12px 16px 8px;margin:0;display:flex;flex-direction:column;box-shadow:0 0 0 100vmax var(--bg)';
    if(host){host.style.flex='1';host.style.minHeight='0';host.style.display='flex';host.style.alignItems='center';host.style.justifyContent='center';}
    if(svg){svg.style.height='100%';svg.style.width='100%';svg.style.maxHeight='none';}
    if(btn)btn.innerHTML='✕ Quitter le plein écran';document.body.style.overflow='hidden';}
  else{viz.style.cssText='position:relative';
    if(host){host.style.flex='';host.style.minHeight='';host.style.display='';host.style.alignItems='';host.style.justifyContent='';}
    if(svg){svg.style.height='auto';svg.style.width='100%';svg.style.maxHeight='';}
    if(btn)btn.innerHTML='⛶ Plein écran';document.body.style.overflow='';}}
function lvlOn(x){return mapLevels.has(x);}
function toggleLvl(x){if(mapLevels.has(x))mapLevels.delete(x);else mapLevels.add(x);if(!mapLevels.size)mapLevels.add('province');}
function LY(){return (GEO&&GEO.layers&&GEO.layers[mapInd])||null;}
function indYears(){const d=LY();return d?d.years:[];}
function curYear(){if(mapYear)return mapYear;const ys=indYears();return ys.length?ys[ys.length-1]:null;}
function provVal(iso,year){const d=LY();if(!d)return 0;const y=year||curYear();return (d.prov[y]&&d.prov[y][iso])||0;}
function terrVal(tk,year){const d=LY();if(!d)return 0;const y=year||curYear();return (d.terr[y]&&d.terr[y][tk])||0;}
function provSum(iso){const d=LY();if(!d)return 0;let s=0;d.years.forEach(y=>{s+=(d.prov[y]&&d.prov[y][iso])||0;});return s;}
function terrSum(tk){const d=LY();if(!d)return 0;let s=0;d.years.forEach(y=>{s+=(d.terr[y]&&d.terr[y][tk])||0;});return s;}
function indFmt(v){const d=LY();if(v==null)return '—';if(!d)return fmtN(v);if(d.fmt==='usd')return fmtUSD(v);if(d.unit==='emplois')return fmtN(Math.round(v))+' empl.';return fmtN(Math.round(v));}
function provName(iso){return (GEO&&GEO.prov_ref&&GEO.prov_ref[iso])||iso;}
// value for the currently shown geographic unit (province choropleth, or aggregate-when-evolution)
function unitVal(iso){return mapEvo?provSum(iso):provVal(iso);}
function hasTerr(){const d=LY();if(!d)return false;return d.years.some(y=>d.terr[y]&&Object.keys(d.terr[y]).length);}
function hasEtdPts(){const d=LY();if(!d||!d.points)return false;return Object.values(d.points).some(a=>a&&a.length);}
function allYears(){const s=new Set();if(GEO&&GEO.layers)Object.values(GEO.layers).forEach(L=>(L.years||[]).forEach(y=>s.add(y)));return[...s].sort();}
function yearCovered(y){return indYears().indexOf(y)>=0;}
function natTotal(year){const d=LY();if(!d)return 0;const y=year||curYear();let s=0;const pp=d.prov[y]||{};Object.keys(pp).forEach(k=>s+=pp[k]);return s;}
function natSum(){const d=LY();if(!d)return 0;let s=0;d.years.forEach(y=>{const pp=d.prov[y]||{};Object.keys(pp).forEach(k=>s+=pp[k]);});return s;}

function mGeo(){
  const hasGeo=GEO&&GEO.geometry;
  const inds=GEO&&GEO.layers?Object.keys(GEO.layers):[];
  const d=LY();const ys=indYears();
  const yrOpts=allYears().map(y=>`<option value="${y}"${y===curYear()?' selected':''}>${y}${yearCovered(y)?'':' — (pas de donnée)'}</option>`).join('');
  // groupes de couches (tous visibles, cliquables)
  const SHORT={recettes:'Recettes extractives',production:'Production',exportation:'Exportations',emploi:'Emplois',
    infra:'Total (DRP+ETD+DOT)',paiements_drp:'Régies provinciales (DRP)',recettes_etd:'ETD (secteurs/chefferies/communes)',dotations_dot:'Dotations OS DOT (0,3%)',
    cahiers_nombre:'Cahiers de charge (nb)',cahiers_montant:'Cahiers de charge ($)',
    dep_sociale:'Dépenses sociales',dep_env:'Dépenses environ.',permis_cami:'Permis cadastre'};
  const GROUPS=[['Recettes & activité',['recettes','production','exportation','emploi']],
    ['Paiements infranationaux — 4.6 (paiements directs aux entités locales)',['infra','paiements_drp','recettes_etd','dotations_dot']],
    ['Cahiers de charge',['cahiers_nombre','cahiers_montant']],
    ['Social & environnement',['dep_sociale','dep_env']],
    ['Cadastre minier',['permis_cami']]];
  const chipHtml=GROUPS.map(([g,keys])=>{const av=keys.filter(k=>GEO.layers[k]);if(!av.length)return '';
    return `<div class="lgroup"><div class="lgttl">${g}</div><div class="lgchips">${av.map(k=>`<button class="lchip ${mapInd===k?'on':''}" data-ind="${k}">${esc(SHORT[k]||GEO.layers[k].label)}</button>`).join('')}</div></div>`;}).join('');
  return `<div class="phead"><div class="eyebrow">Territoire</div><h1>Géographie de l'extraction</h1><p data-edit="intros.geo">${esc(C.intros.geo)}</p><p>Choisissez une <b>couche</b> ci-dessous (recettes, paiements infranationaux, cahiers de charge, permis du cadastre…), puis l'<b>année</b>, la <b>vue</b> et le <b>niveau</b> (national / province / territoire / ETD). Sur les couches ETD et Dotations OS DOT, chaque bénéficiaire apparaît en <b>point géolocalisé</b>. Survolez, zoomez, cliquez.</p>
    <p style="font-size:12.5px;color:var(--ink-soft);margin-top:-6px"><b>Note ITIE :</b> les <b>Paiements infranationaux (Exigence 4.6)</b> sont les paiements <b>directs</b> des entreprises aux entités locales — régies provinciales (DRP), ETD (secteurs, chefferies, communes) et dotations OS DOT (0,3 %). Ils se distinguent des <b>Transferts infranationaux (Exigence 5.2)</b>, qui sont des recettes perçues au niveau central puis rétrocédées aux provinces/ETD — et des dépenses sociales/environnementales (section 6.1).</p></div>
    ${hasGeo?`<div class="card" style="margin-bottom:18px">
      <div class="ch" style="flex-wrap:wrap;gap:10px"><h3 id="mapTitle">Carte</h3></div>
      <div class="lpicker">${chipHtml}</div>
      <div class="filterbar" style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;margin:2px 0 14px;padding:12px 14px;background:var(--panel-2);border:1px solid var(--line);border-radius:10px">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--ink-soft);font-weight:600;text-transform:uppercase;letter-spacing:.04em">Année
          <select id="mYear" class="sel" ${mapEvo?'disabled':''}>${yrOpts}</select><span id="mYearCov" style="font-size:10px;font-weight:600;color:var(--sky);text-transform:none;letter-spacing:0"></span></label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--ink-soft);font-weight:600;text-transform:uppercase;letter-spacing:.04em">Vue
          <div style="display:flex;gap:6px"><button class="ctype ${!mapEvo?'on':''}" data-evo="0">Année</button><button class="ctype ${mapEvo?'on':''}" data-evo="1">Évolution (cumul)</button></div></label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--ink-soft);font-weight:600;text-transform:uppercase;letter-spacing:.04em">Niveau
          <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="ctype ${lvlOn('national')?'on':''}" data-lvl="national">National</button><button class="ctype ${lvlOn('province')?'on':''}" data-lvl="province">Province</button><button class="ctype ${lvlOn('territoire')?'on':''}" data-lvl="territoire" ${hasTerr()?'':'disabled title="Pas de donnée infra-provinciale pour cette couche"'}>Territoire</button><button class="ctype ${lvlOn('etd')?'on':''}" data-lvl="etd" ${hasEtdPts()?'':'disabled title="Pas de bénéficiaire ETD géolocalisé pour cette couche"'}>ETD</button></div>
          <div style="font-size:10px;color:var(--ink-faint);margin-top:3px">Couches cumulables : activez-en plusieurs pour voir l'imbrication</div></label>
      </div>
      <div class="sub" id="mapSub">${d?esc(d.label):''}${d&&!yearCovered(curYear())&&!mapEvo?` · <b style="color:var(--red)">aucune donnée en ${curYear()} — couverture : ${indYears()[0]||'—'}–${indYears().slice(-1)[0]||'—'}</b>`:''}</div>
      <div style="display:grid;grid-template-columns:1fr 320px;gap:16px;align-items:start" class="mapwrap">
        <div id="mapViz" style="position:relative"><div id="mapHost" style="width:100%;position:relative;cursor:grab"></div>
          <div id="mapTip" style="position:absolute;pointer-events:none;display:none;background:var(--navy);color:#fff;padding:8px 11px;border-radius:8px;font-size:12px;z-index:5;box-shadow:0 6px 18px rgba(0,0,0,.3);max-width:240px"></div>
          <div style="display:flex;gap:14px;align-items:center;margin-top:10px;font-size:11.5px;color:var(--ink-soft);flex-wrap:wrap">
            <span id="mapLegend"></span>
            <span style="margin-left:auto;display:inline-flex;gap:6px;align-items:center">Molette : zoom · glisser : déplacer <button class="btn" id="mapZoomOut" style="padding:4px 11px;font-size:14px;line-height:1" title="Dézoomer">−</button><button class="btn" id="mapZoomIn" style="padding:4px 11px;font-size:14px;line-height:1" title="Zoomer">+</button><button class="btn" id="mapReset" style="padding:4px 10px">Réinitialiser</button><button class="btn" id="mapFull" style="padding:4px 10px" title="Afficher la carte en plein écran">⛶ Plein écran</button></span>
          </div>
        </div>
        <div id="mapPanel"></div>
      </div>
    </div>`:''}
    <div class="grid2">
      <div class="card"><div class="ch"><h3 id="geoRankTitle">Classement des provinces</h3></div><div class="sub" id="geoRankSub"></div><div class="chart" id="geoRank"></div></div>
      <div class="card"><div class="ch"><h3>Évolution nationale de l'indicateur</h3></div><div class="sub">Somme sur toutes les provinces couvertes, par année</div><div class="chart" id="geoEvo"></div></div>
    </div>
    <div class="card" style="margin-top:18px"><div class="ch"><h3>Paiements infranationaux — détail par entité perceptrice (DRP · ETD · DOT)</h3><span class="badge">Exigence ITIE 4.6</span></div>
      <div class="sub">Paiements <b>directs</b> des entreprises extractives aux entités locales, ventilés par exercice, province, type d'entité perceptrice (régie provinciale DRP, ETD — secteur/chefferie/commune, dotation OS DOT 0,3 %) et montant. Total infranational 2023 : 801,7 M USD (DRP 532,8 · ETD 165,1 · DOT 103,9), somme du détail des annexes. Le tableau de synthèse officiel (Tableau 60) affiche 797,7 M USD ; l’écart d’environ 4 M provient des paiements pétroliers perçus au Kongo Central (DGR-KC).</div>
      <div id="geoInfra" style="overflow:auto"></div></div>`;}
// equirectangular projection over DRC bounds
const DRC_BOUNDS={minLng:11.9,maxLng:31.4,minLat:-13.6,maxLat:5.5};
function projFactory(W,H){const b=DRC_BOUNDS;const sx=W/(b.maxLng-b.minLng),sy=H/(b.maxLat-b.minLat),s=Math.min(sx,sy);
  const ox=(W-(b.maxLng-b.minLng)*s)/2, oy=(H-(b.maxLat-b.minLat)*s)/2;
  return (lng,lat)=>[ox+(lng-b.minLng)*s, oy+(b.maxLat-lat)*s];}
function ringPath(ring,proj){return ring.map((c,i)=>{const [x,y]=proj(c[0],c[1]);return (i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1);}).join(' ')+'Z';}
function geoPath(geom,proj){const t=geom.type,c=geom.coordinates;let d='';
  if(t==='Polygon')c.forEach(r=>d+=ringPath(r,proj));
  else if(t==='MultiPolygon')c.forEach(p=>p.forEach(r=>d+=ringPath(r,proj)));
  return d;}
function geoBBox(geom,proj){let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;const walk=c=>{if(typeof c[0]==='number'){const[x,y]=proj(c[0],c[1]);if(x<minx)minx=x;if(y<miny)miny=y;if(x>maxx)maxx=x;if(y>maxy)maxy=y;}else c.forEach(walk);};walk(geom.coordinates);return[minx,miny,maxx,maxy];}
function colScale(v,max){const c0=[233,242,250],c1=[0,101,175];const t=max?v/max:0;return `rgb(${c0.map((a,i)=>Math.round(a+(c1[i]-a)*(0.15+0.85*t)).toString()).join(',')})`;}
function curPoints(){const d=LY();if(!d||!d.points)return null;const y=mapEvo?null:curYear();
  if(mapEvo){const agg={};d.years.forEach(yy=>{(d.points[yy]||[]).forEach(p=>{const k=p.lng+','+p.lat;if(!agg[k])agg[k]={nom:p.nom,lng:p.lng,lat:p.lat,prov_iso:p.prov_iso,v:0};agg[k].v+=p.v;});});return Object.values(agg);}
  return d.points[y]||[];}
function drawEtdPoints(s,proj,host){
  const pts=curPoints();if(!pts||!pts.length)return;
  const isDot=mapInd==='dotations_dot';const col=isDot?css('--amber'):css('--brand');
  const kindLbl=isDot?'◆ Dotation OS':(mapInd==='infra'?'◆ Bénéficiaire infra':'◆ ETD');
  const max=Math.max(1,...pts.map(p=>p.v));
  const sorted=pts.slice().sort((a,b)=>b.v-a.v);
  // seuil d'étiquetage : les points ≥ 22 % du max, plafonné à 8 étiquettes
  const labelSet=new Set(sorted.filter((p,i)=>i<8 && p.v/max>=0.22).map(p=>p.lng+','+p.lat));
  sorted.slice().reverse().forEach(p=>{const [x,y]=proj(p.lng,p.lat);const r=4.5+Math.sqrt(p.v/max)*20;
    const c=svgEl('circle',{cx:x,cy:y,r:r,fill:col,'fill-opacity':0.7,stroke:'#fff','stroke-width':1.4});
    c.style.cursor='pointer';c.style.transition='fill-opacity .12s';
    c.addEventListener('mousemove',e=>{const tip=$('#mapTip');tip.style.display='block';c.setAttribute('fill-opacity','0.92');
      tip.innerHTML=`<b>${kindLbl} — ${esc(p.nom)}</b><br>${indFmt(p.v)} <span style="opacity:.7">${mapEvo?'· cumul':'· '+curYear()}</span>`;
      const rr=host.getBoundingClientRect();tip.style.left=(e.clientX-rr.left+12)+'px';tip.style.top=(e.clientY-rr.top+12)+'px';});
    c.addEventListener('mouseleave',()=>{$('#mapTip').style.display='none';c.setAttribute('fill-opacity','0.7');});
    c.style.cursor='pointer';c.addEventListener('click',ev=>{ev.stopPropagation();mapSelPt=p;mapSel='PT';drawPanel();});
    s.appendChild(c);});
  // étiquettes des plus gros (au-dessus des cercles, avec halo blanc)
  sorted.filter(p=>labelSet.has(p.lng+','+p.lat)).forEach(p=>{const [x,y]=proj(p.lng,p.lat);const r=4.5+Math.sqrt(p.v/max)*20;
    const ty=y-r-3;
    const halo=svgEl('text',{x:x,y:ty,'text-anchor':'middle','font-size':'8.6','font-weight':'700','font-family':'Inter',fill:'#fff','stroke':'#fff','stroke-width':'2.6','stroke-linejoin':'round','pointer-events':'none'});halo.textContent=p.nom;s.appendChild(halo);
    const tl=svgEl('text',{x:x,y:ty,'text-anchor':'middle','font-size':'8.6','font-weight':'700','font-family':'Inter',fill:isDot?css('--amber'):css('--brand-deep'),'pointer-events':'none'});tl.textContent=p.nom;s.appendChild(tl);});
}
function drawMap(){
  const host=$('#mapHost');if(!host||!GEO)return;
  const W=680,H=560,proj=projFactory(W,H);
  const s=baseSvg(W,H,'Carte choroplèthe dynamique de la RDC');
  s.style.width='100%';s.style.height='auto';s.setAttribute('id','mapSvg');
  const vb={x:0,y:0,w:W,h:H};s.setAttribute('viewBox',`0 0 ${W} ${H}`);
  const provFeats=GEO.geometry.features;
  // niveaux actifs (cumulables). La PROVINCE reste toujours la choroplèthe de base ;
  // le TERRITOIRE se superpose en contours (+ surlignage des territoires bénéficiaires) ;
  // le territoire ne prend le remplissage que si la province est masquée.
  const showProv=lvlOn('province'),showTerr=lvlOn('territoire')&&hasTerr()&&GEO.terr_geom,showEtd=lvlOn('etd'),showNat=lvlOn('national');
  const provFill = showProv || showNat;           // province colorée
  const terrFill = showTerr && !provFill;          // territoire coloré seulement si province masquée
  // --- Couche PROVINCE ---
  const pvals=provFeats.map(f=>unitVal(f.properties.iso));const pmax=Math.max(1,...pvals);
  provFeats.forEach(f=>{const iso=f.properties.iso,v=unitVal(iso);
    const fill=provFill?(v>0?colScale(v,pmax):css('--panel-2')):css('--panel');
    const p=svgEl('path',{d:geoPath(f.geometry,proj),fill,stroke:provFill?'#fff':css('--line'),'stroke-width':provFill?0.8:0.5,'data-iso':iso});
    if(showProv){p.style.cursor='pointer';p.style.transition='fill .12s';
      p.addEventListener('mousemove',e=>{const tip=$('#mapTip');tip.style.display='block';tip.innerHTML=`<b>${esc(provName(iso))}</b><br>${v>0?indFmt(v):'—'} <span style="opacity:.7">${mapEvo?'· cumul':'· '+curYear()}</span>`;const r=host.getBoundingClientRect();tip.style.left=(e.clientX-r.left+12)+'px';tip.style.top=(e.clientY-r.top+12)+'px';});
      p.addEventListener('mouseleave',()=>{$('#mapTip').style.display='none';});
      p.addEventListener('click',()=>{mapSel=iso;drawPanel();$$('#mapSvg path[data-iso]').forEach(pp=>{const sel=pp.getAttribute('data-iso')===iso;pp.setAttribute('stroke-width',sel?'2.2':(provFill?'0.8':'0.5'));pp.setAttribute('stroke',sel?css('--red'):(provFill?'#fff':css('--line')));});});}
    s.appendChild(p);
    if(provFill&&v>0){const b=geoBBox(f.geometry,proj);const cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2;const t=pmax?v/pmax:0;
      const tl=svgEl('text',{x:cx,y:cy,'text-anchor':'middle','font-size':'8.5','font-weight':'700','font-family':'Inter',fill:t>0.5?'#fff':css('--ink'),'pointer-events':'none'});tl.textContent=iso.replace('CD-','');s.appendChild(tl);}
  });
  // --- Couche TERRITOIRE (superposée) ---
  if(showTerr){const tf=GEO.terr_geom.features;
    const tvals=tf.map(f=>mapEvo?terrSum(f.properties.prov_iso+'|'+f.properties.nom):terrVal(f.properties.prov_iso+'|'+f.properties.nom));
    const tmax=Math.max(1,...tvals);
    tf.forEach((f,i)=>{const nm=f.properties.nom,piso=f.properties.prov_iso,tk=piso+'|'+nm;const v=tvals[i];
      let fill,stroke,sw;
      if(terrFill){fill=v>0?colScale(v,tmax):'transparent';stroke='rgba(10,37,64,0.28)';sw=0.5;}
      else {fill=v>0?'rgba(224,138,30,0.20)':'transparent';stroke=v>0?css('--amber'):'rgba(10,37,64,0.22)';sw=v>0?1.4:0.4;}  // surlignage ambre des territoires bénéficiaires
      const p=svgEl('path',{d:geoPath(f.geometry,proj),fill,stroke,'stroke-width':sw,'data-tk':tk});
      if(v>0){p.style.cursor='pointer';
        p.addEventListener('mousemove',e=>{const tip=$('#mapTip');tip.style.display='block';tip.innerHTML=`<b>Territoire ${esc(nm)}</b> <span style="opacity:.6">(${esc(provName(piso))})</span><br>${indFmt(v)} <span style="opacity:.7">${mapEvo?'· cumul':'· '+curYear()}</span>`;const r=host.getBoundingClientRect();tip.style.left=(e.clientX-r.left+12)+'px';tip.style.top=(e.clientY-r.top+12)+'px';});
        p.addEventListener('mouseleave',()=>{$('#mapTip').style.display='none';});
        p.addEventListener('click',ev=>{ev.stopPropagation();mapSel='T:'+tk;drawPanel();});}
      else {p.style.pointerEvents='none';}
      s.appendChild(p);});
  }
  // --- Couche ETD (points géolocalisés) ---
  if(showEtd)drawEtdPoints(s,proj,host);
  // --- Couche NATIONALE : total au coin (discret) quand d'autres niveaux sont actifs, ou grand au centre si seul ---
  if(showNat){const tot=mapEvo?natSum():natTotal();const alone=!showProv&&!showTerr&&!showEtd;
    if(alone){let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;provFeats.forEach(f=>{const b=geoBBox(f.geometry,proj);minx=Math.min(minx,b[0]);miny=Math.min(miny,b[1]);maxx=Math.max(maxx,b[2]);maxy=Math.max(maxy,b[3]);});
      const cx=(minx+maxx)/2,cy=(miny+maxy)/2;
      [['#fff','4'],[css('--brand-deep'),'0']].forEach(([c,sw])=>{const t=svgEl('text',{x:cx,y:cy,'text-anchor':'middle','font-size':'22','font-weight':'800','font-family':'Poppins',fill:c,'pointer-events':'none'});if(sw!=='0'){t.setAttribute('stroke','#fff');t.setAttribute('stroke-width',sw);t.setAttribute('stroke-linejoin','round');}t.textContent=indFmt(tot);s.appendChild(t);});
      const cap=svgEl('text',{x:cx,y:cy+18,'text-anchor':'middle','font-size':'11','font-weight':'700','font-family':'Inter',fill:css('--navy'),'pointer-events':'none'});cap.textContent='Total national'+(mapEvo?' (cumul)':' '+(curYear()||''));s.appendChild(cap);
    } else {
      const bg=svgEl('rect',{x:8,y:8,width:158,height:34,rx:7,fill:css('--brand'),'fill-opacity':0.92});s.appendChild(bg);
      const t=svgEl('text',{x:16,y:24,'font-size':'13','font-weight':'800','font-family':'Poppins',fill:'#fff','pointer-events':'none'});t.textContent='National : '+indFmt(tot);s.appendChild(t);
      const c2=svgEl('text',{x:16,y:36,'font-size':'8.5','font-family':'Inter',fill:'#fff','pointer-events':'none'});c2.textContent=(mapEvo?'cumul':curYear()||'');s.appendChild(c2);
    }
  }
  host.innerHTML='';host.appendChild(s);
  let drag=null;
  s.addEventListener('wheel',e=>{e.preventDefault();const r=s.getBoundingClientRect();const mx=vb.x+(e.clientX-r.left)/r.width*vb.w,my=vb.y+(e.clientY-r.top)/r.height*vb.h;const k=e.deltaY<0?0.85:1.18;vb.w=Math.min(W,Math.max(60,vb.w*k));vb.h=Math.min(H,Math.max(50,vb.h*k));vb.x=Math.max(0,Math.min(W-vb.w,mx-(mx-vb.x)*k));vb.y=Math.max(0,Math.min(H-vb.h,my-(my-vb.y)*k));s.setAttribute('viewBox',`${vb.x} ${vb.y} ${vb.w} ${vb.h}`);},{passive:false});
  s.addEventListener('mousedown',e=>{drag={x:e.clientX,y:e.clientY};host.style.cursor='grabbing';});
  window.addEventListener('mouseup',()=>{drag=null;if(host)host.style.cursor='grab';});
  s.addEventListener('mousemove',e=>{if(!drag)return;const r=s.getBoundingClientRect();const dx=(e.clientX-drag.x)/r.width*vb.w,dy=(e.clientY-drag.y)/r.height*vb.h;vb.x=Math.max(0,Math.min(W-vb.w,vb.x-dx));vb.y=Math.max(0,Math.min(H-vb.h,vb.y-dy));s.setAttribute('viewBox',`${vb.x} ${vb.y} ${vb.w} ${vb.h}`);drag={x:e.clientX,y:e.clientY};});
  const rst=$('#mapReset');if(rst)rst.onclick=()=>{vb.x=0;vb.y=0;vb.w=W;vb.h=H;s.setAttribute('viewBox',`0 0 ${W} ${H}`);};
  function zoomBy(k){const cx=vb.x+vb.w/2,cy=vb.y+vb.h/2;vb.w=Math.min(W,Math.max(38,vb.w*k));vb.h=Math.min(H,Math.max(31,vb.h*k));vb.x=Math.max(0,Math.min(W-vb.w,cx-vb.w/2));vb.y=Math.max(0,Math.min(H-vb.h,cy-vb.h/2));s.setAttribute('viewBox',`${vb.x} ${vb.y} ${vb.w} ${vb.h}`);}
  const zi=$('#mapZoomIn');if(zi)zi.onclick=()=>zoomBy(0.7);
  const zo=$('#mapZoomOut');if(zo)zo.onclick=()=>zoomBy(1.4);
  const fbtn=$('#mapFull');if(fbtn)fbtn.onclick=()=>{mapFs=!mapFs;fsStyle();try{const el=$('#mapViz');if(mapFs){if(el&&el.requestFullscreen)el.requestFullscreen().catch(()=>{});}else if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen().catch(()=>{});}catch(e){}};
  if(!mapEscBound){mapEscBound=true;
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mapFs){mapFs=false;fsStyle();}});
    document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&mapFs){mapFs=false;fsStyle();}});}
  if(mapFs)fsStyle();
  const lg=$('#mapLegend');if(lg){const pts=curPoints();
    if(pts&&pts.length){const isDot=mapInd==='dotations_dot';const col=isDot?css('--amber'):css('--brand');
      const lbl=isDot?'Dotation OS DOT':(mapInd==='infra'?'Bénéficiaire infranational (ETD/dotation)':'Recette ETD');
      lg.innerHTML=`<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:12px;height:12px;border-radius:50%;background:${col};opacity:.75;border:1px solid #fff;display:inline-block"></span> ${lbl} (aire ∝ montant) — point = localisation officielle CGRDC/OCHA</span>`;}
    else lg.innerHTML=`Faible <span style="display:inline-block;width:90px;height:10px;border-radius:3px;vertical-align:middle;background:linear-gradient(90deg,rgb(233,242,250),rgb(0,101,175))"></span> Élevé · <span style="display:inline-block;width:11px;height:11px;background:var(--panel-2);border:1px solid var(--line);vertical-align:middle;border-radius:2px"></span> pas de donnée`;}
  if(lg&&mapInd==='recettes'&&LY()&&(LY().est_years||[]).includes(String(curYear()))&&!mapEvo){lg.innerHTML+=' · <span style="color:var(--amber);font-weight:600" title="Le total national est le chiffre officiel reconcilie ; la ventilation par province est estimee a partir de la geographie miniere de l-annee reconciliee la plus proche.">ventilation provinciale estimee</span>';}
  const mt=$('#mapTitle');if(mt){const d=LY();mt.textContent=(d?d.label:'Carte')+(mapEvo?' — évolution '+indYears()[0]+'–'+indYears().slice(-1)[0]:' — '+(curYear()||''));}
  const yc=$('#mYearCov');if(yc){const ys=indYears();yc.textContent=ys.length?('Couverture de cette couche : '+ys[0]+(ys.length>1?'–'+ys[ys.length-1]:'')+' ('+ys.length+' an'+(ys.length>1?'s':'')+')'):'Aucune année disponible pour cette couche';yc.style.color=ys.length&&!yearCovered(curYear())&&!mapEvo?'var(--red)':'var(--sky)';}
  drawPanel();
}
function evoBars(host,pairs){ // pairs: [[year,val],...]
  if(!host)return;const max=Math.max(1,...pairs.map(p=>p[1]));
  host.innerHTML=`<div style="display:flex;align-items:flex-end;gap:4px;height:64px;margin-top:6px">${pairs.map(([y,v])=>`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px" title="${y}: ${indFmt(v)}"><div style="width:100%;background:var(--sky);border-radius:3px 3px 0 0;height:${Math.max(2,Math.round(v/max*54))}px"></div><span style="font-size:8.5px;color:var(--ink-faint)">${String(y).slice(2)}</span></div>`).join('')}</div>`;
}
function drawPanel(){
  const panel=$('#mapPanel');if(!panel||!GEO)return;const d=LY();if(!d){panel.innerHTML='';return;}
  // ===== détail d'un point ETD/dotation cliqué : entreprises, ETD (nom source), flux, année =====
  if(mapSel==='PT'&&mapSelPt){const p=mapSelPt;const items=p.items||[];
    panel.innerHTML=`<div style="background:var(--panel-2);border:1px solid var(--line);border-radius:12px;padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center"><h4 style="margin:0;font-size:15px;color:var(--navy)">◆ ${esc(p.nom)}</h4><span class="mono" style="font-size:11px;color:var(--ink-faint)">${esc(provName(p.prov_iso))}</span></div>
      <div style="font-size:11.5px;color:var(--ink-soft);margin-bottom:6px">${esc(d.label)} · ${mapEvo?'cumul':curYear()||''}</div>
      <div style="font-family:'IBM Plex Mono';font-size:20px;font-weight:600;color:var(--sky);margin:2px 0 10px">${indFmt(p.v)}</div>
      <div style="font-size:11px;font-weight:700;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Détail des versements</div>
      <div style="max-height:280px;overflow:auto">${items.length?items.map(it=>`<div style="padding:6px 0;border-bottom:1px dashed var(--line)">
        <div style="display:flex;justify-content:space-between;gap:8px"><b style="font-size:12px;color:var(--navy)">${esc(it.e||'—')}</b><b class="mono" style="font-size:12px">${indFmt(it.v)}</b></div>
        <div style="font-size:11px;color:var(--ink-soft)">Perçu par : <b>${esc(it.p||'—')}</b></div>
        <div style="font-size:10.5px;color:var(--ink-faint)">${esc(it.f||'')}</div></div>`).join(''):'<div style="font-size:12px;color:var(--ink-faint)">—</div>'}</div>
      <div style="margin-top:10px"><button class="btn" data-selprov="" style="padding:4px 10px;font-size:11px">← Retour</button></div></div>`;
    const back=panel.querySelector('[data-selprov=""]');if(back)back.onclick=()=>{mapSel=null;mapSelPt=null;drawPanel();};
    return;
  }
  // territoire selection
  if(mapSel&&mapSel.indexOf('T:')===0){
    const tk=mapSel.slice(2);const [piso,tnom]=tk.split('|');
    const pairs=d.years.map(y=>[y,(d.terr[y]&&d.terr[y][tk])||0]).filter(p=>p[1]>0);
    panel.innerHTML=`<div style="background:var(--panel-2);border:1px solid var(--line);border-radius:12px;padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center"><h4 style="margin:0;font-size:15px;color:var(--navy)">${esc(tnom)}</h4><span class="mono" style="font-size:11px;color:var(--ink-faint)">territoire</span></div>
      <div style="font-size:11.5px;color:var(--ink-soft);margin-bottom:8px">${esc(provName(piso))} · ${esc(d.label)}</div>
      <div style="font-family:'IBM Plex Mono';font-size:20px;font-weight:600;color:var(--sky);margin:4px 0 2px">${indFmt(terrSum(tk))}</div>
      <div style="font-size:11px;color:var(--ink-soft);margin-bottom:10px">Cumul ${d.years[0]}–${d.years.slice(-1)[0]}</div>
      <div style="font-size:11px;font-weight:700;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.05em">Évolution</div>`+
      (pairs.length?`<div id="tEvo"></div>`:'<div style="font-size:12px;color:var(--ink-faint)">—</div>')+`</div>`;
    if(pairs.length)evoBars($('#tEvo'),pairs);
    return;
  }
  // ===== niveau ETD : liste classée des bénéficiaires ETD/dotation géolocalisés =====
  if(lvlOn('etd')&&!lvlOn('province')&&!lvlOn('territoire')&&(!mapSel||mapSel.indexOf('T:')===0)){
    const pts=(curPoints()||[]).slice().sort((a,b)=>b.v-a.v);const et=pts.reduce((a,x)=>a+x.v,0);
    panel.innerHTML=`<div style="background:var(--panel-2);border:1px solid var(--line);border-radius:12px;padding:16px"><h4 style="margin:0 0 4px;font-size:14px;color:var(--navy)">Bénéficiaires ETD ${mapEvo?'(cumul)':curYear()||''}</h4>
      <div style="font-size:12px;color:var(--ink-soft);margin-bottom:10px">${pts.length} entité(s) géolocalisée(s) · total ${indFmt(et)}</div>
      ${pts.length?pts.map(x=>`<div style="display:flex;justify-content:space-between;gap:8px;font-size:12.5px;padding:5px 0;border-bottom:1px dashed var(--line)"><span>◆ ${esc(x.nom)} <span style="color:var(--ink-faint);font-size:10px">${esc(provName(x.prov_iso))}</span></span><b class="mono">${indFmt(x.v)}</b></div>`).join(''):`<div style="font-size:12px;color:var(--ink-faint)">Aucune donnée ETD${!yearCovered(curYear())&&!mapEvo?' en '+curYear():''}.</div>`}</div>`;
    return;
  }
  const ranked=GEO.geometry.features.map(f=>({iso:f.properties.iso,nom:provName(f.properties.iso),v:unitVal(f.properties.iso)})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v);
  const tot=ranked.reduce((a,x)=>a+x.v,0);
  if(!mapSel||mapSel.indexOf('T:')===0){
    const natLbl=(lvlOn('national')&&!lvlOn('province')&&!lvlOn('territoire'))?'Total national ':'Couverture ';
    panel.innerHTML=`<div style="background:var(--panel-2);border:1px solid var(--line);border-radius:12px;padding:16px"><h4 style="margin:0 0 4px;font-size:14px;color:var(--navy)">${natLbl}${mapEvo?'(cumul)':curYear()||''}</h4>
      ${(lvlOn('national')&&!lvlOn('province')&&!lvlOn('territoire'))?`<div style="font-family:'IBM Plex Mono';font-size:22px;font-weight:700;color:var(--brand);margin:2px 0 8px">${indFmt(tot)}</div>`:''}
      <div style="font-size:12px;color:var(--ink-soft);margin-bottom:12px">${ranked.length? ranked.length+' province(s) avec données · total '+indFmt(tot) : (!yearCovered(curYear())&&!mapEvo?'<b style=\"color:var(--red)\">Aucune donnée en '+curYear()+' pour cette couche.</b>':'Aucune donnée.')}</div>
      ${ranked.map(x=>`<div style="display:flex;justify-content:space-between;gap:8px;font-size:12.5px;padding:5px 0;border-bottom:1px dashed var(--line);cursor:pointer" data-selprov="${x.iso}"><span>${esc(x.nom)}</span><b class="mono">${indFmt(x.v)}</b></div>`).join('')}
      <div style="font-size:11.5px;color:var(--ink-faint);margin-top:10px">Cliquez une province (carte ou liste) pour son évolution et ses territoires.</div></div>`;
    $$('[data-selprov]').forEach(el=>el.onclick=()=>{mapSel=el.getAttribute('data-selprov');drawPanel();$$('#mapSvg path').forEach(pp=>{const sel=pp.getAttribute('data-iso')===mapSel;pp.setAttribute('stroke-width',sel?'2.2':'0.8');pp.setAttribute('stroke',sel?css('--red'):'#fff');});});
    return;
  }
  const iso=mapSel;const nom=provName(iso);
  const pairs=d.years.map(y=>[y,(d.prov[y]&&d.prov[y][iso])||0]);
  const nonzero=pairs.filter(p=>p[1]>0);
  // territoire breakdown for this province : cumul + montant de l'année sélectionnée
  const cy=curYear();
  const showYr=!mapEvo&&cy&&yearCovered(cy);
  const tset={},tyr={};
  d.years.forEach(y=>{const tt=d.terr[y]||{};Object.keys(tt).forEach(tk=>{if(tk.split('|')[0]===iso){tset[tk]=(tset[tk]||0)+tt[tk];if(String(y)===String(cy))tyr[tk]=(tyr[tk]||0)+tt[tk];}});});
  const terrRows=Object.keys(tset).filter(tk=>tset[tk]>0).map(tk=>[tk.split('|')[1],tset[tk],tyr[tk]||0]).sort((a,b)=>b[1]-a[1]);
  const ent=(GEO.provinces[iso]&&GEO.provinces[iso].entreprises)||[];
  // ETD breakdown for this province : cumul + montant de l'année sélectionnée
  const eset={},eyr={};
  d.years.forEach(y=>{const ee=d.etd&&d.etd[y]||{};Object.keys(ee).forEach(ek=>{if(ek.split('|')[0]===iso){eset[ek]=(eset[ek]||0)+ee[ek];if(String(y)===String(cy))eyr[ek]=(eyr[ek]||0)+ee[ek];}});});
  const etdRows=Object.keys(eset).filter(ek=>eset[ek]>0).map(ek=>[ek.split('|')[1],eset[ek],eyr[ek]||0]).sort((a,b)=>b[1]-a[1]);
  const dcol=(yv,cum)=>`<span style="display:inline-flex;gap:10px">${showYr?`<b class="mono" style="min-width:66px;text-align:right;display:inline-block">${yv>0?indFmt(yv):'<span style="color:var(--ink-faint)">—</span>'}</b>`:''}<b class="mono" style="min-width:66px;text-align:right;display:inline-block;color:${showYr?'var(--ink-faint)':'var(--ink)'}">${indFmt(cum)}</b></span>`;
  const colHdr=showYr?`<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.03em;padding:1px 0 3px"><span></span><span style="display:inline-flex;gap:10px"><span style="min-width:66px;text-align:right;color:var(--sky)">${cy}</span><span style="min-width:66px;text-align:right">cumul</span></span></div>`:'';
  panel.innerHTML=`<div style="background:var(--panel-2);border:1px solid var(--line);border-radius:12px;padding:16px">
    <div style="display:flex;justify-content:space-between;align-items:center"><h4 style="margin:0;font-size:15px;color:var(--navy)">${esc(nom)}</h4><span class="mono" style="font-size:11px;color:var(--ink-faint)">${esc(iso)}</span></div>
    <div style="font-family:'IBM Plex Mono';font-size:22px;font-weight:600;color:var(--sky);margin:8px 0 2px">${indFmt(unitVal(iso))}</div>
    <div style="font-size:11.5px;color:var(--ink-soft);margin-bottom:10px">${esc(d.label)} · ${mapEvo?'cumul '+d.years[0]+'–'+d.years.slice(-1)[0]:curYear()||''}</div>
    <div style="font-size:11px;font-weight:700;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.05em">Évolution pluriannuelle</div>
    ${nonzero.length?'<div id="pEvo"></div>':'<div style="font-size:12px;color:var(--ink-faint)">—</div>'}
    ${terrRows.length?`<div style="font-size:11px;font-weight:700;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.05em;margin-top:12px">Territoires${showYr?' — '+cy+' · cumul':' (cumul)'}</div>${colHdr}${terrRows.map(([n,cum,yv])=>`<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:3px 0;border-bottom:1px dashed var(--line)"><span>${esc(n)}</span>${dcol(yv,cum)}</div>`).join('')}`:''}
    ${etdRows.length?`<div style="font-size:11px;font-weight:700;color:var(--amber);text-transform:uppercase;letter-spacing:.05em;margin-top:12px">ETD${showYr?' — '+cy+' · cumul':' (cumul)'}</div>${colHdr}${etdRows.map(([n,cum,yv])=>`<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:3px 0;border-bottom:1px dashed var(--line)"><span>◆ ${esc(n)}</span>${dcol(yv,cum)}</div>`).join('')}`:''}
    ${ent.length&&mapInd==='recettes'?`<div style="font-size:11px;font-weight:700;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.05em;margin-top:12px">Entreprises</div>${ent.map(e=>`<div style="font-size:12px;padding:2px 0;color:var(--ink)">• ${esc(e)}</div>`).join('')}`:''}
    <div style="margin-top:12px"><button class="btn" data-selprov="" style="padding:4px 10px;font-size:11px">← Toutes les provinces</button></div></div>`;
  if(nonzero.length)evoBars($('#pEvo'),pairs);
  const back=panel.querySelector('[data-selprov=""]');if(back)back.onclick=()=>{mapSel=null;drawPanel();$$('#mapSvg path').forEach(pp=>{pp.setAttribute('stroke-width','0.8');pp.setAttribute('stroke','#fff');});};
}
function drawGeo(){
  drawMap();
  const d=LY();
  const rt=$('#geoRankTitle');if(rt)rt.textContent='Classement des provinces';
  const rs=$('#geoRankSub');if(rs&&d)rs.textContent=d.label+' · '+(mapEvo?'cumul':curYear()||'');
  const ranked=GEO?GEO.geometry.features.map(f=>({label:provName(f.properties.iso),value:unitVal(f.properties.iso)})).filter(x=>x.value>0):[];
  cBar($('#geoRank'),ranked,css('--sky'),true);
  // national evolution across years
  if(d){const evo=d.years.map(y=>{let s=0;const pp=d.prov[y]||{};Object.keys(pp).forEach(k=>s+=pp[k]);return {label:y,value:s};});
    cBar($('#geoEvo'),evo,css('--amber'),true);}
  drawInfraTable();
}
// détail infranational : ventilation par entité perceptrice depuis les annexes 2022/2023
let infraF={annee:'',type:'',prov:'',perc:'',ent:'',flux:'',group:'perc'};
function drawInfraTable(){const host=$('#geoInfra');if(!host)return;
  const t=DS['ctx_paiement_infranational_detail'];
  if(!t){host.innerHTML='<div class="empty" style="padding:16px">Données détaillées indisponibles.</div>';return;}
  const ci={};t.cols.forEach((c,i)=>ci[c]=i);
  const F=infraF;
  const match=(r,except)=>{
    return (except==='annee'||!F.annee||String(r[ci.annee])===F.annee)
      &&(except==='type'||!F.type||r[ci.type_percepteur]===F.type)
      &&(except==='prov'||!F.prov||r[ci.province]===F.prov)
      &&(except==='perc'||!F.perc||r[ci.percepteur]===F.perc)
      &&(except==='ent'||!F.ent||r[ci.entreprise]===F.ent)
      &&(except==='flux'||!F.flux||r[ci.flux]===F.flux);};
  const opts=(field,col)=>[...new Set(t.rows.filter(r=>match(r,field)).map(r=>r[ci[col]]))].filter(v=>v!=null&&v!=='').sort();
  const anneeOpts=opts('annee','annee').map(String);
  const typeOpts=opts('type','type_percepteur');
  const provOpts=opts('prov','province');
  const percOpts=opts('perc','percepteur');
  const entOpts=opts('ent','entreprise');
  const fluxOpts=opts('flux','flux');
  const rows=t.rows.filter(r=>match(r,null));
  // grouping
  const G=F.group||'perc';
  const GK={perc:['annee','province','type_percepteur','percepteur'],
            ent:['annee','entreprise'],
            flux:['annee','flux'],
            entflux:['annee','entreprise','flux'],
            etd:['province','percepteur'],
            full:['annee','province','type_percepteur','percepteur','entreprise','flux']};
  const keys=GK[G]||GK.perc;
  const agg={};
  for(const r of rows){const k=keys.map(c=>r[ci[c]]).join('¦');
    if(!agg[k]){agg[k]={mt:0,ent:new Set(),perc:new Set(),flux:new Set(),vals:{}};keys.forEach(c=>agg[k].vals[c]=r[ci[c]]);}
    agg[k].mt+=Number(r[ci.montant_usd])||0;agg[k].ent.add(r[ci.entreprise]);agg[k].perc.add(r[ci.percepteur]);agg[k].flux.add(r[ci.flux]);}
  const list=Object.values(agg).sort((a,b)=>b.mt-a.mt);
  const tot=list.reduce((a,x)=>a+x.mt,0);
  const bytype={};for(const r of rows){const ty=r[ci.type_percepteur];bytype[ty]=(bytype[ty]||0)+(Number(r[ci.montant_usd])||0);}
  const typeChips=Object.entries(bytype).sort((a,b)=>b[1]-a[1]).map(([ty,v])=>`<span class="itc" style="display:inline-flex;flex-direction:column;padding:6px 12px;background:var(--panel);border:1px solid var(--line);border-radius:8px"><span style="font-size:10px;color:var(--ink-soft)">${esc(ty)}</span><b style="font-family:'IBM Plex Mono';font-size:13px;color:var(--sky)">${fmtUSD(v)}</b></span>`).join('');
  const tc=v=>`<span style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:600;background:${/Dotation/.test(v)?'rgba(244,197,24,.18)':/ETD/.test(v)?'rgba(0,101,175,.12)':'var(--panel)'};color:${/Dotation/.test(v)?'var(--amber)':/ETD/.test(v)?'var(--sky)':'var(--ink-soft)'};border:1px solid var(--line)">${esc(v)}</span>`;
  // column model per grouping
  const COLS={
    perc:[['Année','annee'],['Province','province'],['Type','type_percepteur',tc],['Entité perceptrice','percepteur'],['Entrep.','_nent'],['Montant (USD)','mt']],
    ent:[['Année','annee'],['Entreprise','entreprise'],['Entités perç.','_nperc'],['Flux','_nflux'],['Montant (USD)','mt']],
    flux:[['Année','annee'],['Flux','flux'],['Entrep.','_nent'],['Montant (USD)','mt']],
    entflux:[['Année','annee'],['Entreprise','entreprise'],['Flux','flux'],['Montant (USD)','mt']],
    etd:[['Province','province'],['Entité perceptrice','percepteur'],['Entrep.','_nent'],['Flux','_nflux'],['Montant (USD)','mt']],
    full:[['Année','annee'],['Province','province'],['Type','type_percepteur',tc],['Entité perceptrice','percepteur'],['Entreprise','entreprise'],['Flux','flux'],['Montant (USD)','mt']]};
  const cols=COLS[G]||COLS.perc;
  const cellVal=(x,key)=>{if(key==='mt')return fmtUSD(x.mt);if(key==='_nent')return x.ent.size;if(key==='_nperc')return x.perc.size;if(key==='_nflux')return x.flux.size;return x.vals[key];};
  const cap=250,shown=list.slice(0,cap);
  const sel=(id,val,options,allLabel)=>`<select id="${id}" style="min-width:120px"><option value="">${allLabel}</option>${options.map(o=>`<option value="${esc(String(o))}" ${String(val)===String(o)?'selected':''}>${esc(String(o))}</option>`).join('')}</select>`;
  const lab=(txt,inner)=>`<label style="display:flex;flex-direction:column;gap:3px;font-size:10px;font-weight:600;color:var(--ink-soft);text-transform:uppercase">${txt}${inner}</label>`;
  host.innerHTML=`
    <div style="display:flex;gap:9px;flex-wrap:wrap;align-items:flex-end;margin:10px 0">
      ${lab('Regrouper par',`<select id="ifGroup" style="min-width:150px">
        <option value="perc" ${G==='perc'?'selected':''}>Entité perceptrice</option>
        <option value="etd" ${G==='etd'?'selected':''}>ETD / entité (cumul)</option>
        <option value="ent" ${G==='ent'?'selected':''}>Entreprise</option>
        <option value="flux" ${G==='flux'?'selected':''}>Flux</option>
        <option value="entflux" ${G==='entflux'?'selected':''}>Entreprise × Flux</option>
        <option value="full" ${G==='full'?'selected':''}>Détail complet</option></select>`)}
      ${lab('Année',sel('ifAnnee',F.annee,anneeOpts,'Toutes'))}
      ${lab("Type d'entité",sel('ifType',F.type,typeOpts,'Tous'))}
      ${lab('Province',sel('ifProv',F.prov,provOpts,'Toutes'))}
      ${lab('Entité perceptrice',sel('ifPerc',F.perc,percOpts,'Toutes'))}
      ${lab('Entreprise',sel('ifEnt',F.ent,entOpts,'Toutes'))}
      ${lab('Flux',sel('ifFlux',F.flux,fluxOpts,'Tous'))}
      <button class="btn" id="ifReset" style="padding:6px 10px">Réinitialiser</button>
      <button class="btn" id="ifCsv">↓ Export CSV</button>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">${typeChips||'<span style="font-size:12px;color:var(--ink-faint)">Aucune ligne pour ces filtres.</span>'}</div>
    <div style="max-height:440px;overflow:auto;border:1px solid var(--line);border-radius:8px">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr>${cols.map((c,i)=>`<th style="position:sticky;top:0;background:var(--panel-2);text-align:${c[1]==='mt'||/^_n/.test(c[1])?'right':'left'};padding:7px 9px;border-bottom:1px solid var(--line);font-size:11px;color:var(--navy);white-space:nowrap">${c[0]}</th>`).join('')}</tr></thead>
    <tbody>${shown.map(x=>`<tr>${cols.map(c=>{const raw=cellVal(x,c[1]);const disp=c[2]?c[2](raw):(c[1]==='mt'?raw:esc(String(raw==null?'':raw)));const right=c[1]==='mt'||/^_n/.test(c[1]);return `<td style="padding:5px 9px;border-bottom:1px solid var(--line);text-align:${right?'right':'left'};${c[1]==='mt'?"font-family:'IBM Plex Mono';font-weight:600":''}${/^_n/.test(c[1])?';color:var(--ink-faint)':''}">${disp}</td>`;}).join('')}</tr>`).join('')}
    </tbody>
    <tfoot><tr><td colspan="${cols.length-1}" style="padding:8px 9px;text-align:right;font-weight:700;color:var(--navy);border-top:2px solid var(--line)">Total de la sélection (${fmtN(list.length)} ligne(s))</td><td style="padding:8px 9px;text-align:right;font-family:'IBM Plex Mono';font-weight:700;color:var(--sky);border-top:2px solid var(--line)">${fmtUSD(tot)}</td></tr></tfoot>
    </table></div>
    ${list.length>cap?`<div style="font-size:11px;color:var(--ink-faint);margin-top:6px">Affichage des ${cap} premières lignes sur ${fmtN(list.length)}. Affinez avec les filtres, ou exportez en CSV pour l'ensemble.</div>`:''}`;
  const rerun=()=>drawInfraTable();
  $('#ifGroup').onchange=e=>{F.group=e.target.value;rerun();};
  $('#ifAnnee').onchange=e=>{F.annee=e.target.value;rerun();};
  $('#ifType').onchange=e=>{F.type=e.target.value;rerun();};
  $('#ifProv').onchange=e=>{F.prov=e.target.value;rerun();};
  $('#ifPerc').onchange=e=>{F.perc=e.target.value;rerun();};
  $('#ifEnt').onchange=e=>{F.ent=e.target.value;rerun();};
  $('#ifFlux').onchange=e=>{F.flux=e.target.value;rerun();};
  $('#ifReset').onclick=()=>{infraF={annee:'',type:'',prov:'',perc:'',ent:'',flux:'',group:F.group};rerun();};
  $('#ifCsv').onclick=()=>{const hdr=cols.map(c=>c[0].replace(/\s*\(USD\)/,'').replace('.','').trim());
    const csv=[hdr.join(';')].concat(list.map(x=>cols.map(c=>{const v=cellVal(x,c[1]);return c[1]==='mt'?Math.round(x.mt):String(v==null?'':v);}).join(';'))).join('\n');
    saveFile('paiements_infranationaux_detail.csv',csv);};
}
const MODULES={
  overview:{t:"Vue d'ensemble",f:mOverview,d:drawOverview},
  explorer:{t:"Explorateur de données",f:mExplorer,d:renderExplorer},
  viz:{t:"Visualisations",f:mViz,d:bindViz},
  geo:{t:"Géographie",f:mGeo,d:drawGeo},
  model:{t:"Modèle de données",f:mModel,d:drawSchema},
  dict:{t:"Dictionnaire de données",f:mDict,d:renderDict},
  qualite:{t:"Qualité des données",f:mQualite,d:drawQualite},
  reports:{t:"Rapports",f:mReports,d:renderReports},
  about:{t:"À propos",f:mAbout,d:()=>{}},
};
const NAV=[
  {g:'Analyse',items:[['overview','◧',"Vue d'ensemble"],['viz','◫','Visualisations'],['explorer','▤','Explorateur'],['geo','◈','Géographie']]},
  {g:'Structure',items:[['model','✳','Modèle de données'],['dict','▥','Dictionnaire'],['qualite','✓','Qualité des données'],['reports','▦','Rapports']]},
  {g:'',items:[['about','ⓘ','À propos']]},
];

/* ===== router / shell ===== */
let current='overview', globalYear='';
function isNavHidden(id){return id!=='overview'&&(C.nav_hidden||[]).includes(id);}
function firstVisibleModule(){for(const sec of NAV)for(const [id] of sec.items)if(!isNavHidden(id))return id;return 'overview';}
function buildSidebar(){
  $('#sidenav').innerHTML=NAV.map(sec=>{const items=sec.items.filter(([id])=>editing||!isNavHidden(id));if(!items.length)return '';
    return `${sec.g?`<div class="grp">${sec.g}</div>`:''}`+items.map(([id,ico,lab])=>`<a class="item ${isNavHidden(id)?'hiddenrub':''}" href="#${id}" data-go="${id}"><span class="ico">${ico}</span>${lab}${isNavHidden(id)?' <span class="badge" style="margin-left:auto">masquée</span>':''}</a>`).join('');
  }).join('');
  $$('#sidenav a.item').forEach(a=>a.classList.toggle('active',a.dataset.go===current));
}
function syncBrandDom(){
  const b=C.brand||{},f=C.footer||{};
  const set=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val||'';};
  set('sideBrandName',b.name||'TransparenceRDC');
  set('sideBrandTag',b.tagline_short||'Entrepôt de données ITIE');
  set('topBrandName',b.name||'TransparenceRDC');
  set('topBrandTag',b.full||'');
  set('sideFooterNote',f.note_short||'Données publiques ITIE · 2007–2024');
}
function fillYears(){
  const ys=new Set();['fait_total_annuel','fait_reconciliation_flux','fait_reconciliation_entreprise','fait_depense_sociale'].forEach(t=>{const yc=yearCol(t);if(!yc)return;const yi=DS[t].cols.indexOf(yc);DS[t].rows.forEach(r=>{const y=yearVal(r[yi]);if(y)ys.add(y);});});
  const opts=['<option value="">Tous</option>'].concat([...ys].sort().map(y=>`<option value="${y}">${y}</option>`));
  $('#yearFilter').innerHTML=opts.join('');
}
function go(id){
  if(editing)collectEdits();
  if(!MODULES[id])id='overview';
  if(isNavHidden(id)&&!editing)id=firstVisibleModule();
  current=id;
  $('#mtitle').textContent=MODULES[id].t;
  $('#app').innerHTML=MODULES[id].f();
  $$('#sidenav a.item').forEach(a=>a.classList.toggle('active',a.dataset.go===id));
  // the exercise filter only applies to Explorer & Visualisations (avoids showing one year's numbers while another is selected)
  const yf=$('#yearFilter'),scoped=(id==='explorer'||id==='viz');
  yf.disabled=!scoped;yf.style.opacity=scoped?'1':'.45';
  yf.title=scoped?'Filtrer par exercice':"Le filtre par exercice s'applique à l'Explorateur et aux Visualisations";
  requestAnimationFrame(()=>{try{MODULES[id].d();}catch(e){console.error(e);}});
  window.scrollTo({top:0});
  $('#side').classList.remove('open');$('#scrim').classList.remove('on');
  if(editing)markEditable(true);
}
function mountStatic(){
  // Le logo est servi directement en tant que fichier statique par Flask
  // (src="/static/logo.png" défini dans templates/index.html) : plus besoin
  // de l'injecter en base64 depuis le JS.
  buildSidebar();fillYears();syncBrandDom();
  // static editable (contact/kpi labels appear in modules; topbar none). fill contact placeholders handled in module render.
}

document.addEventListener('click',e=>{
  const g=e.target.closest('[data-go]');if(g){e.preventDefault();go(g.dataset.go);return;}
  const ds=e.target.closest('[data-ds]');if(ds){exState.ds=ds.dataset.ds;exState.page=0;exState.sort=null;exState.q='';exState.filters={};$$('#exMain');$$('.dsitem').forEach(x=>x.classList.toggle('on',x===ds));renderExplorer();return;}
  const chip=e.target.closest('.chip[data-f]');if(chip){repFilter=chip.dataset.f;$$('.chip').forEach(c=>c.classList.toggle('on',c===chip));renderReports();if(editing)markEditable(true);return;}
  const evo=e.target.closest('[data-evo]');if(evo){mapEvo=evo.dataset.evo==='1';mapSel=null;const yb=$('#mYear');if(yb)yb.disabled=mapEvo;$$('[data-evo]').forEach(b=>b.classList.toggle('on',b===evo));drawGeo();return;}
  const lvl=e.target.closest('[data-lvl]');if(lvl&&!lvl.disabled){toggleLvl(lvl.dataset.lvl);mapSel=null;$$('[data-lvl]').forEach(b=>b.classList.toggle('on',lvlOn(b.dataset.lvl)));drawGeo();return;}
  const ind=e.target.closest('[data-ind]');if(ind){mapInd=ind.dataset.ind;mapSel=null;
    const ys=indYears();if(ys.indexOf(mapYear)<0)mapYear=ys.length?ys[ys.length-1]:null;
    if(lvlOn('territoire')&&!hasTerr())mapLevels.delete('territoire');if(lvlOn('etd')&&!hasEtdPts())mapLevels.delete('etd');if(!mapLevels.size)mapLevels.add('province');
    $('#app').innerHTML=MODULES.geo.f();requestAnimationFrame(()=>drawGeo());return;}
});
document.addEventListener('change',e=>{
  if(e.target.id==='mInd'){mapInd=e.target.value;mapSel=null;
    const ys=indYears();if(ys.indexOf(mapYear)<0)mapYear=ys.length?ys[ys.length-1]:null;
    if(lvlOn('territoire')&&!hasTerr())mapLevels.delete('territoire');if(lvlOn('etd')&&!hasEtdPts())mapLevels.delete('etd');if(!mapLevels.size)mapLevels.add('province');
    $('#app').innerHTML=MODULES.geo.f();requestAnimationFrame(()=>drawGeo());return;}
  if(e.target.id==='mYear'){mapYear=e.target.value;mapSel=null;drawGeo();return;}
});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')){const ds=e.target.closest&&e.target.closest('[data-ds]');if(ds){e.preventDefault();ds.click();}}});
$('#burger').onclick=()=>{$('#side').classList.toggle('open');$('#scrim').classList.toggle('on');};
$('#scrim').onclick=()=>{$('#side').classList.remove('open');$('#scrim').classList.remove('on');};
$('#yearFilter').onchange=e=>{globalYear=e.target.value;if(current==='explorer')renderExplorer();else if(current==='viz')drawViz();};
$('#globalSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){exState.q=e.target.value;exState.page=0;go('explorer');}});

function applyTheme(t){if(t)document.documentElement.setAttribute('data-theme',t);try{localStorage.setItem('trdc-theme',t)}catch(e){}requestAnimationFrame(()=>{try{MODULES[current].d();}catch(e){}});}
$('#themeBtn').onclick=()=>{const cur=document.documentElement.getAttribute('data-theme');const dark=cur?cur==='dark':matchMedia('(prefers-color-scheme:dark)').matches;applyTheme(dark?'light':'dark');};
try{const stx=localStorage.getItem('trdc-theme');if(stx)document.documentElement.setAttribute('data-theme',stx);}catch(e){}

/* ===== ADMIN =====
   Authentification et publication gérées par le back-end Flask :
   - POST /api/login    { username, password } -> cookie de session serveur
   - PUT  /api/content  { content: {...} }      -> enregistre & publie
   Le mot de passe n'est plus jamais comparé côté navigateur (l'ancien
   hash SHA-256 en clair dans le JS était visible par n'importe qui). */
let editing=false;
function markEditable(on){$$('[data-edit]').forEach(el=>{if(on){el.setAttribute('contenteditable','true');el.setAttribute('spellcheck','false');if(!el.textContent.trim()){const v=getPath(C,el.getAttribute('data-edit'));if(v!=null)el.textContent=v;}}else el.removeAttribute('contenteditable');});document.body.classList.toggle('editing',on);}
function collectEdits(){$$('[data-edit]').forEach(el=>{const p=el.getAttribute('data-edit');if(getPath(C,p)!==undefined)assignPath(C,p,el.textContent.trim());});}
function enterAdminMode(){editing=true;$('#adminBar').classList.add('on');$('#adminFab').style.display='none';document.body.style.paddingBottom='64px';markEditable(true);buildSidebar();}
// Si une session admin est déjà active côté serveur (cookie valide), on
// rouvre directement le mode édition sans redemander le mot de passe.
getJSON('/api/me').then(me=>{if(me&&me.authenticated)enterAdminMode();}).catch(()=>{});
$('#adminFab').onclick=()=>{if(editing)return;$('#loginModal').classList.add('on');$('#pw').value='';$('#loginMsg').className='msg';setTimeout(()=>$('#pw').focus(),50);};
$('#loginCancel').onclick=()=>$('#loginModal').classList.remove('on');
$('#loginModal').onclick=e=>{if(e.target.id==='loginModal')$('#loginModal').classList.remove('on');};
async function tryLogin(){
  const btn=$('#loginBtn'),old=btn.textContent;btn.disabled=true;btn.textContent='Connexion…';
  try{
    const r=await fetch('/api/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('#pw').value})});
    if(r.ok){$('#loginModal').classList.remove('on');enterAdminMode();}
    else{const m=$('#loginMsg');m.className='msg err';m.textContent='Mot de passe incorrect.';}
  }catch(e){const m=$('#loginMsg');m.className='msg err';m.textContent="Connexion au serveur impossible.";}
  finally{btn.disabled=false;btn.textContent=old;}
}
$('#loginBtn').onclick=tryLogin;$('#pw').addEventListener('keydown',e=>{if(e.key==='Enter')tryLogin();});
// close modals with Escape
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#loginModal').classList.remove('on');$('#repModal').classList.remove('on');$('#enrichModal').classList.remove('on');$('#navModal').classList.remove('on');}});
$('#exitBtn').onclick=async()=>{try{await fetch('/api/logout',{method:'POST',credentials:'same-origin'});}catch(e){}editing=false;$('#adminBar').classList.remove('on');$('#adminFab').style.display='';document.body.style.paddingBottom='';markEditable(false);buildSidebar();if(isNavHidden(current))go(firstVisibleModule());};

async function saveAndPublish(){
  collectEdits();RAW.content=C;
  const btn=$('#saveBtn'),old=btn.textContent;btn.textContent='Publication…';btn.disabled=true;
  try{
    const r=await fetch('/api/content',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:RAW.content})});
    if(r.status===401){alert('Votre session administrateur a expiré : veuillez vous reconnecter.');editing=false;$('#adminBar').classList.remove('on');$('#adminFab').style.display='';markEditable(false);return;}
    if(!r.ok){const j=await r.json().catch(()=>({}));alert('Échec de la publication : '+(j.error||r.status));return;}
    btn.textContent='Publié ✓';setTimeout(()=>{btn.textContent=old;},1500);
    buildSidebar();syncBrandDom();
  }catch(err){alert("Échec de la publication : connexion au serveur impossible.");}
  finally{btn.disabled=false;}
}
$('#saveBtn').onclick=saveAndPublish;
$('#repMgrBtn').onclick=()=>{renderRM();$('#repModal').classList.add('on');};

/* ===== Gestion des rubriques (menu) ===== */
function renderNavMgr(){
  const host=$('#navList');if(!host)return;
  const flat=NAV.flatMap(sec=>sec.items);
  host.innerHTML=flat.map(([id,ico,lab])=>`<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--panel-2);cursor:${id==='overview'?'default':'pointer'}">
    <input type="checkbox" data-nav="${id}" ${id==='overview'?'checked disabled':(isNavHidden(id)?'':'checked')}>
    <span>${ico} ${esc(lab)}</span>${id==='overview'?'<span style="margin-left:auto;font-size:11px;color:var(--ink-soft)">toujours visible</span>':''}
  </label>`).join('');
}
$('#navMgrBtn').onclick=()=>{renderNavMgr();$('#navModal').classList.add('on');};
$('#navModal').onclick=e=>{if(e.target.id==='navModal')$('#navModal').classList.remove('on');};
$('#navList').addEventListener('change',e=>{const cb=e.target.closest('[data-nav]');if(!cb)return;const id=cb.dataset.nav;
  C.nav_hidden=C.nav_hidden||[];
  if(cb.checked)C.nav_hidden=C.nav_hidden.filter(x=>x!==id);
  else if(!C.nav_hidden.includes(id))C.nav_hidden.push(id);
  buildSidebar();});
$('#navDone').onclick=()=>{$('#navModal').classList.remove('on');buildSidebar();if(isNavHidden(current))go(firstVisibleModule());};

/* ===== ENRICHISSEMENT DES DONNÉES ===== */
let enParsed=null;
function enTables(){return Object.keys(DS).filter(k=>DS[k]&&DS[k].cols&&DS[k].rows);}
function fillEnTables(){const sel=$('#enTable');if(!sel)return;sel.innerHTML=enTables().map(k=>`<option value="${k}">${esc(DS[k].label||k)} — ${DS[k].rows.length} lignes</option>`).join('');enShowInfo();}
function enShowInfo(){const t=$('#enTable').value,d=DS[t];if(!d)return;$('#enInfo').innerHTML=`Colonnes attendues (<b>${d.cols.length}</b>) : <span class="mono" style="font-size:11px">${d.cols.map(esc).join(' · ')}</span>`;$('#enPreview').style.display='none';$('#enAppend').disabled=true;enParsed=null;$('#enMsg').className='msg';$('#enMsg').textContent='';}
function csvParse(txt){const sep=txt.indexOf('\t')>=0&&txt.indexOf('\t')<(txt.indexOf('\n')||1e9)?'\t':(txt.split('\n')[0].split(';').length>txt.split('\n')[0].split(',').length?';':',');
  const rows=[];let i=0,f='',row=[],q=false;
  while(i<txt.length){const c=txt[i];
    if(q){if(c==='"'){if(txt[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}
    else{if(c==='"')q=true;else if(c===sep){row.push(f);f='';}else if(c==='\n'||c==='\r'){if(c==='\r'&&txt[i+1]==='\n')i++;row.push(f);if(row.length>1||row[0]!=='')rows.push(row);row=[];f='';}else f+=c;}
    i++;}
  if(f!==''||row.length){row.push(f);rows.push(row);}
  return rows;}
function coerce(v,type){if(v==null)return null;const s=String(v).trim();if(s===''||/^(null|na|n\/a|-)$/i.test(s))return null;if(type==='num'){const n=Number(s.replace(/\s/g,'').replace(',','.').replace(/[^0-9.\-eE]/g,''));return isNaN(n)?null:n;}return s;}
function enParseFile(name,txt){const t=$('#enTable').value,d=DS[t];let recs=[];
  if(/\.json$/i.test(name)||/^\s*[\[{]/.test(txt)){let j=JSON.parse(txt);if(!Array.isArray(j))j=j.rows||j.data||[];
    recs=j.map(o=>Array.isArray(o)?o:d.cols.map(c=>o[c]!==undefined?o[c]:null));}
  else{const rows=csvParse(txt);if(!rows.length)throw new Error('Fichier vide');
    const header=rows[0].map(h=>h.trim());const idx=d.cols.map(c=>header.findIndex(h=>h.toLowerCase()===c.toLowerCase()));
    const hasHeader=idx.some(x=>x>=0);
    recs=rows.slice(hasHeader?1:0).map(r=>d.cols.map((c,ci)=>{const k=hasHeader?idx[ci]:ci;return k>=0?r[k]:null;}));}
  const maxId=d.rows.reduce((m,r)=>{const v=Number(r[0]);return isNaN(v)?m:Math.max(m,v);},0);
  const idIsNum=d.types&&d.types[0]==='num';
  const clean=recs.filter(r=>r.some(v=>v!=null&&String(v).trim()!=='')).map((r,i)=>d.cols.map((c,ci)=>{
    if(ci===0&&(r[0]==null||String(r[0]).trim()==='')&&idIsNum)return maxId+1+i;
    return coerce(r[ci],(d.types&&d.types[ci])||'str');}));
  return clean;}
function enRenderPreview(recs){const t=$('#enTable').value,d=DS[t];const show=recs.slice(0,20);
  $('#enPreview').style.display='';
  $('#enPreview').innerHTML=`<table style="width:100%;border-collapse:collapse;font-size:11.5px"><thead><tr>${d.cols.map(c=>`<th style="position:sticky;top:0;background:var(--panel-2);padding:5px 8px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap">${esc(c)}</th>`).join('')}</tr></thead><tbody>${show.map(r=>`<tr>${r.map(v=>`<td style="padding:4px 8px;border-bottom:1px solid var(--line);white-space:nowrap">${v==null?'<span style=\"opacity:.4\">∅</span>':esc(String(v))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;}
$('#enrichBtn').onclick=()=>{fillEnTables();$('#enrichModal').classList.add('on');};
$('#enTable').onchange=enShowInfo;
$('#enDone').onclick=()=>$('#enrichModal').classList.remove('on');
$('#enrichModal').onclick=e=>{if(e.target.id==='enrichModal')$('#enrichModal').classList.remove('on');};
$('#enTemplate').onclick=()=>{const t=$('#enTable').value,d=DS[t];const sample=d.rows[d.rows.length-1]||d.cols.map(()=>'');
  const csv=d.cols.join(',')+'\n'+d.cols.map((c,i)=>{const v=sample[i];return v==null?'':(''+v).includes(',')?'"'+v+'"':v;}).join(',');saveFile('modele_'+t+'.csv',csv);};
$('#enFile').onchange=e=>{const f=e.target.files[0];if(!f)return;const rd=new FileReader();
  rd.onload=()=>{try{const recs=enParseFile(f.name,rd.result);if(!recs.length)throw new Error('Aucune ligne exploitable détectée.');
    enParsed=recs;enRenderPreview(recs);$('#enAppend').disabled=false;const m=$('#enMsg');m.className='msg ok';m.textContent=recs.length+' ligne(s) prête(s) à être ajoutée(s) à « '+(DS[$('#enTable').value].label||$('#enTable').value)+' ». Aperçu ci-dessus (20 premières).';}
    catch(err){enParsed=null;$('#enAppend').disabled=true;const m=$('#enMsg');m.className='msg err';m.textContent='Échec de lecture : '+err.message;$('#enPreview').style.display='none';}
    e.target.value='';};
  rd.readAsText(f);};
$('#enAppend').onclick=async()=>{if(!enParsed)return;const t=$('#enTable').value,d=DS[t];d.rows.push(...enParsed);
  const n=enParsed.length,tot=d.rows.length;enParsed=null;
  if(current==='explorer')renderExplorer();else if(current==='overview')drawOverview();else if(current==='viz')drawViz();
  const sel=$('#enTable');sel.innerHTML=enTables().map(k=>`<option value="${k}" ${k===t?'selected':''}>${esc(DS[k].label||k)} — ${DS[k].rows.length} lignes</option>`).join('');
  $('#enPreview').style.display='none';$('#enAppend').disabled=true;
  const m=$('#enMsg');
  if(editing){
    m.className='msg';m.textContent=n+" ligne(s) ajoutée(s) — enregistrement sur le serveur…";
    const ok=await saveDatasetToServer(t,null);
    m.className='msg '+(ok?'ok':'err');
    m.textContent=ok?(n+' ligne(s) ajoutée(s) et enregistrée(s) en base de données. Total : '+tot+' lignes.'):(n+" ligne(s) ajoutée(s) localement, mais l'enregistrement côté serveur a échoué — réessayez depuis l'Explorateur (« Enregistrer cette table en base »).");
  }else{
    m.className='msg ok';m.textContent=n+' ligne(s) ajoutée(s) localement (aperçu). Connectez-vous en administrateur pour les enregistrer en base.';
  }};
$('#enExport').onclick=()=>{saveFile('transparencerdc_donnees_enrichies.json',JSON.stringify(WH,null,1));};
$('#enExportCsv').onclick=()=>{const t=$('#enTable').value,d=DS[t];const esc2=v=>v==null?'':/[",;\n]/.test(''+v)?'"'+(''+v).replace(/"/g,'""')+'"':''+v;
  const csv=[d.cols.join(';')].concat(d.rows.map(r=>r.map(esc2).join(';'))).join('\n');saveFile(t+'_enrichi.csv',csv);};
$('#repModal').onclick=e=>{if(e.target.id==='repModal')$('#repModal').classList.remove('on');};
$('#rmDone').onclick=()=>{$('#repModal').classList.remove('on');if(current==='reports')renderReports();};
$('#rmAdd').onclick=()=>{C.reports.unshift({titre:'Nouveau rapport',categorie:'rapport_itie',annees_couvertes:'',date_publication:'',url:'',format:'pdf'});renderRM();};
function renderRM(){$('#rmList').innerHTML=C.reports.map((r,i)=>`<div class="rm-item" data-i="${i}"><div class="g" style="grid-column:1/2"><input data-k="titre" value="${esc(r.titre)}" placeholder="Titre" style="grid-column:1/3"><input data-k="annees_couvertes" value="${esc(r.annees_couvertes||'')}" placeholder="Années"><select data-k="categorie">${Object.keys(CATS).map(c=>`<option value="${c}" ${r.categorie===c?'selected':''}>${esc(CATS[c])}</option>`).join('')}</select><input data-k="url" value="${esc(r.url||'')}" placeholder="URL PDF" style="grid-column:1/3"></div><button class="rm-del" data-del="${i}">✕</button></div>`).join('');}
$('#rmList').addEventListener('input',e=>{const it=e.target.closest('.rm-item');if(!it)return;const i=+it.dataset.i,k=e.target.dataset.k;if(k)C.reports[i][k]=e.target.value;});
$('#rmList').addEventListener('click',e=>{const del=e.target.closest('[data-del]');if(del){C.reports.splice(+del.dataset.del,1);renderRM();}});

/* ===== BOOT =====
   (l'ancienne capture de PRISTINE_BODY servait uniquement à réexporter la
   page entière depuis le navigateur ; elle est inutile côté back-end Flask
   et a été retirée avec rebuildDoc()/saveAndPublish() basé sur l'artefact.) */

/* ===== SOURCE UNIQUE : recalcul des agrégats/KPI/qualité depuis les tables certifiées ===== */
function _colidx(d,parts){if(!d)return -1;const ps=parts.map(p=>p.toLowerCase());return d.cols.findIndex(c=>{const cl=String(c).toLowerCase();return ps.every(p=>cl.includes(p));});}
function _num(v){if(v==null||v==='')return null;const n=Number(String(v).replace(/\s/g,'').replace(',','.'));return isNaN(n)?null:n;}
function recomputeAll(){try{
  const SA=DS.ent_serie_annuelle;
  if(SA){const iE=_colidx(SA,['exercice']),iT=_colidx(SA,['total','recalcul']),iTp=_colidx(SA,['total','publi']),iM=_colidx(SA,['secteur','minier']),iP=_colidx(SA,['secteur','trol']);
    const serie=[];let latest=null;
    SA.rows.forEach(r=>{const ex=String(r[iE]||'').trim();if(!/^\d{4}$/.test(ex))return;
      let tot=_num(r[iT]);if(tot==null)tot=_num(r[iTp]);if(tot==null)return;
      serie.push({annee:ex,etat:tot,ese:tot});
      if(!latest||+ex>+latest.annee)latest={annee:ex,tot:tot,mines:_num(r[iM]),petr:_num(r[iP])};});
    serie.sort((a,b)=>+a.annee-+b.annee);
    if(serie.length)AGG.serie_etat=serie;
    if(latest){if(latest.mines!=null)O.mines=latest.mines;if(latest.petr!=null)O.petrole=latest.petr;if(latest.tot!=null)O.total=latest.tot;O._year=latest.annee;}
  }
  const RE=DS.ent_revenus_entreprise;
  if(RE){const iE=_colidx(RE,['exercice']),iN=_colidx(RE,['entreprise']),iV=_colidx(RE,['montant','normal']),iD=_colidx(RE,['clar']);
    const yrs=[...new Set(RE.rows.map(r=>String(r[iE]||'').trim()).filter(y=>/^\d{4}$/.test(y)))].sort();
    const ly=yrs[yrs.length-1];
    const agEtat={},agAll={};
    RE.rows.forEach(r=>{if(String(r[iE]||'').trim()!==ly)return;const nom=r[iN];if(!nom)return;const v=_num(r[iV])||0;const dec=String(r[iD]||'').toLowerCase();
      agAll[nom]=(agAll[nom]||0)+v; if(/(tat)/.test(dec))agEtat[nom]=(agEtat[nom]||0)+v;});
    let list=Object.entries(agEtat).filter(([,v])=>v>0); if(!list.length)list=Object.entries(agAll);
    list.sort((a,b)=>b[1]-a[1]);
    if(list.length){AGG.top2023=list.slice(0,10).map(([nom,v])=>({nom,etat:v}));O._topyear=ly;}
    
  }
  const SO=DS.ent_depenses_sociales;
  if(SO){let iE=_colidx(SO,['exercice']);if(iE<0)iE=_colidx(SO,['ann']);let iV=_colidx(SO,['montant','normal']);if(iV<0)iV=_colidx(SO,['montant']);
    if(iE>=0&&iV>=0){const agg={};SO.rows.forEach(r=>{const y=String(r[iE]||'').match(/\d{4}/);if(!y)return;agg[y[0]]=(agg[y[0]]||0)+(_num(r[iV])||0);});
      const arr=Object.entries(agg).map(([a,mt])=>({annee:+a,montant:mt})).sort((a,b)=>a.annee-b.annee);if(arr.length)AGG.social=arr;}
  }
  const DEx=DS.dim_exercice;if(DEx){let iy=_colidx(DEx,['ann']);const ys=new Set();DEx.rows.forEach(r=>{const mm=String(iy>=0?r[iy]:r[0]||'').match(/\d{4}/);if(mm)ys.add(mm[0]);});if(ys.size)STATS.nb_exercices=ys.size;}
  if(DS.dim_organisation)STATS.nb_orgs=DS.dim_organisation.rows.length;
  if(DS.dim_flux)STATS.nb_flux=DS.dim_flux.rows.length;
  if(DS.fait_reconciliation_flux)STATS.nb_recon=DS.fait_reconciliation_flux.rows.length+((DS.fait_reconciliation_entreprise||{rows:[]}).rows.length);
  // entreprises du périmètre (source : chiffres clés du dernier rapport)
  const CC=DS.ent_chiffres_cles;
  if(CC){const iEx=_colidx(CC,['exercice']),iPer=_colidx(CC,['périm'])>=0?_colidx(CC,['périm']):_colidx(CC,['perim']);
    let best=null;CC.rows.forEach(r=>{const ex=String(r[iEx]||'').match(/\d{4}/);if(ex&&(!best||+ex[0]>+best))best=ex[0];});
    if(best&&iPer>=0){const row=CC.rows.find(r=>String(r[iEx]||'').includes(best));
      if(row){const nums=(String(row[iPer]||'').match(/\d+/g)||[]).map(Number);const s=nums.reduce((a,b)=>a+b,0);if(s>0){O.entites=s;O._perimyear=best;}}}}
  // réconciliation : ne compter que les observations réelles (au moins une mesure renseignée)
  function _realRecon(t){if(!t)return 0;const mi=t.cols.map((c,i)=>/final|initial|ajust|societ|declar|etat|diff/i.test(c)?i:-1).filter(i=>i>=0);
    if(!mi.length)return t.rows.length;let n=0;for(const r of t.rows){if(mi.some(i=>{const v=r[i];return v!=null&&v!==''&&v!=='<EXCLURE>';}))n++;}return n;}
  STATS.nb_recon=_realRecon(DS.fait_reconciliation_flux)+_realRecon(DS.fait_reconciliation_entreprise);
  if(DS.fait_depense_sociale)STATS.nb_social=DS.fait_depense_sociale.rows.length;
  // qualité live (pondérée)
  const qrows=[];let totCells=0,totMiss=0;
  Object.entries(DS).forEach(([k,d])=>{if(k.startsWith('_')||!d||!d.rows)return;const nc=d.cols.length,nr=d.rows.length;let miss=0;
    for(const r of d.rows){for(let j=0;j<nc;j++){const v=r[j];if(v==null||v==='')miss++;}}
    const cells=nc*nr;totCells+=cells;totMiss+=miss;
    qrows.push([k,d.label||k,d.cat||'',nr,nc,cells?+(miss/cells*100).toFixed(1):0]);});
  if(DS._qualite)DS._qualite.rows=qrows;
  // Dictionnaire de données : le nombre de lignes par table était figé au
  // moment de la génération initiale de l'entrepôt et pouvait se
  // désynchroniser des tables réelles après un nettoyage, un enrichissement
  // ou une édition (audit qualité, sept. 2026). On le recalcule ici à
  // chaque chargement à partir des tables effectivement en base.
  if(DS._dictionnaire){
    const dd=DS._dictionnaire,ti=dd.cols.indexOf('table'),ni=dd.cols.indexOf('nb_lignes');
    if(ti>=0&&ni>=0)dd.rows.forEach(r=>{const t=DS[r[ti]];if(t)r[ni]=t.rows.length;});
  }
  window.__missWeighted=totCells?+(totMiss/totCells*100).toFixed(1):0;
}catch(e){if(window.console)console.error('recomputeAll',e);}}
recomputeAll();

mountStatic();
const initial=(location.hash||'').replace('#','');
go(MODULES[initial]?initial:'overview');
window.addEventListener('hashchange',()=>{const h=location.hash.replace('#','');if(MODULES[h]&&h!==current)go(h);});
})();
