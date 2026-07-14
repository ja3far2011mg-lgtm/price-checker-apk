'use strict';

/* ═════════════════════════════════════════════════════════════════
   LOGGING — every important step gets written to logfile.txt
   (via main process) AND shown as an on-screen red banner if it's
   an error. Click "View Log" anytime to open the actual file.
═════════════════════════════════════════════════════════════════ */
function log(msg){
  try{ console.log(msg); }catch(_){}
  try{ window.api && window.api.log && window.api.log(String(msg)); }catch(_){}
}
function logError(context, err){
  const text = `[ERROR] ${context}: ${(err && err.message) || err}` +
               (err && err.stack ? ('\n' + err.stack) : '');
  log(text);
  showToast(text);
}
function showToast(msg){
  try{
    let toast = document.getElementById('errToast');
    if(!toast){
      toast = document.createElement('div');
      toast.id = 'errToast';
      toast.style.cssText =
        'position:fixed;top:10px;left:50%;transform:translateX(-50%);'+
        'background:#c53030;color:#fff;padding:10px 18px;border-radius:8px;'+
        'font-size:12px;font-family:monospace;z-index:9999;max-width:90%;'+
        'white-space:pre-wrap;box-shadow:0 4px 16px rgba(0,0,0,.35);cursor:pointer;';
      toast.title = 'Click to dismiss';
      toast.addEventListener('click', ()=>toast.remove());
      document.body.appendChild(toast);
    }
    toast.textContent = String(msg).slice(0, 350);
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(()=>toast.remove(), 9000);
  }catch(_){}
}
window.addEventListener('error', e=>{
  logError('window.onerror', e.error || new Error(e.message));
});
window.addEventListener('unhandledrejection', e=>{
  logError('unhandledrejection', e.reason);
});

/* ── State ─────────────────────────────────────────────────────── */
const State = {
  baseUrl:'', db:'', username:'',
  currency:{ symbol:'LE', before:false },
  settings:{
    pricelistId:null, showImage:true, showRef:true, showSale:true,
    showCost:false, showCat:false, showQty:true, showDiscount:true, showLoyaltyPromo:true, showPromoDetails:true, markupExcludePackaging:false,
    uiLang:'en',
    markupEnabled:false, markupPercent:0, markupRound:0,
    showPackaging:false,
    taxPercent:0, resetSeconds:7, slideshowEnabled:false,
    slideshowDelay:30, slideDuration:5, startFullscreen:false,
    bgColor:'#FFFFFF', accentColor:'#7c5cbf', textColor:'#1a1a2e',
    kioskTitle:'', titleFont:'inherit', titleSize:22,
    titleWeight:'700', titleColor:'#1a1a2e',
    taxExemptProducts:[], // [{id, name}, ...] — always shown without VAT
  },
  pricelists:[], resetTimer:null, cdTimer:null, pendingLogoData:null,
};

function saveState(){
  try{
    localStorage.setItem('pc_settings', JSON.stringify(State.settings));
    localStorage.setItem('pc_conn', JSON.stringify(
      { baseUrl:State.baseUrl, db:State.db, username:State.username }));
    log('saveState: settings saved');
  }catch(e){ logError('saveState', e); }
}

/* Defensive load — never let corrupted localStorage break the app */
function loadState(){
  try{
    const s = localStorage.getItem('pc_settings');
    if(s){
      const parsed = JSON.parse(s);
      if(parsed && typeof parsed === 'object') Object.assign(State.settings, parsed);
      else log('loadState: pc_settings was not a valid object, ignoring it');
    }
  }catch(e){ log('loadState: pc_settings parse failed, using defaults — ' + e.message); }

  try{
    const c = localStorage.getItem('pc_conn');
    if(c){
      const d = JSON.parse(c);
      if(d && typeof d === 'object'){
        State.baseUrl=d.baseUrl||''; State.db=d.db||''; State.username=d.username||'';
      }
    }
  }catch(e){ log('loadState: pc_conn parse failed — ' + e.message); }
}

/* ── Slides ────────────────────────────────────────────────────── */
function getSlides(){
  try{
    const arr = JSON.parse(localStorage.getItem('pc_slides')||'[]');
    return Array.isArray(arr) ? arr : [];
  }catch(e){ log('getSlides: parse failed — ' + e.message); return []; }
}
function setSlides(a){ localStorage.setItem('pc_slides', JSON.stringify(a)); }
let _editingSlotIdx = -1;

/* ── Slideshow engine ──────────────────────────────────────────── */
const SS = {
  active:false, idx:0, slideTimer:null, idleTimer:null,
  scheduleStart(){
    this.cancelIdleTimer();
    if(!State.settings.slideshowEnabled) return;
    const slides = getSlides().filter(Boolean);
    if(!slides.length) return;
    this.idleTimer = setTimeout(()=>this.start(), State.settings.slideshowDelay*1000);
  },
  cancelIdleTimer(){ clearTimeout(this.idleTimer); this.idleTimer=null; },
  start(){
    try{
      const slides = getSlides().filter(Boolean);
      if(!slides.length) return;
      this.active=true; this.idx=0;
      const overlay = document.getElementById('slideshowOverlay');
      if(!overlay) { log('SS.start: slideshowOverlay element missing'); return; }
      overlay.classList.remove('hidden');
      const dots = document.getElementById('slideshowDots');
      if(dots){
        dots.innerHTML = slides.map((_,i)=>
          `<div class="slideshow-dot${i===0?' active':''}" data-idx="${i}"></div>`).join('');
        dots.querySelectorAll('.slideshow-dot').forEach(d=>
          d.addEventListener('click', e=>{ e.stopPropagation(); SS.goTo(+d.dataset.idx); }));
      }
      const img = document.getElementById('slideshowImg');
      img.src = slides[0]; img.style.opacity='1';
      document.getElementById('slideshowImgNext').style.opacity='0';
      this._next(slides);
    }catch(e){ logError('SS.start', e); }
  },
  _next(slides){
    clearTimeout(this.slideTimer);
    this.slideTimer = setTimeout(()=>{
      this.idx = (this.idx+1) % slides.length;
      this._fade(slides[this.idx], slides);
    }, State.settings.slideDuration*1000);
  },
  _fade(src, slides){
    try{
      const cur=document.getElementById('slideshowImg');
      const nxt=document.getElementById('slideshowImgNext');
      nxt.src=src; nxt.style.transition='opacity .8s ease'; nxt.style.opacity='1';
      cur.style.transition='opacity .8s ease'; cur.style.opacity='0';
      document.querySelectorAll('.slideshow-dot').forEach((d,i)=>
        d.classList.toggle('active', i===this.idx));
      setTimeout(()=>{
        cur.src=src; cur.style.transition='none'; cur.style.opacity='1';
        nxt.style.transition='none'; nxt.style.opacity='0';
        this._next(slides);
      }, 850);
    }catch(e){ logError('SS._fade', e); }
  },
  goTo(idx){
    const slides=getSlides().filter(Boolean); if(!slides[idx]) return;
    this.idx=idx; clearTimeout(this.slideTimer);
    document.getElementById('slideshowImg').src=slides[idx];
    document.querySelectorAll('.slideshow-dot').forEach((d,i)=>
      d.classList.toggle('active', i===idx));
    this._next(slides);
  },
  exit(){
    if(!this.active) return;
    this.active=false; clearTimeout(this.slideTimer); this.cancelIdleTimer();
    const overlay=document.getElementById('slideshowOverlay');
    if(overlay) overlay.classList.add('hidden');
    const input=document.getElementById('barcodeInput');
    if(input) input.focus();
  },
};

/* ── Global scanner keyboard listener ─────────────────────────── */
let _gBuf='', _gTimer=null, _lastKey=Date.now();
document.addEventListener('keydown', e=>{
  const sv=document.getElementById('scannerView');
  if(!sv || !sv.classList.contains('active')) return;
  // If the user is already typing directly into the search box, let it
  // behave like a normal text field — don't run the parallel scanner
  // buffer at all. (A real barcode scanner that fires while the field
  // happens to be focused still works fine: its keystrokes land in the
  // input's own value natively, and Enter is handled by the input's own
  // listener below.) This prevents the two listeners from racing and
  // clobbering manually-typed text — including Arabic — right as Enter
  // is pressed.
  if(document.activeElement && document.activeElement.id==='barcodeInput') return;
  const now=Date.now(), delta=now-_lastKey; _lastKey=now;
  if(e.key==='Enter'){
    if(_gBuf.length>2){
      const code=_gBuf; _gBuf=''; clearTimeout(_gTimer);
      if(SS.active) SS.exit();
      document.getElementById('barcodeInput').value=code;
      App.search();
    }else{ _gBuf=''; }
    return;
  }
  if(e.key.length===1 && delta<60){
    _gBuf+=e.key; clearTimeout(_gTimer);
    _gTimer=setTimeout(()=>{ _gBuf=''; }, 500);
  }else{
    if(SS.active && e.key.length===1) SS.exit();
    _gBuf=e.key.length===1?e.key:'';
  }
});

/* ── Tax ───────────────────────────────────────────────────────── */
function hasTax(){ return parseFloat(State.settings.taxPercent||0)>0; }
function applyTax(p){ const t=parseFloat(State.settings.taxPercent||0); return t>0?p*(1+t/100):p; }

/* ── Consumer markup ──────────────────────────────────────────────── */
function applyMarkup(p){
  const s=State.settings;
  const pct=parseFloat(s.markupPercent||0);
  if(!s.markupEnabled || !(pct>0)) return p;
  const marked=p*(1+pct/100);
  const round=parseFloat(s.markupRound||0);
  return round>0 ? Math.round(marked/round)*round : marked;
}

/* ── Odoo RPC ──────────────────────────────────────────────────── */
async function rpc(path, params){
  const r=await window.api.rpc(State.baseUrl+path, params);
  if(r?.error) throw new Error(r.error?.data?.message||r.error?.message||'RPC error');
  return r?.result;
}
async function callKw(model, method, args, kwargs={}){
  return rpc(`/web/dataset/call_kw/${model}/${method}`, {model,method,args,kwargs});
}

/* ── Tagline display ───────────────────────────────────────────── */
function applyTagline(){
  try{
    const s=State.settings;
    const wrap=document.getElementById('kioskTaglineWrap');
    const el=document.getElementById('kioskTagline');
    if(!wrap||!el) return;
    if(!s.kioskTitle){ wrap.style.display='none'; return; }
    el.textContent      = s.kioskTitle;
    el.style.fontFamily = s.titleFont   || 'inherit';
    el.style.fontSize   = (s.titleSize  || 22)+'px';
    el.style.fontWeight = s.titleWeight || '700';
    el.style.color      = s.titleColor  || '#1a1a2e';
    wrap.style.display  = 'flex';
  }catch(e){ logError('applyTagline', e); }
}

/* ═════════════════════════════════════════════════════════════════
   APP
═════════════════════════════════════════════════════════════════ */
const App = {

  _fsBusy: false,

  async init(){
    log('App.init: starting');
    try{
      // Diagnostic: confirm style.css actually loaded with rules.
      // If this shows 0 rules or an error, the CSS file failed to load
      // inside the packaged app — that alone would explain every view
      // being visible at once (no display:none applied anywhere).
      try{
        log('Stylesheets found: ' + document.styleSheets.length);
        for(let i=0;i<document.styleSheets.length;i++){
          const ss=document.styleSheets[i];
          try{
            log(`  stylesheet[${i}] href="${ss.href}" rules=${ss.cssRules ? ss.cssRules.length : 'N/A'}`);
          }catch(e){ log(`  stylesheet[${i}] href="${ss.href}" ERROR reading rules: ${e.message}`); }
        }
      }catch(e){ log('Stylesheet diagnostic failed: ' + e.message); }

      loadState();
      applyColors();
      applyUiLang();
      applyTagline();
      this._bindAll();
      // Sync header markup toggle with loaded settings
      const hdrInit=document.getElementById('hdrMarkupToggle');
      if(hdrInit){
        hdrInit.checked=!!State.settings.markupEnabled;
        hdrInit.closest('.hdr-markup-toggle')?.classList.toggle('is-active', !!State.settings.markupEnabled);
      }

      if(State.baseUrl){
        document.getElementById('loginUrl').value  = State.baseUrl;
        document.getElementById('loginDb').value   = State.db;
        document.getElementById('loginUser').value = State.username;
      }
      const pass = localStorage.getItem('pc_pass');
      if(State.baseUrl && State.db && State.username && pass){
        try{
          document.getElementById('loginBtn').disabled=true;
          document.getElementById('loginBtn').textContent='Reconnecting…';
          await this._doConnect(State.baseUrl, State.db, State.username, pass);
          log('App.init: auto-reconnect succeeded');
          return;
        }catch(e){ log('App.init: auto-reconnect failed — ' + e.message); }
        document.getElementById('loginBtn').disabled=false;
        document.getElementById('loginBtn').textContent='Connect to Odoo';
      }
      showView('loginView');
      log('App.init: done, showing loginView');
    }catch(e){ logError('App.init', e); }
    finally{ this._hideSplash(); }
  },

  // Fades out and removes the splash screen. Called once App.init()
  // settles — whether it auto-reconnected or fell through to the
  // login view — so the splash never lingers or gets stuck.
  _hideSplash(){
    const el=document.getElementById('splashScreen');
    if(!el) return;
    el.classList.add('fade-out');
    setTimeout(()=>{ el.remove(); }, 550);
  },

  /* ── Every button gets EXACTLY ONE listener here.
     No delegated/duplicate listeners anywhere else in the app —
     that was the bug causing fullscreen to flicker (toggled twice
     in the same click) and very likely settings misbehaving too. */
  _bindAll(){
    log('_bindAll: wiring buttons');
    const on=(id, fn)=>{
      const el=document.getElementById(id);
      if(!el){ log('_bindAll: #'+id+' not found in DOM'); return; }
      el.addEventListener('click', ()=>{
        log('click: #'+id);
        try{ fn(); }
        catch(e){ logError('handler for #'+id, e); }
      });
    };

    on('loginBtn', ()=>this.login());
    document.getElementById('loginPass')?.addEventListener('keydown', e=>{
      if(e.key==='Enter') this.login();
    });

    on('btnFullscreen', ()=>this.toggleFullscreen());
    on('btnSettings',   ()=>this.showSettings());
    on('btnExit',       ()=>this.logout());
    on('btnViewLog',    ()=>this.openLog());
    on('btnViewLogLogin', ()=>this.openLog());

    on('btnSearch', ()=>this.search());
    document.getElementById('barcodeInput')?.addEventListener('keydown', e=>{
      SS.cancelIdleTimer();
      if(SS.active) SS.exit();
      if(e.key==='Enter'){ e.preventDefault(); e.stopPropagation(); this.search(); }
    });

    on('slideshowCta', ()=>SS.exit());
    on('slideshowOverlay', ()=>SS.exit());  // click anywhere on the image to exit

    on('btnReset',   ()=>this.reset());
    on('btnResetNF', ()=>this.reset());
    on('btnResetHeader', ()=>this.reset());
    on('btnPickerCancel', ()=>this.reset());

    on('btnSettingsBack', ()=>this.hideSettings());
    on('btnSettingsSave', ()=>this.saveSettings());
    on('btnRemoveLogo',   ()=>this.removeLogo());
    on('btnLogout',       ()=>this.logout());
    on('btnExemptSearch', ()=>this.searchExemptCandidates());
    document.getElementById('exemptSearchInput')?.addEventListener('keydown', e=>{
      if(e.key==='Enter'){ e.preventDefault(); this.searchExemptCandidates(); }
    });

    document.getElementById('logoUpload')
      ?.addEventListener('change', e=>this.onLogoFileSelected(e.target));
    document.getElementById('slideUploadInput')
      ?.addEventListener('change', e=>this.onSlideFileSelected(e.target));

    document.getElementById('setResetSec')?.addEventListener('input', e=>{
      const v=document.getElementById('resetSecVal'); if(v) v.textContent=e.target.value+'s';
    });
    const liveColor=(inputId, previewId)=>{
      document.getElementById(inputId)?.addEventListener('input', e=>{
        const p=document.getElementById(previewId); if(p) p.style.background=e.target.value;
      });
    };
    liveColor('setBg','prevBg');
    liveColor('setAccent','prevAccent');
    liveColor('setText','prevText');
    liveColor('setTitleColor','prevTitleColor');

    // Header consumer-price quick-toggle
    const hdrMarkup=document.getElementById('hdrMarkupToggle');
    if(hdrMarkup){
      hdrMarkup.addEventListener('change',()=>{
        State.settings.markupEnabled=hdrMarkup.checked;
        saveState();
        hdrMarkup.closest('.hdr-markup-toggle')?.classList.toggle('is-active', hdrMarkup.checked);
        // Re-render current product if one is showing
        if(State._lastProduct) App._showProduct(State._lastProduct);
      });
    }

    // EN/AR language + layout direction quick-toggle
    on('btnLangToggle', ()=>{
      State.settings.uiLang = (State.settings.uiLang==='ar') ? 'en' : 'ar';
      saveState();
      applyUiLang();
    });

    // Live markup example preview
    const updEx=()=>App._updateMarkupExample();
    document.getElementById('setMarkupEnabled')?.addEventListener('change', updEx);
    document.getElementById('setMarkupPct')?.addEventListener('input', updEx);
    document.getElementById('setMarkupRound')?.addEventListener('input', updEx);

    log('_bindAll: done');
  },

  /* ── Log viewer ───────────────────────────────────────────────*/
  async openLog(){
    log('openLog: requested by user');
    try{ await window.api.openLog(); }
    catch(e){ logError('openLog', e); }
  },

  /* ── Login ──────────────────────────────────────────────────── */
  async login(){
    const url  = document.getElementById('loginUrl').value.trim().replace(/\/$/,'');
    const db   = document.getElementById('loginDb').value.trim();
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value;
    if(!url||!db||!user||!pass){ showError('Please fill in all fields.'); return; }
    const btn=document.getElementById('loginBtn');
    btn.disabled=true; btn.textContent='Connecting…'; hideError();
    try{ await this._doConnect(url,db,user,pass); }
    catch(e){
      logError('login', e);
      showError(e.message||'Connection failed. Check URL and credentials.');
      btn.disabled=false; btn.textContent='Connect to Odoo';
    }
  },

  async _doConnect(url,db,user,pass){
    log('_doConnect: connecting to ' + url);
    State.baseUrl=url;
    await window.api.setBaseUrl(url);
    const resp=await window.api.rpc(url+'/web/session/authenticate',
      {db, login:user, password:pass});
    if(!resp?.result?.uid) throw new Error('Invalid credentials or database name.');
    State.db=db; State.username=user;
    localStorage.setItem('pc_pass', pass);
    saveState();
    await this._fetchCurrency();
    await this._fetchPricelists();
    if(!this._loadCustomLogo()) await this._fetchLogo();
    if(State.settings.startFullscreen){
      log('_doConnect: startFullscreen is on, enabling fullscreen');
      await window.api.setFullscreen(true);
    }
    await this._updateFSBtn();
    showView('scannerView');
    applyColors();
    applyTagline();
    document.getElementById('barcodeInput').focus();
    SS.scheduleStart();
    log('_doConnect: connected successfully');
  },

  logout(){
    log('logout: invoked');
    SS.exit(); SS.cancelIdleTimer();
    window.api.clearSession();
    localStorage.removeItem('pc_pass');
    State.baseUrl='';
    showView('loginView');
    document.getElementById('loginPass').value='';
  },

  /* ── Meta ───────────────────────────────────────────────────── */
  async _fetchCurrency(){
    try{
      const cos=await callKw('res.company','search_read',[[]],{fields:['currency_id'],limit:1});
      const cid=cos?.[0]?.currency_id?.[0]; if(!cid) return;
      const cur=await callKw('res.currency','search_read',
        [[['id','=',cid]]],{fields:['symbol','position'],limit:1});
      if(cur?.length){
        State.currency.symbol=cur[0].symbol||'LE';
        State.currency.before=cur[0].position==='before';
      }
    }catch(e){ log('_fetchCurrency failed (non-fatal): ' + e.message); }
  },

  async _fetchLogo(){
    try{
      const dataUrl=await window.api.fetchLogo();
      if(dataUrl && dataUrl.startsWith('data:')){
        document.getElementById('logoImg').src=dataUrl;
        document.getElementById('logoImg').style.display='block';
        document.getElementById('logoBar').classList.remove('hidden');
        log('_fetchLogo: loaded from Odoo');
      }
    }catch(e){ log('_fetchLogo failed (non-fatal): ' + e.message); }
  },

  _loadCustomLogo(){
    const d=localStorage.getItem('pc_custom_logo');
    if(d){
      document.getElementById('logoImg').src=d;
      document.getElementById('logoImg').style.display='block';
      document.getElementById('logoBar').classList.remove('hidden');
      return true;
    }
    return false;
  },

  async _fetchPricelists(){
    try{
      State.pricelists=await callKw('product.pricelist','search_read',
        [[['active','=',true]]],{fields:['id','name'],limit:50})||[];
    }catch(e){ log('_fetchPricelists failed (non-fatal): ' + e.message); }
  },

  /* ── Fullscreen — busy-guarded, single IPC call returns new state */
  async toggleFullscreen(){
    if(this._fsBusy){ log('toggleFullscreen: ignored, already in progress'); return; }
    this._fsBusy = true;
    log('toggleFullscreen: invoking IPC');
    try{
      const isFS = await window.api.toggleFullscreen();
      log('toggleFullscreen: result isFullscreen=' + isFS);
      const btn=document.getElementById('btnFullscreen');
      if(btn) btn.textContent = isFS ? '⧉ Windowed' : '⛶ Fullscreen';
    }catch(e){ logError('toggleFullscreen', e); }
    finally{ this._fsBusy = false; }
  },
  async _updateFSBtn(){
    try{
      const isFS=await window.api.isFullscreen();
      const btn=document.getElementById('btnFullscreen');
      if(btn) btn.textContent=isFS?'⧉ Windowed':'⛶ Fullscreen';
    }catch(e){ log('_updateFSBtn failed: ' + e.message); }
  },

  /* ── Logo upload ──────────────────────────────────────────────*/
  onLogoFileSelected(input){
    if(!input.files[0]) return;
    const reader=new FileReader();
    reader.onload=e=>{
      State.pendingLogoData=e.target.result;
      const prev=document.getElementById('currentLogoPreview');
      if(prev){ prev.src=e.target.result; prev.style.display='block'; }
      const rmBtn=document.getElementById('btnRemoveLogo');
      if(rmBtn) rmBtn.style.display='inline-block';
    };
    reader.readAsDataURL(input.files[0]);
  },

  removeLogo(){
    localStorage.removeItem('pc_custom_logo');
    State.pendingLogoData=null;
    const prev=document.getElementById('currentLogoPreview');
    const rmBtn=document.getElementById('btnRemoveLogo');
    const img=document.getElementById('logoImg');
    if(prev) prev.style.display='none';
    if(rmBtn) rmBtn.style.display='none';
    if(img){ img.src=''; img.style.display='none'; }
    document.getElementById('logoBar').classList.add('hidden');
    const lu=document.getElementById('logoUpload'); if(lu) lu.value='';
    this._fetchLogo();
  },

  /* ── Slides grid ──────────────────────────────────────────────*/
  renderSlidesGrid(){
    const slides=getSlides();
    const grid=document.getElementById('slidesGrid');
    if(!grid) return;
    grid.innerHTML='';
    for(let i=0;i<10;i++){
      const slot=document.createElement('div');
      slot.className=`slide-slot${slides[i]?' filled':''}`;
      if(slides[i]){
        slot.innerHTML=
          `<img src="${slides[i]}" alt="Slide ${i+1}"/>` +
          `<span class="slide-num">${i+1}</span>` +
          `<button class="slide-remove" data-i="${i}">×</button>`;
        slot.querySelector('.slide-remove').addEventListener('click', e=>{
          e.stopPropagation(); App.removeSlide(+e.target.dataset.i);
        });
        slot.addEventListener('click', ()=>App._openSlideDialog(i));
      }else{
        slot.innerHTML='<span class="slide-add-icon">+</span>';
        slot.addEventListener('click', ()=>App._openSlideDialog(i));
      }
      grid.appendChild(slot);
    }
  },

  _openSlideDialog(idx){
    _editingSlotIdx=idx;
    document.getElementById('slideUploadInput').value='';
    document.getElementById('slideUploadInput').click();
  },

  onSlideFileSelected(input){
    if(!input.files[0]||_editingSlotIdx<0) return;
    const reader=new FileReader();
    reader.onload=e=>{
      const slides=getSlides();
      while(slides.length<=_editingSlotIdx) slides.push(null);
      slides[_editingSlotIdx]=e.target.result;
      while(slides.length && slides[slides.length-1]==null) slides.pop();
      setSlides(slides);
      App.renderSlidesGrid(); _editingSlotIdx=-1; input.value='';
    };
    reader.readAsDataURL(input.files[0]);
  },

  removeSlide(idx){
    const slides=getSlides(); slides.splice(idx,1);
    setSlides(slides); this.renderSlidesGrid();
  },

  /* ── Tax-exempt products ──────────────────────────────────────── */
  async searchExemptCandidates(){
    const input=document.getElementById('exemptSearchInput');
    const box=document.getElementById('exemptSearchResults');
    const q=input.value.trim();
    box.innerHTML='';
    if(!q) return;
    let rows=[];
    try{
      rows=await callKw('product.product','search_read',
        [[['active','=',true],'|',['name','ilike',q],['barcode','=',q]]],
        {fields:['id','name','barcode','default_code'], limit:15});
    }catch(e){ log('searchExemptCandidates failed: ' + e.message); }
    if(!rows.length){
      box.innerHTML=`<div class="exempt-empty">No matching products.</div>`;
      return;
    }
    rows.forEach(p=>{
      const row=document.createElement('div');
      row.className='exempt-result-row';
      row.textContent=p.name + (p.default_code ? `  ·  ref ${p.default_code}` : '');
      row.addEventListener('click', ()=>this.addExemptProduct(p));
      box.appendChild(row);
    });
  },

  addExemptProduct(p){
    const list=State.settings.taxExemptProducts || [];
    if(list.some(x=>x.id===p.id)) return; // already added
    list.push({ id:p.id, name:p.name });
    State.settings.taxExemptProducts=list;
    this.renderExemptList();
    document.getElementById('exemptSearchInput').value='';
    document.getElementById('exemptSearchResults').innerHTML='';
  },

  removeExemptProduct(id){
    State.settings.taxExemptProducts=(State.settings.taxExemptProducts||[]).filter(x=>x.id!==id);
    this.renderExemptList();
  },

  renderExemptList(){
    const box=document.getElementById('exemptList');
    if(!box) return;
    const list=State.settings.taxExemptProducts || [];
    box.innerHTML='';
    if(!list.length){
      box.innerHTML=`<div class="exempt-empty">No exempt products yet.</div>`;
      return;
    }
    list.forEach(p=>{
      const chip=document.createElement('div');
      chip.className='exempt-chip';
      chip.innerHTML=`<span>${escapeHtml(p.name)}</span><button class="exempt-chip-remove" data-id="${p.id}">×</button>`;
      chip.querySelector('.exempt-chip-remove').addEventListener('click', ()=>this.removeExemptProduct(p.id));
      box.appendChild(chip);
    });
  },

  /* ── Search ───────────────────────────────────────────────────*/
  async search(){
    SS.exit();
    SS.cancelIdleTimer();
    const input=document.getElementById('barcodeInput');
    const query=input.value.trim(); if(!query) return;
    input.value=''; this._cancelTimers(); showStatus('loading');
    try{
      const product=await this._findProduct(query);
      if(product){
        await this._showProduct(product);
        showStatus('result');
        this._startCountdown();
      }else if(/[a-zA-Z\u0600-\u06FF]/.test(query)){
        // No exact barcode/ref match, and the query contains letters
        // (Latin or Arabic) — fall back to a flexible multi-word name search.
        const matches=await this._searchByKeywords(query);
        if(matches.length===1){
          await this._showProduct(matches[0]);
          showStatus('result');
          this._startCountdown();
        }else if(matches.length>1){
          this._showPicker(matches);
          // No quick auto-reset while the picker is open — staff needs
          // time to read the list and tap one.
        }else{
          showStatus('notFound');
          this._startCountdown();
        }
      }else{
        showStatus('notFound');
        this._startCountdown();
      }
    }catch(e){
      log('search failed: ' + e.message);
      showStatus('notFound');
      this._startCountdown();
    }
    input.focus();
  },

  async _findProduct(query){
    const fields=['id','name','barcode','default_code','lst_price',
      'standard_price','qty_available','uom_id','categ_id','product_tmpl_id'];

    const hasArabic=/[\u0600-\u06FF]/.test(query);
    const kwargs={fields, limit:1};
    if(hasArabic){
      const arLang=await this._resolveArabicLangCode();
      if(arLang) kwargs.context={lang:arLang};
    }

    // 1. Exact barcode on the base product/variant
    let rows=await callKw('product.product','search_read',
      [[['barcode','=',query],['active','=',true]]], kwargs);
    if(rows?.length) return rows[0];

    // 2. Exact internal reference
    rows=await callKw('product.product','search_read',
      [[['default_code','=',query],['active','=',true]]], kwargs);
    if(rows?.length) return rows[0];

    // 3. product.packaging model (Odoo 14-15, stock module)
    //    In Odoo 19 Online this usually returns 0 rows — the Sales-tab
    //    "Packagings" are uom.uom records, NOT product.packaging records.
    //    We keep this for backward compatibility and log the result clearly.
    try{
      const pkgs=await callKw('product.packaging','search_read',
        [[['barcode','=',query]]],
        {fields:['id','name','qty','product_id','product_tmpl_id','barcode'], limit:1});
      log('[Step 3 product.packaging] rows='+JSON.stringify(pkgs?.length)+' for: '+query);
      if(pkgs?.length){
        const pkg=pkgs[0];
        const packInfo={qty:parseFloat(pkg.qty)||1, name:pkg.name||'', barcode:query};
        const prodId=Array.isArray(pkg.product_id)?pkg.product_id[0]:(pkg.product_id||null);
        if(prodId){
          const pr=await callKw('product.product','search_read',
            [[['id','=',prodId],['active','=',true]]], {fields, limit:1});
          if(pr?.length){ pr[0]._pack=packInfo; log('[Step 3a] found via product_id'); return pr[0]; }
        }
        const tmplId=Array.isArray(pkg.product_tmpl_id)?pkg.product_tmpl_id[0]:
                     (typeof pkg.product_tmpl_id==='number'?pkg.product_tmpl_id:null);
        if(tmplId){
          const pr=await callKw('product.product','search_read',
            [[['product_tmpl_id','=',tmplId],['active','=',true]]], {fields, limit:1});
          if(pr?.length){ pr[0]._pack=packInfo; log('[Step 3b] found via product_tmpl_id'); return pr[0]; }
        }
      }
    }catch(e){ log('[Step 3 FAILED] '+e.message); }

    // 4. product.uom lookup (Odoo 19 Online)
    //    CONFIRMED by log: uom.uom.product_uom_ids (one2many to product.uom)
    //    is labeled "Barcodes". Each product.uom record stores a barcode for
    //    a UOM packaging. Lookup: product.uom.barcode → uom_id → product.template
    //    (via uom_ids many2many) → product.product.
    try{
      // 4a. Discover product.uom fields (barcode field name, qty, product link)
      let bField='barcode', qField=null, hasTmpl=false;
      try{
        const fget=await callKw('product.uom','fields_get',[],
          {attributes:['string','type','relation']});
        const chars=Object.keys(fget).filter(k=>fget[k].type==='char');
        const nums=Object.entries(fget)
          .filter(([k,v])=>['float','integer'].includes(v.type))
          .map(([k,v])=>k+':'+v.string);
        const m2o=Object.entries(fget)
          .filter(([k,v])=>v.type==='many2one')
          .map(([k,v])=>k+'→'+v.relation);
        log('[product.uom fields] chars='+JSON.stringify(chars)
            +' nums='+JSON.stringify(nums)+' m2o='+JSON.stringify(m2o));
        // Barcode field: prefer 'barcode', else first char field
        bField=chars.includes('barcode')?'barcode':(chars.find(k=>k.includes('code')||k.includes('scan'))||chars[0]||'barcode');
        // Quantity field
        qField=Object.keys(fget).find(k=>
          ['float','integer'].includes(fget[k].type)&&
          (k==='qty'||k==='quantity'||k.includes('qty')||k.includes('quant')||k.includes('factor'))
        )||null;
        hasTmpl='product_tmpl_id' in fget;
        log('[product.uom] bField='+bField+' qField='+qField+' hasTmpl='+hasTmpl);
      }catch(e2){ log('[product.uom fields_get] '+e2.message); }

      // 4b. Search product.uom for the scanned barcode
      const reqFlds=['id','uom_id',bField];
      if(qField) reqFlds.push(qField);
      if(hasTmpl) reqFlds.push('product_tmpl_id');

      const puomRows=await callKw('product.uom','search_read',
        [[[bField,'=',query]]],{fields:reqFlds,limit:1});
      log('[product.uom search] field='+bField+' hits='+JSON.stringify(puomRows?.length));

      if(puomRows?.length){
        const puom=puomRows[0];
        log('[product.uom record] '+JSON.stringify(puom));
        const uomId=Array.isArray(puom.uom_id)?puom.uom_id[0]:(puom.uom_id||null);
        const packQty=qField?(parseFloat(puom[qField])||1):1;

        // Get UOM name + relative_factor (pack quantity) for display
        let uomName='Pack', resolvedQty=packQty;
        if(uomId){
          const uRec=await callKw('uom.uom','search_read',
            [[['id','=',uomId]]],{fields:['name','relative_factor'],limit:1});
          uomName=uRec?.[0]?.name||'Pack';
          if(parseFloat(uRec?.[0]?.relative_factor||0)>0)
            resolvedQty=parseFloat(uRec[0].relative_factor);
          log('[product.uom] uomName='+uomName+' relative_factor='+uRec?.[0]?.relative_factor+' → packQty='+resolvedQty);
        }
        const packInfo={qty:resolvedQty,name:uomName,barcode:query};

        // 4c. Find product via product_tmpl_id on product.uom (fastest path)
        if(hasTmpl&&puom.product_tmpl_id){
          const tmplId=Array.isArray(puom.product_tmpl_id)?puom.product_tmpl_id[0]:puom.product_tmpl_id;
          const pr=await callKw('product.product','search_read',
            [[['product_tmpl_id','=',tmplId],['active','=',true]]],{fields,limit:1});
          if(pr?.length){pr[0]._pack=packInfo;log('[product.uom] FOUND via product_tmpl_id');return pr[0];}
        }

        // 4d. Fallback: search product.template where uom_ids contains this uom.uom
        if(uomId){
          const tmplRows=await callKw('product.template','search_read',
            [[['uom_ids','in',[uomId]],['active','=',true]]],
            {fields:['id'],limit:1});
          log('[product.uom] uom_ids search: tmplRows='+JSON.stringify(tmplRows?.length));
          if(tmplRows?.length){
            const pr=await callKw('product.product','search_read',
              [[['product_tmpl_id','=',tmplRows[0].id],['active','=',true]]],
              {fields,limit:1});
            if(pr?.length){pr[0]._pack=packInfo;log('[product.uom] FOUND via uom_ids');return pr[0];}
          }
        }
      }else{
        log('[product.uom] barcode not found in product.uom.'+bField);
      }
    }catch(e){ log('[product.uom FAILED] '+e.message); }

    log('[_findProduct] all steps exhausted — not found for: '+query);
    return null;
  },

  /* Resolves the actual Arabic locale code installed in this Odoo
     instance (e.g. 'ar_001', 'ar_SY') so Arabic searches use whatever
     translated product names actually exist, rather than guessing. */
  async _resolveArabicLangCode(){
    if(State._arLangCode!==undefined) return State._arLangCode;
    try{
      const langs=await callKw('res.lang','search_read',
        [[['code','=like','ar%'],['active','=',true]]], {fields:['code'], limit:1});
      State._arLangCode=(langs && langs[0] && langs[0].code) || null;
    }catch(e){ State._arLangCode=null; }
    return State._arLangCode;
  },

  /* ── Flexible multi-word name search ─────────────────────────────
     Matches regardless of word order and allows partial words
     (e.g. "toilet covers", "cover toilet", "toil cov" all match
     "Toilet seat covers"). Also makes a best-effort attempt at
     smashed-together queries with no spaces (e.g. "papercup" will
     find a product literally named "Paper Cup"); this can't reliably
     catch cases where an unrelated word sits between the two typed
     words in the real product name (e.g. "Toilet SEAT covers").
     Works the same way for Arabic text typed by the user — Odoo's
     ilike is fully Unicode-aware, and if the product name has an
     Arabic translation in Odoo, it's searched automatically. */
  async _fetchNameCandidates(filterTerm, context){
    const fields=['id','name','barcode','default_code','lst_price',
      'standard_price','qty_available','uom_id','categ_id','product_tmpl_id'];
    try{
      const kwargs={fields, limit:150};
      if(context) kwargs.context=context;
      return await callKw('product.product','search_read',
        [[['name','ilike',filterTerm],['active','=',true]]],
        kwargs) || [];
    }catch(e){ log('_fetchNameCandidates failed: ' + e.message); return []; }
  },

  async _searchByKeywords(query){
    const rawTokens=query.trim().split(/\s+/).filter(t=>t.length>0);
    if(!rawTokens.length) return [];
    const lowerTokens=rawTokens.map(t=>t.toLowerCase());
    const queryNorm=query.replace(/\s+/g,'').toLowerCase();

    let context=null;
    if(/[\u0600-\u06FF]/.test(query)){
      const arLang=await this._resolveArabicLangCode();
      if(arLang) context={lang:arLang};
    }

    let candidates=[];
    if(rawTokens.length>=2){
      // Multiple typed words: use the longest one as the server-side
      // filter (very likely a literal substring of the real name),
      // then require every OTHER word to also appear in the name —
      // this naturally allows any word order and partial words.
      const primary=lowerTokens.reduce((a,b)=> b.length>a.length?b:a, lowerTokens[0]);
      candidates=await this._fetchNameCandidates(primary, context);
    }else{
      // Single token — could be a normal short word, or a smashed
      // multi-word guess. Try it whole first; if nothing comes back,
      // retry with shorter prefixes to widen the net.
      const token=lowerTokens[0];
      candidates=await this._fetchNameCandidates(token, context);
      if(!candidates.length && token.length>5){
        for(const len of [6,5,4]){
          if(token.length<len) continue;
          candidates=await this._fetchNameCandidates(token.slice(0,len), context);
          if(candidates.length) break;
        }
      }
    }
    if(!candidates.length) return [];

    const matches=candidates.filter(p=>{
      const nameLower=(p.name||'').toLowerCase();
      const nameNorm=nameLower.replace(/\s+/g,'');
      const allWordsPresent=lowerTokens.every(t=>nameLower.includes(t));
      const smashedMatch=queryNorm.length>=3 && nameNorm.includes(queryNorm);
      return allWordsPresent || smashedMatch;
    });

    matches.sort((a,b)=>(a.name||'').length-(b.name||'').length);
    return matches.slice(0,12);
  },

  _showPicker(matches){
    const list=document.getElementById('pickerList');
    list.innerHTML='';
    matches.forEach(p=>{
      const row=document.createElement('div');
      row.className='picker-row';
      const price=fmtPrice(applyTax(applyMarkup(parseFloat(p.lst_price||0))));
      const metaParts=[];
      if(p.default_code) metaParts.push('ref '+escapeHtml(p.default_code));
      if(p.barcode) metaParts.push(escapeHtml(p.barcode));
      row.innerHTML=
        `<div class="picker-row-name">${escapeHtml(p.name||'')}</div>`+
        `<div class="picker-row-meta">${metaParts.join('  ·  ')}</div>`+
        `<div class="picker-row-price">${price}</div>`;
      row.addEventListener('click', ()=>this._selectPickerItem(p));
      list.appendChild(row);
    });
    showStatus('picker');
  },

  async _selectPickerItem(product){
    this._cancelTimers();
    showStatus('loading');
    await this._showProduct(product);
    showStatus('result');
    this._startCountdown();
  },

  async _showProduct(json){
    State._lastProduct=json;
    const pack=json._pack || null;
    const packQty=pack ? (parseFloat(pack.qty)||1) : 1;

    const unitListPrice=parseFloat(json.lst_price||0);
    const unitCostPrice=parseFloat(json.standard_price||0);
    const qty=parseFloat(json.qty_available||0);
    const uom=nameOf(json.uom_id), categ=nameOf(json.categ_id);
    const tmplId=Array.isArray(json.product_tmpl_id)?json.product_tmpl_id[0]:0;
    const s=State.settings;

    // Discount math always runs on the per-unit price — that's how
    // Odoo's pricelist rules are defined — then we scale to pack size
    // afterwards purely for display.
    let unitPlPrice=unitListPrice, isDisc=false, discPct=0;
    let plMinQty=0, plDateStart=null, plDateEnd=null;
    if(s.pricelistId){
      const r=await this._getPricelistInfo(json.id,tmplId,unitListPrice);
      unitPlPrice=r.price; isDisc=r.isDiscounted; discPct=r.discountPct;
      plMinQty=r.minQty||0; plDateStart=r.dateStart||null; plDateEnd=r.dateEnd||null;
    }
    const listPrice=unitListPrice*packQty;
    const plPrice=unitPlPrice*packQty;
    const costPrice=unitCostPrice*packQty;

    const isExempt=(State.settings.taxExemptProducts||[]).some(x=>x.id===json.id);

    let promo=null;
    if(s.showLoyaltyPromo!==false){
      promo=await this._getLoyaltyPromo(json.id);
    }

    // Pack label (e.g. "Pack of 6 pcs.") shown above the product name
    const packLabelEl=document.getElementById('packLabel');
    if(pack){
      packLabelEl.textContent=pack.name || `Pack of ${packQty} ${uom}`;
      packLabelEl.style.display='block';
    }else packLabelEl.style.display='none';

    // Sale / promo badge — smart labels (BUY X PCs, LIMITED OFFER UNTIL, or SALE)
    // Phrasing follows the current UI language (EN/AR) via I18N; the
    // quantity, percentage, and day number always stay as plain
    // English digits — only the surrounding words are translated.
    const badge=document.getElementById('saleBadge');
    const offerUntilBadge=document.getElementById('offerUntilBadge');
    const _lang=I18N[(State.settings&&State.settings.uiLang==='ar')?'ar':'en'];
    if(isDisc&&s.showDiscount){
      if(s.showPromoDetails){
        const parseD=str=>{ if(!str) return null; const p=str.split(' ')[0].split('-'); return p.length>=3?{d:+p[2],m:+p[1]-1}:null; };
        const hasMinQty=plMinQty>1;
        const expiryDt=parseD(plDateEnd);          // only use END date for "UNTIL"
        const expiryStr=expiryDt?`${expiryDt.d} ${_lang.months[expiryDt.m]}`:null;
        // Primary badge
        if(hasMinQty){
          badge.textContent=`${_lang.badgeBuyGetPrefix} ${Math.round(plMinQty)} ${_lang.badgeBuyGetMid} ${discPct.toFixed(0)}% ${_lang.badgeBuyGetSuffix}`;
          badge.className='sale-badge badge-min-qty';
        }else if(expiryStr){
          badge.textContent=`${_lang.badgeLimitedUntil} ${expiryStr}`;
          badge.className='sale-badge badge-validity';
        }else{
          badge.textContent=`${_lang.badgeSalePrefix} ${discPct.toFixed(1)}% ${_lang.badgeSaleSuffix}`;
          badge.className='sale-badge';
        }
        badge.style.display='inline-block';
        // Secondary badge: show validity alongside min-qty if both apply
        if(hasMinQty&&expiryStr){
          offerUntilBadge.textContent=`${_lang.badgeLimitedUntil} ${expiryStr}`;
          offerUntilBadge.style.display='inline-block';
        }else{ offerUntilBadge.style.display='none'; }
      }else{
        badge.textContent=`${_lang.badgeSalePrefix} ${discPct.toFixed(1)}% ${_lang.badgeSaleSuffix}`;
        badge.className='sale-badge';
        badge.style.display='inline-block';
        if(offerUntilBadge) offerUntilBadge.style.display='none';
      }
    }else{
      badge.style.display='none';
      if(offerUntilBadge) offerUntilBadge.style.display='none';
    }

    // Offers-panel — mirrors badges but in the dedicated right column
    const offersPanel=document.getElementById('offersPanel');
    const panelSale=document.getElementById('offerPanelSale');
    const panelUntil=document.getElementById('offerPanelUntil');
    if(offersPanel&&panelSale&&panelUntil){
      if(isDisc&&s.showDiscount&&s.showPromoDetails){
        panelSale.textContent=badge.textContent;
        panelSale.className=badge.className;
        panelSale.style.display='block';
        if(offerUntilBadge&&offerUntilBadge.style.display!=='none'){
          panelUntil.textContent=offerUntilBadge.textContent;
          panelUntil.style.display='block';
        }else{ panelUntil.style.display='none'; }
        offersPanel.style.display='flex';
      }else{
        panelSale.style.display='none';
        panelUntil.style.display='none';
        offersPanel.style.display='none';
      }
    }

    // Big flashing discount line (same treatment as Buy-X-Get-Y promo line)
    const discountLine=document.getElementById('discountLine');
    if(isDisc&&s.showDiscount){ discountLine.textContent=`${discPct.toFixed(1)}% OFF`; discountLine.style.display='block'; }
    else discountLine.style.display='none';

    // Limited offer badge (loyalty buy-x-get-y)
    const offerBadge=document.getElementById('offerBadge');
    if(promo){ offerBadge.textContent='Limited offer'; offerBadge.style.display='inline-block'; }
    else offerBadge.style.display='none';

    const taxBadge=document.getElementById('taxBadge');
    if(hasTax() && !isExempt){
      taxBadge.textContent=isDisc?`Prices include ${s.taxPercent}% VAT`:`Price includes ${s.taxPercent}% VAT`;
      taxBadge.style.display='inline-block';
    }else taxBadge.style.display='none';

    const img=document.getElementById('productImg');
    const imgPlaceholder=document.getElementById('productImgPlaceholder');
    if(s.showImage){
      img.style.display='none';
      imgPlaceholder.style.display='flex'; // show placeholder while loading / as fallback
      try{
        const dataUrl=await window.api.fetchProductImage(json.id);
        if(dataUrl && dataUrl.startsWith('data:')){
          img.src=dataUrl;
          img.style.display='block';
          imgPlaceholder.style.display='none';
        }
      }catch(e){ log('fetchProductImage failed (non-fatal): ' + e.message); }
    }else{
      img.style.display='none';
      imgPlaceholder.style.display='none';
    }

    document.getElementById('productName').textContent=json.name||'';

    // Promo line (big bold red "Buy X get Y free")
    const promoLine=document.getElementById('promoLine');
    if(promo){ promoLine.textContent=promo.label; promoLine.style.display='block'; }
    else promoLine.style.display='none';

    const finalUnitPrice=isDisc&&s.showDiscount ? plPrice : listPrice;
    const displayPrice=isExempt ? applyMarkup(finalUnitPrice) : applyTax(applyMarkup(finalUnitPrice));

    // Price (the hero number)
    const priceEl=document.getElementById('productPrice');
    if(s.showSale){
      priceEl.textContent=fmtPrice(displayPrice);
      priceEl.style.display='block';
    }else priceEl.style.display='none';

    // Original (struck-through) price shown only when discounted
    const origEl=document.getElementById('productOrigPrice');
    if(isDisc&&s.showDiscount&&s.showSale){
      origEl.textContent=fmtPrice(isExempt?applyMarkup(listPrice):applyTax(applyMarkup(listPrice)));
      origEl.style.display='inline';
    }else origEl.style.display='none';

    // Single muted caption line: ref · stock · barcode
    const dispBarcode=pack ? (pack.barcode||json.barcode) : json.barcode;
    const parts=[];
    if(s.showRef&&json.default_code) parts.push(`ref ${json.default_code}`);
    if(s.showQty){
      if(pack){
        const packsAvail=packQty>0 ? Math.floor(qty/packQty) : 0;
        parts.push(`stock ${packsAvail} pack(s) (${qty.toFixed(0)} ${uom} total)`);
      }else{
        parts.push(`stock ${qty.toFixed(0)} ${uom}`);
      }
    }
    if(dispBarcode) parts.push(dispBarcode);
    if(s.showCat&&categ) parts.push(categ);
    document.getElementById('productCaption').textContent=parts.join('  ·  ');

    // Cost price (optional, separate small line)
    const costEl=document.getElementById('productCost');
    if(s.showCost){ costEl.textContent=`Cost (ex. VAT): ${fmtPrice(costPrice)}`; costEl.style.display='block'; }
    else costEl.style.display='none';

    // Toggle has-offers class on result-card for layout switching
    const resultCard=document.querySelector('.result-card');
    const hasOffers=(isDisc&&s.showDiscount&&s.showPromoDetails) ||
                    (promo&&s.showLoyaltyPromo);
    if(resultCard){
      if(hasOffers) resultCard.classList.add('has-offers');
      else resultCard.classList.remove('has-offers');
    }

    // Packaging prices — shown below the main price when enabled
    const pkgListEl=document.getElementById('packagingList');
    if(pkgListEl){
      if(s.showPackaging && !pack){
        const pkgs=await this._fetchPackagings(json.id);
        if(pkgs.length){
          const baseUnit=isDisc&&s.showDiscount ? unitPlPrice : unitListPrice;
          pkgListEl.innerHTML=pkgs.map(pkg=>{
            const raw=baseUnit*parseFloat(pkg.qty||1);
            const shown=s.markupExcludePackaging
              ? (isExempt?raw:applyTax(raw))
              : (isExempt?applyMarkup(raw):applyTax(applyMarkup(raw)));
            const uomLabel=uom?` ${uom}`:'';
            return `<div class="packaging-item">`+
              `<span class="packaging-item-name">${escapeHtml(pkg.name||'')}</span>`+
              `<span class="packaging-item-qty">${parseFloat(pkg.qty||1).toFixed(0)}${uomLabel}</span>`+
              `<span class="packaging-item-price">${fmtPrice(shown)}</span>`+
              `</div>`;
          }).join('');
          pkgListEl.style.display='flex';
        }else pkgListEl.style.display='none';
      }else pkgListEl.style.display='none';
    }
  },

  /* ── Loyalty / Buy-X-Get-Y promotion lookup ─────────────────────────
     Reads Odoo's loyalty.program / loyalty.rule / loyalty.reward models
     (the same engine behind Sales & POS promotions). Only considers
     programs with program_type='buy_x_get_y' and trigger='auto' —
     coupon-code and gift-card programs are intentionally excluded since
     they don't apply automatically at a price-check. */
  async _getLoyaltyPromo(productId){
    try{
      const today=new Date().toISOString().slice(0,10);

      const programs=await callKw('loyalty.program','search_read',
        [[['program_type','=','buy_x_get_y'],['trigger','=','auto'],['active','=',true]]],
        {fields:['id','date_from','date_to']});
      if(!programs?.length) return null;

      const validProgramIds=programs
        .filter(p => (!p.date_from || p.date_from<=today) && (!p.date_to || p.date_to>=today))
        .map(p => p.id);
      if(!validProgramIds.length) return null;

      // NOTE: any_product is a non-stored computed field on loyalty.rule —
      // Odoo cannot use it inside a search domain, only read it. So we
      // fetch all rules for the valid programs and filter for our product
      // (or any_product=true) in JavaScript instead.
      const allRules=await callKw('loyalty.rule','search_read',
        [[['program_id','in',validProgramIds]]],
        {fields:['id','program_id','minimum_qty','product_ids','any_product']});
      if(!allRules?.length) return null;

      const rules=allRules.filter(r =>
        r.any_product===true || (Array.isArray(r.product_ids) && r.product_ids.includes(productId)));
      if(!rules.length) return null;

      const matchedProgramIds=rules.map(r => r.program_id[0]);
      const rewards=await callKw('loyalty.reward','search_read',
        [[['program_id','in',matchedProgramIds],['reward_type','=','product']]],
        {fields:['id','program_id','reward_product_id','reward_product_qty']});
      if(!rewards?.length) return null;

      const rule=rules[0];
      const reward=rewards.find(r => r.program_id[0]===rule.program_id[0]) || rewards[0];
      if(!rule.minimum_qty || !reward.reward_product_qty) return null;

      const sameProduct = reward.reward_product_id && reward.reward_product_id[0]===productId;
      const label = sameProduct
        ? `Buy ${rule.minimum_qty} get ${reward.reward_product_qty} free`
        : `Buy ${rule.minimum_qty} get ${reward.reward_product_qty} free ${nameOf(reward.reward_product_id)}`;

      return { label, minQty: rule.minimum_qty, freeQty: reward.reward_product_qty };
    }catch(e){
      log('_getLoyaltyPromo failed (non-fatal): ' + e.message);
      return null;
    }
  },

  async _fetchPackagings(productId){
    // Odoo 19 Online: packagings stored in product.uom, linked via
    // product.template.uom_ids (many2many to uom.uom).
    // Each uom.uom.product_uom_ids → product.uom contains the barcode + qty.
    try{
      const varRows=await callKw('product.product','search_read',
        [[['id','=',productId]]],{fields:['product_tmpl_id'],limit:1});
      const tmplId=varRows?.[0]?.product_tmpl_id?.[0];
      if(!tmplId) return [];

      // Get UOM IDs linked to this product template
      const tmplRows=await callKw('product.template','search_read',
        [[['id','=',tmplId]]],{fields:['uom_ids'],limit:1});
      const uomIds=tmplRows?.[0]?.uom_ids||[];
      if(!uomIds.length) return [];

      // Discover product.uom fields (barcode + qty) once, then fetch records
      let bField='barcode', qField=null;
      try{
        const fget=await callKw('product.uom','fields_get',[],{attributes:['string','type']});
        const chars=Object.keys(fget).filter(k=>fget[k].type==='char');
        bField=chars.includes('barcode')?'barcode':(chars.find(k=>k.includes('code'))||chars[0]||'barcode');
        qField=Object.keys(fget).find(k=>
          ['float','integer'].includes(fget[k].type)&&
          (k==='qty'||k==='quantity'||k.includes('qty')||k.includes('quant'))
        )||null;
      }catch(_){}

      // Fetch product.uom records for these UOM IDs
      const reqFlds=['id','uom_id',bField];
      if(qField) reqFlds.push(qField);
      const puomRows=await callKw('product.uom','search_read',
        [[['uom_id','in',uomIds]]],{fields:reqFlds,limit:20});

      // Also get UOM names for display
      const uomRecs=await callKw('uom.uom','search_read',
        [[['id','in',uomIds]]],{fields:['id','name','relative_factor'],limit:20});
      const uomMap=Object.fromEntries((uomRecs||[]).map(u=>[u.id,u]));

      return (puomRows||[]).map(p=>{
        const uomId=Array.isArray(p.uom_id)?p.uom_id[0]:p.uom_id;
        const uom=uomMap[uomId]||{};
        // prefer relative_factor from uom.uom; fall back to qty field on product.uom
        const qty=parseFloat(uom.relative_factor||0)>0
          ? parseFloat(uom.relative_factor)
          : qField?(parseFloat(p[qField])||1):1;
        return {id:p.id, name:uom.name||'Pack', qty, barcode:p[bField]||null};
      }).filter(p=>p.qty>1);
    }catch(e){ log('_fetchPackagings (product.uom) failed: '+e.message); }

    // Fallback: classic product.packaging model (Odoo 14-16)
    try{
      const r=await callKw('product.packaging','search_read',
        [[['product_id','=',productId]]],
        {fields:['id','name','qty','barcode'],limit:20});
      return (r||[]).filter(p=>parseFloat(p.qty||0)>1);
    }catch(e){ log('_fetchPackagings fallback failed: '+e.message); return []; }
  },

  async _getPricelistInfo(productId,tmplId,listPrice){
    try{
      const today=new Date().toISOString().slice(0,10);
      const items=await callKw('product.pricelist.item','search_read',
        [[['pricelist_id','=',State.settings.pricelistId],
          '|','&',['applied_on','=','0_product_variant'],['product_id','=',productId],
          '&',['applied_on','=','1_product'],['product_tmpl_id','=',tmplId],
          '|',['date_start','=',false],['date_start','<=',today],
          '|',['date_end','=',false],['date_end','>=',today]]],
        {fields:['applied_on','product_id','product_tmpl_id','compute_price','fixed_price','percent_price','min_quantity','date_start','date_end']});
      if(!items?.length) return{price:listPrice,isDiscounted:false,discountPct:0,minQty:0,dateStart:null,dateEnd:null};
      const match=items.find(i=>i.applied_on==='0_product_variant')||items.find(i=>i.applied_on==='1_product');
      if(!match) return{price:listPrice,isDiscounted:false,discountPct:0,minQty:0,dateStart:null,dateEnd:null};
      let price=listPrice;
      if(match.compute_price==='fixed') price=parseFloat(match.fixed_price);
      else if(match.compute_price==='percentage') price=listPrice*(1-parseFloat(match.percent_price)/100);
      const isDisc=price<listPrice-0.001;
      const discPct=isDisc?Math.round((listPrice-price)/listPrice*1000)/10:0;
      return{price,isDiscounted:isDisc,discountPct:discPct,
             minQty:parseFloat(match.min_quantity||0),
             dateStart:match.date_start||null,dateEnd:match.date_end||null};
    }catch(e){ log('_getPricelistInfo failed: ' + e.message); return{price:listPrice,isDiscounted:false,discountPct:0,minQty:0,dateStart:null,dateEnd:null}; }
  },

  reset(){
    this._cancelTimers(); showStatus('idle');
    document.getElementById('barcodeInput').focus();
    SS.scheduleStart();
  },
  _startCountdown(){
    let left=State.settings.resetSeconds;
    const upd=()=>{
      const t=left>0?`⏱ Resetting in ${left}s`:'';
      const e1=document.getElementById('countdown'), e2=document.getElementById('notFoundCountdown');
      if(e1)e1.textContent=t; if(e2)e2.textContent=left>0?`Ready in ${left}s`:'';
    };
    upd();
    State.cdTimer=setInterval(()=>{ left--;upd();if(left<=0)clearInterval(State.cdTimer); },1000);
    State.resetTimer=setTimeout(()=>this.reset(), left*1000);
  },
  _cancelTimers(){ clearTimeout(State.resetTimer); clearInterval(State.cdTimer); },

  /* ── Settings — heavily logged so we can see exactly where
     execution gets to if anything ever fails again ─────────────*/
  showSettings(){
    log('showSettings: ENTRY');
    try{
      SS.exit(); SS.cancelIdleTimer();
      const s=State.settings;
      const chk=(id,v)=>{ const el=document.getElementById(id); if(el) el.checked=v; };
      const val=(id,v)=>{ const el=document.getElementById(id); if(el) el.value=v; };

      chk('setShowImage', s.showImage);
      chk('setShowRef', s.showRef);
      chk('setShowSale', s.showSale);
      chk('setShowCost', s.showCost);
      chk('setShowCat', s.showCat);
      chk('setShowQty', s.showQty);
      chk('setShowDiscount', s.showDiscount);
      chk('setShowLoyaltyPromo',        s.showLoyaltyPromo);
      chk('setShowPromoDetails',       s.showPromoDetails);
      chk('setMarkupExcludePackaging', s.markupExcludePackaging);
      chk('setShowPackaging',   s.showPackaging);
      chk('setMarkupEnabled', s.markupEnabled);
      const hdrT=document.getElementById('hdrMarkupToggle');
      if(hdrT){ hdrT.checked=s.markupEnabled;
        hdrT.closest('.hdr-markup-toggle')?.classList.toggle('is-active', s.markupEnabled); }
      val('setMarkupPct',     s.markupPercent||0);
      val('setMarkupRound',   s.markupRound||0);
      this._updateMarkupExample();

      chk('setSlideshowOn', s.slideshowEnabled);
      chk('setStartFullscreen', s.startFullscreen);

      val('setTax', s.taxPercent||0);
      val('setResetSec', s.resetSeconds);
      val('setSlideshowDelay', s.slideshowDelay);
      val('setSlideDuration', s.slideDuration);
      val('setBg', s.bgColor);
      val('setAccent', s.accentColor);
      val('setText', s.textColor);
      val('setKioskTitle', s.kioskTitle||'');
      val('setTitleFont', s.titleFont||'inherit');
      val('setTitleSize', s.titleSize||22);
      val('setTitleWeight', s.titleWeight||'700');
      val('setTitleColor', s.titleColor||'#1a1a2e');

      const rv=document.getElementById('resetSecVal'); if(rv) rv.textContent=s.resetSeconds+'s';
      const pb=document.getElementById('prevBg');      if(pb) pb.style.background=s.bgColor;
      const pa=document.getElementById('prevAccent');  if(pa) pa.style.background=s.accentColor;
      const pt=document.getElementById('prevText');    if(pt) pt.style.background=s.textColor;
      const pc=document.getElementById('prevTitleColor'); if(pc) pc.style.background=s.titleColor||'#1a1a2e';

      const sel=document.getElementById('setPricelist');
      if(sel){
        sel.innerHTML='<option value="">Default (no pricelist)</option>';
        State.pricelists.forEach(p=>{
          const o=document.createElement('option');
          o.value=p.id; o.textContent=p.name;
          if(State.settings.pricelistId===p.id) o.selected=true;
          sel.appendChild(o);
        });
      }
      log('showSettings: fields populated');

      const saved=localStorage.getItem('pc_custom_logo');
      const prev=document.getElementById('currentLogoPreview');
      const rmBtn=document.getElementById('btnRemoveLogo');
      if(saved){ if(prev){prev.src=saved;prev.style.display='block';} if(rmBtn)rmBtn.style.display='inline-block'; }
      else{ if(prev)prev.style.display='none'; if(rmBtn)rmBtn.style.display='none'; }
      State.pendingLogoData=null;
      const lu=document.getElementById('logoUpload'); if(lu) lu.value='';

      this.renderSlidesGrid();
      log('showSettings: slides grid rendered');

      this.renderExemptList();
      document.getElementById('exemptSearchResults').innerHTML='';
      document.getElementById('exemptSearchInput').value='';

      const ci=document.getElementById('connectionInfo');
      if(ci) ci.innerHTML=`<strong>${State.baseUrl}</strong><br>DB: ${State.db} &nbsp;•&nbsp; User: ${State.username}`;

      showView('settingsView');
      log('showSettings: EXIT — settingsView should now be visible');
    }catch(e){ logError('showSettings', e); }
  },

  _updateMarkupExample(){
    const el=document.getElementById('markupExample'); if(!el) return;
    const enabled=document.getElementById('setMarkupEnabled')?.checked;
    const pct=parseFloat(document.getElementById('setMarkupPct')?.value||0);
    const round=parseFloat(document.getElementById('setMarkupRound')?.value||0);
    if(!enabled||!(pct>0)){
      el.textContent='Enable markup and enter a % to see a live preview.';
      return;
    }
    const base=100, marked=base*(1+pct/100);
    const rounded=round>0?Math.round(marked/round)*round:marked;
    const f2=n=>n.toFixed(2);
    let txt=`${f2(base)} + ${f2(pct)}% → ${f2(marked)}`;
    if(round>0) txt+=` → rounds to ${f2(rounded)}`;
    el.textContent=txt;
  },

  hideSettings(){
    log('hideSettings: invoked');
    try{
      showView('scannerView');
      document.getElementById('barcodeInput').focus();
      SS.scheduleStart();
    }catch(e){ logError('hideSettings', e); }
  },

  saveSettings(){
    log('saveSettings: invoked');
    try{
      const s=State.settings;
      const chk=(id)=>!!document.getElementById(id)?.checked;
      const num=(id)=>parseFloat(document.getElementById(id)?.value)||0;
      const int=(id)=>parseInt(document.getElementById(id)?.value)||0;
      const str=(id)=>document.getElementById(id)?.value||'';

      s.showImage        = chk('setShowImage');
      s.showRef          = chk('setShowRef');
      s.showSale         = chk('setShowSale');
      s.showCost         = chk('setShowCost');
      s.showCat          = chk('setShowCat');
      s.showQty          = chk('setShowQty');
      s.showDiscount     = chk('setShowDiscount');
      s.showLoyaltyPromo = chk('setShowLoyaltyPromo');
      s.showPromoDetails        = chk('setShowPromoDetails');
      s.markupExcludePackaging  = chk('setMarkupExcludePackaging');
      s.showPackaging     = chk('setShowPackaging');
      s.markupEnabled    = chk('setMarkupEnabled');
      const hdrTog=document.getElementById('hdrMarkupToggle');
      if(hdrTog){ hdrTog.checked=s.markupEnabled;
        hdrTog.closest('.hdr-markup-toggle')?.classList.toggle('is-active', s.markupEnabled); }
      s.markupPercent    = num('setMarkupPct');
      s.markupRound      = num('setMarkupRound');
      s.slideshowEnabled = chk('setSlideshowOn');
      s.startFullscreen  = chk('setStartFullscreen');
      s.taxPercent       = num('setTax');
      s.resetSeconds     = int('setResetSec') || 7;
      s.slideshowDelay   = int('setSlideshowDelay') || 30;
      s.slideDuration    = int('setSlideDuration') || 5;
      s.bgColor          = str('setBg');
      s.accentColor      = str('setAccent');
      s.textColor        = str('setText');
      s.kioskTitle       = str('setKioskTitle');
      s.titleFont        = str('setTitleFont');
      s.titleSize        = int('setTitleSize') || 22;
      s.titleWeight      = str('setTitleWeight');
      s.titleColor       = str('setTitleColor');

      const plVal=document.getElementById('setPricelist')?.value;
      s.pricelistId=plVal?parseInt(plVal):null;

      if(State.pendingLogoData){
        localStorage.setItem('pc_custom_logo', State.pendingLogoData);
        const li=document.getElementById('logoImg');
        if(li){ li.src=State.pendingLogoData; li.style.display='block'; }
        document.getElementById('logoBar')?.classList.remove('hidden');
        State.pendingLogoData=null;
      }

      saveState();
      applyColors();
      applyTagline();
      this.hideSettings();
      log('saveSettings: done');
    }catch(e){ logError('saveSettings', e); }
  },
};

/* ── UI helpers ────────────────────────────────────────────────── */
function showView(id){
  try{
    const target=document.getElementById(id);
    if(!target){ logError('showView', new Error('Element not found: #'+id)); return; }
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    target.classList.add('active');
    log('showView: activated #' + id);
    // Diagnostic: dump the ACTUAL computed display of every view so we can
    // see in the log file whether the CSS really applied or not.
    document.querySelectorAll('.view').forEach(v=>{
      try{
        const cs = window.getComputedStyle(v);
        log(`  computed-style: #${v.id} display="${cs.display}" classes="${v.className}"`);
      }catch(_){}
    });
  }catch(e){ logError('showView', e); }
}
function showStatus(s){
  const map={ idle:'idleState', loading:'loadingState', result:'resultState', notFound:'notFoundState', picker:'pickerState' };
  Object.values(map).forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display='none'; });
  const el=document.getElementById(map[s]); if(el) el.style.display='block';
  // Header reset shortcut only makes sense when a result or not-found state is showing
  const hdrReset=document.getElementById('btnResetHeader');
  if(hdrReset) hdrReset.style.display=(s==='result'||s==='notFound')?'inline-flex':'none';
  // Picker lists can be taller than the window — stop vertical centering
  // so the top/bottom rows aren't pushed out of view (JS class, robust
  // fallback alongside the CSS :has() rule).
  const kioskMain=document.querySelector('.kiosk-main');
  if(kioskMain) kioskMain.classList.toggle('picker-active', s==='picker');
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function showError(msg){ const e=document.getElementById('loginError'); if(e){e.textContent=msg;e.classList.add('show');} }
function hideError(){ document.getElementById('loginError')?.classList.remove('show'); }

/* ── EN/AR translation dictionary ──────────────────────────────────
   Only static UI chrome is translated (buttons, labels, headings,
   hints). Product names and prices are always left exactly as Odoo
   returns them / as formatted in English digits — they are rendered
   dynamically in app.js and never pass through this dictionary. */
const I18N = {
  en: {
    loginTitle:'Price Checker', loginSub:'Connect to your Odoo 19 Online account',
    loginUrlLabel:'Odoo URL', loginDbLabel:'Database Name',
    loginDbHint:'For yourcompany.odoo.com → enter: yourcompany',
    loginEmailLabel:'Email / Username', loginPassLabel:'Password / API Key',
    loginBtn:'Connect to Odoo', viewLogLink:'🪵 View log file (for troubleshooting)',
    slideshowCta:'Scan or click to check price',
    headerTitle:'Price Checker', btnLog:'🪵 Log', btnReset:'↺ Reset', btnResetTitle:'Reset / Scan Again',
    btnFullscreen:'⛶ Fullscreen', btnSettings:'⚙ Settings', btnExit:'Exit',
    idleTitle:'Scan a barcode', idleSub:'Point your scanner or type below',
    loadingText:'Looking up product…', offerBadge:'Limited offer',
    notFoundTitle:'Product Not Found', notFoundSub:'No product matches that barcode or reference.',
    btnScanAgain:'↺ Scan Again',
    pickerTitle:'Multiple matches — tap one to select', btnCancel:'✕ Cancel',
    searchPlaceholder:'Scan or type barcode / reference…', btnSearch:'🔍 Search',
    settingsHeaderTitle:'⚙ Settings', btnBack:'← Back', btnSave:'Save',
    sectionLogoTitle:'Logo & Title', btnChooseLogo:'📁 Choose Logo', btnRemoveLogo:'✕ Remove Logo',
    logoHint:'Leave empty to use your Odoo company logo.',
    titleTaglineLabel:'Title / Tagline', taglinePlaceholder:'e.g. Welcome to Our Store — leave empty to hide',
    fontLabel:'Font', fontDefault:'Default (System)', sizeLabel:'Size', weightLabel:'Weight',
    weightNormal:'Normal', weightSemiBold:'Semi-Bold', weightBold:'Bold', weightExtraBold:'Extra Bold',
    colourLabel:'Colour',
    sectionSlideshow:'Slideshow / Screensaver', enableSlideshow:'Enable Slideshow',
    slideshowSub:'Show posters when idle', startAfter:'Start after', secondsIdle:'seconds idle',
    eachSlideFor:'Each slide for', secondsUnit:'seconds',
    posterImagesHint:'Poster images (up to 10) — click to upload, × to remove',
    sectionPricelist:'Pricelist', pricelistDefault:'Default (no pricelist)',
    sectionFieldsDisplay:'Fields to Display', fieldProductImage:'Product Image',
    fieldInternalRef:'Internal Reference', fieldSalePrice:'Sale Price', fieldCostPrice:'Cost Price',
    fieldCategory:'Category', fieldQtyOnHand:'Qty On Hand',
    sectionPackaging:'Packaging / UOM', showPackagingPrices:'Show Packaging Prices',
    showPackagingSub:'Lists available pack sizes and prices below the unit price',
    packagingHint:'💡 Reads packs defined in Odoo (e.g. Box of 6, Case of 24). Prices respect any active pricelist, markup & VAT.',
    sectionDiscount:'Discount', highlightDiscounted:'Highlight Discounted Products',
    highlightDiscountedSub:'SALE badge when a pricelist rule applies',
    showBuyXGetY:'Show Buy X Get Y Promotions',
    showBuyXGetYSub:"Reads active automatic promotions from Odoo's Loyalty Programs",
    smartPromoLabels:'Smart Promo Labels',
    smartPromoLabelsSub:'Shows "BUY X PCs — GET Y% OFF" and "OFFER UNTIL DD - Month" instead of a plain SALE badge',
    sectionConsumerPrice:'Consumer Price', applyConsumerMarkup:'Apply Consumer Markup',
    applyConsumerMarkupSub:'Adds a % on top of the Odoo list price before display',
    markupLabel:'Markup', roundToLabel:'Round to', zeroOffHint:'(0 = off)',
    excludePackagingMarkup:'Exclude Packaging from Markup',
    excludePackagingMarkupSub:'Pack / UOM prices display the base price without the consumer markup added',
    sectionTaxVat:'Tax / VAT', vatPercentage:'VAT Percentage',
    vatPercentageSub:'Enter % to add to prices. 0 = disabled.',
    taxExemptProducts:'Tax-Exempt Products',
    taxExemptSub:'These products always show their plain sale price — the VAT % above is never added to them.',
    searchProductPlaceholder:'Search product name or barcode…', btnSearchPlain:'Search',
    sectionAutoReset:'Auto-Reset Timer', resetAfter:'Reset after',
    sectionAppearance:'Appearance', startFullscreen:'Start in Fullscreen',
    startFullscreenSub:'Launch maximised (F11 to toggle anytime)',
    colorBackground:'Background', colorAccent:'Accent', colorText:'Text',
    sectionConnection:'Connection', btnDisconnect:'Disconnect & Change Account',
    badgeBuyGetPrefix:'BUY', badgeBuyGetMid:'PCs AND GET', badgeBuyGetSuffix:'OFF',
    badgeLimitedUntil:'LIMITED OFFER UNTIL', badgeSalePrefix:'SALE —', badgeSaleSuffix:'off',
    months:['January','February','March','April','May','June','July','August','September','October','November','December']
  },
  ar: {
    loginTitle:'فاحص الأسعار', loginSub:'اتصل بحساب Odoo 19 Online الخاص بك',
    loginUrlLabel:'رابط Odoo', loginDbLabel:'اسم قاعدة البيانات',
    loginDbHint:'لموقع yourcompany.odoo.com → أدخل: yourcompany',
    loginEmailLabel:'البريد الإلكتروني / اسم المستخدم', loginPassLabel:'كلمة المرور / مفتاح API',
    loginBtn:'الاتصال بـ Odoo', viewLogLink:'🪵 عرض ملف السجل (لاستكشاف الأخطاء)',
    slideshowCta:'امسح أو اضغط لمعرفة السعر',
    headerTitle:'فاحص الأسعار', btnLog:'🪵 السجل', btnReset:'↺ إعادة تعيين', btnResetTitle:'إعادة تعيين / مسح جديد',
    btnFullscreen:'⛶ ملء الشاشة', btnSettings:'⚙ الإعدادات', btnExit:'خروج',
    idleTitle:'امسح الباركود', idleSub:'وجّه الماسح أو اكتب أدناه',
    loadingText:'جارٍ البحث عن المنتج…', offerBadge:'عرض محدود',
    notFoundTitle:'المنتج غير موجود', notFoundSub:'لا يوجد منتج مطابق لهذا الباركود أو المرجع.',
    btnScanAgain:'↺ امسح مرة أخرى',
    pickerTitle:'نتائج متعددة — اضغط لاختيار واحدة', btnCancel:'✕ إلغاء',
    searchPlaceholder:'امسح أو اكتب الباركود / المرجع…', btnSearch:'🔍 بحث',
    settingsHeaderTitle:'⚙ الإعدادات', btnBack:'← رجوع', btnSave:'حفظ',
    sectionLogoTitle:'الشعار والعنوان', btnChooseLogo:'📁 اختر شعارًا', btnRemoveLogo:'✕ إزالة الشعار',
    logoHint:'اتركه فارغًا لاستخدام شعار شركتك من Odoo.',
    titleTaglineLabel:'العنوان / الشعار النصي', taglinePlaceholder:'مثال: مرحبًا بكم في متجرنا — اتركه فارغًا لإخفائه',
    fontLabel:'الخط', fontDefault:'افتراضي (النظام)', sizeLabel:'الحجم', weightLabel:'السُّمك',
    weightNormal:'عادي', weightSemiBold:'شبه عريض', weightBold:'عريض', weightExtraBold:'عريض جدًا',
    colourLabel:'اللون',
    sectionSlideshow:'عرض الشرائح / شاشة التوقف', enableSlideshow:'تفعيل عرض الشرائح',
    slideshowSub:'عرض الملصقات عند عدم النشاط', startAfter:'يبدأ بعد', secondsIdle:'ثانية من عدم النشاط',
    eachSlideFor:'كل شريحة لمدة', secondsUnit:'ثانية',
    posterImagesHint:'صور الملصقات (حتى 10) — اضغط للتحميل، × للإزالة',
    sectionPricelist:'قائمة الأسعار', pricelistDefault:'افتراضي (بدون قائمة أسعار)',
    sectionFieldsDisplay:'الحقول المعروضة', fieldProductImage:'صورة المنتج',
    fieldInternalRef:'المرجع الداخلي', fieldSalePrice:'سعر البيع', fieldCostPrice:'سعر التكلفة',
    fieldCategory:'الفئة', fieldQtyOnHand:'الكمية المتوفرة',
    sectionPackaging:'التعبئة / وحدة القياس', showPackagingPrices:'عرض أسعار التعبئة',
    showPackagingSub:'يعرض أحجام العبوات المتاحة وأسعارها أسفل سعر الوحدة',
    packagingHint:'💡 يقرأ العبوات المحددة في Odoo (مثل علبة من 6، كرتونة من 24). الأسعار تراعي أي قائمة أسعار نشطة والهامش وضريبة القيمة المضافة.',
    sectionDiscount:'الخصم', highlightDiscounted:'إبراز المنتجات المخفضة',
    highlightDiscountedSub:'شارة "تخفيض" عند تطبيق قاعدة سعر',
    showBuyXGetY:'عرض عروض اشترِ X واحصل على Y',
    showBuyXGetYSub:'يقرأ العروض التلقائية النشطة من برامج الولاء في Odoo',
    smartPromoLabels:'شارات العروض الذكية',
    smartPromoLabelsSub:'يعرض "اشترِ X قطعة واحصل على خصم Y%" و"العرض حتى تاريخ - شهر" بدلاً من شارة تخفيض عادية',
    sectionConsumerPrice:'سعر المستهلك', applyConsumerMarkup:'تطبيق هامش المستهلك',
    applyConsumerMarkupSub:'يضيف نسبة % فوق سعر القائمة من Odoo قبل العرض',
    markupLabel:'الهامش', roundToLabel:'التقريب إلى', zeroOffHint:'(0 = معطل)',
    excludePackagingMarkup:'استثناء التعبئة من الهامش',
    excludePackagingMarkupSub:'تعرض أسعار العبوات / وحدات القياس السعر الأساسي بدون هامش المستهلك',
    sectionTaxVat:'الضريبة / ضريبة القيمة المضافة', vatPercentage:'نسبة ضريبة القيمة المضافة',
    vatPercentageSub:'أدخل النسبة % لإضافتها إلى الأسعار. 0 = معطلة.',
    taxExemptProducts:'المنتجات المعفاة من الضريبة',
    taxExemptSub:'تعرض هذه المنتجات دائمًا سعر البيع الصافي — لا تُضاف إليها نسبة الضريبة أعلاه أبدًا.',
    searchProductPlaceholder:'ابحث عن اسم المنتج أو الباركود…', btnSearchPlain:'بحث',
    sectionAutoReset:'مؤقت إعادة التعيين التلقائي', resetAfter:'إعادة التعيين بعد',
    sectionAppearance:'المظهر', startFullscreen:'البدء بملء الشاشة',
    startFullscreenSub:'التشغيل بحجم كامل (F11 للتبديل في أي وقت)',
    colorBackground:'الخلفية', colorAccent:'اللون المميز', colorText:'النص',
    sectionConnection:'الاتصال', btnDisconnect:'قطع الاتصال وتغيير الحساب',
    badgeBuyGetPrefix:'اشترِ', badgeBuyGetMid:'قطعة واحصل على خصم', badgeBuyGetSuffix:'مجانًا',
    badgeLimitedUntil:'عرض لحد يوم', badgeSalePrefix:'عرض —', badgeSaleSuffix:'خصم',
    months:['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
  }
};

/* ── EN/AR translation + layout direction toggle ─────────────────────
   Translates static UI chrome (buttons, labels, headings, hints) and
   mirrors the layout to RTL. Product names, barcodes, and all price
   numbers are rendered dynamically elsewhere and are NEVER touched
   here — they always stay exactly as returned by Odoo / formatted in
   English digits. */
function applyUiLang(){
  const lang = (State.settings && State.settings.uiLang) || 'en';
  const isAr = lang === 'ar';
  const dict = I18N[isAr ? 'ar' : 'en'];

  document.documentElement.setAttribute('dir', isAr ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', isAr ? 'ar' : 'en');
  document.body.classList.toggle('rtl-layout', isAr);

  const btn = document.getElementById('btnLangToggle');
  if(btn) btn.textContent = isAr ? 'AR' : 'EN';

  // Text content
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key = el.getAttribute('data-i18n');
    if(dict[key] !== undefined) el.textContent = dict[key];
  });
  // Placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{
    const key = el.getAttribute('data-i18n-placeholder');
    if(dict[key] !== undefined) el.setAttribute('placeholder', dict[key]);
  });
  // title= tooltips
  document.querySelectorAll('[data-i18n-title]').forEach(el=>{
    const key = el.getAttribute('data-i18n-title');
    if(dict[key] !== undefined) el.setAttribute('title', dict[key]);
  });
}
function applyColors(){
  const s=State.settings, r=document.documentElement.style;
  r.setProperty('--accent', s.accentColor||'#7c5cbf');
  r.setProperty('--bg',     s.bgColor    ||'#FFFFFF');
  r.setProperty('--text',   s.textColor  ||'#1a1a2e');
}
function priceBox(cls,label,amount){
  return `<div class="price-box ${cls}"><div class="plabel">${label}</div><div class="pvalue">${fmtPrice(amount)}</div></div>`;
}
function fmtPrice(n){
  const f=parseFloat(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  return State.currency.before?`${State.currency.symbol} ${f}`:`${f} ${State.currency.symbol}`;
}
function nameOf(f){ return Array.isArray(f)&&f.length>=2?f[1]:''; }

document.addEventListener('DOMContentLoaded', ()=>{
  log('DOMContentLoaded fired — booting App');
  App.init();
});
