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
// Métadonnées de gouvernance (page À propos) : date de rafraîchissement,
// licence de réutilisation, version de l'entrepôt — signalées absentes par
// le second audit qualité (sept. 2026). Éditables comme le reste du contenu
// ; la date se réplie sur WH.generated (déjà suivi côté import) tant
// qu'aucune valeur n'a été saisie explicitement par un admin.
C.about=Object.assign({titre:"À propos de l'entrepôt",mission:'',gouvernance:'',methodo:'',
  derniere_maj:'',licence:"Licence ouverte — réutilisation libre à des fins non commerciales, avec mention de la source (ITIE-RDC / TransparenceRDC)",
  version_entrepot:''},C.about||{});
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
/* ===== Rubriques publiques alignées sur la Norme ITIE 2023 (sept. 2026) =====
   Chaque table de l'entrepôt porte désormais une métadonnée `meta` (thème,
   période, unité, devise, source, périmètre, désagrégation, statut qualité)
   calculée à l'import (voir import_data.py / data/warehouse.seed.json). Les
   117 annexes brutes et les tables de référence internes portent le thème
   'technique' : elles ne sont listées dans l'Explorateur, le Dictionnaire et
   la Qualité des données que pour un utilisateur connecté en administrateur
   — le visiteur public ne voit que les tables organisées par thème ITIE
   (retour utilisateur, sept. 2026 : « organiser les données selon les
   exigences de la Norme ITIE plutôt que selon la structure des fichiers
   sources »). Aucune donnée n'est supprimée : tout reste accessible à
   l'administrateur, jamais caché de manière permanente. */
const THEME_INFO=WH.theme_info||{};
function tableMeta(name){const d=DS[name];return d&&d.meta?d.meta:null;}
function tableTheme(name){const m=tableMeta(name);return m?m.theme:'technique';}
function isPublicTable(name){return tableTheme(name)!=='technique';}
function visibleTableNames(){return Object.keys(DS).filter(n=>editing||isPublicTable(n));}
function tablesInTheme(theme){return Object.keys(DS).filter(n=>tableTheme(n)===theme).sort((a,b)=>(DS[a].label||a).localeCompare(DS[b].label||b,'fr'));}
function metaStrip(name){
  const m=tableMeta(name);if(!m)return '';
  const row=(k,v)=>v?`<div><b>${esc(k)}</b><br>${esc(v)}</div>`:'';
  return `<div class="metastrip" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px 16px;font-size:11.5px;color:var(--ink-soft);background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin:10px 0 14px">
    ${row('Période',m.periode)}${row('Unité',m.unite)}${row('Devise',m.devise)}${row('Périmètre',m.perimetre)}${row('Désagrégation',m.desagregation)}${row('Source',m.source)}
  </div>${m.qualite?`<div class="msg warn" style="margin-bottom:12px"><b>Statut qualité :</b> ${esc(m.qualite)}</div>`:''}
  <div style="margin:-8px 0 12px"><button type="button" class="srclink" data-srctable="${esc(name)}">ⓘ Source &amp; traçabilité de ce tableau</button></div>`;
}
// Transforme les URL en texte brut d'un champ `source`/`méthodologie` en
// liens cliquables, sans toucher au reste du texte (retour utilisateur,
// sept. 2026 : « chaque chiffre devrait ouvrir sa source exacte »).
function linkifySource(text){
  return esc(text).replace(/(https?:\/\/[^\s<]+)/g,url=>`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
}
function openSourceModal(tableName){
  const d=DS[tableName],m=tableMeta(tableName);
  const body=$('#srcModalBody');if(!d||!body)return;
  body.innerHTML=`
    <div style="margin-bottom:12px"><b>${esc(d.label||tableName)}</b><br><span style="font-size:12.5px;color:var(--ink-soft)">${esc(d.desc||'')}</span></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px 16px;font-size:12.5px;margin-bottom:12px">
      ${m&&m.periode?`<div><b>Période</b><br>${esc(m.periode)}</div>`:''}
      ${m&&m.perimetre?`<div><b>Périmètre</b><br>${esc(m.perimetre)}</div>`:''}
      ${m&&m.desagregation?`<div><b>Désagrégation</b><br>${esc(m.desagregation)}</div>`:''}
      <div><b>Dernière synchronisation de l'entrepôt</b><br>${esc(WH.generated||'non renseignée')}<br><span style="color:var(--ink-faint);font-size:11px">Date du dernier import complet (<code>python import_data.py</code>) ; l'entrepôt étant resynchronisé intégralement à chaque mise à jour, cette date s'applique à toutes les tables.</span></div>
      <div><b>Nombre de lignes</b><br>${fmtN(d.rows.length)}</div>
      <div><b>Identifiant technique de la table</b><br><code>${esc(tableName)}</code></div>
    </div>
    ${m&&m.source?`<div style="font-size:12.5px;margin-bottom:12px"><b>Source</b><br>${linkifySource(m.source)}</div>`:'<div class="msg warn" style="font-size:12px;margin-bottom:12px">Aucune source détaillée n\'a encore été renseignée pour ce tableau technique.</div>'}
    ${d.tech?`<div style="font-size:11px;color:var(--ink-faint);margin-bottom:12px"><b>Repère technique interne (provenance du fichier importé)</b><br><code>${esc(d.tech)}</code></div>`:''}
    ${m&&m.qualite?`<div class="msg warn" style="font-size:12px">${esc(m.qualite)}</div>`:''}
  `;
  showModal('srcModal');
}
window.openSourceModal=openSourceModal;
function goExplorerTable(name){exState.ds=name;exState.page=0;exState.filters={};exState.q='';go('explorer');}
window.goExplorerTable=goExplorerTable;
function themeCard(name){
  const d=DS[name];if(!d)return '';
  const rowN=d.rows.length;
  return `<div class="card" style="margin-bottom:16px">
    <div class="ch"><h3 style="margin:0">${esc(d.label||name)}</h3><span class="badge">${fmtN(rowN)} ligne${rowN>1?'s':''}</span></div>
    <div class="sub" style="margin-bottom:2px">${esc(d.desc||'')}</div>
    ${metaStrip(name)}
    <button class="btn primary" data-gotable="${esc(name)}">▤ Explorer ce tableau →</button>
  </div>`;
}
/* ===== Cahiers des charges des entreprises minières — vue détaillée =====
   Les deux tables ent_cahier_charges_entreprise (28 lignes) et
   ent_cahier_charges_projet (122 lignes) contiennent l'intégralité du
   document source (« Résumé des cahiers des charges des entreprises
   minières », mai 2022, 2 feuilles Excel) mais un simple tableau à colonnes
   multiples les rendait peu lisibles (retour utilisateur, sept. 2026 :
   « pas assez structuré, professionnel et compréhensible »). Cette vue les
   recompose en fiches par entreprise (identité, titre minier, chronogramme,
   budget) avec, en dessous, chaque projet détaillé (secteur, description
   complète, montant) — sans rien retirer ni fusionner : les deux tables
   restent aussi consultables telles quelles dans l'Explorateur (boutons en
   bas de section), et aucune ligne (y compris les entrées incomplètes de la
   feuille LUALABA) n'est masquée. */
const CAHIERS_ENT='ent_cahier_charges_entreprise', CAHIERS_PROJ='ent_cahier_charges_projet';
let cahiersQ='', cahiersFeuille='', cahiersSecteur='';
function cahiersCtx(){
  const eD=DS[CAHIERS_ENT], pD=DS[CAHIERS_PROJ];
  if(!eD||!pD)return null;
  const ci=(d,name)=>d.cols.indexOf(name);
  const ei={feuille:ci(eD,'Feuille source'),ent:ci(eD,'Entreprise'),abrev:ci(eD,'Abréviation'),
    rccm:ci(eD,'RCCM'),idnat:ci(eD,'Id-Nat'),prov:ci(eD,'Province déclarée'),siege:ci(eD,'Siège à Kinshasa'),
    pete:ci(eD,'Numéro(s) PE ou TE'),valide:ci(eD,"Valide jusqu'au"),dureeTitre:ci(eD,'Durée totale du titre'),
    superficie:ci(eD,'Superficie (carrés miniers)'),chrono:ci(eD,'Chronogramme des engagements'),
    dureeEng:ci(eD,'Durée des engagements (an)'),nbProj:ci(eD,'Nombre de projets prévus'),
    secteursNb:ci(eD,"Secteurs d'intervention (nombre)"),budget:ci(eD,'Budget total engagé (USD)'),obs:ci(eD,'Observation')};
  const pi={feuille:ci(pD,'Feuille source'),ent:ci(pD,'Entreprise'),n:ci(pD,'N° projet'),secteur:ci(pD,'Secteur'),
    titre:ci(pD,'Titre du projet'),desc:ci(pD,'Description complète'),montant:ci(pD,'Montant estimé (USD)')};
  const byEnt=new Map();
  pD.rows.forEach(r=>{const key=r[pi.feuille]+'||'+r[pi.ent];if(!byEnt.has(key))byEnt.set(key,[]);byEnt.get(key).push(r);});
  return {eD,pD,ei,pi,byEnt};
}
function cahiersSecteurs(){
  const c=cahiersCtx();if(!c)return [];
  const s=new Set();c.pD.rows.forEach(r=>{if(r[c.pi.secteur])s.add(r[c.pi.secteur]);});
  return [...s].sort((a,b)=>a.localeCompare(b,'fr'));
}
function cahiersField(lab,v,fmt){if(v==null||v==='')return '';return `<div><b>${esc(lab)}</b><br>${esc(fmt?fmt(v):v)}</div>`;}
function cahiersCard(c,eRow){
  const {ei,pi}=c;
  const feuille=eRow[ei.feuille];
  let projets=(c.byEnt.get(feuille+'||'+eRow[ei.ent])||[]).slice().sort((a,b)=>(a[pi.n]||0)-(b[pi.n]||0));
  if(cahiersSecteur)projets=projets.filter(p=>p[pi.secteur]===cahiersSecteur);
  const totalProjBudget=projets.reduce((s,p)=>s+(typeof p[pi.montant]==='number'?p[pi.montant]:0),0);
  return `<div class="card" style="margin-bottom:14px">
    <div class="ch" style="flex-wrap:wrap">
      <h3 style="margin:0">${esc(eRow[ei.ent])}${eRow[ei.abrev]?` <span style="color:var(--ink-soft);font-weight:400">(${esc(eRow[ei.abrev])})</span>`:''}</h3>
      <span class="tag ${feuille==='LUALABA'?'analytique':'referentiel'}" title="Feuille source du document Excel">${esc(feuille)}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px 16px;font-size:12px;color:var(--ink-soft);margin:8px 0 10px">
      ${cahiersField('RCCM',eRow[ei.rccm])}${cahiersField('Id-Nat',eRow[ei.idnat])}${cahiersField('Province déclarée',eRow[ei.prov])}
      ${cahiersField('Siège à Kinshasa',eRow[ei.siege])}${cahiersField('Permis (PE/TE)',eRow[ei.pete])}${cahiersField("Valide jusqu'au",eRow[ei.valide])}
      ${cahiersField('Durée totale du titre',eRow[ei.dureeTitre])}${cahiersField('Superficie (carrés miniers)',eRow[ei.superficie],fmtN)}
      ${cahiersField('Chronogramme des engagements',eRow[ei.chrono])}${cahiersField('Durée des engagements',eRow[ei.dureeEng]!=null?eRow[ei.dureeEng]+' an(s)':null)}
      ${cahiersField('Projets prévus (déclarés)',eRow[ei.nbProj],fmtN)}${cahiersField("Secteurs d'intervention (déclarés)",eRow[ei.secteursNb],fmtN)}
      ${cahiersField('Budget total engagé (synthèse)',eRow[ei.budget],fmtUSD)}${cahiersField('Observation',eRow[ei.obs])}
    </div>
    ${projets.length?`<div style="font-size:12.5px;color:var(--ink-soft);margin-bottom:6px">${fmtN(projets.length)} projet${projets.length>1?'s':''} détaillé${projets.length>1?'s':''} dans le document${totalProjBudget?` · ${fmtUSD(totalProjBudget)} au total sur ${projets.length>1?'ces projets':'ce projet'}`:''}</div>
      <div style="display:flex;flex-direction:column;gap:6px">${projets.map(p=>`
        <details class="srcdetails">
          <summary><b>${esc(p[pi.secteur]||'Secteur non précisé')}</b>${p[pi.titre]?' — '+esc(p[pi.titre]):''}${typeof p[pi.montant]==='number'?` <span class="badge">${fmtUSD(p[pi.montant])}</span>`:''}</summary>
          <div style="font-size:12.5px;color:var(--ink-soft);margin-top:6px;line-height:1.6">${esc(p[pi.desc]||'')}</div>
        </details>`).join('')}</div>`
      :`<div class="empty" style="padding:10px">Aucun projet détaillé n'est renseigné pour cette entreprise dans le document source${feuille==='LUALABA'?' (feuille « LUALABA » très incomplète pour cette entreprise, voir note ci-dessus)':''}.</div>`}
  </div>`;
}
function cahiersSection(){
  const c=cahiersCtx();if(!c)return '';
  const secteurs=cahiersSecteurs();
  return `<div class="card" style="margin-bottom:16px;background:var(--panel-2)">
      <div class="ch"><h2 style="margin:0;font-size:16px">Cahiers des charges des entreprises minières — détail entreprise par entreprise</h2><span class="badge">Résumé, mai 2022</span></div>
      <p style="font-size:12.5px;color:var(--ink-soft);margin:6px 0 0">Synthèse (identité, titre minier, chronogramme, budget engagé) et détail des projets (secteur, description complète, montant) de chaque cahier des charges de responsabilité sociétale en cours, tels que déclarés dans le document transmis à l'ITIE-RDC. Document composé de deux feuilles Excel distinctes, reprises ici sans les fusionner (badge « HAUT-KATANGA 2021-2025 » ou « LUALABA » sur chaque fiche).</p>
      <div class="msg warn" style="margin-top:10px;font-size:12px">Malgré son nom, la feuille « LUALABA » déclare elle-même « Province : Haut-Katanga » pour les 3 entreprises qu'elle renseigne, et ses données de projets recoupent largement celles de MMG Kinsevere dans la feuille « HAUT-KATANGA 2021-2025 » : il s'agit très probablement d'une copie de travail incomplète. Conformément au principe de ne rien masquer, elle est publiée ici telle quelle (aucune ligne supprimée) mais n'a pas été utilisée pour les agrégats cartographiques (voir Géographie) afin d'éviter un double comptage. Pour la même raison, le « Budget total engagé » d'une fiche ne correspond pas toujours à la somme des montants de ses projets détaillés ci-dessous : c'est un reflet direct du document source, pas une erreur de traitement.</div>
    </div>
    <div class="extoolbar">
      <div class="exsearch"><span class="si" aria-hidden="true">⌕</span><input id="cahQ" placeholder="Rechercher une entreprise…" value="${esc(cahiersQ)}" aria-label="Rechercher une entreprise"></div>
      <select id="cahFeuille" aria-label="Filtrer par feuille source"><option value="">Toutes les feuilles</option>
        <option value="HAUT-KATANGA 2021-2025"${cahiersFeuille==='HAUT-KATANGA 2021-2025'?' selected':''}>HAUT-KATANGA 2021-2025</option>
        <option value="LUALABA"${cahiersFeuille==='LUALABA'?' selected':''}>LUALABA</option></select>
      <select id="cahSecteur" aria-label="Filtrer par secteur de projet"><option value="">Tous les secteurs de projet</option>
        ${secteurs.map(s=>`<option value="${esc(s)}"${cahiersSecteur===s?' selected':''}>${esc(s)}</option>`).join('')}</select>
    </div>
    <div id="cahList"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 4px">
      <button class="btn" data-gotable="${CAHIERS_ENT}">▤ Tableau brut — synthèse par entreprise →</button>
      <button class="btn" data-gotable="${CAHIERS_PROJ}">▤ Tableau brut — détail des projets →</button>
    </div>`;
}
function renderCahiers(){
  const host=$('#cahList');if(!host)return;
  const c=cahiersCtx();if(!c)return;
  const {ei}=c;
  const q=stripAccents(cahiersQ).toLowerCase();
  let rows=c.eD.rows.filter(r=>!cahiersFeuille||r[ei.feuille]===cahiersFeuille);
  if(q)rows=rows.filter(r=>stripAccents(r[ei.ent]||'').toLowerCase().includes(q)||stripAccents(r[ei.abrev]||'').toLowerCase().includes(q));
  if(cahiersSecteur)rows=rows.filter(r=>(c.byEnt.get(r[ei.feuille]+'||'+r[ei.ent])||[]).some(p=>p[c.pi.secteur]===cahiersSecteur));
  host.innerHTML=rows.length?rows.map(r=>cahiersCard(c,r)).join(''):'<div class="empty" style="padding:16px">Aucune entreprise ne correspond à ces filtres.</div>';
}
function bindCahiers(){
  if(!$('#cahList'))return;
  renderCahiers();
  const q=$('#cahQ');if(q)q.oninput=e=>{cahiersQ=e.target.value;renderCahiers();const el=$('#cahQ');if(el){el.focus();el.setSelectionRange(e.target.value.length,e.target.value.length);}};
  const f=$('#cahFeuille');if(f)f.onchange=e=>{cahiersFeuille=e.target.value;renderCahiers();};
  const s=$('#cahSecteur');if(s)s.onchange=e=>{cahiersSecteur=e.target.value;renderCahiers();};
}
/* ===== Contrats et licences extractifs (Exigence ITIE 2.4) =====
   Table ent_contrats_extractifs (756 lignes) : registre intégral des
   contrats, licences, avenants et documents contractuels miniers,
   pétroliers, gaziers et forestiers de la RDC, tel que publié par le
   Resource Contracts Portal (Natural Resource Governance Institute / NRGI
   et Columbia Center on Sustainable Investment / CCSI, resourcecontracts.org
   — snapshot du 8 septembre 2026, 756/756 documents vérifiés sans doublon).
   L'Exigence 2.4 rend obligatoire, depuis le 1er janvier 2021, la
   divulgation des contrats et licences octroyés, conclus ou modifiés ;
   elle encourage par ailleurs la divulgation de l'ensemble des contrats.
   Comme pour les cahiers des charges, un simple tableau de 756 lignes à
   12 colonnes serait peu exploitable : cette vue le recompose en fiches
   filtrables (catégorie, ressource, année, conformité 2021+), chaque fiche
   renvoyant vers le texte intégral du contrat sur resourcecontracts.org.
   Rien n'est retiré : le tableau brut reste consultable via le bouton en
   bas de section, et les 756 lignes y figurent toutes. */
const CONTRATS_DS='ent_contrats_extractifs';
let contratsQ='', contratsCat='', contratsRessource='', contratsConf='', contratsPage=0;
const CONTRATS_PAGE_SIZE=24;
function contratsCtx(){
  const d=DS[CONTRATS_DS];if(!d)return null;
  const ci=n=>d.cols.indexOf(n);
  const idx={n:ci('N°'),titre:ci('Intitulé du contrat'),cat:ci('Catégorie'),types:ci('Type(s) de contrat'),
    annee:ci('Année de signature'),date:ci('Date de signature'),ressource:ci('Ressource(s) / secteur'),
    pays:ci('Pays / parties'),langue:ci('Langue du document'),conf:ci('Conformité Exigence ITIE 2.4 (divulgation à compter du 1er janvier 2021)'),
    lien:ci('Lien vers le contrat (texte intégral, PDF)'),ocid:ci('Identifiant Open Contracting')};
  return {d,idx};
}
function contratsRessources(){
  const c=contratsCtx();if(!c)return [];
  const s=new Set();
  c.d.rows.forEach(r=>{String(r[c.idx.ressource]||'').split(',').map(x=>x.trim()).filter(Boolean).forEach(x=>s.add(x));});
  return [...s].sort((a,b)=>a.localeCompare(b,'fr'));
}
function contratsCard(c,r){
  const {idx}=c;
  const is2021=String(r[idx.conf]||'').startsWith('Oui');
  const cat=r[idx.cat]||'';
  const catTag=cat.startsWith('Contrat minier')?'fait':'referentiel';
  const link=r[idx.lien];
  return `<div class="card" style="margin-bottom:12px">
    <div class="ch" style="flex-wrap:wrap;gap:8px">
      <h3 style="margin:0;font-size:14.5px;line-height:1.4">${esc(r[idx.titre])}</h3>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span class="tag ${catTag}">${esc(cat.split(' (')[0])}</span>
        ${is2021?'<span class="tag analytique">Exigence 2.4 — obligatoire</span>':''}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px 16px;font-size:12px;color:var(--ink-soft);margin:6px 0 10px">
      ${cahiersField('Type(s) de contrat',r[idx.types])}${cahiersField('Ressource(s) / secteur',r[idx.ressource])}
      ${cahiersField('Année de signature',r[idx.annee],fmtN)}${cahiersField('Date de signature',r[idx.date])}
      ${cahiersField('Langue du document',r[idx.langue])}${cahiersField('Pays / parties',r[idx.pays])}
    </div>
    <div class="msg" style="font-size:11.5px;margin-bottom:10px">${esc(r[idx.conf])}</div>
    ${link?`<a class="btn primary" href="${esc(link)}" target="_blank" rel="noopener noreferrer">↗ Voir le contrat (texte intégral, PDF) sur resourcecontracts.org</a>`:''}
  </div>`;
}
function renderContrats(){
  const host=$('#conList');if(!host)return;
  const c=contratsCtx();if(!c)return;
  const {idx}=c;
  const q=stripAccents(contratsQ).toLowerCase();
  let rows=c.d.rows.filter(r=>{
    if(contratsCat&&!String(r[idx.cat]||'').startsWith(contratsCat))return false;
    if(contratsRessource&&!String(r[idx.ressource]||'').split(',').map(x=>x.trim()).includes(contratsRessource))return false;
    if(contratsConf==='2021'&&!String(r[idx.conf]||'').startsWith('Oui'))return false;
    if(contratsConf==='avant'&&String(r[idx.conf]||'').startsWith('Oui'))return false;
    if(q&&!stripAccents(r[idx.titre]||'').toLowerCase().includes(q))return false;
    return true;
  });
  const total=rows.length;
  const maxPage=Math.max(0,Math.ceil(total/CONTRATS_PAGE_SIZE)-1);
  if(contratsPage>maxPage)contratsPage=maxPage;
  const page=rows.slice(contratsPage*CONTRATS_PAGE_SIZE,(contratsPage+1)*CONTRATS_PAGE_SIZE);
  host.innerHTML=(total?`<div style="font-size:12px;color:var(--ink-soft);margin-bottom:8px">${fmtN(total)} contrat${total>1?'s':''} correspondant${total>1?'s':''} à ces filtres (sur ${fmtN(c.d.rows.length)} au total)</div>`:'')+
    (page.length?page.map(r=>contratsCard(c,r)).join(''):'<div class="empty" style="padding:16px">Aucun contrat ne correspond à ces filtres.</div>')+
    (total>CONTRATS_PAGE_SIZE?`<div style="display:flex;justify-content:center;align-items:center;gap:12px;margin:14px 0 4px">
      <button class="btn" id="conPrev"${contratsPage<=0?' disabled':''}>← Précédent</button>
      <span style="font-size:12px;color:var(--ink-soft)">Page ${contratsPage+1} / ${maxPage+1}</span>
      <button class="btn" id="conNext"${contratsPage>=maxPage?' disabled':''}>Suivant →</button>
    </div>`:'');
  const prev=$('#conPrev');if(prev)prev.onclick=()=>{contratsPage--;renderContrats();host.scrollIntoView({block:'start',behavior:'smooth'});};
  const next=$('#conNext');if(next)next.onclick=()=>{contratsPage++;renderContrats();host.scrollIntoView({block:'start',behavior:'smooth'});};
}
function contratsSection(){
  const c=contratsCtx();if(!c)return '';
  const ressources=contratsRessources();
  const total=c.d.rows.length;
  const n2021=c.d.rows.filter(r=>String(r[c.idx.conf]||'').startsWith('Oui')).length;
  return `<div class="card" style="margin-bottom:16px;background:var(--panel-2)">
      <div class="ch"><h2 style="margin:0;font-size:16px">Contrats et licences miniers, pétroliers et forestiers</h2><span class="badge">${fmtN(total)} contrats — Exigence 2.4</span></div>
      <p style="font-size:12.5px;color:var(--ink-soft);margin:6px 0 0">L'Exigence ITIE 2.4 vise à assurer l'accès public à toutes les licences et à tous les contrats liés aux activités extractives, comme base de la compréhension publique des droits et obligations contractuels des entreprises. Elle est obligatoire, depuis le 1<sup>er</sup> janvier 2021, pour tout contrat ou licence octroyé, conclu ou modifié ; les pays sont par ailleurs encouragés à divulguer l'ensemble de leurs contrats. Ce registre reprend les ${fmtN(total)} contrats, licences, avenants et documents contractuels de la RDC (mines, pétrole, gaz, forêts) publiés par le <a href="https://resourcecontracts.org/countries/cd" target="_blank" rel="noopener noreferrer">Resource Contracts Portal</a> (Natural Resource Governance Institute et Columbia Center on Sustainable Investment) ; chaque fiche renvoie vers le texte intégral du contrat.</p>
      <div class="msg warn" style="margin-top:10px;font-size:12px"><b>${fmtN(n2021)} contrats sur ${fmtN(total)}</b> ont été signés à compter du 1<sup>er</sup> janvier 2021 et relèvent donc du champ obligatoire de l'Exigence 2.4 (badge « Exigence 2.4 — obligatoire » ci-dessous) ; les ${fmtN(total-n2021)} autres, antérieurs à 2021, sont publiés au titre de la divulgation volontaire que l'ITIE encourage également. Pour 252 documents, la source ne renseigne pas de date de signature complète (seule l'année est alors connue) : c'est un défaut d'information du Resource Contracts Portal, reproduit tel quel plutôt que masqué ou deviné.</div>
    </div>
    <div class="extoolbar">
      <div class="exsearch"><span class="si" aria-hidden="true">⌕</span><input id="conQ" placeholder="Rechercher un contrat (entreprise, titre…)" value="${esc(contratsQ)}" aria-label="Rechercher un contrat"></div>
      <select id="conCat" aria-label="Filtrer par catégorie"><option value="">Toutes catégories</option>
        <option value="Contrat minier"${contratsCat.startsWith('Contrat minier')?' selected':''}>Contrats miniers / pétroliers</option>
        <option value="Contrat foncier"${contratsCat.startsWith('Contrat foncier')?' selected':''}>Contrats fonciers / forestiers</option></select>
      <select id="conRessource" aria-label="Filtrer par ressource"><option value="">Toutes ressources</option>
        ${ressources.map(r=>`<option value="${esc(r)}"${contratsRessource===r?' selected':''}>${esc(r)}</option>`).join('')}</select>
      <select id="conConf" aria-label="Filtrer par conformité Exigence 2.4"><option value="">Toutes périodes</option>
        <option value="2021"${contratsConf==='2021'?' selected':''}>Signés depuis 2021 (obligatoire)</option>
        <option value="avant"${contratsConf==='avant'?' selected':''}>Signés avant 2021 (volontaire)</option></select>
    </div>
    <div id="conList"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 4px">
      <button class="btn" data-gotable="${CONTRATS_DS}">▤ Tableau brut — les ${fmtN(total)} contrats →</button>
    </div>`;
}
function bindContrats(){
  if(!$('#conList'))return;
  renderContrats();
  const q=$('#conQ');if(q)q.oninput=e=>{contratsQ=e.target.value;contratsPage=0;renderContrats();const el=$('#conQ');if(el){el.focus();el.setSelectionRange(e.target.value.length,e.target.value.length);}};
  const cat=$('#conCat');if(cat)cat.onchange=e=>{contratsCat=e.target.value;contratsPage=0;renderContrats();};
  const res=$('#conRessource');if(res)res.onchange=e=>{contratsRessource=e.target.value;contratsPage=0;renderContrats();};
  const conf=$('#conConf');if(conf)conf.onchange=e=>{contratsConf=e.target.value;contratsPage=0;renderContrats();};
}
function mTheme(theme){
  const info=THEME_INFO[theme]||{label:theme,desc:'',eiti:''};
  const names=tablesInTheme(theme).filter(n=>!(theme==='depenses_sociales'&&(n===CAHIERS_ENT||n===CAHIERS_PROJ))&&!(theme==='cadre_licences'&&n===CONTRATS_DS));
  const cahiers=theme==='depenses_sociales'?cahiersSection():'';
  const contrats=theme==='cadre_licences'?contratsSection():'';
  return `<div class="phead"><div class="eyebrow">${esc(info.eiti||'')}</div><h1>${esc(info.label)}</h1><p>${esc(info.desc)}</p></div>
    ${names.length?names.map(themeCard).join(''):(cahiers||contrats?'':'<div class="empty" style="padding:20px">Aucun tableau public dans cette rubrique pour le moment.</div>')}
    ${contrats}${cahiers}`;
}
function bindThemePage(){$$('#app [data-gotable]').forEach(b=>b.onclick=()=>goExplorerTable(b.dataset.gotable));bindCahiers();bindContrats();}


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

/* ===== Recherche transversale (entreprises, régies, flux, provinces,
   exercices, rapports, exigences ITIE 2023) =====
   Audit du 8 sept. 2026 : la barre de recherche de l'en-tête ne présélectionnait
   qu'un filtre plein texte sur la SEULE table déjà affichée dans l'Explorateur —
   ce n'était pas une recherche transversale. Cette section construit, au
   chargement, un index de toutes les entités canoniques déjà identifiées
   (table `ref_identifiants_stables`, elle-même dérivée de `ref_canoniques` et
   de `GEO.prov_ref` — voir README « Identifiants stables des référentiels »),
   des exercices (années) présents dans les tables publiques, des rapports
   publiés et des exigences de la Norme ITIE 2023 (déduites de THEME_INFO).
   Choisir une entreprise / régie / flux affiche la liste RÉELLE des tableaux
   publics où elle apparaît (via CANON_COLS), au lieu de se limiter à un seul
   tableau présélectionné à l'avance. */
function isPlausibleEntityLabel(s){
  if(s==null)return false;
  const t=String(s).trim();
  if(t.length<2)return false;
  if(/^[<%]/.test(t))return false;
  if(/^(exclure|n\/?c|n[ée]ant|nd|n\/a|nap)$/i.test(t))return false;
  return true;
}
function buildReverseCanonCols(){
  const rev={entreprise:[],'entité perceptrice':[],flux:[],province:[]};
  Object.entries(CANON_COLS).forEach(([key,dim])=>{
    if(!rev[dim])return;
    const dot=key.indexOf('.');const table=key.slice(0,dot),col=key.slice(dot+1);
    const d=DS[table];
    if(!d||!isPublicTable(table))return;
    const idx=d.cols.indexOf(col);
    if(idx>=0)rev[dim].push({table,col,idx});
  });
  return rev;
}
const REV_CANON_COLS=buildReverseCanonCols();
const YEAR_COL_NAMES=new Set(['exercice','année','annee','year']);
function buildYearIndex(){
  const years=new Map(); // année -> Set(nom de table publique)
  Object.keys(DS).forEach(n=>{
    if(!isPublicTable(n))return;
    const d=DS[n];
    const idx=d.cols.findIndex(c=>YEAR_COL_NAMES.has(String(c).trim().toLowerCase()));
    if(idx<0)return;
    d.rows.forEach(r=>{
      const raw=r[idx];if(raw==null||raw==='')return;
      const yn=typeof raw==='number'?Math.round(raw):parseInt(raw,10);
      if(!yn||yn<1960||yn>2100)return;
      if(!years.has(yn))years.set(yn,new Set());
      years.get(yn).add(n);
    });
  });
  return years;
}
const YEAR_INDEX=buildYearIndex();
// Déduit la liste des numéros d'Exigence ITIE 2023 rattachés à chaque
// rubrique à partir du champ `eiti` déjà affiché en en-tête de page (ex.
// « Exigences 2.1 à 2.4 », « Exigence 2.5 », « Exigences 3.2 et 3.3 ») :
// aucune liste séparée à maintenir à la main, donc jamais désynchronisée du
// texte réellement affiché aux visiteurs.
function exigencesIndex(){
  const out=[];
  Object.entries(THEME_INFO).forEach(([k,info])=>{
    if(k==='technique'||!info.eiti)return;
    const rangeM=info.eiti.match(/(\d+)\.(\d+)\s*à\s*(\d+)\.(\d+)/i);
    if(rangeM&&rangeM[1]===rangeM[3]){
      for(let i=parseInt(rangeM[2],10);i<=parseInt(rangeM[4],10);i++)out.push({num:`${rangeM[1]}.${i}`,theme:k,label:info.label});
      return;
    }
    [...info.eiti.matchAll(/\d+\.\d+/g)].forEach(m=>out.push({num:m[0],theme:k,label:info.label}));
  });
  return out;
}
const EXIGENCES_INDEX=exigencesIndex();
const GSEARCH_KIND_LABELS={entreprise:'Entreprises','entité perceptrice':'Entités perceptrices (régies)',flux:'Flux de paiement',province:'Provinces',exercice:'Exercices',rapport:'Rapports',exigence:'Exigences ITIE 2023'};
const GSEARCH_KIND_ORDER=['entreprise','entité perceptrice','flux','province','exercice','exigence','rapport'];
function globalSearchIndex(){
  const idx=[];
  const rid=DS.ref_identifiants_stables;
  if(rid){
    const li=rid.cols.indexOf('Libellé canonique'),ii=rid.cols.indexOf('Identifiant stable (application)'),vi=rid.cols.indexOf('Variantes brutes recensées');
    rid.rows.forEach(r=>{
      const label=r[li],sid=r[ii];
      if(!isPlausibleEntityLabel(label))return;
      const prefix=String(sid).split(':')[0];
      const kind=prefix==='entite'?'entité perceptrice':prefix;
      idx.push({kind,label,sid,weight:r[vi]||0});
    });
  }
  YEAR_INDEX.forEach((tables,year)=>idx.push({kind:'exercice',label:String(year),sid:'exercice:'+year,weight:tables.size}));
  (C.reports||[]).forEach((r,i)=>idx.push({kind:'rapport',label:r.titre,sid:'rapport:'+i,weight:1}));
  EXIGENCES_INDEX.forEach(e=>idx.push({kind:'exigence',label:'Exigence ITIE '+e.num+' — '+e.label,sid:'exigence:'+e.num+':'+e.theme,weight:1}));
  return idx;
}
const GLOBAL_SEARCH_INDEX=globalSearchIndex();
function searchGlobal(q,limitPerGroup){
  const nq=normKey(q);
  if(!nq)return [];
  limitPerGroup=limitPerGroup||6;
  const groups={};
  GLOBAL_SEARCH_INDEX.forEach(item=>{
    if(!normKey(item.label).includes(nq))return;
    (groups[item.kind]||(groups[item.kind]=[])).push(item);
  });
  const out=[];
  GSEARCH_KIND_ORDER.forEach(k=>{
    if(!groups[k])return;
    groups[k].sort((a,b)=>(b.weight||0)-(a.weight||0)||a.label.localeCompare(b.label,'fr'));
    out.push({kind:k,items:groups[k].slice(0,limitPerGroup),total:groups[k].length});
  });
  return out;
}
function crossTableHits(kind,label){
  const cols=REV_CANON_COLS[kind]||[];
  const hits=[];
  cols.forEach(({table,idx})=>{
    const d=DS[table];let n=0;
    for(const r of d.rows){if(canonicalize(kind,r[idx])===label)n++;}
    if(n>0)hits.push({table,label:d.label||table,n});
  });
  hits.sort((a,b)=>b.n-a.n);
  return hits;
}
function renderGlobalSuggestions(q){
  const box=$('#gsugList');if(!box)return;
  const groups=searchGlobal(q);
  const inp=$('#globalSearch');
  if(!q){box.classList.remove('on');if(inp)inp.setAttribute('aria-expanded','false');return;}
  if(!groups.length){box.innerHTML='<div class="gsug-empty">Aucun résultat pour « '+esc(q)+' » parmi les entreprises, régies, flux, provinces, exercices, rapports et exigences ITIE.<br><span style="color:var(--ink-faint)">Entrée : rechercher ce texte dans le tableau actuellement ouvert.</span></div>';box.classList.add('on');if(inp)inp.setAttribute('aria-expanded','true');return;}
  box.innerHTML=groups.map(g=>`<div class="gsug-group">${esc(GSEARCH_KIND_LABELS[g.kind]||g.kind)}${g.total>g.items.length?` (${g.total})`:''}</div>`+
    g.items.map(it=>`<button type="button" class="gsug-item" role="option" data-gkind="${esc(it.kind)}" data-glabel="${esc(it.label)}" data-gsid="${esc(it.sid)}"><span class="gtag">${esc((GSEARCH_KIND_LABELS[it.kind]||it.kind).slice(0,3).toUpperCase())}</span><span>${esc(it.label)}</span></button>`).join('')
  ).join('');
  box.classList.add('on');if(inp)inp.setAttribute('aria-expanded','true');
}
function closeGlobalSuggestions(){const box=$('#gsugList');if(box)box.classList.remove('on');const inp=$('#globalSearch');if(inp)inp.setAttribute('aria-expanded','false');}
function openCrossModal(kind,label,sid){
  const body=$('#crossModalBody'),sub=$('#crossModalSub'),title=$('#crossModalTitle');
  title.textContent=label;
  if(kind==='exercice'){
    const year=parseInt(label,10);
    const tables=[...(YEAR_INDEX.get(year)||[])].map(t=>({table:t,label:DS[t].label||t})).sort((a,b)=>a.label.localeCompare(b.label,'fr'));
    sub.textContent=`Exercice ${year} — présent dans ${tables.length} tableau${tables.length>1?'x':''} public${tables.length>1?'s':''}.`;
    body.innerHTML=tables.map(t=>`<div class="xt-hit"><span>${esc(t.label)}</span><button class="btn" data-xtgo="${esc(t.table)}" data-xtyear="${year}">▤ Explorer →</button></div>`).join('')||'<div class="empty">Aucun tableau public ne référence cet exercice.</div>';
  }else if(kind==='rapport'){
    hideModal('crossModal');closeGlobalSuggestions();go('reports');return;
  }else if(kind==='exigence'){
    hideModal('crossModal');closeGlobalSuggestions();go(sid.split(':')[2]);return;
  }else{
    const item=GLOBAL_SEARCH_INDEX.find(it=>it.sid===sid);
    const hits=crossTableHits(kind,label);
    sub.textContent=`${GSEARCH_KIND_LABELS[kind]||kind} — apparaît dans ${hits.length} tableau${hits.length>1?'x':''} public${hits.length>1?'s':''}${item&&item.weight?` (${fmtN(item.weight)} variante${item.weight>1?'s':''} de libellé recensée${item.weight>1?'s':''} dans les déclarations brutes, regroupées ici sous ce nom canonique)`:''}.`;
    body.innerHTML=(hits.length?hits.map(h=>`<div class="xt-hit"><span>${esc(h.label)} <span style="color:var(--ink-faint);font-size:11px">(${fmtN(h.n)} ligne${h.n>1?'s':''})</span></span><button class="btn" data-xtgo="${esc(h.table)}" data-xtq="${esc(label)}">▤ Explorer →</button></div>`).join(''):'')+
      `<div style="margin-top:8px"><a href="#" data-srctable="ref_identifiants_stables" style="font-size:11.5px">ⓘ À propos de cet identifiant (référentiel technique)</a></div>`+
      (!hits.length?'<div class="empty">Aucun tableau public n\'est actuellement rattaché à cette entité (voir README, « Référentiels canoniques »).</div>':'');
  }
  closeGlobalSuggestions();
  showModal('crossModal');
}
window.openCrossModal=openCrossModal;

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
// Jetons utilisés dans les rapports source pour indiquer une valeur non
// communiquée, sans objet ou non applicable — distincts d'un véritable zéro
// déclaré. Affichés de façon lisible plutôt que tels quels (ex. "N/c" brut)
// pour que l'absence de donnée ne soit jamais confondue avec 0 (audit
// qualité, sept. 2026 : « distinguer zéro confirmé, non déclaré, non
// applicable et non disponible »).
function isNonDeclareToken(v){if(v==null||v==='')return false;return /^(n\/?c|n[eé]ant|nd|n\/a|nap|non[\s-]?d[ée]clar[ée]|non[\s-]?disponible|non[\s-]?applicable)$/i.test(String(v).trim());}
// `noGroup` : pour une colonne-année (ex. « Exercice »), affiche l'entier tel
// quel (« 2022 ») plutôt qu'avec les séparateurs de milliers de fmtN()
// (« 2 022 », lu à tort comme "2 mille 22" — signalé sept. 2026 dans
// l'Explorateur sur les nouvelles tables par régie).
function fmtCell(v,type,noGroup){if(v==null||v==='')return '';if(isNonDeclareToken(v))return '· non déclaré';if(type==='num'&&typeof v==='number')return Number.isInteger(v)?(noGroup?String(v):fmtN(v)):v.toLocaleString('fr-FR',{maximumFractionDigits:2});return String(v);}
function getPath(o,p){return p.split('.').reduce((a,k)=>a==null?a:a[k],o);}
function assignPath(o,p,v){const ks=p.split('.');let x=o;for(let i=0;i<ks.length-1;i++){if(x[ks[i]]==null)x[ks[i]]={};x=x[ks[i]];}x[ks[ks.length-1]]=v;}

/* ===== data helpers ===== */
function colIndex(name,col){return DS[name].cols.indexOf(col);}
function yearCol(name){const cs=DS[name].cols;
  let c=cs.find(x=>/^ann[eé]es?$/i.test(x));if(c)return c;         // Année / Années / annee
  if(cs.includes('exercice_id'))return 'exercice_id';
  c=cs.find(x=>/^exercice$/i.test(x));if(c)return c;               // colonne "Exercice" (entrepôt consolidé)
  c=cs.find(x=>/ann[eé]e/i.test(x));return c||null;}
function yearVal(v){if(v==null)return null;const m=String(v).match(/(19|20)\d{2}/);return m?+m[0]:null;}
function isPct(col){return /pourcent|%|taux|pct|part/i.test(col);}
function isIdCol(col){return /^(rid|id)$|_id$|identifi|code|numero|n°|register|iso\d|p[ée]rim[eè]tre|^num[eé]ro?\b/i.test(col);}
function isYearLikeCol(name,col){if(/^ann[eé]es?$|^exercice$/i.test(col))return true;const yc=yearCol(name);return !!yc&&yc===col;}
// Colonnes contenant un numéro de page / renvoi de document source : jamais
// additives (ex. « Page » dans les tables consolidées ent_revenus_*), même
// si stockées en type "num".
function isPageLikeCol(col){return /(^|_)page(s)?$/i.test(col);}
// Certaines colonnes-identifiants métier ne suivent aucun des motifs
// génériques ci-dessus (ex. « PERMIS » dans le registre CAMI, qui est un
// numéro de titre minier, pas une quantité) : liste d'exceptions constatées
// lors de l'audit qualité de sept. 2026, à compléter au fil des futurs
// constats plutôt que de deviner une regex trop large qui exclurait des
// mesures légitimes.
const NON_SUMMABLE_OVERRIDES={cami_droits_miniers:['PERMIS']};
// colonnes numériques qu'il est licite de sommer : ni identifiant, ni
// année/exercice, ni pourcentage/taux, ni numéro de page — additionner un
// code, une année, un taux ou une page n'a pas de sens analytique (audit
// qualité, sept. 2026).
function isSummableNumCol(name,col){
  if(isIdCol(col)||isYearLikeCol(name,col)||isPct(col)||isPageLikeCol(col))return false;
  const ov=NON_SUMMABLE_OVERRIDES[name];
  if(ov&&ov.includes(col))return false;
  return true;
}
// ===== Couche sémantique des colonnes (audit qualité, sept. 2026) =====
// isIdCol/isYearLikeCol/isPct/isPageLikeCol/NON_SUMMABLE_OVERRIDES ci-dessus
// ne couvrent que « sommable ou non » (isSummableNumCol). L'audit demande une
// typologie plus fine des rôles de colonne (prix unitaire, ratio, encours…)
// pour piloter, en aval, le choix des colonnes affichées par défaut dans
// l'Explorateur public et les types de graphique valides par mesure — sans
// changer le comportement des sommes déjà en place. isSummableNumCol reste
// donc volontairement autonome (zéro régression garantie sur les callers
// existants) ; columnRole ajoute deux rôles numériques plus stricts que
// l'audit signale comme jamais sommables mais qu'isSummableNumCol traitait
// jusqu'ici comme additionnables faute de détection dédiée : « Prix »
// (ent_prix) et « Encours non remboursé » (ctx_pret_subvention). C'est un
// raffinement délibéré (conforme au tableau sémantique de l'audit), pas une
// régression : columnRole('additive') est un sous-ensemble strict, jamais un
// sur-ensemble, de isSummableNumCol()===true.
function isPriceLikeCol(col){return /^prix\b|\bcours\b|\btarif/i.test(col);}
function isRatioLikeCol(col){return /\bratio\b|\bindice\b/i.test(col)&&!isPct(col);}
function isStockLikeCol(col){return /\bencours\b|\bsolde\b|\bstock\b/i.test(col);}
// Colonnes de texte libre (description, commentaire, observation…) : ni
// mesure, ni dimension catégorielle utilisable pour grouper/filtrer.
function isFreeTextCol(col){return /descri|comment|observ|remarqu|d[ée]tail|objet|intitul[ée]/i.test(col);}
const ROLE_LABELS={
  id:'Identifiant',
  year:'Année/Exercice',
  page:'Référence de page',
  pct:'Pourcentage',
  price:'Prix/Cours',
  ratio:'Ratio/Indice',
  stock:'Solde/Encours',
  additive:'Montant additionnable',
  text:'Texte libre',
  dimension:'Dimension (catégorie)'
};
// Détermine le rôle sémantique d'une colonne, dans l'ordre de priorité fixé
// par l'audit qualité (sept. 2026). Utilisé par l'Explorateur public et la
// future galerie de graphiques pour savoir ce qu'il est licite de sommer,
// moyenner, ou afficher « dernière valeur » plutôt que total.
function columnRole(name,col){
  // isYearLikeCol est vérifié AVANT isIdCol : certaines colonnes-année sont
  // nommées avec un suffixe « _id » (ex. « exercice_id » dans
  // fait_depense_sociale) que isIdCol reconnaîtrait sinon comme un simple
  // identifiant technique, la reléguant en fin de liste et masquant
  // l'exercice dans la vue simplifiée à 7 colonnes (retour utilisateur,
  // audit du 7 sept. 2026 : « un montant social sans année est
  // pratiquement inutilisable »).
  if(isYearLikeCol(name,col))return 'year';
  if(isIdCol(col))return 'id';
  if(isPageLikeCol(col))return 'page';
  if(isPct(col))return 'pct';
  if(isPriceLikeCol(col))return 'price';
  if(isRatioLikeCol(col))return 'ratio';
  if(isStockLikeCol(col))return 'stock';
  const d=DS[name],idx=d?d.cols.indexOf(col):-1,type=idx>=0?d.types[idx]:null;
  if(type==='num'){
    const ov=NON_SUMMABLE_OVERRIDES[name];
    // identifiant métier non reconnu par isIdCol (ex. « PERMIS » du registre
    // CAMI : un numéro de titre minier, pas une quantité additionnable).
    if(ov&&ov.includes(col))return 'id';
    return 'additive';
  }
  if(isFreeTextCol(col))return 'text';
  return 'dimension';
}
// Exposés sur window : fonctions/objets plats (pas de modules ES), utilisables
// depuis la console pour vérification, et par de futures pages/consommateurs
// (galerie de graphiques, colonnes par défaut de l'Explorateur public…).
window.columnRole=columnRole;window.ROLE_LABELS=ROLE_LABELS;window.isSummableNumCol=isSummableNumCol;
// Avertit quand une somme affichée mélange plusieurs unités/devises (ex.
// USD + CDF, ou tonnes + kg) sur la sélection courante : additionner des
// montants dans des unités différentes produit un total sans signification
// (audit qualité, sept. 2026 : « afficher l'unité … et filtrer avant
// agrégation »). Ne bloque rien : signale seulement, pour laisser
// l'utilisateur affiner ses filtres.
// Détecte toute colonne « devise »/« unité » — y compris les variantes
// composées comme « Unité de volume » ou « Unité de valeur » (tables de
// production/exportations, qui mélangent tonnes, carats, barils… dans une
// même colonne) : la version précédente ne reconnaissait que les noms de
// colonne exacts « Devise »/« Unité » et laissait passer ces variantes sans
// avertissement, alors que sommer des quantités dans des unités différentes
// produit un total sans signification (audit du 7 sept. 2026).
function mixedUnitWarning(name,rows){
  const d=DS[name];if(!d||!rows.length)return '';
  const uCols=d.cols.map((c,i)=>({c,i})).filter(o=>/devise|unit[eé]/i.test(o.c));
  if(!uCols.length)return '';
  const out=[];
  for(const {c,i} of uCols){
    const vals=new Set();for(const r of rows){const v=r[i];if(v!=null&&v!=='')vals.add(String(v));}
    if(vals.size>1)out.push(`<span class="sm-s" style="color:#b3261e" title="${esc([...vals].join(', '))}">⚠ ${esc(c)} mixte (${vals.size})</span>`);
  }
  return out.join('');
}
// Les lignes dont la dimension choisie est vide/nulle sont le plus souvent des
// sous-totaux, notes de bas de tableau ou lignes récapitulatives (mêmes causes
// que isRollupEntityLabel plus haut) plutôt qu'une vraie catégorie « (vide) » :
// les sommer sous cette étiquette produit un bâton qui écrase le reste du
// graphique (ex. 2,3 Md / 7 Md USD sur des annexes 2022). On les exclut donc du
// graphique et on remonte leur nombre/masse via `_excluded` pour que
// l'utilisateur en soit informé plutôt que de les voir disparaître en silence.
function aggregate(name,groupCol,measureCol,agg,filterYear){
  const d=DS[name],gi=d.cols.indexOf(groupCol),mi=measureCol?d.cols.indexOf(measureCol):-1,yc=yearCol(name),yi=yc?d.cols.indexOf(yc):-1;
  const gdim=canonDimFor(name,groupCol);
  const map=new Map();
  let excCount=0,excSum=0;
  for(const r of d.rows){
    if(filterYear&&yi>=0&&yearVal(r[yi])!==+filterYear)continue;
    const gv=r[gi];
    if(gv==null||gv===''){
      excCount++;
      if(mi>=0){const raw=r[mi];if(raw!==null&&raw!==''){const v=Number(raw);if(!isNaN(v))excSum+=v;}}
      continue;
    }
    const k=String(gdim?canonicalize(gdim,gv):gv);
    let a=map.get(k);if(!a){a={sum:0,count:0,n:0,min:Infinity,max:-Infinity};map.set(k,a);}
    a.count++;                                   // total rows in group
    if(mi>=0){const raw=r[mi];if(raw!==null&&raw!==''){const v=Number(raw);if(!isNaN(v)){a.sum+=v;a.n++;if(v<a.min)a.min=v;if(v>a.max)a.max=v;}}}
  }
  // avg divides by count of NON-NULL measured values (a.n), not all rows
  const out=[...map.entries()].map(([label,a])=>({label,value:agg==='count'?a.count:agg==='avg'?(a.n?a.sum/a.n:0):agg==='min'?(a.min===Infinity?0:a.min):agg==='max'?(a.max===-Infinity?0:a.max):a.sum,n:a.n}));
  out._excluded={count:excCount,sum:excSum};
  return out;
}
function numericStats(name,col){const i=colIndex(name,col);let sum=0,n=0,min=Infinity,max=-Infinity,nn=0;const seen=new Set();
  for(const r of DS[name].rows){const v=r[i];if(v!=null&&v!=='')seen.add(String(v));const x=Number(v);if(v!=null&&v!==''&&!isNaN(x)){sum+=x;n++;if(x<min)min=x;if(x>max)max=x;}else if(v==null||v==='')nn++;}
  return {sum,avg:n?sum/n:0,min:n?min:0,max:n?max:0,count:n,distinct:seen.size,nulls:nn};}

/* ===== chart engine =====
   Alternative texte : chaque conteneur ".chart" porte un aria-label repris
   du titre de la carte des pages statiques ; baseSvg() le reprend comme
   aria-label + <title> du SVG — on n'essaie pas de rendre chaque
   barre/point du SVG navigable individuellement (hors périmètre de cette
   passe, cf. limite assumée). */
function baseSvg(W,H,desc){const s=svgEl('svg',{viewBox:`0 0 ${W} ${H}`,width:W,height:H,class:'c',role:'img'});
  if(desc){s.setAttribute('aria-label',desc);const t=svgEl('title',{});t.textContent=desc;s.appendChild(t);}return s;}
function hostDesc(host){try{return (host&&host.getAttribute('aria-label'))||null;}catch(e){return null;}}
function isYearSeq(data){return data.length>1&&data.every(d=>/^\d{4}$/.test(String(d.label)));}
/* Alternative accessible d'un graphique en barres : un vrai <table> caché
   visuellement (.sr-only) plutôt qu'un simple aria-label de synthèse — un
   graphique lu ou copié-collé sans cette table ne restitue que les textes
   SVG bruts, concaténés sans séparateur (« 202292202368 » pour 2022 : 92,
   2023 : 68 : illisible, retour utilisateur sept. 2026). Le tableau, lui,
   reste lisible ligne par ligne à la copie comme au lecteur d'écran, et ne
   duplique pas visuellement le graphique puisqu'il est masqué à l'écran. */
function chartDataTable(data,labelHead,valueHead){
  const rows=data.map(d=>`<tr><td>${esc(d.label)}</td><td>${esc(fmtSmart(d.value))}</td></tr>`).join('');
  return `<table class="sr-only charttbl"><caption>${esc(labelHead)} et ${esc(valueHead)}</caption><thead><tr><th scope="col">${esc(labelHead)}</th><th scope="col">${esc(valueHead)}</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function cBar(host,data,color,horizontal){
  data=data.slice().sort((a,b)=>b.value-a.value);
  color=color||css('--sky');
  if(horizontal||data.length>7){
    data=data.slice(0,14);const rowH=30,W=640,labelW=Math.min(230,Math.max(120,...data.map(d=>d.label.length*6.6))),P={t:6,r:96},iw=W-labelW-P.r,H=P.t*2+data.length*rowH,max=Math.max(...data.map(d=>d.value),1);
    const s=baseSvg(W,H,hostDesc(host));
    data.forEach((d,i)=>{const cy=P.t+i*rowH,bw=Math.max(2,iw*d.value/max);let lab=d.label;if(lab.length>34)lab=lab.slice(0,33)+'…';
      const tl=svgEl('text',{class:'barlabel',x:0,y:cy+rowH/2+4});tl.textContent=lab;s.appendChild(tl);
      s.appendChild(svgEl('rect',{x:labelW,y:cy+6,width:bw,height:rowH-13,rx:3,fill:color,opacity:.9}));
      const tv=svgEl('text',{class:'barval',x:labelW+bw+7,y:cy+rowH/2+4});tv.textContent=fmtSmart(d.value);s.appendChild(tv);});
    host.innerHTML='';host.appendChild(s);host.insertAdjacentHTML('beforeend',chartDataTable(data,isYearSeq(data)?'Année':'Catégorie','Valeur'));return;
  }
  const W=Math.max(420,data.length*74),H=250,P={l:48,r:14,t:14,b:44},iw=W-P.l-P.r,ih=H-P.t-P.b,bw=iw/data.length*.62;
  const dmax=Math.max(0,...data.map(d=>d.value)),dmin=Math.min(0,...data.map(d=>d.value)),span=(dmax-dmin)||1;
  const y0=P.t+ih*(dmax/span);                              // pixel position of value 0
  const s=baseSvg(W,H,hostDesc(host));
  for(let g=0;g<=4;g++){const gy=P.t+ih*g/4,val=dmax-span*g/4;s.appendChild(svgEl('line',{class:'gridline',x1:P.l,y1:gy,x2:W-P.r,y2:gy}));const t=svgEl('text',{class:'axis',x:P.l-7,y:gy+3,'text-anchor':'end'});t.textContent=fmtSmart(val);s.appendChild(t);}
  if(dmin<0)s.appendChild(svgEl('line',{x1:P.l,y1:y0,x2:W-P.r,y2:y0,stroke:css('--ink-faint'),'stroke-width':1}));
  data.forEach((d,i)=>{const cx=P.l+iw*(i+.5)/data.length,h=ih*Math.abs(d.value)/span,yy=d.value>=0?y0-h:y0;
    s.appendChild(svgEl('rect',{x:cx-bw/2,y:yy,width:bw,height:Math.max(0,h),rx:3,fill:d.value<0?css('--red'):color,opacity:.9}));
    const t=svgEl('text',{class:'axis',x:cx,y:H-24,'text-anchor':'middle'});let lb=String(d.label);if(lb.length>10)lb=lb.slice(0,9)+'…';t.textContent=lb;s.appendChild(t);
    const tv=svgEl('text',{class:'barval',x:cx,y:(d.value>=0?yy-5:yy+h+11),'text-anchor':'middle'});tv.textContent=fmtSmart(d.value);s.appendChild(tv);});
  host.innerHTML='';host.appendChild(s);host.insertAdjacentHTML('beforeend',chartDataTable(data,isYearSeq(data)?'Année':'Catégorie','Valeur'));
}
function cLine(host,data,area,color,color2,k1,k2){
  color=color||css('--sky');k1=k1||'value';
  const W=Math.max(480,data.length*46),H=250,P={l:48,r:16,t:14,b:30},iw=W-P.l-P.r,ih=H-P.t-P.b;
  const max=Math.max(...data.map(d=>Math.max(d[k1]||0,k2?d[k2]||0:0)),1)*1.08;
  const x=i=>P.l+iw*(i/(data.length-1||1)),y=v=>P.t+ih*(1-v/max);
  const s=baseSvg(W,H,hostDesc(host));
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
  const s=baseSvg(360,190,hostDesc(host));
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
  const W=680,H=300,cols=PALETTE();const s=baseSvg(W,H,hostDesc(host));
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
// Répartition des recettes extractives par régie percevante nationale
// (DGI, DGRAD, DGDA, CAMI, SGH, OCC...) et par niveau (National / Provincial
// / ETD / Entreprise publique) : les recettes nationales sont largement
// majoritaires dans les données (ent_revenus_entite, colonne "Niveau") mais
// n'apparaissaient auparavant dans aucun graphique du tableau de bord,
// contrairement aux flux infranationaux mis en avant par la Géographie
// (retour utilisateur, sept. 2026).
// Certaines valeurs de "Entité perceptrice harmonisée" sont en réalité des
// sous-totaux ou des agrégats de la source ("Total", "Toutes entités",
// "Total secteur minier"...) plutôt que de vraies régies : les inclure dans
// un classement par entité créerait des doublons trompeurs (une régie et,
// séparément, un total qui la recouvre déjà). On les exclut du classement.
function isRollupEntityLabel(v){return /^(total|toutes)\b/i.test(String(v||'').trim());}
function nationalRegieTop(n){
  const d=DS.ent_revenus_entite;if(!d)return [];
  const ci=d.cols.indexOf('Entité perceptrice harmonisée'),ni=d.cols.indexOf('Niveau'),mi=d.cols.indexOf('Montant normalisé');
  if(ci<0||ni<0||mi<0)return [];
  const map=new Map();
  for(const r of d.rows){
    if(r[ni]!=='National')continue;
    if(isRollupEntityLabel(r[ci]))continue;
    const v=Number(r[mi]);if(isNaN(v))continue;
    const k=r[ci]||'(non précisé)';
    map.set(k,(map.get(k)||0)+v);
  }
  return [...map.entries()].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value).slice(0,n);
}
// Variante année-par-année de nationalRegieTop(), utilisée par la Géographie
// (page Territoire) pour que les recettes nationales par régie (DGI, DGRAD,
// DGDA, CAMI, FOMIN, SGH, FONAREV…) suivent le même sélecteur Année/Évolution
// que la carte, plutôt que de n'apparaître qu'en cumul « toutes années » dans
// la Vue d'ensemble (retour utilisateur, sept. 2026 : ces régies n'apparaissaient
// pas du tout dans la Géographie, contrairement aux flux infranationaux).
function nationalRegieBreakdown(year){
  const d=DS.ent_revenus_entite;if(!d)return [];
  const ci=d.cols.indexOf('Entité perceptrice harmonisée'),ni=d.cols.indexOf('Niveau'),mi=d.cols.indexOf('Montant normalisé'),yi=d.cols.indexOf('Exercice');
  if(ci<0||ni<0||mi<0)return [];
  const yv=year?yearVal(year):null;
  const map=new Map();
  for(const r of d.rows){
    if(r[ni]!=='National')continue;
    if(isRollupEntityLabel(r[ci]))continue;
    if(yv&&yi>=0&&yearVal(r[yi])!==yv)continue;
    const v=Number(r[mi]);if(isNaN(v))continue;
    const k=r[ci]||'(non précisé)';
    map.set(k,(map.get(k)||0)+v);
  }
  return [...map.entries()].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
}
function revenueLevelBreakdown(){
  const d=DS.ent_revenus_entite;if(!d)return [];
  const ci=d.cols.indexOf('Entité perceptrice harmonisée'),ni=d.cols.indexOf('Niveau'),mi=d.cols.indexOf('Montant normalisé');
  if(ni<0||mi<0)return [];
  const map=new Map();
  for(const r of d.rows){
    if(ci>=0&&isRollupEntityLabel(r[ci]))continue; // évite les doubles comptes (une ligne "Total" additionnée aux lignes qu'elle recouvre déjà)
    const v=Number(r[mi]);if(isNaN(v))continue;
    const k=r[ni]||'(non précisé)';
    map.set(k,(map.get(k)||0)+v);
  }
  return [...map.entries()].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
}
function mOverview(){return `
  <div class="phead"><div class="eyebrow">Tableau de bord</div><h1>Vue d'ensemble</h1>
    <p data-edit="overview.intro">${esc(C.overview.intro)}</p></div>
  ${kpiRow()}
  ${highlight()}
  <div class="grid2">
    <div class="card"><div class="ch"><h3>Recettes de l'État par exercice</h3><span class="badge">${AGG.serie_etat.length?AGG.serie_etat[0].annee+'–'+AGG.serie_etat[AGG.serie_etat.length-1].annee:''}</span></div><div class="sub">Millions USD · réconciliées</div><div class="chart" id="ov1" aria-label="${esc("Recettes de l'État par exercice, millions USD")}"></div><div class="srcnote">Source : agrégat <code>serie_etat</code> (recettes de l'État réconciliées par exercice)</div></div>
    <div class="card"><div class="ch"><h3>Répartition des revenus ${O._year||'2023'}</h3><span class="badge">Secteurs</span></div><div class="sub">Mines vs hydrocarbures</div><div class="chart" id="ov2" aria-label="${esc('Répartition des revenus '+(O._year||'2023')+', mines vs hydrocarbures')}"></div><div class="srcnote">Source : chiffres officiels agrégés <code>officiel2023</code> (mines / hydrocarbures)</div></div>
    <div class="card"><div class="ch"><h3>Principales entreprises ${O._topyear||'2023'}</h3><span class="badge">Top 10</span></div><div class="sub">Recettes perçues par l'État, USD</div><div class="chart" id="ov3" aria-label="${esc('Principales entreprises '+(O._topyear||'2023')+', recettes perçues par l’État en USD')}"></div><div class="srcnote">Source : table <code>ent_revenus_entreprise</code></div></div>
    <div class="card"><div class="ch"><h3>Dépenses sociales par exercice</h3><span class="badge">${AGG.social&&AGG.social.length?AGG.social[0].annee+'–'+AGG.social[AGG.social.length-1].annee:''}</span></div><div class="sub">Total annuel, USD</div><div class="chart" id="ov4" aria-label="${esc('Dépenses sociales par exercice, total annuel en USD')}"></div><div class="srcnote">Source : table <code>ent_depenses_sociales</code></div></div>
    <div class="card"><div class="ch"><h3>Recettes par régie nationale</h3><span class="badge">Toutes années</span></div><div class="sub">DGI, DGRAD, DGDA, CAMI… — cumul, USD</div><div class="chart" id="ov5" aria-label="${esc('Recettes par régie nationale, cumul toutes années en USD')}"></div><div class="srcnote">Source : table <code>ent_revenus_entite</code></div></div>
    <div class="card"><div class="ch"><h3>Recettes par niveau de perception</h3><span class="badge">National vs infranational</span></div><div class="sub">Régies nationales, provinciales, ETD, entreprises publiques</div><div class="chart" id="ov6" aria-label="${esc('Recettes par niveau de perception, national vs infranational')}"></div><div class="srcnote">Source : table <code>ent_revenus_entite</code></div></div>
  </div>`;}
function drawOverview(){
  cLine($('#ov1'),AGG.serie_etat.map(d=>({label:d.annee,value:d.etat,ese:d.ese})),true,css('--sky'),css('--red'),'value','ese');
  cDonut($('#ov2'),[{label:'Mines',value:O.mines},{label:'Hydrocarbures',value:O.petrole}]);
  cBar($('#ov3'),AGG.top2023.map(d=>({label:d.nom,value:d.etat})),css('--sky'),true);
  cBar($('#ov4'),AGG.social.map(d=>({label:String(d.annee),value:d.montant})),css('--red'),false);
  cBar($('#ov5'),nationalRegieTop(10),css('--teal'),true);
  cDonut($('#ov6'),revenueLevelBreakdown());
}

/* Explorer */
let exState={ds:'fait_reconciliation_flux',page:0,sort:null,dir:1,q:'',filters:{},panel:true,showAllCols:false};
let exTableQ='';
function mExplorer(){
  // Regroupement par thème ITIE (et non plus par nature technique de la
  // table) — cohérent avec la navigation par thème (voir NAV/mTheme, sept.
  // 2026). Les 128 tables « techniques » (117 annexes brutes + référentiels
  // internes) ne sont listées que pour un utilisateur connecté en
  // administrateur ; rien n'est supprimé, seulement masqué du visiteur
  // public par défaut (ne rien cacher ne veut pas dire tout mélanger).
  const names=visibleTableNames();
  const tq=exTableQ.toLowerCase();
  const groups={};
  names.forEach(k=>{const d=DS[k];if(k.startsWith('_'))return;if(tq&&!(d.label||'').toLowerCase().includes(tq)&&!k.toLowerCase().includes(tq))return;
    const th=tableTheme(k);(groups[th]||(groups[th]=[])).push([k,d]);});
  const list=th=>(groups[th]||[]).sort((a,b)=>(a[1].label||a[0]).localeCompare(b[1].label||b[0],'fr')).map(([k,d])=>`<div class="dsitem ${exState.ds===k?'on':''}" data-ds="${k}" role="button" tabindex="0" aria-pressed="${exState.ds===k}"><span>${esc(d.label)}</span><span class="n">${fmtN(d.rows.length)}</span></div>`).join('');
  const grp=(th,title)=>groups[th]&&groups[th].length?`<div class="dg">${title} <span style="opacity:.5">(${groups[th].length})</span></div>${list(th)}`:'';
  const themeOrder=Object.keys(THEME_INFO).filter(k=>k!=='technique');
  const nT=names.length, nR=names.reduce((a,k)=>a+DS[k].rows.length,0);
  return `<div class="phead"><div class="eyebrow">Explorateur</div><h1>Explorateur de données</h1><p data-edit="intros.explorer">${esc(C.intros.explorer)}</p><p><b>${nT} tables</b>${editing?' (y compris les annexes brutes et référentiels techniques)':''} · ${fmtN(nR)} lignes.${!editing?' <a href="#" id="exGoAdmin" style="font-size:12px">Voir aussi les tables techniques (connexion administrateur)</a>':''}</p></div>
  <div class="expl">
    <div class="dslist">
      <div class="dstsearch"><input id="exTableQ" placeholder="🔍 Trouver une table…" value="${esc(exTableQ)}"></div>
      ${themeOrder.map(th=>grp(th,(THEME_INFO[th]||{}).label||th)).join('')}
      ${editing?grp('technique','Espace technique (annexes brutes & référentiels)'):''}
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
  // Recherche insensible aux accents/casse (ex. « minière » doit retrouver
  // « miniere » et inversement — signalé sept. 2026 : la recherche brute par
  // .toLowerCase() seul ne rapprochait pas ces variantes orthographiques).
  const q=stripAccents(exState.q||'').toLowerCase();
  if(q)rows=rows.filter(r=>r.some(v=>stripAccents(v==null?'':v).toLowerCase().includes(q)));
  const F=exState.filters;
  for(const k in F){const i=+k,f=F[k];if(!f)continue;
    if(f.type==='cat'){const dim=canonDimFor(exState.ds,d.cols[i]);
      if(f.vals&&f.vals.length){const set=new Set(f.vals);rows=rows.filter(r=>{const raw=r[i];const v=(raw==null||raw==='')?'∅':String(dim?canonicalize(dim,raw):raw);return set.has(v);});}
      if(f.q){const qq=stripAccents(f.q).toLowerCase();rows=rows.filter(r=>stripAccents(r[i]==null?'':r[i]).toLowerCase().includes(qq));}}
    else if(f.type==='num'){if(f.min!=null)rows=rows.filter(r=>{const v=Number(r[i]);return !isNaN(v)&&v>=f.min;});
      if(f.max!=null)rows=rows.filter(r=>{const v=Number(r[i]);return !isNaN(v)&&v<=f.max;});}}
  return rows;}

function exActiveCount(){let n=0;const F=exState.filters;for(const k in F){const f=F[k];if(!f)continue;if(f.type==='cat'&&((f.vals&&f.vals.length)||f.q))n++;if(f.type==='num'&&(f.min!=null||f.max!=null))n++;}return n;}

// Colonnes de `exState.ds` couvertes par la canonicalisation (référentiel
// province/entreprise/flux/entité perceptrice) : pour chacune, l'Explorateur
// affiche une colonne "canonique" juste après la colonne source, plutôt que
// de remplacer silencieusement la valeur affichée (audit qualité, sept.
// 2026 : « il faut présenter deux colonnes clairement séparées »). La
// valeur brute stockée reste inchangée dans l'export CSV / l'édition.
function canonColIdxs(ds){const d=DS[ds];if(!d)return [];return d.cols.map((c,i)=>canonDimFor(ds,c)?i:-1).filter(i=>i>=0);}
// Annexes dont l'import initial avait décalé l'en-tête d'une ligne (les noms
// de colonnes affichés étaient en réalité des valeurs de données) : signalé
// par l'audit qualité de sept. 2026, puis corrigé pour les 27 tables
// concernées à partir des classeurs officiels ITIE RDC 2022 et 2023 fournis
// par l'utilisateur (en-têtes reconstruits, lignes perdues récupérées).
// Cet ensemble reste vide tant qu'aucune nouvelle table cassée n'est
// détectée ; si un futur import révèle un nouveau cas, ajouter sa clé ici
// en attendant sa correction.
const UNRELIABLE_HEADER_TABLES=new Set([]);
function renderExplorer(){
  const host=$('#exMain');if(!host)return;const d=DS[exState.ds];
  const yc=yearCol(exState.ds);
  let rows=exApply();
  if(exState.sort!=null){const si=exState.sort,ty=d.types[si];rows=rows.slice().sort((a,b)=>{let x=a[si],y=b[si];if(ty==='num'){x=Number(x);y=Number(y);if(isNaN(x))x=-Infinity;if(isNaN(y))y=-Infinity;return (x-y)*exState.dir;}return String(x==null?'':x).localeCompare(String(y==null?'':y),'fr')*exState.dir;});}
  const per=25,tot=rows.length,pages=Math.max(1,Math.ceil(tot/per));if(exState.page>=pages)exState.page=0;
  const pageRows=rows.slice(exState.page*per,exState.page*per+per);
  const canEdit=editing;
  const canonIdx=canonColIdxs(exState.ds);
  const visIdx=exVisibleColIdx(exState.ds);
  const colsLimited=visIdx.length<d.cols.length;
  const th=visIdx.map(i=>{const c=d.cols[i];return `<th scope="col" data-si="${i}" tabindex="0" role="button" aria-sort="${exState.sort===i?(exState.dir>0?'ascending':'descending'):'none'}" title="Trier">${esc(c)}${exState.sort===i?`<span class="ar" aria-hidden="true">${exState.dir>0?'▲':'▼'}</span>`:''}</th>`+(canonIdx.includes(i)?`<th scope="col" class="canoncol" title="Valeur normalisée utilisée pour les filtres et les agrégations">${esc(c)} <span class="ftag">canonique</span></th>`:'');}).join('')+(canEdit?'<th scope="col">—</th>':'');
  const body=pageRows.map(r=>{const ridx=d.rows.indexOf(r);
    return `<tr data-rowidx="${ridx}">${visIdx.map(i=>{const v=r[i];
      const cell=`<td class="${d.types[i]==='num'?'num':''}" ${canEdit?`contenteditable="true" data-ecol="${i}"`:''} title="${esc(v)}">${esc(fmtCell(v,d.types[i],isYearLikeCol(exState.ds,d.cols[i])))}</td>`;
      const dim=canonIdx.includes(i)?canonDimFor(exState.ds,d.cols[i]):null;
      const canonCell=dim?`<td class="canoncol" title="Valeur canonique">${esc(canonicalize(dim,v)||'')}</td>`:'';
      return cell+canonCell;
    }).join('')}${canEdit?`<td><button class="rm-del" data-erowdel="${ridx}" aria-label="Supprimer cette ligne" title="Supprimer cette ligne">✕</button></td>`:''}</tr>`;
  }).join('');
  // live aggregates over filtered rows: sum of each numeric column
  const numCols=d.cols.map((c,i)=>({c,i})).filter(o=>d.types[o.i]==='num' && isSummableNumCol(exState.ds,o.c));
  const sums=numCols.map(o=>{let s=0,n=0;for(const r of rows){const v=Number(r[o.i]);if(!isNaN(v)){s+=v;n++;}}return {c:o.c,s,n};}).filter(o=>o.n>0).slice(0,6);
  const nActive=exActiveCount();
  const headerWarning=UNRELIABLE_HEADER_TABLES.has(exState.ds)?`<div class="msg warn" style="margin-bottom:10px">⚠ En-têtes de colonnes non fiables : l'import initial de cette annexe a décalé la première ligne de données à la place des noms de colonnes réels. Les intitulés affichés ci-dessous ne sont donc pas ceux du rapport ITIE d'origine — à corriger dès que les intitulés officiels seront fournis.</div>`:'';
  host.innerHTML=`
    ${headerWarning}
    <div class="extoolbar">
      <div class="desc">${esc(d.desc)}</div>
      <div class="exsearch"><span class="si" aria-hidden="true">⌕</span><input id="exQ" placeholder="Recherche plein-texte…" value="${esc(exState.q)}" aria-label="Recherche plein-texte dans le tableau"></div>
      <button class="btn ${exState.panel?'primary':''}" id="exToggle">⚙ Filtres par colonne${nActive?` (${nActive})`:''}</button>
      <button class="btn" id="exReset">Réinitialiser</button>
      <button class="btn" id="exCsv">↓ Export CSV (sélection)</button>
      <button class="btn" id="exShare" title="Copier un lien reproduisant cette vue (table, filtres, tri, recherche)">🔗 Copier le lien</button>
      ${colsLimited?`<button class="btn" id="exShowAllCols" title="Afficher les ${d.cols.length} colonnes de cette table">▤ Afficher toutes les colonnes</button>`:''}
      ${canEdit?`<button class="btn" id="exAddRow">+ Ligne</button><button class="btn primary" id="exSaveTable">💾 Enregistrer cette table en base</button>`:''}
    </div>
    ${colsLimited?`<div class="msg warn" style="display:block;margin-bottom:10px">Vue simplifiée : ${visIdx.length} colonne(s) affichée(s) sur ${d.cols.length}. Cliquez « Afficher toutes les colonnes » pour la vue complète.</div>`:''}
    ${canEdit?`<div style="font-size:12px;color:var(--ink-soft);margin:-6px 0 10px">Mode édition : cliquez une cellule pour la modifier, <b>✕</b> pour supprimer une ligne, <b>+ Ligne</b> pour en ajouter une, puis <b>Enregistrer cette table en base</b> pour publier ces changements sur le serveur.</div>`:''}
    <div id="exFilters" class="exfilters" style="display:${exState.panel?'grid':'none'}"></div>
    <div class="exsummary" id="exSummary"></div>
    <div class="gridwrap"><div class="gridscroll"><table class="dg"><thead><tr>${th}</tr></thead><tbody>${body||`<tr><td colspan="${visIdx.length+canonIdx.filter(i=>visIdx.includes(i)).length+(canEdit?1:0)}"><div class="empty">Aucune ligne pour cette combinaison de filtres.</div></td></tr>`}</tbody></table></div>
      <div class="gridfoot"><div>${fmtN(tot)} ligne(s)${nActive||exState.q||(globalYear&&yc)?' filtrée(s) sur '+fmtN(d.rows.length):''} · ${visIdx.length}${colsLimited?'/'+d.cols.length:''} colonnes${canonIdx.length?` (+${canonIdx.filter(i=>visIdx.includes(i)).length} canonique${canonIdx.length>1?'s':''})`:''}</div>
      <div class="pager"><button id="exFirst" aria-label="Première page" ${exState.page===0?'disabled':''}>«</button><button id="exPrev" aria-label="Page précédente" ${exState.page===0?'disabled':''}>‹</button><span>Page ${exState.page+1} / ${pages}</span><button id="exNext" aria-label="Page suivante" ${exState.page>=pages-1?'disabled':''}>›</button><button id="exLast" aria-label="Dernière page" ${exState.page>=pages-1?'disabled':''}>»</button></div></div>
    </div>`;
  if(canEdit)bindExplorerEdit(d);
  // summary
  const sum=$('#exSummary');
  sum.innerHTML=`<span class="sm-c">${fmtN(tot)} ligne(s) sélectionnée(s)</span>`+sums.map(o=>`<span class="sm-s"><span>Σ ${esc(o.c)}</span><b>${fmtSmart(o.s)}</b></span>`).join('')+mixedUnitWarning(exState.ds,rows);
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
  const exShareBtn=$('#exShare');if(exShareBtn)exShareBtn.onclick=()=>copyShareLink(exShareBtn);
  const exShowAllBtn=$('#exShowAllCols');if(exShowAllBtn)exShowAllBtn.onclick=()=>{exState.showAllCols=true;renderExplorer();};
  const tqi=$('#exTableQ');if(tqi&&!tqi._bound){tqi._bound=true;tqi.addEventListener('input',e=>{exTableQ=e.target.value;const v=e.target.value;$('#app').innerHTML=mExplorer();renderExplorer();const t=$('#exTableQ');if(t){t.focus();t.setSelectionRange(v.length,v.length);}});}
  const exGoAdmin=$('#exGoAdmin');if(exGoAdmin)exGoAdmin.onclick=e=>{e.preventDefault();$('#user').value='';$('#pw').value='';$('#loginMsg').className='msg';showModal('loginModal');};
  if(editing)markEditable(true);
  syncURL();
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
  const canonIdx=canonColIdxs(exState.ds);
  const visIdx=exVisibleColIdx(exState.ds);
  const tb=$('#exMain tbody');if(tb)tb.innerHTML=pageRows.map(r=>`<tr>${visIdx.map(i=>{const v=r[i];
    const cell=`<td class="${d.types[i]==='num'?'num':''}" title="${esc(v)}">${esc(fmtCell(v,d.types[i],isYearLikeCol(exState.ds,d.cols[i])))}</td>`;
    const dim=canonIdx.includes(i)?canonDimFor(exState.ds,d.cols[i]):null;
    const canonCell=dim?`<td class="canoncol" title="Valeur canonique">${esc(canonicalize(dim,v)||'')}</td>`:'';
    return cell+canonCell;
  }).join('')}</tr>`).join('')||`<tr><td colspan="${visIdx.length+canonIdx.filter(i=>visIdx.includes(i)).length}"><div class="empty">Aucune ligne pour cette combinaison de filtres.</div></td></tr>`;
  const numCols=d.cols.map((c,i)=>({c,i})).filter(o=>d.types[o.i]==='num' && isSummableNumCol(exState.ds,o.c));
  const sums=numCols.map(o=>{let s=0,n=0;for(const r of rows){const v=Number(r[o.i]);if(!isNaN(v)){s+=v;n++;}}return {c:o.c,s,n};}).filter(o=>o.n>0).slice(0,6);
  const sum=$('#exSummary');if(sum)sum.innerHTML=`<span class="sm-c">${fmtN(tot)} ligne(s) sélectionnée(s)</span>`+sums.map(o=>`<span class="sm-s"><span>Σ ${esc(o.c)}</span><b>${fmtSmart(o.s)}</b></span>`).join('')+mixedUnitWarning(exState.ds,rows);
  const foot=$('#exMain .gridfoot > div:first-child');if(foot)foot.innerHTML=`${fmtN(tot)} ligne(s)${nActive||exState.q?' filtrée(s) sur '+fmtN(d.rows.length):''} · ${visIdx.length}${visIdx.length<d.cols.length?'/'+d.cols.length:''} colonnes`;
  const pg=$('#exMain .pager');if(pg)pg.innerHTML=`<button id="exFirst" ${exState.page===0?'disabled':''}>«</button><button id="exPrev" ${exState.page===0?'disabled':''}>‹</button><span>Page ${exState.page+1} / ${pages}</span><button id="exNext" ${exState.page>=pages-1?'disabled':''}>›</button><button id="exLast" ${exState.page>=pages-1?'disabled':''}>»</button>`;
  if(pg){$('#exFirst').onclick=()=>{exState.page=0;refreshExResult();};$('#exPrev').onclick=()=>{exState.page--;refreshExResult();};$('#exNext').onclick=()=>{exState.page++;refreshExResult();};$('#exLast').onclick=()=>{exState.page=pages-1;refreshExResult();};}
  syncURL();
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
const GALLERY_CARDS=`
      <div class="card"><div class="ch"><h3>Recettes vs paiements (écart)</h3></div><div class="sub">Réconciliation par exercice, USD</div><div class="chart" id="g1" aria-label="Recettes vs paiements, écart de réconciliation par exercice"></div><div id="g1Warn"></div></div>
      <div class="card"><div class="ch"><h3>Top flux de recettes 2023</h3></div><div class="sub">Perçu par l'État, USD</div><div class="chart" id="g2" aria-label="Top flux de recettes 2023, perçu par l’État"></div></div>
      <div class="card"><div class="ch"><h3>Contributeurs sociaux (cumul)</h3></div><div class="sub">2015–2024, USD</div><div class="chart" id="g3" aria-label="Contributeurs sociaux, cumul 2015-2024"></div></div>
      <div class="card"><div class="ch"><h3>Production 2023 (part-à-tout)</h3></div><div class="sub">Valeur par substance</div><div class="chart" id="g4" aria-label="Production 2023 part-à-tout, valeur par substance"></div></div>
      <div class="card"><div class="ch"><h3>Exportations par produit</h3><span class="badge">Contextuel</span></div><div class="sub">Valeur cumulée déclarée</div><div class="chart" id="g5" aria-label="Exportations par produit, valeur cumulée déclarée"></div></div>
      <div class="card"><div class="ch"><h3>Effectifs par exercice</h3><span class="badge">Contextuel</span></div><div class="sub">Total employés déclarés</div><div class="chart" id="g6" aria-label="Effectifs par exercice, total employés déclarés"></div></div>`;
function mViz(){
  const vizNames=visibleTableNames();
  if(!vizNames.includes(vizState.ds))vizState.ds=vizNames[0];
  const dsOpts=vizNames.map(k=>`<option value="${k}" ${vizState.ds===k?'selected':''}>${esc(DS[k].label)}</option>`).join('');
  const genHtml=`<div class="vizbar">
      <div class="vf"><label>Table</label><select id="vzDs">${dsOpts}</select></div>
      <div class="vf"><label>Dimension (axe)</label><select id="vzDim"></select></div>
      <div class="vf"><label>Mesure</label><select id="vzMeasure"></select></div>
      <div class="vf"><label>Agrégation</label><select id="vzAgg">
        <option value="sum">Somme</option><option value="avg">Moyenne</option><option value="count">Nombre</option><option value="min">Minimum</option><option value="max">Maximum</option></select></div>
      <div class="vf"><label>&nbsp;</label><button class="btn" id="vzCsv">↓ Export</button></div>
      <div class="vf"><label>&nbsp;</label><button class="btn" id="vzShare" title="Copier un lien reproduisant cette vue">🔗 Copier le lien</button></div>
    </div>
    <div class="chiptypes" id="vzTypes"></div>
    <div id="vzHint" style="font-size:12.5px;color:var(--amber);margin:-6px 0 12px;font-weight:600"></div>
    <div id="vzExcNote" style="margin:-6px 0 12px"></div>
    <div class="card"><div class="ch"><h3 id="vzTitle">Visualisation</h3></div><div class="chart" id="vzChart"></div></div>`;
  const galleryHtml=`<div class="phead" style="margin-top:26px"><div class="eyebrow">Galerie</div><h1 style="font-size:20px">Analyses prêtes à l'emploi</h1></div>
    <div class="gallery">${GALLERY_CARDS}</div>`;
  return `<div class="phead"><div class="eyebrow">Visualisations</div><h1>Générateur de visualisations</h1><p data-edit="intros.viz">${esc(C.intros.viz)}</p></div>
    ${genHtml}
    ${galleryHtml}`;}
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
  syncURL();
  const measure=vizState.measure==='__count__'?null:vizState.measure;
  const agg=vizState.measure==='__count__'?'count':vizState.agg;
  const vzTitleTxt=`${d.label} — ${agg==='count'?'nombre':agg} ${measure?'de '+measure:''} par ${vizState.dim}`;
  $('#vzTitle').textContent=vzTitleTxt;host.setAttribute('aria-label',vzTitleTxt);
  if(vizState.type==='hist'){cHistogram(host,vizState.ds,vizState.dim);return;}
  let data=aggregate(vizState.ds,vizState.dim,measure,agg,globalYear);
  const excNote=$('#vzExcNote');
  if(excNote){
    const exc=data._excluded;
    excNote.innerHTML=(exc&&exc.count)?`<span class="msg warn">⚠ ${exc.count} ligne(s) sans valeur pour « ${esc(vizState.dim)} » exclue(s) du graphique (souvent des sous-totaux/notes)${exc.sum?` — masse concernée : ${esc(fmtCell(exc.sum,'num'))}`:''}. Consultez le Tableau ou l'Explorateur pour les examiner.</span>`:'';
  }
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
  // Alerte qualité : sur 2015-2021 « soc » (paiements des sociétés) et « etat » (recettes
  // déclarées par l'État) restent du même ordre de grandeur (ratio < x2), ce qui est
  // attendu pour une réconciliation ; sur les exercices suivants, « soc » explose sans
  // que la source de l'écart n'ait pu être confirmée à ce jour — on ne masque pas ces
  // valeurs (elles restent affichées, ne rien cacher) mais on avertit explicitement
  // le lecteur plutôt que de les laisser passer pour un écart réel (retour audit, 7 sept. 2026).
  const g1w=$('#g1Warn');
  if(g1w){
    const susp=AGG.recon_year.filter(d=>d.etat>0&&(d.soc/d.etat)>5).map(d=>d.annee);
    g1w.innerHTML=susp.length?`<div class="msg warn" style="margin-top:8px">⚠ Donnée expérimentale — non validée pour ${susp.join(', ')} : le montant « paiements des sociétés » y dépasse de plus de 5× les recettes déclarées par l'État, un écart improbable qui indique très probablement une erreur d'unité ou d'agrégation en amont plutôt qu'un véritable écart de réconciliation. Les chiffres bruts restent affichés ci-dessus par souci de transparence, mais ne doivent pas être interprétés comme un écart réel tant que la source n'est pas confirmée.</div>`:'';
  }
  cBar($('#g2'),AGG.flux2023.map(f=>({label:f.flux.replace(/\s*\(.*$/,''),value:f.etat})),css('--sky'),true);
  cBar($('#g3'),AGG.top_social.map(d=>({label:d.nom,value:d.total})),css('--amber'),true);
  cTreemap($('#g4'),[{label:'Cuivre',value:O.cuivre_val},{label:'Cobalt',value:O.cobalt_val},{label:'Diamant',value:O.diamant_val||O.diamant_c*10625},{label:'Pétrole',value:O.petrole*1e0}].filter(x=>x.value));
  if(AGG.export_produit)cBar($('#g5'),AGG.export_produit,css('--teal'),true);
  if(AGG.effectif_annee)cBar($('#g6'),AGG.effectif_annee.map(d=>({label:String(d.annee),value:d.value})),css('--violet'),false);
}
function bindViz(){
  const genPresent=!!$('#vzDs');
  if(genPresent){
    $('#vzDs').onchange=e=>{vizState.ds=e.target.value;vizState.dim='';vizState.measure='';fillViz();};
    $('#vzDim').onchange=e=>{vizState.dim=e.target.value;renderVizTypes();};
    $('#vzMeasure').onchange=e=>{vizState.measure=e.target.value;applyMeasureSemantics();renderVizTypes();};
    $('#vzAgg').onchange=e=>{vizState.agg=e.target.value;drawViz();};
    $('#vzCsv').onclick=()=>{const measure=vizState.measure==='__count__'?null:vizState.measure;const agg=vizState.measure==='__count__'?'count':vizState.agg;const data=aggregate(vizState.ds,vizState.dim,measure,agg,globalYear);const csv=[[vizState.dim,agg].join(';')].concat(data.map(r=>[r.label,r.value].join(';'))).join('\n');saveFile('visualisation.csv',csv);};
    const vzShareBtn=$('#vzShare');if(vzShareBtn)vzShareBtn.onclick=()=>copyShareLink(vzShareBtn);
    fillViz();
  }
  drawGallery();
}

/* Model */
// ===== Classement architecture de l'entrepôt (audit qualité, sept. 2026) =====
// La page « Modèle de données » distinguait jusqu'ici seulement 3 valeurs de
// d.cat (faits/contextuel/tout le reste) et repliait tout le reste sur
// l'étiquette « Dimension » — ce qui faisait passer des annexes brutes, des
// entrepôts consolidés et des produits d'analyse (recommandations, synthèses
// d'exigence…) pour de simples tables de dimension. datasetKind() distingue
// 7 catégories d'architecture entrepôt, à partir de d.cat ET du nom de la
// table (certaines familles de noms sont plus fiables que le seul d.cat).
const KIND_LABELS={
  source:'Source brute',
  referentiel:'Référentiel',
  dimension:'Dimension',
  fait:'Fait',
  entrepot:'Entrepôt consolidé',
  analytique:'Produit analytique',
  vue:'Vue calculée'
};
function datasetKind(name,d){
  const cat=d&&d.cat;
  if(name.startsWith('_'))return 'vue';                                    // _dictionnaire, _qualite
  if(cat==='annexe'||name.startsWith('annexe_'))return 'source';           // annexes brutes déclarées telles quelles
  if(name.includes('ref_'))return 'referentiel';                          // ref_canoniques, ref_entites_infranationales
  if(cat==='faits'||name.startsWith('fait_'))return 'fait';
  if(cat==='Entrepôt consolidé 2007-2023'||name.startsWith('regie_')||name.startsWith('ent_'))return 'entrepot';
  // « contextuel » regroupe des tables de contexte ITIE 2023 dérivées des
  // annexes (dépenses sociales, effectifs, exportations…) : ce sont des
  // produits assemblés pour l'analyse thématique, pas des tables de
  // dimension au sens entrepôt — l'audit cite justement les recommandations
  // comme exemple de produit analytique à ne pas confondre avec une
  // dimension ; on applique la même lecture aux autres tables ctx_*/cadrage_*.
  if(cat==='Analyse par exigence ITIE 2023'||name.startsWith('ana_')||cat==='contextuel')return 'analytique';
  return 'dimension';                                                      // dim_*, et repli par défaut (rare, à surveiller)
}
window.datasetKind=datasetKind;window.KIND_LABELS=KIND_LABELS;
function mModel(){
  const names=visibleTableNames().filter(k=>!k.startsWith('_'));
  const cards=names.map(k=>{const d=DS[k];const kind=datasetKind(k,d);
    return `<div class="tc"><div class="tct"><h4>${esc(d.label)}</h4><span class="tag ${kind}">${esc(KIND_LABELS[kind])}</span></div>
    <div class="tn">${esc(k)} · ${fmtN(d.rows.length)} lignes · ${d.cols.length} colonnes</div><p>${esc(d.desc)}</p>
    <div class="open" data-openex="${k}">Explorer cette table →</div></div>`;}).join('');
  const nT=names.length,nR=names.reduce((a,k)=>a+DS[k].rows.length,0);
  return `<div class="phead"><div class="eyebrow">Architecture</div><h1>Modèle de données</h1><p data-edit="intros.model">${esc(C.intros.model)}</p><p>${fmtN(nR)} lignes réparties sur ${nT} tables${editing?' (y compris les tables techniques, visibles uniquement en mode administrateur)':''}.</p>
    <p class="kindlegend">7 familles de tables composent l'entrepôt : les <b>sources brutes</b> reprennent les annexes déclarées telles quelles ; les <b>référentiels</b> harmonisent les libellés et codes ; les <b>dimensions</b> et les <b>faits</b> forment le modèle en étoile ; les <b>entrepôts consolidés</b> agrègent et dédoublonnent plusieurs exercices ; les <b>produits analytiques</b> répondent à une exigence ITIE (couverture, recommandations, synthèses) ; les <b>vues calculées</b> décrivent l'entrepôt lui-même (dictionnaire, qualité).</p></div>
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
  return `<div class="phead"><div class="eyebrow">Documents</div><h1>Rapports &amp; publications</h1><p data-edit="intros.reports">${esc(C.intros.reports)}</p></div>${chips}<div class="msg warn" style="display:block;margin-bottom:12px">Certains liens vers itierdc.net peuvent être temporairement inaccessibles (site source) — réessayez plus tard ou consultez eiti.org.</div><div class="reports" id="repList"></div>`;}
// Un lien qui pointe vers une page de listing générique (ex. ".../rapports/"
// sans nom de fichier) n'est pas un téléchargement direct : l'étiqueter
// « ↓ Télécharger » induit en erreur (audit sept. 2026 : deux rapports de
// catégories différentes pointant tous deux vers la même page générique du
// site source). On distingue donc le libellé selon la forme de l'URL plutôt
// que de prétendre à un fichier précis qu'on ne peut pas garantir.
function isGenericListingUrl(u){return /\/(rapports|publications)\/?$/i.test(String(u||'').split(/[?#]/)[0]);}
function renderReports(){const list=$('#repList');if(!list)return;
  const rs=C.reports.filter(r=>repFilter==='all'||r.categorie===repFilter).sort((a,b)=>String(b.annees_couvertes).localeCompare(String(a.annees_couvertes)));
  list.innerHTML=rs.map(r=>{const url=r.url&&r.url!=='#'?r.url:null;const generic=url&&isGenericListingUrl(url);
    const linkHtml=url?(generic?`<br><a class="dl" href="${esc(url)}" target="_blank" rel="noopener">↗ Voir sur le site source (${esc((r.format||'pdf').toUpperCase())})</a>`:`<br><a class="dl" href="${esc(url)}" target="_blank" rel="noopener">↓ Télécharger (${esc((r.format||'pdf').toUpperCase())})</a>`):'';
    return `<div class="rep"><div class="yr">${esc(r.annees_couvertes||'')}</div><div><div class="t">${esc(r.titre)}</div><span class="cat">${esc(CATS[r.categorie]||r.categorie)}</span>${linkHtml}</div></div>`;}).join('')||`<div class="empty">Aucun rapport dans cette catégorie.</div>`;}

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
      <div class="card" style="margin-bottom:16px"><h3 style="margin-bottom:10px">Gouvernance des données</h3>
        <div style="font-size:13px;color:var(--ink-soft);line-height:2">
          <div>Dernière actualisation : <b data-edit="about.derniere_maj">${esc(A.derniere_maj||WH.generated||'à renseigner')}</b></div>
          <div>Version de l'entrepôt : <b data-edit="about.version_entrepot">${esc(A.version_entrepot||'à renseigner')}</b></div>
          <div>Licence de réutilisation : <span data-edit="about.licence">${esc(A.licence)}</span></div>
        </div>
        ${editing?'<div style="font-size:11.5px;color:var(--ink-soft);margin-top:8px">Ces champs sont visibles publiquement — à tenir à jour à chaque nouvel import de données.</div>':''}
      </div>
      <div class="card" style="margin-bottom:16px"><h3 style="margin-bottom:10px">Journal des modifications</h3>
        <div style="font-size:12.5px;color:var(--ink-soft);line-height:1.7">
          ${CHANGELOG.map(c=>`<div style="padding:7px 0;border-bottom:1px dashed var(--line)"><b class="mono" style="color:var(--navy)">${esc(c.date)}</b> — ${esc(c.txt)}</div>`).join('')}
        </div>
        <div style="font-size:11px;color:var(--ink-faint);margin-top:8px">Journal tenu manuellement pour tracer les corrections apportées à l'entrepôt (doublons, encodage, libellés…) — voir aussi la « Version de l'entrepôt » ci-dessus.</div>
      </div>
      <details class="srcdetails"><summary>Sources techniques (API)</summary>
        <div class="srcs" style="margin-top:10px">${C.sources.map(s=>`<div class="src"><span class="d"></span><div><b>${esc(s.libelle)}</b><br><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a></div></div>`).join('')}</div>
      </details>
    </div>
  </div>`;}
const CHANGELOG=[
  {date:'2026-09-09',txt:"Suite à un retour utilisateur (« il est anormal que certaines tables aient des données manquantes pour 2022 et 2023 alors que les annexes sont très riches »), deux actions : (1) 113 annexes officielles brutes du Rapport ITIE-RDC 2022/2023 (sur 117), jusqu'ici classées par erreur dans l'espace technique et donc invisibles au public alors qu'elles existaient déjà dans l'entrepôt, sont désormais publiées dans leurs rubriques thématiques (Production et exportations, Dépenses sociales et environnementales, Cadre légal/licences, Entreprises publiques, Propriété effective, Transferts infranationaux, Paiements et recettes, Réconciliation, Rapports/méthodologie, Contribution économique) ; (2) 2022 et 2023 ont été intégrés, à partir de ces mêmes annexes réelles, dans les tableaux normalisés « Production », « Exportations », « Propriété effective » et « Effectifs / emploi » (2022 seulement pour ce dernier — voir sa note de qualité). Pour les tableaux composites plus anciens dont la structure de colonnes n'est plus documentée de façon fiable (Dépenses sociales, Dépenses environnementales, Structure du capital, Transactions de troc, Participation publique, Paiements infranationaux « régies », Prêts & subventions), aucune correspondance incertaine n'a été forcée : chacun indique désormais dans sa note de qualité pourquoi 2022/2023 n'y figurent pas et renvoie vers l'annexe source réelle, désormais publique, où consulter les chiffres. Par ailleurs, le texte d'introduction de la page « Géographie de l'extraction », jugé trop dense, a été condensé (les précisions méthodologiques restent disponibles dans un bloc dépliable)."},
  {date:'2026-09-08',txt:"Premier volet de l'audit d'optimisation du 8 sept. 2026 (confiance/traçabilité + recherche transversale, menés en parallèle) : (1) chaque tableau public affiche désormais un bouton « Source & traçabilité » ouvrant sa fiche complète — source (avec liens cliquables), périmètre, désagrégation, date de dernière synchronisation de l'entrepôt et repère technique du fichier importé ; (2) la barre de recherche de l'en-tête devient une vraie recherche transversale (entreprises, entités perceptrices/régies, flux, provinces, exercices, rapports et exigences ITIE 2023, avec suggestions en direct) — choisir une entreprise/régie/flux/province affiche désormais la liste réelle des tableaux publics où elle apparaît (au lieu de présélectionner un seul tableau), et un exercice ou une exigence ITIE renvoie directement vers les tableaux ou la rubrique correspondante ; (3) nouvelle table technique `ref_identifiants_stables` (2 191 lignes) attribuant un identifiant de navigation stable à chaque entreprise/régie/flux/province déjà recensés dans les référentiels canoniques existants — à ne pas confondre avec un numéro d'immatriculation officiel (RCCM, Id-Nat…). Restent à traiter dans les prochains volets : performance du chargement initial, export CSV/XLSX des vues filtrées, matrice de conformité par exigence ITIE, et ergonomie du menu/mobile (voir README, « Feuille de route »)."},
  {date:'2026-09-08',txt:"Ajout du registre des contrats et licences extractifs (Exigence ITIE 2.4) dans « Cadre légal, licences et contrats » : 756 contrats miniers, pétroliers, gaziers et fonciers/forestiers publiés par le Resource Contracts Portal (NRGI/CCSI, resourcecontracts.org, snapshot du 8 septembre 2026), avec fiche par contrat (catégorie, type, ressource, année et date de signature, langue, lien vers le texte intégral), recherche et filtres (catégorie, ressource, période), pagination, et mise en évidence des 43 contrats signés depuis le 1er janvier 2021 relevant du champ obligatoire de l'Exigence 2.4. Les 252 contrats sans date de signature complète dans la source sont signalés tels quels plutôt que masqués ou complétés par une valeur devinée. Le tableau brut des 756 lignes reste consultable intégralement depuis cette page."},
  {date:'2026-09-08',txt:"Cahiers des charges : remplacement du simple tableau brut par une vue dédiée dans « Dépenses sociales et environnementales » (28 fiches entreprise avec identité, titre minier, chronogramme et budget, et pour chacune la liste dépliable de ses projets — secteur, description complète, montant), avec recherche par entreprise et filtres par feuille source / secteur ; les deux tableaux bruts restent consultables intégralement depuis cette page."},
  {date:'2026-09-08',txt:"Ajout des cahiers des charges des entreprises minières (résumé mai 2022) : deux nouvelles tables publiques dans la rubrique « Dépenses sociales et environnementales » — synthèse par entreprise (28 lignes, 2 feuilles source) et détail des 122 projets engagés (secteur, description complète, montant estimé) — ainsi que deux nouvelles couches cartographiques dans Géographie (entreprises engagées et budget engagé, Haut-Katanga, 2021). La feuille source « LUALABA » du document, qui déclare elle-même « Province : Haut-Katanga » et recoupe les données de MMG Kinsevere, est publiée telle quelle mais exclue des agrégats géographiques pour éviter un double comptage."},
  {date:'2026-09-07',txt:"Réorganisation complète de l'entrepôt selon les thèmes et exigences de la Norme ITIE 2023 : les 181 tables sont désormais réparties en 10 rubriques publiques (cadre légal/licences, propriété effective, entreprises publiques, production/exportations, paiements/recettes, réconciliation, transferts infranationaux, dépenses sociales/environnementales, contribution économique, rapports/méthodologie) et un espace technique réservé au profil administrateur (annexes brutes, référentiels, 128 tables), sans suppression de données. Chaque table publique affiche désormais période, unité, devise, source, périmètre, désagrégation et statut de qualité."},
  {date:'2026-09-07',txt:"Correction d'un double comptage dans les revenus par entité (76 lignes de sous-total additionnées en trop, ex. DGI 2022 : 17,25 Md → 10,29 Md USD) ; réparation de l'encodage (471 cellules) et des dates 1905 issues d'un import Excel défectueux (79 valeurs, remplacées par une valeur manquante plutôt que devinées) ; fusion des libellés dupliqués de communes/secteurs/chefferies (22 cas, ex. « COMMUNE DE SHITURU » / « Commune de Shituru ») dans la Géographie ; ajout d'un avertissement sur le graphique « écart » de réconciliation pour les exercices où le montant paru est incohérent ; colonnes par défaut recentrées sur les montants définitifs/certifiés."},
  {date:'2026-09-06',txt:"Retour à une vue unique et simplifiée (abandon d'un mode Public/Expert à deux espaces) ; limitation des tableaux à 7 colonnes par défaut avec option « Afficher toutes les colonnes » ; passe accessibilité et mobile (navigation clavier, contraste, alternative textuelle aux graphiques)."},
];

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
  const qNames=visibleTableNames();
  const qCiTable=DS._qualite.cols.indexOf('table');
  const q=DS._qualite.rows.filter(r=>qCiTable<0||qNames.includes(r[qCiTable]));             // [table,label,cat,rows,cols,miss%]
  const totRows=qNames.filter(k=>!k.startsWith('_')).reduce((a,k)=>a+DS[k].rows.length,0);
  const avgMiss=(editing&&window.__missWeighted!=null?window.__missWeighted:(q.length?q.reduce((a,r)=>a+r[5],0)/q.length:0)).toFixed(1);
  const cl=WH.clean||{dedup:{},sentinels:{},dropped_cols:{}};
  const dupTot=Object.values(cl.dedup||{}).reduce((a,b)=>a+b,0);
  const sentTot=Object.values(cl.sentinels||{}).reduce((a,s)=>a+(String(s).match(/\d+/g)||[]).reduce((x,y)=>x+ +y,0),0);
  const negExp=countNeg('ctx_exportation',['Valeur_totale','Quantite_totale']), negProd=countNeg('ctx_production',['Valeur_totale','Quantite_totale']);
  return `<div class="phead"><div class="eyebrow">Gouvernance</div><h1>Qualité des données</h1><p data-edit="intros.qualite">${esc(C.intros.qualite)}</p><p>Dernière actualisation : <b>${esc(WH.generated||'2026')}</b>.</p></div>
  <div class="kpis">
    <div class="kpi"><div class="v">${qNames.filter(k=>!k.startsWith('_')).length}</div><div class="l">Tables</div></div>
    <div class="kpi"><div class="v">${fmtN(totRows)}</div><div class="l">Lignes</div></div>
    <div class="kpi"><div class="v">${avgMiss}%</div><div class="l">Cellules manquantes (pondéré)</div></div>
    <div class="kpi"><div class="v">${fmtN(dupTot)}</div><div class="l">Doublons exacts retirés</div></div>
    <div class="kpi"><div class="v">${fmtN(sentTot)}</div><div class="l">Dates sentinelles 1900 → nulles</div></div>
    <div class="kpi"><div class="v">${negExp+negProd}</div><div class="l">Valeurs négatives signalées</div></div>
  </div>
  <div class="grid2">
    <div class="card"><div class="ch"><h3>Complétude par table</h3><span class="badge">% renseigné</span></div><div class="sub">100 % − taux de cellules manquantes</div><div class="chart" id="q1" aria-label="Complétude par table, pourcentage de cellules renseignées"></div></div>
    <div class="card"><div class="ch"><h3>Doublons exacts retirés par table</h3></div><div class="sub">Lignes identiques supprimées à l'intégration</div><div class="chart" id="q2" aria-label="Doublons exacts retirés par table lors de l’intégration"></div></div>
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
  const qNames=visibleTableNames();
  const qCiTable=DS._qualite.cols.indexOf('table');
  const q=DS._qualite.rows.filter(r=>qCiTable<0||qNames.includes(r[qCiTable])).slice().sort((a,b)=>a[5]-b[5]);
  cBar($('#q1'),q.map(r=>({label:r[1],value:+(100-r[5]).toFixed(1)})),css('--green'),true);
  const cl=WH.clean||{dedup:{}};
  const dd=Object.entries(cl.dedup||{}).filter(([k])=>qNames.includes(k)).map(([k,v])=>({label:(DS[k]?DS[k].label:k),value:v})).sort((a,b)=>b.value-a.value);
  cBar($('#q2'),dd,css('--red'),true);
}
/* Dictionnaire de données */
let dictQ='';
function mDict(){
  const names=visibleTableNames().filter(k=>!k.startsWith('_'));
  const ciTable=DS._dictionnaire.cols.indexOf('table');
  const nCols=ciTable>=0?DS._dictionnaire.rows.filter(r=>names.includes(r[ciTable])).length:DS._dictionnaire.rows.length;
  return `<div class="phead"><div class="eyebrow">Métadonnées</div><h1>Dictionnaire de données</h1><p data-edit="intros.dict">${esc(C.intros.dict)}</p><p>${fmtN(nCols)} colonnes documentées sur ${names.length} tables${editing?' (y compris les tables techniques)':''}.</p></div>
    <div class="extoolbar"><div class="exsearch"><span class="si" aria-hidden="true">⌕</span><input id="dictQ" placeholder="Rechercher une table ou une colonne…" value="${esc(dictQ)}" aria-label="Rechercher une table ou une colonne"></div><button class="btn" id="dictCsv">↓ Export CSV</button></div>
    <div class="gridwrap"><div class="gridscroll"><table class="dg" id="dictTable"></table></div></div>`;}
function renderDict(){
  const t=$('#dictTable');if(!t)return;const d=DS._dictionnaire;const q=stripAccents(dictQ).toLowerCase();
  const visNames=visibleTableNames();
  const ciTableF=d.cols.indexOf('table');
  let rows=d.rows.filter(r=>ciTableF<0||visNames.includes(r[ciTableF]));
  rows=rows.filter(r=>!q||r.some(v=>stripAccents(v).toLowerCase().includes(q)));
  // La colonne « categorie » du dictionnaire (data/warehouse.seed.json) a été
  // générée avec l'ancienne classification à 3 valeurs (Fait/Contextuel/
  // Dimension) : on la ré-affiche ici à la volée avec datasetKind() plutôt
  // que de retoucher le fichier de données figé.
  const ciTable=d.cols.indexOf('table'),ciCat=d.cols.indexOf('categorie');
  t.innerHTML=`<thead><tr>${d.cols.map(c=>`<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0,500).map(r=>`<tr>${r.map((v,i)=>{
    if(i===ciCat&&ciTable>=0){const kind=datasetKind(r[ciTable],DS[r[ciTable]]);return `<td><span class="tag ${kind}">${esc(KIND_LABELS[kind]||v)}</span></td>`;}
    return `<td class="${d.types[i]==='num'?'num':''}">${esc(fmtCell(v,d.types[i]))}</td>`;}).join('')}</tr>`).join('')}</tbody>`;
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
    cahiers_nombre:'Cahiers de charge (nb, statut CPI)',cahiers_montant:'Cahiers de charge (dépenses sociales, $)',
    cahiers_2021_entreprises:'Cahiers de charge — entreprises engagées 2021 (résumé mai 2022)',
    cahiers_2021_budget:'Cahiers de charge — budget engagé 2021 (résumé mai 2022)',
    dep_sociale:'Dépenses sociales',dep_env:'Dépenses environ.',permis_cami:'Permis cadastre'};
  const GROUPS=[['Recettes & activité',['recettes','production','exportation','emploi']],
    ['Paiements infranationaux — 4.6 (paiements directs aux entités locales)',['infra','paiements_drp','recettes_etd','dotations_dot']],
    ['Cahiers de charge',['cahiers_nombre','cahiers_montant','cahiers_2021_entreprises','cahiers_2021_budget']],
    ['Social & environnement',['dep_sociale','dep_env']],
    ['Cadastre minier',['permis_cami']]];
  const chipHtml=GROUPS.map(([g,keys])=>{const av=keys.filter(k=>GEO.layers[k]);if(!av.length)return '';
    return `<div class="lgroup"><div class="lgttl">${g}</div><div class="lgchips">${av.map(k=>`<button class="lchip ${mapInd===k?'on':''}" data-ind="${k}">${esc(SHORT[k]||GEO.layers[k].label)}</button>`).join('')}</div></div>`;}).join('');
  return `<div class="phead"><div class="eyebrow">Territoire</div><h1>Géographie de l'extraction</h1><p data-edit="intros.geo">${esc(C.intros.geo)}</p><p>Choisissez une <b>couche</b>, une <b>année</b>, une <b>vue</b> et un <b>niveau</b> (national / province / territoire / ETD) — chaque bénéficiaire ETD/DOT apparaît en point géolocalisé.</p>
    <details class="srcdetails" style="margin-top:-4px"><summary style="font-size:12.5px;font-weight:600">ⓘ Précisions méthodologiques (paiements vs transferts infranationaux, couches « Cahiers de charge »)</summary>
      <p style="font-size:12.5px;color:var(--ink-soft);margin-top:6px"><b>Paiements infranationaux (Exigence 4.6)</b> : paiements <b>directs</b> des entreprises aux entités locales — régies provinciales (DRP), ETD (secteurs, chefferies, communes) et dotations OS DOT (0,3 %). Distincts des <b>Transferts infranationaux (Exigence 5.2)</b> : recettes perçues au niveau central puis rétrocédées aux provinces/ETD — et des dépenses sociales/environnementales (section 6.1).</p>
      <p style="font-size:12.5px;color:var(--ink-soft);margin-top:6px"><b>Couches « Cahiers de charge — 2021 (résumé mai 2022) »</b> : proviennent d'un document distinct et ne couvrent que les 14 entreprises de la feuille source « HAUT-KATANGA 2021-2025 », pas l'ensemble du pays — à ne pas confondre avec les couches « Cahiers de charge (nb, statut CPI) » et « (dépenses sociales, $) », qui viennent des annexes officielles des Rapports ITIE (2022-2023) et comptent les <i>cahiers</i> par statut d'approbation (base différente). Détail entreprise par entreprise et projet par projet dans « Dépenses sociales et environnementales ».</p>
    </details></div>
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
            <span style="margin-left:auto;display:inline-flex;gap:6px;align-items:center">Molette : zoom · glisser : déplacer <button class="btn" id="mapZoomOut" style="padding:4px 11px;font-size:14px;line-height:1" aria-label="Dézoomer la carte" title="Dézoomer">−</button><button class="btn" id="mapZoomIn" style="padding:4px 11px;font-size:14px;line-height:1" aria-label="Zoomer la carte" title="Zoomer">+</button><button class="btn" id="mapReset" style="padding:4px 10px">Réinitialiser</button><button class="btn" id="mapFull" style="padding:4px 10px" aria-label="Afficher la carte en plein écran" title="Afficher la carte en plein écran">⛶ Plein écran</button></span>
          </div>
        </div>
        <div id="mapPanel"></div>
      </div>
    </div>`:''}
    <div class="card" style="margin-bottom:18px"><div class="ch"><h3>Recettes nationales par régie perceptrice</h3><span class="badge" id="geoNatRegieBadge"></span></div>
      <div class="sub">DGI, DGRAD, DGDA, Trésor public, SGH, CAMI, FOMIN, FONAREV, OCC, CEEC, BCC… — Montant normalisé (USD), lignes de sous-total exclues. Suit le sélecteur Année/Évolution ci-dessus (indépendant de la couche cartographique choisie).</div>
      <div class="chart" id="geoNatRegie" aria-label="Recettes nationales par régie perceptrice"></div></div>
    <div class="grid2">
      <div class="card"><div class="ch"><h3 id="geoRankTitle">Classement des provinces</h3></div><div class="sub" id="geoRankSub"></div><div class="chart" id="geoRank" aria-label="Classement des provinces"></div></div>
      <div class="card"><div class="ch"><h3>Évolution nationale de l'indicateur</h3></div><div class="sub">Somme sur toutes les provinces couvertes, par année</div><div class="chart" id="geoEvo" aria-label="Évolution nationale de l'indicateur, somme sur toutes les provinces couvertes"></div></div>
    </div>
    <div class="card" style="margin-top:18px"><div class="ch"><h3>Paiements infranationaux — détail par entité perceptrice (DRP · ETD · DOT)</h3><span class="badge">Exigence ITIE 4.6</span></div>
      <div class="sub">Paiements <b>directs</b> des entreprises extractives aux entités locales, ventilés par exercice, province, type d'entité perceptrice (régie provinciale DRP, ETD — secteur/chefferie/commune, dotation OS DOT 0,3 %) et montant. Total infranational 2023 : 801,7 M USD (DRP 532,8 · ETD 165,1 · DOT 103,9), somme du détail des annexes. Le tableau de synthèse officiel (Tableau 60) affiche 797,7 M USD ; l’écart d’environ 4 M provient des paiements pétroliers perçus au Kongo Central (DGR-KC). <b>Note :</b> les variantes de casse/orthographe d'un même nom d'ETD (ex. « COMMUNE DE SHITURU » / « Commune de Shituru ») sont regroupées sous un libellé unique, mais une même entité déclarée sous des provinces différentes selon l'exercice (rare, ex. « Commune de Shituru » rattachée au Haut-Katanga la plupart des années et, ponctuellement, au Lualaba) n'est <b>pas</b> réattribuée d'office : la province déclarée dans la source est conservée telle quelle par souci de traçabilité, même quand elle semble incohérente d'une année à l'autre.</div>
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
  const nrHost=$('#geoNatRegie');
  if(nrHost){
    const y=mapEvo?null:curYear();
    const badge=$('#geoNatRegieBadge');if(badge)badge.textContent=y?String(yearVal(y)||y):'Toutes années (cumul)';
    cBar(nrHost,nationalRegieBreakdown(y),css('--teal'),true);
  }
  const d=LY();
  const rt=$('#geoRankTitle');if(rt)rt.textContent='Classement des provinces';
  const rs=$('#geoRankSub');if(rs&&d)rs.textContent=d.label+' · '+(mapEvo?'cumul':curYear()||'');
  const rankHost=$('#geoRank');if(rankHost&&d)rankHost.setAttribute('aria-label','Classement des provinces — '+d.label);
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
  const TNAME='ctx_paiement_infranational_detail';
  const t=DS[TNAME];
  if(!t){host.innerHTML='<div class="empty" style="padding:16px">Données détaillées indisponibles.</div>';return;}
  const ci={};t.cols.forEach((c,i)=>ci[c]=i);
  // Province / entité perceptrice / entreprise / flux sont canonicalisées ici
  // exactement comme dans l'Explorateur (mêmes référentiels `ref_canoniques`
  // et `GEO.prov_ref`), afin que cette table de la page Géographie ne réaffiche
  // pas les variantes brutes de casse/accents déjà nettoyées ailleurs
  // (audit qualité, sept. 2026).
  const dimProv=canonDimFor(TNAME,'province'),dimPerc=canonDimFor(TNAME,'percepteur'),dimEnt=canonDimFor(TNAME,'entreprise'),dimFlux=canonDimFor(TNAME,'flux');
  const cv=(r,col,dim)=>{const raw=r[ci[col]];return dim?canonicalize(dim,raw):raw;};
  const F=infraF;
  const match=(r,except)=>{
    return (except==='annee'||!F.annee||String(r[ci.annee])===F.annee)
      &&(except==='type'||!F.type||r[ci.type_percepteur]===F.type)
      &&(except==='prov'||!F.prov||cv(r,'province',dimProv)===F.prov)
      &&(except==='perc'||!F.perc||cv(r,'percepteur',dimPerc)===F.perc)
      &&(except==='ent'||!F.ent||cv(r,'entreprise',dimEnt)===F.ent)
      &&(except==='flux'||!F.flux||cv(r,'flux',dimFlux)===F.flux);};
  const opts=(field,col)=>[...new Set(t.rows.filter(r=>match(r,field)).map(r=>r[ci[col]]))].filter(v=>v!=null&&v!=='').sort();
  const optsCanon=(field,col,dim)=>[...new Set(t.rows.filter(r=>match(r,field)).map(r=>cv(r,col,dim)))].filter(v=>v!=null&&v!=='').sort();
  const anneeOpts=opts('annee','annee').map(String);
  const typeOpts=opts('type','type_percepteur');
  const provOpts=optsCanon('prov','province',dimProv);
  const percOpts=optsCanon('perc','percepteur',dimPerc);
  const entOpts=optsCanon('ent','entreprise',dimEnt);
  const fluxOpts=optsCanon('flux','flux',dimFlux);
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
  const canonVals=r=>({annee:r[ci.annee],type_percepteur:r[ci.type_percepteur],
    province:cv(r,'province',dimProv),percepteur:cv(r,'percepteur',dimPerc),
    entreprise:cv(r,'entreprise',dimEnt),flux:cv(r,'flux',dimFlux)});
  // Valeurs brutes (telles que déclarées) conservées à part, pour affichage
  // côte à côte avec la valeur canonique (audit qualité, sept. 2026 :
  // « il faut présenter deux colonnes clairement séparées »). Un groupe
  // canonique peut réunir plusieurs libellés bruts (ex. « DRLU » et
  // « Direction des recettes de Lualaba (DRLU) ») : on les liste tous.
  const CANON_KEYS=['province','percepteur','entreprise','flux'];
  const agg={};
  for(const r of rows){const vals=canonVals(r);const k=keys.map(c=>vals[c]).join('¦');
    if(!agg[k]){agg[k]={mt:0,ent:new Set(),perc:new Set(),flux:new Set(),vals:{},raws:{}};keys.forEach(c=>agg[k].vals[c]=vals[c]);CANON_KEYS.forEach(c=>agg[k].raws[c]=new Set());}
    agg[k].mt+=Number(r[ci.montant_usd])||0;agg[k].ent.add(vals.entreprise);agg[k].perc.add(vals.percepteur);agg[k].flux.add(vals.flux);
    CANON_KEYS.forEach(c=>{const raw=r[ci[c]];if(raw!=null&&raw!=='')agg[k].raws[c].add(String(raw));});}
  const list=Object.values(agg).sort((a,b)=>b.mt-a.mt);
  const tot=list.reduce((a,x)=>a+x.mt,0);
  const bytype={};for(const r of rows){const ty=r[ci.type_percepteur];bytype[ty]=(bytype[ty]||0)+(Number(r[ci.montant_usd])||0);}
  const typeChips=Object.entries(bytype).sort((a,b)=>b[1]-a[1]).map(([ty,v])=>`<span class="itc" style="display:inline-flex;flex-direction:column;padding:6px 12px;background:var(--panel);border:1px solid var(--line);border-radius:8px"><span style="font-size:10px;color:var(--ink-soft)">${esc(ty)}</span><b style="font-family:'IBM Plex Mono';font-size:13px;color:var(--sky)">${fmtUSD(v)}</b></span>`).join('');
  const tc=v=>`<span style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:600;background:${/Dotation/.test(v)?'rgba(244,197,24,.18)':/ETD/.test(v)?'rgba(0,101,175,.12)':'var(--panel)'};color:${/Dotation/.test(v)?'var(--amber)':/ETD/.test(v)?'var(--sky)':'var(--ink-soft)'};border:1px solid var(--line)">${esc(v)}</span>`;
  // column model per grouping — chaque colonne "canonique" (province,
  // percepteur, entreprise, flux) est suivie d'une colonne "brute" listant
  // le·s libellé·s original·aux réunis dans ce regroupement, pour que la
  // traçabilité avec les annexes déclarées reste visible (jamais de
  // fusion silencieuse — voir README, « Référentiels canoniques »).
  const CANON_SET=new Set(CANON_KEYS);
  const withRaw=arr=>arr.reduce((out,c)=>{out.push(c);if(CANON_SET.has(c[1]))out.push([c[0]+' (brute)','_raw_'+c[1]]);return out;},[]);
  const COLS={
    perc:withRaw([['Année','annee'],['Province','province'],['Type','type_percepteur',tc],['Entité perceptrice','percepteur'],['Entrep.','_nent'],['Montant (USD)','mt']]),
    ent:withRaw([['Année','annee'],['Entreprise','entreprise'],['Entités perç.','_nperc'],['Flux','_nflux'],['Montant (USD)','mt']]),
    flux:withRaw([['Année','annee'],['Flux','flux'],['Entrep.','_nent'],['Montant (USD)','mt']]),
    entflux:withRaw([['Année','annee'],['Entreprise','entreprise'],['Flux','flux'],['Montant (USD)','mt']]),
    etd:withRaw([['Province','province'],['Entité perceptrice','percepteur'],['Entrep.','_nent'],['Flux','_nflux'],['Montant (USD)','mt']]),
    full:withRaw([['Année','annee'],['Province','province'],['Type','type_percepteur',tc],['Entité perceptrice','percepteur'],['Entreprise','entreprise'],['Flux','flux'],['Montant (USD)','mt']])};
  const cols=COLS[G]||COLS.perc;
  const cellVal=(x,key)=>{
    if(key==='mt')return fmtUSD(x.mt);if(key==='_nent')return x.ent.size;if(key==='_nperc')return x.perc.size;if(key==='_nflux')return x.flux.size;
    if(key.startsWith('_raw_')){const c=key.slice(5);const s=x.raws&&x.raws[c];if(!s||!s.size)return '';const arr=[...s];return arr.length>1?arr.slice(0,3).join(' / ')+(arr.length>3?'…':''):arr[0];}
    return x.vals[key];};
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
      <button class="btn" id="ifShare" title="Copier un lien reproduisant cette vue">🔗 Copier le lien</button>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">${typeChips||'<span style="font-size:12px;color:var(--ink-faint)">Aucune ligne pour ces filtres.</span>'}</div>
    <div style="max-height:440px;overflow:auto;border:1px solid var(--line);border-radius:8px">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr>${cols.map((c,i)=>`<th class="${/^_raw_/.test(c[1])?'canoncol':''}" style="position:sticky;top:0;background:var(--panel-2);text-align:${c[1]==='mt'||/^_n/.test(c[1])?'right':'left'};padding:7px 9px;border-bottom:1px solid var(--line);font-size:11px;color:var(--navy);white-space:nowrap">${c[0]}</th>`).join('')}</tr></thead>
    <tbody>${shown.map(x=>`<tr>${cols.map(c=>{const raw=cellVal(x,c[1]);const disp=c[2]?c[2](raw):(c[1]==='mt'?raw:esc(String(raw==null?'':raw)));const right=c[1]==='mt'||/^_n/.test(c[1]);const isRaw=/^_raw_/.test(c[1]);return `<td class="${isRaw?'canoncol':''}" style="padding:5px 9px;border-bottom:1px solid var(--line);text-align:${right?'right':'left'};${c[1]==='mt'?"font-family:'IBM Plex Mono';font-weight:600":''}${/^_n/.test(c[1])?';color:var(--ink-faint)':''}">${disp}</td>`;}).join('')}</tr>`).join('')}
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
  const ifShareBtn=$('#ifShare');if(ifShareBtn)ifShareBtn.onclick=()=>copyShareLink(ifShareBtn);
  syncURL();
}
/* ===== Colonnes par défaut de l'Explorateur (audit qualité, sept. 2026) =====
   pickDefaultCols() choisit, pour une table donnée, jusqu'à `max` colonnes à
   afficher par défaut — dimensions/montants additionnables en priorité,
   colonnes techniques (identifiants, pages) en dernier recours — pour que
   l'Explorateur reste lisible pour un citoyen sans cacher aucune donnée
   (« Afficher toutes les colonnes » reste toujours disponible). */
// Certaines tables (réconciliation notamment) déclinent un même montant en
// plusieurs colonnes : valeur initiale déclarée, ajustement, écart, puis
// valeur finale retenue. Le lecteur citoyen ne veut voir que ce dernier
// chiffre définitif, pas les étapes intermédiaires du calcul (retour
// utilisateur, sept. 2026 : « le lecteur veut voir un chiffre unique de
// paiement, le chiffre définitif ») — ces colonnes intermédiaires sont donc
// reléguées en dernier, et une colonne « finale/définitive » est priorisée.
const INTERMEDIATE_COL_RE=/initial|ajustement|difference|différence|ecart|écart/i;
const FINAL_COL_RE=/final|définitif|definitif|certifi/i;
function pickDefaultCols(name,max){
  max=max||7;
  const d=DS[name];if(!d)return [];
  const tierFinal=[],tier1=[],tier2=[],tierIntermediate=[],tier3=[];
  d.cols.forEach(c=>{const r=columnRole(name,c);
    if((r==='dimension'||r==='additive')&&FINAL_COL_RE.test(c))tierFinal.push(c);
    else if((r==='dimension'||r==='additive')&&INTERMEDIATE_COL_RE.test(c))tierIntermediate.push(c);
    else if(r==='dimension'||r==='additive')tier1.push(c);
    else if(r==='id'||r==='page')tier3.push(c);
    else tier2.push(c);});
  let chosen=tierFinal.concat(tier1).slice(0,max);
  if(chosen.length<max)chosen=chosen.concat(tier2.slice(0,max-chosen.length));
  if(chosen.length<max)chosen=chosen.concat(tierIntermediate.slice(0,max-chosen.length));
  if(chosen.length<max)chosen=chosen.concat(tier3.slice(0,max-chosen.length));
  const chosenSet=new Set(chosen);
  return d.cols.filter(c=>chosenSet.has(c)); // conserve l'ordre d'origine des colonnes
}
window.pickDefaultCols=pickDefaultCols;
// Colonnes de l'Explorateur effectivement affichées : toujours limitées à
// pickDefaultCols (≤7) par défaut, pour tout le monde, sauf si l'utilisateur
// a cliqué « Afficher toutes les colonnes » (exState.showAllCols) pour cette
// session — comportement universel, plus de bascule de mode.
function exVisibleColIdx(name){
  const d=DS[name];const allIdx=d.cols.map((_,i)=>i);
  if(exState.showAllCols)return allIdx;
  const chosen=new Set(pickDefaultCols(name,7));
  const idx=allIdx.filter(i=>chosen.has(d.cols[i]));
  return idx.length?idx:allIdx;
}

const THEME_NAV_ICONS={cadre_licences:'⚖',propriete:'◉',entreprises_publiques:'🏛',production_export:'⛏',
  paiements_recettes:'💰',reconciliation:'⇄',transferts_infra:'⇩',depenses_sociales:'❤',contribution_eco:'📈',rapports:'▦'};
const MODULES={
  overview:{t:"Vue d'ensemble",f:mOverview,d:drawOverview},
  geo:{t:"Géographie",f:mGeo,d:drawGeo},
  viz:{t:"Visualisations",f:mViz,d:bindViz},
  explorer:{t:"Explorateur (données complètes)",f:mExplorer,d:renderExplorer},
  model:{t:"Modèle de données",f:mModel,d:drawSchema},
  dict:{t:"Dictionnaire de données",f:mDict,d:renderDict},
  qualite:{t:"Qualité des données",f:mQualite,d:drawQualite},
  reports:{t:"Rapports",f:mReports,d:renderReports},
  about:{t:"À propos",f:mAbout,d:()=>{}},
};
Object.keys(THEME_INFO).forEach(k=>{if(k==='technique')return;
  MODULES[k]={t:(THEME_INFO[k]||{}).label||k,f:()=>mTheme(k),d:bindThemePage};});
// Navigation réorganisée selon les thèmes et exigences de la Norme ITIE 2023
// plutôt que selon la structure technique des tables sources (retour
// utilisateur, sept. 2026). Chaque table publique est rattachée à une seule
// rubrique ITIE et porte un bandeau de métadonnées (période, unité, devise,
// périmètre, désagrégation, source, statut qualité — voir metaStrip()).
// L'Explorateur technique (données complètes, 181 tables dont les 117
// annexes brutes) et le reste de l'« Espace technique » restent accessibles
// à tous MAIS ne listent, hors connexion administrateur, que les tables
// publiques ; aucune donnée n'est supprimée, seulement rangée par thème —
// toujours « ne rien cacher, toutes ces données sont publiques ».
const NAV=[
  {g:"Vue d'ensemble",items:[['overview','◧',"Vue d'ensemble"],['geo','◈','Géographie']]},
  {g:'Par thème ITIE',items:Object.keys(THEME_INFO).filter(k=>k!=='technique').map(k=>[k,THEME_NAV_ICONS[k]||'▪',(THEME_INFO[k]||{}).label||k])},
  {g:'Données complètes',items:[['viz','◫','Visualisations'],['explorer','▤','Explorateur'],['model','✳','Modèle de données'],['dict','▥','Dictionnaire'],['qualite','✓','Qualité des données']]},
  {g:'',items:[['reports','▦','Rapports'],['about','ⓘ','À propos']]},
];

/* ===== router / shell ===== */
let current='overview', globalYear='';
function isNavHidden(id){return id!=='overview'&&(C.nav_hidden||[]).includes(id);}
function firstVisibleModule(){for(const sec of NAV)for(const [id] of sec.items)if(!isNavHidden(id))return id;return 'overview';}
function buildSidebar(){
  $('#sidenav').innerHTML=NAV.map(sec=>{const items=sec.items.filter(([id])=>editing||!isNavHidden(id));if(!items.length)return '';
    return `${sec.g?`<div class="grp">${sec.g}</div>`:''}`+items.map(([id,ico,lab])=>`<a class="item ${isNavHidden(id)?'hiddenrub':''}" href="#${id}" data-go="${id}"><span class="ico">${ico}</span>${lab}${isNavHidden(id)?' <span class="badge" style="margin-left:auto">masquée</span>':''}</a>`).join('');
  }).join('');
  $$('#sidenav a.item').forEach(a=>{const on=a.dataset.go===current;a.classList.toggle('active',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
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
/* ===== URLs partageables =====
   Le module courant, ainsi que l'état de l'Explorateur / des Visualisations
   / du tableau détaillé de la Géographie (table, filtres, tri, recherche…),
   sont encodés dans le fragment d'adresse (#module?param=valeur…). Un lien
   copié depuis la barre d'adresse reproduit donc exactement la même vue —
   utile pour partager une analyse précise avec un collègue ou un
   journaliste (audit qualité, sept. 2026 : « les URL ne sont pas
   partageables »). On utilise history.replaceState (pas pushState) pour ne
   pas polluer l'historique de navigation à chaque frappe/filtre. */
function b64(s){try{return btoa(unescape(encodeURIComponent(s)));}catch(e){return '';}}
function unb64(s){try{return decodeURIComponent(escape(atob(s)));}catch(e){return '';}}
function currentStateParams(){
  const p=new URLSearchParams();
  if(current==='explorer'){
    if(exState.ds)p.set('table',exState.ds);
    if(exState.q)p.set('q',exState.q);
    if(exState.sort!=null){p.set('sort',exState.sort);p.set('dir',exState.dir);}
    if(exState.page)p.set('page',exState.page);
    if(globalYear)p.set('annee',globalYear);
    if(exState.filters&&Object.keys(exState.filters).length)p.set('f',b64(JSON.stringify(exState.filters)));
  }else if(current==='viz'){
    ['ds','dim','measure','agg','type'].forEach(k=>{if(vizState[k])p.set(k,vizState[k]);});
  }else if(current==='geo'&&typeof infraF==='object'){
    Object.entries(infraF).forEach(([k,v])=>{if(v)p.set(k,v);});
  }
  return p;
}
function syncURL(){
  try{
    const qs=currentStateParams().toString();
    const newHash='#'+current+(qs?'?'+qs:'');
    if(location.hash!==newHash)history.replaceState(null,'',newHash);
  }catch(e){}
}
function parseHash(){
  const h=(location.hash||'').replace('#','');
  const qi=h.indexOf('?');
  const id=qi>=0?h.slice(0,qi):h;
  return {id,params:new URLSearchParams(qi>=0?h.slice(qi+1):'')};
}
async function copyShareLink(btn){
  try{await navigator.clipboard.writeText(location.href);}catch(e){}
  if(btn){const old=btn.textContent;btn.textContent='Lien copié ✓';setTimeout(()=>{btn.textContent=old;},1400);}
}
function go(id){
  if(editing)collectEdits();
  if(!MODULES[id])id='overview';
  if(isNavHidden(id)&&!editing)id=firstVisibleModule();
  current=id;
  $('#mtitle').textContent=MODULES[id].t;
  // Si la construction du HTML de la page échoue (ex. un jeu de données
  // attendu par la page est absent), on affiche un message explicite plutôt
  // que de laisser le contenu de la page PRÉCÉDENTE affiché sous un titre/URL
  // qui, eux, ont déjà changé — symptôme confus signalé sept. 2026 sur
  // Dictionnaire/Qualité des données quand ces pages levaient une exception.
  try{$('#app').innerHTML=MODULES[id].f();}
  catch(e){console.error(e);$('#app').innerHTML=`<div class="phead"><div class="eyebrow">Erreur</div><h1>${esc(MODULES[id].t)}</h1><p>Cette page n'a pas pu s'afficher (donnée manquante ou erreur technique). Rechargez la page (Ctrl+Maj+R) ; si le problème persiste, contactez l'administrateur.</p></div>`;}
  $$('#sidenav a.item').forEach(a=>{const on=a.dataset.go===id;a.classList.toggle('active',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  // the exercise filter only applies to Explorer & Visualisations (avoids showing one year's numbers while another is selected)
  const yf=$('#yearFilter'),scoped=(id==='explorer'||id==='viz');
  yf.disabled=!scoped;yf.style.opacity=scoped?'1':'.45';
  yf.title=scoped?'Filtrer par exercice':"Le filtre par exercice s'applique à l'Explorateur et aux Visualisations";
  requestAnimationFrame(()=>{try{MODULES[id].d();}catch(e){console.error(e);}syncURL();});
  window.scrollTo({top:0});
  setSideOpen(false);
  if(editing)markEditable(true);
  syncURL();
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
  const srcBtn=e.target.closest('[data-srctable]');if(srcBtn){e.preventDefault();openSourceModal(srcBtn.dataset.srctable);return;}
  const gitem=e.target.closest('.gsug-item[data-gkind]');if(gitem){e.preventDefault();openCrossModal(gitem.dataset.gkind,gitem.dataset.glabel,gitem.dataset.gsid);return;}
  const xtgo=e.target.closest('[data-xtgo]');if(xtgo){
    e.preventDefault();hideModal('crossModal');
    exState.ds=xtgo.dataset.xtgo;exState.page=0;exState.filters={};exState.q=xtgo.dataset.xtq||'';
    if(xtgo.dataset.xtyear)globalYear=xtgo.dataset.xtyear;
    go('explorer');
    requestAnimationFrame(()=>{const yf=$('#yearFilter');if(yf&&xtgo.dataset.xtyear)yf.value=globalYear;});
    return;
  }
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
function setSideOpen(open){$('#side').classList.toggle('open',open);$('#scrim').classList.toggle('on',open);$('#burger').setAttribute('aria-expanded',open?'true':'false');}
$('#burger').onclick=()=>{setSideOpen(!$('#side').classList.contains('open'));};
$('#scrim').onclick=()=>{setSideOpen(false);};
// on mobile, picking a rubrique in the sidebar should close it (item was already
// removed from .open via go(), this also resets the burger's aria-expanded state)
document.addEventListener('click',e=>{if(e.target.closest('#sidenav a.item'))$('#burger').setAttribute('aria-expanded','false');});
$('#yearFilter').onchange=e=>{globalYear=e.target.value;if(current==='explorer')renderExplorer();else if(current==='viz')drawViz();};
// Recherche transversale : suggestions en direct pendant la saisie
// (entreprises, régies, flux, provinces, exercices, rapports, exigences
// ITIE — voir GLOBAL_SEARCH_INDEX plus haut) ; Entrée sans sélection retombe
// sur l'ancien comportement (filtre plein texte du tableau déjà ouvert dans
// l'Explorateur), pour ne rien retirer de ce qui fonctionnait déjà.
$('#globalSearch').addEventListener('input',e=>{renderGlobalSuggestions(e.target.value);});
$('#globalSearch').addEventListener('focus',e=>{if(e.target.value)renderGlobalSuggestions(e.target.value);});
$('#globalSearch').addEventListener('keydown',e=>{
  const box=$('#gsugList');
  if(e.key==='Escape'){closeGlobalSuggestions();return;}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    if(!box||!box.classList.contains('on'))return;
    e.preventDefault();
    const items=$$('.gsug-item',box);if(!items.length)return;
    let i=items.findIndex(x=>x.classList.contains('active'));
    items.forEach(x=>x.classList.remove('active'));
    i=e.key==='ArrowDown'?(i+1)%items.length:(i<=0?items.length-1:i-1);
    items[i].classList.add('active');items[i].scrollIntoView({block:'nearest'});
    return;
  }
  if(e.key==='Enter'){
    const active=box&&$('.gsug-item.active',box);
    if(active){e.preventDefault();openCrossModal(active.dataset.gkind,active.dataset.glabel,active.dataset.gsid);return;}
    closeGlobalSuggestions();exState.q=e.target.value;exState.page=0;go('explorer');
  }
});
document.addEventListener('click',e=>{if(!e.target.closest('#globalSearchBox'))closeGlobalSuggestions();});
const srcDoneBtn=$('#srcDone');if(srcDoneBtn)srcDoneBtn.onclick=()=>hideModal('srcModal');
$('#srcModal').onclick=e=>{if(e.target.id==='srcModal')hideModal('srcModal');};
const srcGoReportsBtn=$('#srcGoReports');if(srcGoReportsBtn)srcGoReportsBtn.onclick=()=>{hideModal('srcModal');go('reports');};
const crossDoneBtn=$('#crossDone');if(crossDoneBtn)crossDoneBtn.onclick=()=>hideModal('crossModal');
$('#crossModal').onclick=e=>{if(e.target.id==='crossModal')hideModal('crossModal');};

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
let ME=null; // {username, role} de l'admin actuellement connecté
function markEditable(on){$$('[data-edit]').forEach(el=>{if(on){el.setAttribute('contenteditable','true');el.setAttribute('spellcheck','false');if(!el.textContent.trim()){const v=getPath(C,el.getAttribute('data-edit'));if(v!=null)el.textContent=v;}}else el.removeAttribute('contenteditable');});document.body.classList.toggle('editing',on);}
function collectEdits(){$$('[data-edit]').forEach(el=>{const p=el.getAttribute('data-edit');if(getPath(C,p)!==undefined)assignPath(C,p,el.textContent.trim());});}
function enterAdminMode(me){editing=true;if(me)ME=me;$('#adminBar').classList.add('on');$('#adminFab').style.display='none';document.body.style.paddingBottom='64px';markEditable(true);buildSidebar();
  const um=$('#userMgrBtn');if(um)um.style.display=(ME&&ME.role==='admin')?'':'none';
  const tm=$('#tablesMgrBtn');if(tm)tm.style.display=(ME&&ME.role==='admin')?'':'none';}
// Si une session admin est déjà active côté serveur (cookie valide), on
// rouvre directement le mode édition sans redemander le mot de passe.
// Le bouton "⚙ Admin" lui-même ne s'affiche que sur le lien d'accès dédié
// (voir README, « Sécurité admin ») — jamais sur la page d'accueil publique,
// pour ne pas exposer inutilement l'existence d'un espace protégé par
// mot de passe à n'importe quel visiteur.
getJSON('/api/me').then(me=>{
  if(me&&me.authenticated)enterAdminMode(me);
  else if(window.ADMIN_ENTRY_PAGE)$('#adminFab').style.display='';
}).catch(()=>{if(window.ADMIN_ENTRY_PAGE)$('#adminFab').style.display='';});
/* ===== Modales : ouverture/fermeture accessibles =====
   showModal()/hideModal() centralisent ce qu'on ajoutait auparavant
   dispersé en classList.add/remove('on') : mémorisation de l'élément
   déclencheur pour lui rendre le focus à la fermeture, focus initial sur le
   premier champ/bouton de la boîte de dialogue, et un piège de focus (Tab/
   Maj+Tab) qui garde le clavier à l'intérieur de la modale ouverte —
   comportement standard des dialogues modales (role="dialog" posé côté
   HTML), pas une certification. */
let modalStack=[];
function focusablesIn(el){return $$('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',el).filter(e=>!e.disabled&&e.offsetParent!==null);}
function showModal(id){
  const bg=document.getElementById(id);if(!bg)return;
  const trigger=(document.activeElement&&document.activeElement!==document.body)?document.activeElement:null;
  bg.classList.add('on');
  modalStack.push({id,trigger});
  const modal=bg.querySelector('.modal');
  requestAnimationFrame(()=>{const f=focusablesIn(modal);(f[0]||modal).focus({preventScroll:true});});
}
function hideModal(id){
  const bg=document.getElementById(id);if(!bg)return;
  bg.classList.remove('on');
  const idx=modalStack.findIndex(m=>m.id===id);
  if(idx>=0){const [m]=modalStack.splice(idx,1);if(m.trigger&&document.contains(m.trigger)&&m.trigger.focus)m.trigger.focus({preventScroll:true});}
}
function hideAllModals(){modalStack.slice().reverse().forEach(m=>hideModal(m.id));}
document.addEventListener('keydown',e=>{
  if(e.key!=='Tab'||!modalStack.length)return;
  const bg=document.getElementById(modalStack[modalStack.length-1].id);if(!bg)return;
  const modal=bg.querySelector('.modal');const f=focusablesIn(modal);if(!f.length)return;
  const first=f[0],last=f[f.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
});
$('#adminFab').onclick=()=>{if(editing)return;$('#user').value='';$('#pw').value='';$('#loginMsg').className='msg';showModal('loginModal');};
$('#loginCancel').onclick=()=>hideModal('loginModal');
$('#loginModal').onclick=e=>{if(e.target.id==='loginModal')hideModal('loginModal');};
async function tryLogin(){
  const btn=$('#loginBtn'),old=btn.textContent;btn.disabled=true;btn.textContent='Connexion…';
  try{
    const r=await fetch('/api/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('#user').value,password:$('#pw').value})});
    if(r.ok){const me=await r.json();hideModal('loginModal');enterAdminMode(me);}
    else{const m=$('#loginMsg');m.className='msg err';m.textContent='Identifiant ou mot de passe incorrect.';}
  }catch(e){const m=$('#loginMsg');m.className='msg err';m.textContent="Connexion au serveur impossible.";}
  finally{btn.disabled=false;btn.textContent=old;}
}
$('#loginBtn').onclick=tryLogin;$('#pw').addEventListener('keydown',e=>{if(e.key==='Enter')tryLogin();});
$('#user').addEventListener('keydown',e=>{if(e.key==='Enter')tryLogin();});
// close modals with Escape
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modalStack.length)hideAllModals();});
$('#exitBtn').onclick=async()=>{try{await fetch('/api/logout',{method:'POST',credentials:'same-origin'});}catch(e){}editing=false;ME=null;$('#adminBar').classList.remove('on');$('#adminFab').style.display=window.ADMIN_ENTRY_PAGE?'':'none';document.body.style.paddingBottom='';markEditable(false);buildSidebar();if(isNavHidden(current))go(firstVisibleModule());};

/* ===== Gestion des comptes administrateur (rôle "admin" uniquement) ===== */
async function loadUsers(){
  const r=await fetch('/api/users',{credentials:'same-origin'});
  if(!r.ok)return [];
  return r.json();
}
function renderUserRow(u){
  const isSelf=ME&&u.username===ME.username;
  return `<div class="rm-item" data-uid="${u.id}" style="display:grid;grid-template-columns:1.4fr .8fr auto auto auto;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)">
    <span><b>${esc(u.username)}</b>${isSelf?' <i style="color:var(--ink-faint)">(vous)</i>':''}</span>
    <select data-urole="${u.id}" ${isSelf?'disabled title="Vous ne pouvez pas changer votre propre rôle"':''}><option value="editor" ${u.role==='editor'?'selected':''}>editor</option><option value="admin" ${u.role==='admin'?'selected':''}>admin</option></select>
    <label style="display:flex;align-items:center;gap:4px;font-size:12px"><input type="checkbox" data-uactive="${u.id}" ${u.active?'checked':''} ${isSelf?'disabled':''}> actif</label>
    <button class="btn" data-upw="${u.id}" style="font-size:11px;padding:4px 8px">Réinit. mot de passe</button>
    <button class="rm-del" data-udel="${u.id}" ${isSelf?'disabled title="Vous ne pouvez pas supprimer votre propre compte" aria-label="Vous ne pouvez pas supprimer votre propre compte"':'aria-label="Supprimer ce compte" title="Supprimer"'}>✕</button>
  </div>`;
}
async function renderUM(){
  const list=$('#userList');if(!list)return;
  const users=await loadUsers();
  list.innerHTML=users.map(renderUserRow).join('')||'<div class="empty">Aucun compte.</div>';
  list.querySelectorAll('[data-urole]').forEach(sel=>sel.addEventListener('change',async e=>{
    const id=+e.target.dataset.urole;
    const r=await fetch('/api/users/'+id,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:e.target.value})});
    if(!r.ok){alert('Échec de la mise à jour du rôle.');renderUM();}
  }));
  list.querySelectorAll('[data-uactive]').forEach(cb=>cb.addEventListener('change',async e=>{
    const id=+e.target.dataset.uactive;
    const r=await fetch('/api/users/'+id,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({active:e.target.checked})});
    if(!r.ok){const j=await r.json().catch(()=>({}));alert(j.error||'Échec de la mise à jour.');renderUM();}
  }));
  list.querySelectorAll('[data-upw]').forEach(b=>b.addEventListener('click',async()=>{
    const id=+b.dataset.upw;const pw=prompt('Nouveau mot de passe (8 caractères minimum) :');
    if(!pw)return;
    const r=await fetch('/api/users/'+id,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})});
    if(!r.ok){const j=await r.json().catch(()=>({}));alert(j.error||'Échec de la réinitialisation.');}else alert('Mot de passe réinitialisé.');
  }));
  list.querySelectorAll('[data-udel]').forEach(b=>b.addEventListener('click',async()=>{
    const id=+b.dataset.udel;const row=b.closest('[data-uid]');const name=row.querySelector('b').textContent;
    if(!confirm('Supprimer définitivement le compte « '+name+' » ?'))return;
    const r=await fetch('/api/users/'+id,{method:'DELETE',credentials:'same-origin'});
    if(!r.ok){const j=await r.json().catch(()=>({}));alert(j.error||'Échec de la suppression.');}
    renderUM();
  }));
}
const userMgrBtn=$('#userMgrBtn');if(userMgrBtn)userMgrBtn.onclick=()=>{renderUM();showModal('userModal');};
const userDoneBtn=$('#userDone');if(userDoneBtn)userDoneBtn.onclick=()=>hideModal('userModal');
const uAddBtn=$('#uAdd');if(uAddBtn)uAddBtn.onclick=async()=>{
  const username=$('#uNewName').value.trim(),password=$('#uNewPw').value,role=$('#uNewRole').value;
  const msg=$('#userMsg');msg.className='msg';msg.textContent='';
  if(!username||password.length<8){msg.className='msg err';msg.textContent='Identifiant requis, mot de passe de 8 caractères minimum.';return;}
  const r=await fetch('/api/users',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password,role})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok){msg.className='msg err';msg.textContent=j.error||'Échec de la création.';return;}
  $('#uNewName').value='';$('#uNewPw').value='';renderUM();
};

/* ===== Gestion de l'affichage des tables (rôle "admin" uniquement) =====
   Utilise directement DS (déjà chargé, y compris les tables masquées quand
   on est authentifié — voir /api/warehouse côté serveur) plutôt qu'un
   second appel réseau : la liste reflète donc exactement ce que l'admin
   voit déjà dans l'appli. */
function renderTablesList(filterTxt){
  const host=$('#tablesList');if(!host)return;
  const f=(filterTxt||'').trim().toLowerCase();
  const names=Object.keys(DS).sort((a,b)=>(DS[a].label||a).localeCompare(DS[b].label||b));
  const rows=names.filter(k=>!f||k.toLowerCase().includes(f)||(DS[k].label||'').toLowerCase().includes(f));
  host.innerHTML=rows.map(k=>{
    const d=DS[k],vis=d.visible!==false;
    return `<div class="rm-item" data-tname="${esc(k)}" style="display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)">
      <span title="${esc(k)}"><b>${esc(d.label||k)}</b> <i style="color:var(--ink-faint);font-size:11px">${esc(k)}</i></span>
      <span class="sm-s" style="color:var(--ink-faint)">${(d.rows||[]).length||d.nb_lignes||0} lignes</span>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600">
        <input type="checkbox" data-tvis="${esc(k)}" ${vis?'checked':''}> ${vis?'Visible':'Masquée'}
      </label>
    </div>`;
  }).join('')||'<div class="empty">Aucune table ne correspond à ce filtre.</div>';
  host.querySelectorAll('[data-tvis]').forEach(cb=>cb.addEventListener('change',async e=>{
    const name=e.target.dataset.tvis,visible=e.target.checked;
    const msg=$('#tablesMsg');msg.className='msg';msg.textContent='';
    e.target.disabled=true;
    try{
      const r=await fetch('/api/datasets/'+encodeURIComponent(name)+'/visibility',{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({visible})});
      if(!r.ok){const j=await r.json().catch(()=>({}));msg.className='msg err';msg.textContent=j.error||'Échec de la mise à jour.';e.target.checked=!visible;return;}
      if(DS[name])DS[name].visible=visible;
      const lbl=e.target.closest('label');lbl.lastChild.textContent=' '+(visible?'Visible':'Masquée');
    }catch(err){msg.className='msg err';msg.textContent='Connexion au serveur impossible.';e.target.checked=!visible;}
    finally{e.target.disabled=false;}
  }));
}
const tablesMgrBtn=$('#tablesMgrBtn');if(tablesMgrBtn)tablesMgrBtn.onclick=()=>{$('#tmFilter').value='';renderTablesList('');showModal('tablesModal');};
const tablesDoneBtn=$('#tablesDone');if(tablesDoneBtn)tablesDoneBtn.onclick=()=>hideModal('tablesModal');
const tmFilterInput=$('#tmFilter');if(tmFilterInput)tmFilterInput.addEventListener('input',e=>renderTablesList(e.target.value));

/* ===== Journal d'activité ===== */
async function renderAudit(){
  const host=$('#auditList');if(!host)return;host.innerHTML='<div class="empty">Chargement…</div>';
  const r=await fetch('/api/audit-log',{credentials:'same-origin'});
  if(!r.ok){host.innerHTML='<div class="empty">Impossible de charger le journal.</div>';return;}
  const rows=await r.json();
  if(!rows.length){host.innerHTML='<div class="empty">Aucune activité enregistrée.</div>';return;}
  host.innerHTML=`<table class="dg" style="width:100%"><thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Cible</th><th>Détail</th></tr></thead><tbody>${rows.map(a=>`<tr><td style="white-space:nowrap;font-size:11px">${esc(new Date(a.created_at).toLocaleString('fr-FR'))}</td><td>${esc(a.username)}</td><td><code>${esc(a.action)}</code></td><td>${esc(a.target)}</td><td style="font-size:11px;color:var(--ink-soft)">${esc(a.detail)}</td></tr>`).join('')}</tbody></table>`;
}
const auditBtn=$('#auditBtn');if(auditBtn)auditBtn.onclick=()=>{renderAudit();showModal('auditModal');};
const auditDoneBtn=$('#auditDone');if(auditDoneBtn)auditDoneBtn.onclick=()=>hideModal('auditModal');

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
$('#repMgrBtn').onclick=()=>{renderRM();showModal('repModal');};

/* ===== Gestion des rubriques (menu) ===== */
function renderNavMgr(){
  const host=$('#navList');if(!host)return;
  const flat=NAV.flatMap(sec=>sec.items);
  host.innerHTML=flat.map(([id,ico,lab])=>`<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--panel-2);cursor:${id==='overview'?'default':'pointer'}">
    <input type="checkbox" data-nav="${id}" ${id==='overview'?'checked disabled':(isNavHidden(id)?'':'checked')}>
    <span>${ico} ${esc(lab)}</span>${id==='overview'?'<span style="margin-left:auto;font-size:11px;color:var(--ink-soft)">toujours visible</span>':''}
  </label>`).join('');
}
$('#navMgrBtn').onclick=()=>{renderNavMgr();showModal('navModal');};
$('#navModal').onclick=e=>{if(e.target.id==='navModal')hideModal('navModal');};
$('#navList').addEventListener('change',e=>{const cb=e.target.closest('[data-nav]');if(!cb)return;const id=cb.dataset.nav;
  C.nav_hidden=C.nav_hidden||[];
  if(cb.checked)C.nav_hidden=C.nav_hidden.filter(x=>x!==id);
  else if(!C.nav_hidden.includes(id))C.nav_hidden.push(id);
  buildSidebar();});
$('#navDone').onclick=()=>{hideModal('navModal');buildSidebar();if(isNavHidden(current))go(firstVisibleModule());};

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
$('#enrichBtn').onclick=()=>{fillEnTables();showModal('enrichModal');};
$('#enTable').onchange=enShowInfo;
$('#enDone').onclick=()=>hideModal('enrichModal');
$('#enrichModal').onclick=e=>{if(e.target.id==='enrichModal')hideModal('enrichModal');};
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
$('#repModal').onclick=e=>{if(e.target.id==='repModal')hideModal('repModal');};
$('#rmDone').onclick=()=>{hideModal('repModal');if(current==='reports')renderReports();};
$('#rmAdd').onclick=()=>{C.reports.unshift({titre:'Nouveau rapport',categorie:'rapport_itie',annees_couvertes:'',date_publication:'',url:'',format:'pdf'});renderRM();};
function renderRM(){$('#rmList').innerHTML=C.reports.map((r,i)=>`<div class="rm-item" data-i="${i}"><div class="g" style="grid-column:1/2"><input data-k="titre" value="${esc(r.titre)}" placeholder="Titre" style="grid-column:1/3"><input data-k="annees_couvertes" value="${esc(r.annees_couvertes||'')}" placeholder="Années"><select data-k="categorie">${Object.keys(CATS).map(c=>`<option value="${c}" ${r.categorie===c?'selected':''}>${esc(CATS[c])}</option>`).join('')}</select><input data-k="url" value="${esc(r.url||'')}" placeholder="URL PDF" style="grid-column:1/3"></div><button class="rm-del" data-del="${i}" aria-label="Supprimer ce rapport" title="Supprimer">✕</button></div>`).join('');}
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
    RE.rows.forEach(r=>{if(String(r[iE]||'').trim()!==ly)return;const nom=r[iN];if(!nom||isRollupEntityLabel(nom))return;const v=_num(r[iV])||0;const dec=String(r[iD]||'').toLowerCase();
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
// Restaure l'état (table/filtres/tri pour l'Explorateur, ds/dim/mesure pour
// les Visualisations, filtres pour la Géographie) depuis un lien partagé,
// avant le premier rendu du module concerné.
(function restoreFromHash(){
  const {id,params}=parseHash();
  if(!MODULES[id])return;
  if(id==='explorer'){
    const t=params.get('table');if(t&&DS[t])exState.ds=t;
    if(params.has('q'))exState.q=params.get('q');
    if(params.has('sort'))exState.sort=+params.get('sort');
    if(params.has('dir'))exState.dir=+params.get('dir')||1;
    if(params.has('page'))exState.page=+params.get('page')||0;
    if(params.has('annee'))globalYear=params.get('annee');
    if(params.has('f')){try{const f=JSON.parse(unb64(params.get('f')));if(f&&typeof f==='object')exState.filters=f;}catch(e){}}
  }else if(id==='viz'){
    ['ds','dim','measure','agg','type'].forEach(k=>{if(params.has(k))vizState[k]=params.get(k);});
  }else if(id==='geo'){
    infraF=infraF||{};
    ['annee','type','prov','perc','ent','flux','group'].forEach(k=>{if(params.has(k))infraF[k]=params.get(k);});
  }
})();
const initial=parseHash().id;
go(MODULES[initial]?initial:'overview');
window.addEventListener('hashchange',()=>{const {id}=parseHash();if(MODULES[id]&&id!==current)go(id);});
})();
