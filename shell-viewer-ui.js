(function () {
  'use strict';
  const host = document.getElementById('model-host');
  const card = document.querySelector('.model-card');
  const query = s => card.querySelector(s), all = s => [...card.querySelectorAll(s)];
  const groups = [
    ['lips', '입술·잇몸'], ['body', '몸통'], ['long', '큰 촉수'],
    ['medium', '중간 턱 촉수'], ['small', '짧은 턱 촉수'],
    ['head', '머리 위 가시']
  ];
  const parts = (window.MORBOL_MODEL?.objects || []).filter(p=>!p.helper).map(p=>({...p,group:window.MorbolViewer.groupFor(p)}));
  const groupParts = Object.fromEntries(groups.map(([id]) => [id, parts.filter(p => p.group === id)]));
  const shortNames = {BODY:'몸통', JAW:'아래턱', M01:'윗입술', M02:'아랫입술', B01:'하단 마감', L01:'상단 마감'};
  const details = query('.model-part-filter'), groupSelect = query('#detail-group');
  const grid = query('.part-item-grid'), empty = query('.part-empty');
  let renderer, detailGroup = 'lips', renderedGroup = null;
  const status = query('.model-state-status');
  const action = fn => { if (renderer && renderer.getState().ready) fn(); };
  function toggle(button, on, text) {
    button.classList.toggle('active', on);
    button.setAttribute('aria-pressed', String(on));
    if (text) button.textContent = text;
  }
  function syncDetail(state) {
    const enabled = groups.filter(([id]) => state.visible[id]).map(([id]) => id);
    if (!enabled.includes(detailGroup)) detailGroup = enabled[0] || '';
    groupSelect.disabled = !state.ready || !enabled.length;
    for (const option of groupSelect.options) {
      if (!option.value) { option.hidden = !!enabled.length; continue; }
      option.disabled = !state.visible[option.value];
    }
    groupSelect.value = detailGroup;
    if (renderedGroup !== detailGroup) {
      renderedGroup = detailGroup;
      grid.replaceChildren();
      const label = groups.find(([id]) => id === detailGroup)?.[1];
      grid.setAttribute('aria-label', label ? `${label} 세부 파츠 켜기와 끄기` : '세부 파츠');
      grid.classList.toggle('wide-items', ['lips', 'body', 'long'].includes(detailGroup));
      for (const part of groupParts[detailGroup] || []) {
        const choice = document.createElement('label'); choice.className = 'part-choice';
        choice.title = `${part.id} · ${part.name}`;
        const input = document.createElement('input'); input.type = 'checkbox';
        input.dataset.partId = part.id; input.setAttribute('aria-label', `${part.id} ${part.name} 표시`);
        input.onchange = () => action(() => renderer.setPartVisible(part.id, input.checked));
        const id = document.createElement('span'); id.className = 'part-id'; id.textContent = part.id;
        choice.append(input, id);
        if (shortNames[part.id]) { const name = document.createElement('span'); name.className = 'part-short-name'; name.textContent = shortNames[part.id]; choice.append(name); }
        grid.append(choice);
      }
    }
    const available = groupParts[detailGroup] || [];
    const selected = available.filter(p => state.partVisible[p.id]).length;
    all('[data-part-id]').forEach(input => {
      input.disabled = !state.ready || !state.visible[detailGroup];
      input.checked = !!state.partVisible[input.dataset.partId];
      input.closest('label').classList.toggle('selected', input.checked);
    });
    empty.hidden = !!enabled.length;
    grid.hidden = !enabled.length;
    query('.part-group-count').textContent = enabled.length ? `${selected}/${available.length}개 표시` : '선택할 분류 없음';
    query('.part-total-count').textContent = state.ready ? `${state.visibleObjects.length}개 표시` : '불러오는 중';
    all('[data-part-action]').forEach(b => b.disabled = !state.ready || !enabled.length);
  }
  function sync(state) {
    card.dataset.ready = String(!!state.ready);
    all('button,select').forEach(b => b.disabled = !state.ready);
    all('[data-visible]').forEach(b => {
      const group = b.dataset.visible, total = groupParts[group].length;
      const count = state.visible[group] ? groupParts[group].filter(p => state.partVisible[p.id]).length : 0;
      toggle(b, !!state.visible[group]);
      b.querySelector('.count').textContent = `${count}/${total}`;
      b.setAttribute('aria-label', `${groups.find(([id])=>id===group)[1]} 분류 ${state.visible[group]?'켜짐':'꺼짐'}, ${count}/${total}개 표시`);
    });
    syncDetail(state);
    all('button[data-palette]').forEach(b => toggle(b, b.dataset.palette === state.palette));
    all('[data-view]').forEach(b => toggle(b, b.dataset.view === state.view));
    toggle(query('.labels-toggle'), state.labels, state.labels ? '✓ 번호표 켜짐' : '번호표 꺼짐');
    toggle(query('.model-wire-toggle'), state.wire, state.wire ? '✓ 메시 선 켜짐' : '메시 선 꺼짐');
    toggle(query('.person-toggle'), state.person, state.person ? '✓ 사람 켜짐' : '사람 꺼짐');
    query('.appearance-hint').hidden = state.palette !== 'actual';
    query('.person-hint').hidden = !state.person;
    if (!state.ready) return;
    const count = state.visibleObjects.length;
    status.textContent = count ? `파츠 ${count}/${parts.length}개 표시${state.person ? ' · 164cm 참고 인체 함께 표시' : ''}`
      : state.person ? '파츠는 모두 숨김 · 164cm 참고 인체만 표시'
      : groups.some(([id])=>state.visible[id]) ? '표시 중인 파츠가 없습니다. ‘세부 파츠 선택’에서 번호를 켜세요.'
      : '표시 중인 파츠가 없습니다. 위에서 분류를 켜세요.';
    host.setAttribute('aria-label', `몰볼 3D 모델, ${count}개 파츠 표시. 왼쪽 드래그로 회전하고 휠로 확대하며 오른쪽 드래그로 이동할 수 있습니다.`);
  }
  function revealEmptyGroup() {
    if (!renderer.getState().visibleObjects.length) details.open = true;
  }
  groups.forEach(([group, name]) => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.visible = group; b.disabled = true;
    b.className = 'active'; b.setAttribute('aria-pressed','true');
    b.append(document.createTextNode(name)); const count = document.createElement('span'); count.className = 'count'; count.textContent = `${groupParts[group].length}/${groupParts[group].length}`; b.append(count);
    b.onclick = () => action(() => {
      const on = !renderer.getState().visible[group]; if (on) detailGroup = group;
      renderer.setVisible(group, on); if (on) revealEmptyGroup();
    });
    query('.visibility-groups').append(b);
    for (const select of [query('#only-group'), groupSelect]) { const o = document.createElement('option'); o.value = group; o.textContent = name; select.append(o); }
  });
  groupSelect.onchange = () => action(() => { detailGroup = groupSelect.value; syncDetail(renderer.getState()); });
  all('[data-part-action]').forEach(b => b.onclick = () => action(() => {
    if (detailGroup && renderer.getState().visible[detailGroup]) renderer.setGroupParts(detailGroup, b.dataset.partAction === 'on');
  }));
  function only(group) { detailGroup = group; renderer.showOnly(group); revealEmptyGroup(); }
  query('#only-group').onchange = e => action(() => { const group=e.target.value; if(group) only(group); e.target.value=''; });
  all('button[data-palette]').forEach(b=>b.onclick=()=>action(()=>renderer.setPalette(b.dataset.palette)));
  all('[data-view]').forEach(b=>b.onclick=()=>action(()=>renderer.setView(b.dataset.view)));
  query('.labels-toggle').onclick=()=>action(()=>renderer.setLabels(!renderer.getState().labels));
  query('.model-wire-toggle').onclick=()=>action(()=>renderer.setWire(!renderer.getState().wire));
  query('.person-toggle').onclick=()=>action(()=>renderer.setPerson(!renderer.getState().person));
  all('[data-model-action]').forEach(b=>b.onclick=()=>action(()=>{
    switch(b.dataset.modelAction){
      case 'all-on':renderer.setAllVisible(true);renderer.fit();break;
      case 'all-off':renderer.setAllVisible(false);break;
      case 'lips-only':only('lips');break;
      case 'fit':renderer.fit();break;
      case 'save':{
        try {
          const a=document.createElement('a');a.href=renderer.exportPNG();a.download='몰볼-현재-모델.png';document.body.append(a);a.click();a.remove();
        } catch(error) { status.textContent='이미지 저장을 완료하지 못했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.'; }
        break;
      }
    }
  }));
  function failed(error){
    status.textContent='3D 모델을 불러오지 못했습니다. 폴더 전체의 압축을 풀고 최신 Edge 또는 Chrome에서 다시 열어 주세요.';
    host.dataset.ready='error';card.dataset.ready='error';all('button,select,input').forEach(b=>b.disabled=true);
    if(!host.textContent.trim()){const msg=document.createElement('p');msg.className='model-error';msg.textContent='3D 화면을 준비할 수 없습니다. 오른쪽 UV 자료는 계속 볼 수 있습니다.';host.append(msg);}
    console.error('Morbol viewer initialization failed',error);
  }
  try {
    if(!window.MorbolViewer||!window.MORBOL_MODEL||!window.MORBOL_TEXTURES)throw Error('Offline model files are missing');
    renderer=new window.MorbolViewer(host,window.MORBOL_MODEL,window.MORBOL_TEXTURES,{onStateChange:sync});
    window.morbolViewer=renderer;renderer.ready.then(()=>sync(renderer.getState())).catch(failed);
  }catch(error){failed(error);}
})();

