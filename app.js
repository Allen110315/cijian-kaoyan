'use strict';
(() => {
  const words = window.WORDS;
  const STORAGE_KEY = 'cijian-kaoyan-1849-v1';
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const day = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
  const initial = () => ({version:1, records:{}, daily:{}, lastId:1, settings:{hide:false,goal:20}, session:{mode:'study',query:'',group:'all',status:'all',page:1}});
  let store = initial(), storageAvailable = true;
  function validate(value) {
    if (!value || value.version !== 1 || typeof value.records !== 'object' || value.records === null || Array.isArray(value.records)) throw new Error('备份格式不正确');
    const clean = initial();
    for (const entry of words) {
      const r = value.records[entry.id];
      if (!r) continue;
      if (typeof r !== 'object' || !['new','review','mastered'].includes(r.status || 'new')) throw new Error('备份含有无效状态');
      clean.records[entry.id] = {status:r.status || 'new',saved:r.saved === true,updated:typeof r.updated === 'string' ? r.updated.slice(0,40) : ''};
    }
    if (value.daily && typeof value.daily === 'object' && !Array.isArray(value.daily)) {
      for (const [date, ids] of Object.entries(value.daily)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Array.isArray(ids)) clean.daily[date] = [...new Set(ids.filter(id => Number.isInteger(id) && id >= 1 && id <= words.length))];
      }
    }
    clean.lastId = Number.isInteger(value.lastId) && value.lastId >= 1 && value.lastId <= words.length ? value.lastId : 1;
    clean.settings.hide = value.settings?.hide === true;
    const goal = value.settings?.goal;
    if (Number.isInteger(goal) && goal >= 1 && goal <= words.length) clean.settings.goal = goal;
    const session = value.session;
    if (session && typeof session === 'object') {
      if (['study','library','quiz','saved'].includes(session.mode)) clean.session.mode = session.mode;
      if (typeof session.query === 'string') clean.session.query = session.query.slice(0,200);
      if (session.group === 'all' || /^([1-9]|[1-8][0-9]|9[0-3])$/.test(String(session.group))) clean.session.group = String(session.group);
      if (['all','new','review','mastered','saved'].includes(session.status)) clean.session.status = session.status;
      if (Number.isInteger(session.page) && session.page >= 1 && session.page <= Math.ceil(words.length/24)) clean.session.page = session.page;
      if (Array.isArray(session.order) && session.order.length === words.length && new Set(session.order).size === words.length && session.order.every(id => Number.isInteger(id) && id >= 1 && id <= words.length)) clean.session.order = session.order.slice();
    }
    return clean;
  }
  try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) store = validate(JSON.parse(saved)); } catch { storageAvailable = false; }
  let mode = 'study', index = Math.max(0, words.findIndex(w => w.id === store.lastId)), libraryPage = 1;
  let order = words.map(w => w.id), filtered = words.slice(), revealed = !store.settings.hide, quiz = null;
  let quizStats = {answered:0,correct:0}, toastTimer;
  const statusNames = {new:'未学习',review:'待复习',mastered:'已掌握'};
  const record = id => store.records[id] || {status:'new',saved:false};
  function toast(text) { $('toast').textContent = text; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'),2800); }
  function persist() { try { localStorage.setItem(STORAGE_KEY,JSON.stringify(store)); storageAvailable = true; } catch { storageAvailable = false; toast('当前浏览器无法保存，请导出进度备份。'); } }
  function logStudy(id) { const date=day(); const ids=store.daily[date] || []; if (!ids.includes(id)) { ids.push(id); store.daily[date]=ids; persist(); } renderStats(); }
  function rememberSession() {
    if (filtered[index]) store.lastId=filtered[index].id;
    store.session={mode,query:$('searchInput').value.slice(0,200),group:$('groupFilter').value,status:$('statusFilter').value,page:libraryPage,order:order.slice()};
    persist();
  }
  function restoreSession() {
    const session=store.session, lastId=store.lastId;
    order=session.order ? session.order.slice() : words.map(w=>w.id);
    $('searchInput').value=session.query; $('groupFilter').value=session.group; $('statusFilter').value=session.status;
    $('hideMeanings').checked=store.settings.hide; $('dailyGoal').value=store.settings.goal;
    setMode(session.mode,lastId);
    libraryPage=session.page;
    if (filtered.length && ['library','saved'].includes(mode)) renderLibrary();
  }
  function renderStats() {
    const records=Object.values(store.records), mastered=records.filter(r=>r.status==='mastered').length, review=records.filter(r=>r.status==='review').length, today=(store.daily[day()] || []).length;
    $('masteredStat').textContent=mastered; $('reviewStat').textContent=review; $('todayStat').textContent=today; $('goalCount').textContent=today;
    $('sideMastered').textContent=mastered; $('sideProgressBar').style.width=mastered/words.length*100+'%';
    $('goalTotal').textContent='/ '+store.settings.goal;
    $('goalCircle').style.background='conic-gradient(#9aac7c '+Math.min(today/store.settings.goal,1)*360+'deg,#edf0e6 0deg)';
  }
  function recompute(keepId) {
    const query=$('searchInput').value.trim().toLowerCase(), group=$('groupFilter').value, status=$('statusFilter').value;
    const rank=new Map(order.map((id,i)=>[id,i]));
    filtered=words.filter(w => {
      const r=record(w.id);
      return (!query || [w.word,w.meaning,w.phrase,w.phraseZh].some(t=>t.toLowerCase().includes(query))) && (group==='all' || w.group===Number(group)) && (status==='all' || (status==='saved'?r.saved:r.status===status)) && (mode!=='saved' || r.saved);
    }).sort((a,b)=>rank.get(a.id)-rank.get(b.id));
    index=keepId ? filtered.findIndex(w=>w.id===keepId) : 0;
    if (index<0 || index>=filtered.length) index=0;
    libraryPage=1; revealed=!store.settings.hide; quiz=null; render();
  }
  function setMode(next,keepId) {
    mode=next; document.querySelectorAll('[data-mode]').forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle(b.classList.contains('nav-item')?'active':'selected',active);b.setAttribute('aria-pressed',String(active));});
    $('modeTitle').textContent=({study:'今日词卡',library:'全部词库',quiz:'释义自测',saved:'我的收藏'})[mode];
    recompute(keepId);
  }
  function render() {
    renderStats(); const empty=filtered.length===0;
    $('studyPanel').hidden=empty || mode!=='study'; $('libraryPanel').hidden=empty || !['library','saved'].includes(mode); $('quizPanel').hidden=empty || mode!=='quiz'; $('emptyPanel').hidden=!empty;
    $('resultInfo').textContent=filtered.length+' 个单词'+($('groupFilter').value==='all'?'':' · 第 '+$('groupFilter').value+' 组');
    $('emptyText').textContent=mode==='saved'?'点击词卡上的星星，把容易忘的单词收在这里。':'试试换一组词，或者清除筛选条件。';
    if(empty) { rememberSession(); return; }
    if(mode==='study') renderStudy(); else if(mode==='quiz') renderQuiz(); else renderLibrary();
  }
  function star(w) {const r=record(w.id);return '<button class="star-button '+(r.saved?'saved':'')+'" data-save="'+w.id+'" aria-label="'+(r.saved?'取消收藏':'收藏')+' '+escape(w.word)+'" aria-pressed="'+r.saved+'">'+(r.saved?'★':'☆')+'</button>';}
  function phraseHTML(w) { return '<div class="phrase-box"><div class="block-label">↗ 短搭配</div><div class="phrase-text"><strong>'+escape(w.phrase)+'</strong><span>'+escape(w.phraseZh)+'</span></div></div>'; }
  function memoryHTML(w) {return '<div class="memory-box"><div class="block-label">✦ 记忆线索 <span class="cue-type">'+escape(w.type)+'</span></div><p>'+escape(w.memory)+'</p></div>';}
  function renderStudy() {
    rememberSession();
    const w=filtered[index],r=record(w.id); store.lastId=w.id;
    const contents=revealed?'<p class="meaning">'+escape(w.meaning)+'</p>':'';
    const body=revealed?'<div class="card-body">'+memoryHTML(w)+phraseHTML(w)+'<details class="dictionary-detail"><summary>展开词典参考义</summary><p>'+escape(w.dictionary)+'</p></details></div>':'<div class="reveal-panel"><p>这个词是什么意思？<br>先主动回想，再看看你的答案。</p><button class="primary-button" id="revealButton">揭晓释义与记忆法 <span>↗</span></button></div>';
    $('flashcard').innerHTML='<div class="card-top"><div class="card-meta"><span><span class="group-tag">GROUP '+String(w.group).padStart(2,'0')+'</span> &nbsp; #'+String(w.id).padStart(4,'0')+'</span>'+star(w)+'</div><div class="word-line"><h3>'+escape(w.word)+'</h3><button class="speak-button" data-speak="'+w.id+'" aria-label="朗读 '+escape(w.word)+'">♪</button></div><div class="phonetic">'+escape('常用释义 · 原词表顺序')+'</div>'+contents+'</div>'+body+'<div class="card-actions"><button class="status-button review" data-status="review" aria-pressed="'+(r.status==='review')+'">↻ 待复习</button><button class="status-button mastered" data-status="mastered" aria-pressed="'+(r.status==='mastered')+'">✓ 已掌握</button>'+(r.status!=='new'?'<button class="status-button" data-status="new" title="重置为未学习">重置</button>':'')+'<div class="card-navigation"><button class="arrow-button" id="previousWord" aria-label="上一个单词" '+(index===0?'disabled':'')+'>←</button><span>'+String(index+1).padStart(2,'0')+' / '+filtered.length+'</span><button class="arrow-button" id="nextWord" aria-label="下一个单词" '+(index===filtered.length-1?'disabled':'')+'>→</button></div></div>';
  }
  function renderLibrary() {
    const size=24,total=Math.ceil(filtered.length/size);libraryPage=Math.max(1,Math.min(libraryPage,total));
    rememberSession();
    $('wordGrid').innerHTML=filtered.slice((libraryPage-1)*size,libraryPage*size).map(w=>{
      const r=record(w.id);return '<article class="mini-card"><div class="mini-card-head"><span>'+String(w.id).padStart(4,'0')+' · 第'+w.group+'组</span>'+star(w)+'</div><button class="mini-word" data-open="'+w.id+'">'+escape(w.word)+'</button><div class="mini-meaning">'+(store.settings.hide?'先回想，再打开词卡':escape(w.meaning))+'</div>'+(store.settings.hide?'':'<p class="mini-phrase">'+escape(w.phrase)+'</p>')+'<div class="mini-status"><span class="status-label '+r.status+'">'+statusNames[r.status]+'</span><button data-open="'+w.id+'">打开词卡 ↗</button></div></article>';
    }).join('');$('pageInfo').textContent=libraryPage+' / '+total+' 页';$('prevPage').disabled=libraryPage===1;$('nextPage').disabled=libraryPage===total;
  }
  function shuffled(list) { const a=list.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
  function newQuiz() {
    const w=filtered[index], seen=new Set([w.meaning]);
    const choices=[{id:w.id,meaning:w.meaning}];
    const tokens = value => value.split(/[；，]/).map(part=>part.trim()).filter(part=>part.length>1);
    const correctTokens = tokens(w.meaning);
    const isSimilar = candidate => tokens(candidate.meaning).some(a=>correctTokens.some(b=>a.includes(b)||b.includes(a)));
    for(const candidate of shuffled(words.filter(c=>c.id!==w.id && !isSimilar(c)))){if(!seen.has(candidate.meaning)){choices.push({id:candidate.id,meaning:candidate.meaning});seen.add(candidate.meaning);if(choices.length===4)break;}}
    quiz={wordId:w.id,options:shuffled(choices),answered:false,choice:null};
  }
  function renderQuiz() {
    rememberSession();
    if(!quiz) newQuiz();const w=words.find(w=>w.id===quiz.wordId),r=record(w.id);
    const options=quiz.options.map((o,i)=>{let cls='';if(quiz.answered){if(o.id===w.id)cls=' correct';else if(i===quiz.choice)cls=' wrong';}return '<button class="quiz-option'+cls+'" data-option="'+i+'" '+(quiz.answered?'disabled':'')+'><span>'+String.fromCharCode(65+i)+'</span><span>'+escape(o.meaning)+'</span></button>';}).join('');
    const feedback=quiz.answered?'<div class="quiz-feedback"><h4>'+(quiz.options[quiz.choice].id===w.id?'✓ 回想正确':'再看一遍，它会更牢')+'</h4><p>正确释义：'+escape(w.meaning)+'</p>'+memoryHTML(w)+phraseHTML(w)+'<button class="status-button review" data-quiz-status="review">↻ 加入待复习</button> <button class="status-button mastered" data-quiz-status="mastered">✓ 标为已掌握</button></div>':'';
    $('quizCard').innerHTML='<div class="quiz-top"><span>第 '+(index+1)+' / '+filtered.length+' 词 · '+statusNames[r.status]+'</span><span>本轮 '+quizStats.correct+' / '+quizStats.answered+' 正确</span></div><div class="quiz-word"><h3>'+escape(w.word)+'</h3><p>选择这个单词的正确释义</p><button class="speak-button" data-speak="'+w.id+'" aria-label="朗读 '+escape(w.word)+'">♪</button></div><div class="quiz-options">'+options+'</div>'+feedback+'<div class="quiz-bottom"><span>快捷键 A / B / C / D 选答案</span><button class="primary-button" id="nextQuiz" '+(!quiz.answered?'disabled':'')+'>'+(index===filtered.length-1?'再测一轮 ↻':'下一个词 →')+'</button></div>';
  }
  function move(delta) { if(!filtered.length)return;index=Math.max(0,Math.min(filtered.length-1,index+delta));revealed=!store.settings.hide;quiz=null;store.lastId=filtered[index].id;persist();render(); }
  function setStatus(id,status,isQuiz=false) {
    if(!['new','review','mastered'].includes(status))return;
    store.records[id]={...record(id),status,updated:new Date().toISOString()};
    if(status!=='new')logStudy(id);persist();renderStats();toast('已标记：'+statusNames[status]);
    const active=$('statusFilter').value;
    if(active!=='all' && active!=='saved' && active!==status){recompute();return;}
    if(isQuiz)renderQuiz();else renderStudy();
  }
  function saveWord(id) { const current=record(id);store.records[id]={...current,saved:!current.saved};persist();toast(!current.saved?'已加入收藏':'已取消收藏');if(mode==='saved'||$('statusFilter').value==='saved')recompute();else render(); }
  function speak(id) {
    if(!('speechSynthesis' in window)){toast('此浏览器不支持朗读。');return;}
    const w=words.find(w=>w.id===id);if(!w)return;
    const utterance=new SpeechSynthesisUtterance(w.word);utterance.lang='en-US';utterance.rate=.82;const voice=speechSynthesis.getVoices().find(v=>/^en[-_]/i.test(v.lang));if(voice)utterance.voice=voice;
    utterance.onerror=()=>toast('朗读暂不可用，请检查设备的英语语音。');speechSynthesis.cancel();speechSynthesis.speak(utterance);
  }
  function reveal(){if(!filtered.length||mode!=='study')return;revealed=true;logStudy(filtered[index].id);renderStudy();}
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode,filtered[index]?.id)));
  $('groupFilter').innerHTML+=[...Array(93)].map((_,i)=>'<option value="'+(i+1)+'">第 '+String(i+1).padStart(2,'0')+' 组 · '+(i===92?9:20)+' 词</option>').join('');
  $('searchInput').addEventListener('input',()=>recompute());$('groupFilter').addEventListener('change',()=>recompute());$('statusFilter').addEventListener('change',()=>recompute());
  $('reviewQuizButton').addEventListener('click',()=>{
    $('searchInput').value=''; $('groupFilter').value='all'; $('statusFilter').value='review';
    quizStats={answered:0,correct:0}; setMode('quiz');
    if (!filtered.length) toast('还没有待复习单词，可以先在词卡中标记。');
  });
  function saveGoal() {
    const goal=Number($('dailyGoal').value);
    if (!Number.isInteger(goal) || goal < 1 || goal > words.length) { $('dailyGoal').value=store.settings.goal; toast('每日目标请输入 1–1849 之间的整数。'); return; }
    store.settings.goal=goal; persist(); renderStats(); toast('每日目标已设为 '+goal+' 词。');
  }
  $('dailyGoal').addEventListener('change',saveGoal);
  $('saveGoalButton').addEventListener('click',saveGoal);
  $('dailyGoal').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();saveGoal();}});
  $('hideMeanings').checked=store.settings.hide;
  $('hideMeanings').addEventListener('change',()=>{store.settings.hide=$('hideMeanings').checked;revealed=!store.settings.hide;persist();render();});
  $('shuffleButton').addEventListener('click',()=>{order=shuffled(words.map(w=>w.id));recompute();toast('已随机排列，原始编号保持不变。');});
  $('clearFilters').addEventListener('click',()=>{$('searchInput').value='';$('groupFilter').value='all';$('statusFilter').value='all';setMode('library');});
  $('prevPage').addEventListener('click',()=>{libraryPage--;renderLibrary();});$('nextPage').addEventListener('click',()=>{libraryPage++;renderLibrary();});
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.save)saveWord(Number(button.dataset.save));
    if(button.dataset.speak)speak(Number(button.dataset.speak));
    if(button.dataset.open)setMode('study',Number(button.dataset.open));
    if(button.dataset.status&&filtered.length)setStatus(filtered[index].id,button.dataset.status);
    if(button.dataset.quizStatus&&quiz)setStatus(quiz.wordId,button.dataset.quizStatus,true);
    if(button.id==='revealButton')reveal();
    if(button.id==='previousWord')move(-1);
    if(button.id==='nextWord')move(1);
    if(button.dataset.option!==undefined&&quiz&&!quiz.answered){quiz.choice=Number(button.dataset.option);quiz.answered=true;quizStats.answered++;const correct=quiz.options[quiz.choice].id===quiz.wordId;if(correct)quizStats.correct++;else{store.records[quiz.wordId]={...record(quiz.wordId),status:'review',updated:new Date().toISOString()};}logStudy(quiz.wordId);persist();renderQuiz();}
    if(button.id==='nextQuiz'){index=index===filtered.length-1?0:index+1;quiz=null;renderQuiz();}
  });
  document.addEventListener('keydown',event=>{
    if(event.target.closest('input,select,textarea,button,a,summary')||$('helpDialog').open)return;
    if(event.key==='/'){event.preventDefault();$('searchInput').focus();return;}
    if(mode==='study'){
      if(event.key==='ArrowRight'){event.preventDefault();move(1);}
      else if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}
      else if(event.code==='Space'){event.preventDefault();reveal();}
    } else if(mode==='quiz'&&quiz){
      const n='abcd'.indexOf(event.key.toLowerCase());if(n>=0&&!quiz.answered){event.preventDefault();$('quizCard').querySelector('[data-option="'+n+'"]').click();}
      else if(event.key==='Enter'&&quiz.answered){event.preventDefault();$('nextQuiz').click();}
    }
  });
  $('helpButton').addEventListener('click',()=>$('helpDialog').showModal());$('topHelpButton').addEventListener('click',()=>$('helpDialog').showModal());$('closeHelp').addEventListener('click',()=>$('helpDialog').close());
  $('exportButton').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(store,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='词间学习进度-'+day()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出进度备份。');});
  $('importButton').addEventListener('click',()=>$('importFile').click());
  $('importFile').addEventListener('change',async()=>{
    const file=$('importFile').files[0];if(!file)return;
    try { if(file.size>5*1024*1024)throw Error('备份文件过大');const incoming=validate(JSON.parse(await file.text()));if(!window.confirm('导入将替换当前学习进度。建议先导出备份，是否继续？'))return;store=incoming;quizStats={answered:0,correct:0};restoreSession();toast('进度已恢复。'); }catch(error){toast('无法导入：'+error.message);}finally{$('importFile').value='';}
  });
  restoreSession();
  if(!storageAvailable)toast('本地存储不可用，请用导出备份保留进度。');
})();
