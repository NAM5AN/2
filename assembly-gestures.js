(function () {
  'use strict';
  const SELECTOR = '[data-assembly-part][data-assembly-piece]';
  const LONG_PRESS_MS = 550, MOVE_LIMIT_PX = 10, DOUBLE_MS = 450;
  const panel = document.querySelector('#comparison .uv-card');
  if (!panel) return;
  const version = () => window.morbolShellUV ? 2 : 1;
  const key = p => p ? [p.version, p.part, p.piece].join('/') : '';
  const pointerIds = new Set();
  let pending = null, lastTap = null, suppressedClick = null, current = null;
  let currentContext = '', scheduled = false, openSerial = 0, lastOpen = null;

  const toolbar = document.createElement('div');
  toolbar.className = 'assembly-entry';
  toolbar.innerHTML = '<div class="assembly-entry-copy"><span class="assembly-entry-label">도안을 더블클릭하거나 길게 눌러 조립 과정을 보세요.</span><span class="assembly-entry-selection" aria-live="polite"></span></div><button type="button" class="assembly-entry-open" disabled aria-keyshortcuts="Alt+Enter">조립 보기</button>';
  // The body view hides .tent-content, which owns .selection-heading.
  // Keep the entry at panel level so body and jaw also retain the button.
  const heading = panel.querySelector('.uv-heading');
  if (heading) heading.after(toolbar); else panel.prepend(toolbar);
  const button = toolbar.querySelector('button');
  const selectionText = toolbar.querySelector('.assembly-entry-selection');

  function isVisible(element) {
    return !!element && element.isConnected && !element.closest('[hidden], [inert]') &&
      (typeof element.getClientRects !== 'function' || element.getClientRects().length > 0);
  }
  function isReference(element) {
    if (element.closest('.tent-card-link,.tent-atlas-link,.j01-contact-reference,.uv-piece-downloads,.downloads')) return true;
    const host = element.closest('.smooth-base-section');
    return !!host && !!window.morbolSmoothUV?.getState().reference;
  }
  function bodyMetadata() {
    if (version() !== 1) return;
    for (const element of panel.querySelectorAll('.uv-map .uv-face[data-part],.uv-map .uv-merged-face[data-part],.body-part[data-part]')) {
      const piece = element.dataset.part;
      if (!/^U(?:0[1-9]|1[01])$/.test(piece)) continue;
      const part = ['U10', 'U11'].includes(piece) ? 'JAW' : 'BODY';
      element.dataset.assemblyPart = part;
      element.dataset.assemblyPiece = piece;
      element.dataset.assemblySelection = part;
      element.dataset.assemblyVersion = '1';
    }
    // The custom body renderer names each individual bank with its U region.
    // Shared labels without an individual bank owner retain normal selection.
    for (const element of panel.querySelectorAll('.uv-map .seam[aria-label]')) {
      const piece = element.getAttribute('aria-label')?.match(/\bU(?:0[1-9]|1[01])\b/)?.[0];
      if (!piece) continue;
      element.dataset.assemblyPart = ['U10','U11'].includes(piece) ? 'JAW' : 'BODY';
      element.dataset.assemblyPiece = piece;
      element.dataset.assemblyVersion = '1';
    }
  }
  function payloadFor(element, source) {
    const part = element?.dataset.assemblyPart, piece = element?.dataset.assemblyPiece;
    if (!part || !piece) return null;
    const payload = {part, piece, version: Number(element.dataset.assemblyVersion) || version(),
      selectionId: element.dataset.assemblySelection || part, sourceElement: source || element};
    const seam = source?.closest?.('[data-seam]')?.dataset.seam;
    if (seam) payload.seam = seam;
    return payload;
  }
  function resolve(target) {
    if (!target?.closest || !panel.contains(target) || target.closest('a,button[download],.assembly-entry')) return null;
    const element = target.closest(SELECTOR);
    if (!element || !isVisible(element) || isReference(element)) return null;
    // A sheet's empty white margin is not a cloth piece.
    if (element.tagName?.toLowerCase() === 'svg' && (target === element || target.tagName?.toLowerCase() === 'rect' && !target.closest('[data-seam]'))) return null;
    return payloadFor(element, target);
  }
  function context() {
    const shell = window.morbolShellUV?.getState();
    if (shell) return JSON.stringify([2, shell.group, shell.part, shell.headAtlas, shell.mode]);
    const smooth = window.morbolSmoothUV?.getState();
    return JSON.stringify([1, smooth?.group || panel.querySelector('.uv-groups .active')?.dataset.group,
      smooth?.part || panel.querySelector('.tent-parts .active')?.dataset.id,
      smooth?.detail, smooth?.headAtlas, !!smooth?.reference]);
  }
  function choose(payload) {
    current = payload;
    updateToolbar();
  }
  function updateToolbar() {
    const name = current ? current.part + '-' + current.piece : '';
    const disabled = !current;
    const label = name ? name + ' 조립 보기' : '도안을 고른 뒤 조립 보기';
    if (button.disabled !== disabled) button.disabled = disabled;
    if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
    // textContent replaces its text node even when the string is unchanged.
    // The panel observer sees that childList mutation, so repeated refreshes
    // must not write it again and create a self-sustaining microtask loop.
    if (selectionText.textContent !== name) selectionText.textContent = name;
  }
  function refresh() {
    scheduled = false;
    bodyMetadata();
    const next = context();
    if (next !== currentContext) {
      currentContext = next; current = null; lastTap = null; cancelPending();
    }
    // Existing controllers continue to own piece and seam selection.
    const selected = panel.querySelector('.uv-piece-buttons button.active' + SELECTOR) ||
      panel.querySelector('.shell-piece-buttons button.active' + SELECTOR) ||
      panel.querySelector('.body-part.active' + SELECTOR);
    if (selected && isVisible(selected)) current = payloadFor(selected);
    if (current && !Array.from(panel.querySelectorAll(SELECTOR)).some(el => isVisible(el) && key(payloadFor(el)) === key(current))) current = null;
    updateToolbar();
  }
  function queueRefresh() {
    if (scheduled) return;
    scheduled = true; queueMicrotask(refresh);
  }
  function cancelPending() {
    if (pending?.timer) clearTimeout(pending.timer);
    pending = null;
  }
  function request(payload, trigger) {
    if (!payload || !window.MorbolAssembly?.open) return Promise.resolve({status:'unavailable'});
    const now = performance.now();
    // Native dblclick may follow the second pointerup; launch just one modal.
    if (lastOpen && lastOpen.key === key(payload) && now - lastOpen.time < 200 && trigger === 'doubleclick') return Promise.resolve({status:'duplicate'});
    lastOpen = {key:key(payload), time:now};
    choose(payload);
    const serial = ++openSerial;
    const options = {...payload, trigger};
    document.dispatchEvent(new CustomEvent('morbol:assembly-request', {detail:{part:options.part,piece:options.piece,version:options.version,trigger}}));
    let opening;
    try { opening = window.MorbolAssembly.open(options); } catch (error) { opening = Promise.reject(error); }
    return Promise.resolve(opening).catch(error => {
      if (serial === openSerial) selectionText.textContent = '조립 화면을 열지 못했어요. 다시 눌러 주세요.';
      console.error('Assembly preview could not open', error);
      return {status:'error'};
    });
  }
  function pointerDown(event) {
    pointerIds.add(event.pointerId);
    if (pointerIds.size > 1) { cancelPending(); lastTap = null; return; }
    if (event.button !== 0 || event.isPrimary === false) return;
    const payload = resolve(event.target);
    if (!payload) return;
    cancelPending();
    const record = pending = {id:event.pointerId, x:event.clientX, y:event.clientY, payload,
      type:event.pointerType || 'mouse', fired:false, timer:0};
    record.timer = setTimeout(() => {
      if (pending !== record || pointerIds.size !== 1) return;
      record.fired = true; lastTap = null;
      suppressedClick = {key:key(payload), x:record.x, y:record.y, until:performance.now() + 1500};
      request(payload, 'longpress');
    }, LONG_PRESS_MS);
  }
  function pointerMove(event) {
    if (pending?.id === event.pointerId && Math.hypot(event.clientX-pending.x,event.clientY-pending.y) > MOVE_LIMIT_PX) {
      cancelPending(); lastTap = null;
    }
  }
  function pointerUp(event) {
    pointerIds.delete(event.pointerId);
    if (!pending || pending.id !== event.pointerId) return;
    const record = pending; cancelPending();
    if (record.fired) {
      if (suppressedClick) suppressedClick.until = performance.now() + 900;
      return;
    }
    if (Math.hypot(event.clientX-record.x,event.clientY-record.y) > MOVE_LIMIT_PX) { lastTap = null; return; }
    const now = performance.now();
    const payload = resolve(event.target) || record.payload;
    if (lastTap && lastTap.key === key(payload) && lastTap.type === record.type &&
      now - lastTap.time <= DOUBLE_MS && Math.hypot(event.clientX-lastTap.x,event.clientY-lastTap.y) <= 14) {
      lastTap = null; request(payload,'doubleclick');
    } else lastTap = {key:key(payload),time:now,x:event.clientX,y:event.clientY,type:record.type};
  }
  function pointerCancel(event) {
    pointerIds.delete(event.pointerId); cancelPending(); lastTap = null;
  }
  function interruptGesture() { cancelPending(); lastTap = null; }
  function click(event) {
    const payload = resolve(event.target), suppressed = suppressedClick;
    if (suppressed && performance.now() <= suppressed.until &&
        (key(payload) === suppressed.key || Math.hypot(event.clientX-suppressed.x,event.clientY-suppressed.y) <= MOVE_LIMIT_PX)) {
      suppressedClick = null; event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    if (suppressed && performance.now() > suppressed.until) suppressedClick = null;
    if (payload) choose(payload);
    queueRefresh();
  }
  function doubleClick(event) {
    const payload = resolve(event.target);
    if (!payload) return;
    event.preventDefault(); request(payload, 'doubleclick');
  }
  document.addEventListener('pointerdown',pointerDown,{capture:true,passive:true});
  document.addEventListener('pointermove',pointerMove,{capture:true,passive:true});
  document.addEventListener('pointerup',pointerUp,{capture:true,passive:true});
  document.addEventListener('pointercancel',pointerCancel,{capture:true,passive:true});
  document.addEventListener('lostpointercapture',pointerCancel,{capture:true,passive:true});
  document.addEventListener('scroll',interruptGesture,{capture:true,passive:true});
  document.addEventListener('wheel',interruptGesture,{capture:true,passive:true});
  window.addEventListener('blur',()=>{interruptGesture();pointerIds.clear();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)interruptGesture();});
  document.addEventListener('click',click,true);
  document.addEventListener('dblclick',doubleClick,true);
  document.addEventListener('contextmenu',event=>{
    if (pending && key(resolve(event.target))===key(pending.payload) || suppressedClick && performance.now()<=suppressedClick.until) event.preventDefault();
  },true);
  document.addEventListener('focusin',event=>{const payload=resolve(event.target);if(payload)choose(payload);});
  document.addEventListener('keydown',event=>{
    if(event.altKey && !event.ctrlKey && !event.metaKey && event.key==='Enter' && current && !document.querySelector('.assembly-dialog[open],dialog[open]')) {
      event.preventDefault(); request({...current,sourceElement:event.target},'keyboard');
    }
  });
  button.addEventListener('click',()=>request({...current,sourceElement:button},'button'));
  new MutationObserver(queueRefresh).observe(panel,{subtree:true,childList:true,attributes:true,attributeFilter:['class','aria-pressed','hidden']});
  window.MorbolAssemblyGestures = {
    resolve, refresh,
    open:payload=>request(payload || current,'button'),
    cancel:interruptGesture,
    getState:()=>({current:current?{part:current.part,piece:current.piece,version:current.version,selectionId:current.selectionId}:null,
      pending:!!pending,pointerCount:pointerIds.size,longPressMs:LONG_PRESS_MS,moveLimitPx:MOVE_LIMIT_PX})
  };
  refresh();
})();
