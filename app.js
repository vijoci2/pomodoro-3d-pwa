(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const STORAGE_KEY='pomodoro-mechanical-v3', SETTINGS_KEY='pomodoro-mechanical-settings-v3', STATS_KEY='pomodoro-mechanical-stats-v3';
  const defaults={focus:25,short:5,long:15,sessions:4,autoBreak:false,autoFocus:false,wake:true,sound:true,tick:true,vibrate:true,motion:true};
  const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}};
  const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const dayKey=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const settings={...defaults,...read(SETTINGS_KEY,{})};
  const saved=read(STORAGE_KEY,{});
  let stats=read(STATS_KEY,{date:dayKey(),completed:0,focusMinutes:0});
  if(stats.date!==dayKey()) stats={date:dayKey(),completed:0,focusMinutes:0};
  const modeFromSaved=['focus','short','long'].includes(saved.mode)?saved.mode:'focus';
  const durationFor=mode=>clamp(Number(settings[mode==='focus'?'focus':mode==='short'?'short':'long'])||1,1,60)*60;
  const state={mode:modeFromSaved,running:!!saved.running,remaining:Number.isFinite(saved.remaining)?saved.remaining:durationFor(modeFromSaved),duration:Number.isFinite(saved.duration)?saved.duration:durationFor(modeFromSaved),endTime:saved.endTime||null,focusInCycle:Number.isFinite(saved.focusInCycle)?saved.focusInCycle:0};

  const els={top:$('mechanicalTop'),scale:$('scaleTrack'),drag:$('dial'),hint:$('dialHint'),status:$('mechanicalStatus'),time:$('timeDisplay'),start:$('startBtn'),startText:$('startText'),startIcon:$('startIcon'),reset:$('resetBtn'),skip:$('skipBtn'),settingsBtn:$('settingsBtn'),closeSettings:$('closeSettings'),sheet:$('settingsPanel'),scrim:$('scrim'),completed:$('completedToday'),focusMinutes:$('focusMinutes'),cycle:$('cycleDots'),session:$('sessionText'),soundQuick:$('soundQuickBtn'),notify:$('notificationBtn'),install:$('installBtn'),toast:$('toast')};
  const inputs={focus:$('focusMinutesInput'),short:$('shortMinutesInput'),long:$('longMinutesInput'),sessions:$('sessionsInput'),autoBreak:$('autoBreakInput'),autoFocus:$('autoFocusInput'),wake:$('wakeInput'),sound:$('soundInput'),tick:$('tickInput'),vibrate:$('vibrateInput'),motion:$('motionInput')};

  let raf=0,audioCtx=null,wakeLock=null,deferredPrompt=null,dragState=null,toastTimer=null,lastSecond=-1;
  const minutes=()=>clamp(state.remaining/60,0,60);
  const persist=()=>{write(STORAGE_KEY,state);write(SETTINGS_KEY,settings);write(STATS_KEY,stats)};
  const fmt=sec=>{sec=Math.max(0,Math.ceil(sec));return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`};

  function buildScale(){
    els.scale.innerHTML=''; const width=840,step=width/60;
    for(let i=0;i<=60;i++){
      const m=document.createElement('span');m.className='scale-mark'+(i%5?' minor':'');m.style.left=`${i*step}px`;els.scale.appendChild(m);
      if(i%5===0){const n=document.createElement('b');n.className='scale-number';n.textContent=i;n.style.left=`${i*step}px`;els.scale.appendChild(n)}
    }
  }

  function renderMechanical(){
    const width=840,step=width/60,m=minutes();
    // The value under the fixed pointer is always the actual remaining minutes.
    // Therefore 0 mathematically lands dead-center at the end of the countdown.
    els.scale.style.setProperty('--scale-x',`${(30-m)*step}px`);
    // Physical sideways twist, not a flat clockwise spin.
    const normalized=(m-30)/30;
    els.top.style.setProperty('--yaw',`${clamp(normalized*13,-13,13)}deg`);
    els.top.style.setProperty('--slide-x',`${clamp(normalized*4,-4,4)}px`);
    els.time.textContent=fmt(state.remaining);
  }

  function renderDots(){els.cycle.innerHTML='';for(let i=0;i<settings.sessions;i++){const d=document.createElement('div');d.className='cycle-dot'+(i<state.focusInCycle?' done':'')+(i===state.focusInCycle&&state.mode==='focus'?' current':'');els.cycle.appendChild(d)}}
  function renderUI(){
    if(stats.date!==dayKey()) stats={date:dayKey(),completed:0,focusMinutes:0};
    els.startText.textContent=state.running?'Pause':(state.remaining<state.duration?'Resume':'Start');els.startIcon.textContent=state.running?'❚❚':'▶';
    els.completed.textContent=stats.completed;els.focusMinutes.textContent=stats.focusMinutes;els.session.textContent=`Session ${Math.min(state.focusInCycle+1,settings.sessions)} of ${settings.sessions}`;els.soundQuick.textContent=settings.sound?'Sound on':'Sound off';
    document.querySelectorAll('.mode').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));
    els.status.textContent=state.running?'Running':`${Math.round(minutes())} min set`;renderMechanical();renderDots();persist();
  }

  function ensureAudio(){if(!audioCtx){const C=window.AudioContext||window.webkitAudioContext;if(C)audioCtx=new C()}if(audioCtx?.state==='suspended')audioCtx.resume().catch(()=>{})}
  function tone(freq,dur=.025,gain=.03,type='square',delay=0){if(!settings.sound)return;ensureAudio();if(!audioCtx)return;const t=audioCtx.currentTime+delay,o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g);g.connect(audioCtx.destination);o.start(t);o.stop(t+dur+.02)}
  const ratchet=()=>tone(1250,.018,.018,'square');
  const releaseClick=()=>{tone(760,.035,.035,'triangle');tone(980,.025,.02,'square',.028)};
  const bell=()=>{if(!settings.sound)return;[880,1320,1760].forEach((f,i)=>tone(f,.78-i*.08,.115/(i+1),'sine',i*.035))};
  const tick=()=>tone(lastSecond%2?1600:1450,.012,.012,'square');

  async function acquireWake(){if(settings.wake&&state.running&&document.visibilityState==='visible'&&navigator.wakeLock){try{wakeLock=await navigator.wakeLock.request('screen')}catch{}}}
  async function releaseWake(){try{await wakeLock?.release()}catch{}wakeLock=null}

  function stopLoop(){if(raf)cancelAnimationFrame(raf);raf=0}
  function loop(){
    if(!state.running||!state.endTime){raf=0;return}
    state.remaining=Math.max(0,(state.endTime-Date.now())/1000);
    const sec=Math.ceil(state.remaining);
    if(settings.tick&&sec!==lastSecond&&sec>0){lastSecond=sec;tick()}
    renderMechanical();
    if(sec<=0){complete(false);return}
    raf=requestAnimationFrame(loop);
  }
  function startLoop(){stopLoop();raf=requestAnimationFrame(loop)}

  function startTimer(){ensureAudio();if(state.remaining<=0){state.duration=durationFor(state.mode);state.remaining=state.duration}state.running=true;state.endTime=Date.now()+state.remaining*1000;lastSecond=-1;acquireWake();renderUI();startLoop()}
  function pauseTimer(){if(state.running&&state.endTime)state.remaining=Math.max(0,(state.endTime-Date.now())/1000);state.running=false;state.endTime=null;stopLoop();releaseWake();renderUI()}
  const toggle=()=>state.running?pauseTimer():startTimer();
  function reset(){state.running=false;state.endTime=null;stopLoop();releaseWake();state.duration=durationFor(state.mode);state.remaining=state.duration;renderUI();showToast('Reset')}
  function switchMode(mode){state.running=false;state.endTime=null;stopLoop();releaseWake();state.mode=mode;state.duration=durationFor(mode);state.remaining=state.duration;renderUI()}
  function complete(skipped){
    const cm=state.mode,cd=state.duration;state.running=false;state.endTime=null;stopLoop();releaseWake();state.remaining=0;renderMechanical();
    if(!skipped){bell();if(settings.vibrate&&navigator.vibrate)navigator.vibrate([220,90,420]);if(cm==='focus'){stats.completed++;stats.focusMinutes+=Math.round(cd/60);state.focusInCycle++}}
    setTimeout(()=>{if(cm==='focus'){if(state.focusInCycle>=settings.sessions){state.mode='long';state.focusInCycle=0}else state.mode='short'}else state.mode='focus';state.duration=durationFor(state.mode);state.remaining=state.duration;renderUI();const auto=cm==='focus'?settings.autoBreak:settings.autoFocus;if(auto&&!skipped)startTimer()},skipped?0:450);
  }

  function setMinutes(m){const next=clamp(Math.round(m),1,60);state.duration=next*60;state.remaining=state.duration;renderMechanical();els.status.textContent=`${next} min set`;persist()}
  function setupDrag(){
    els.drag.addEventListener('pointerdown',e=>{if(state.running){showToast('Pause before setting time');return}ensureAudio();dragState={id:e.pointerId,lastX:e.clientX,acc:0};els.drag.setPointerCapture?.(e.pointerId);els.top.classList.add('dragging');els.hint.textContent='Twist left / right'});
    els.drag.addEventListener('pointermove',e=>{if(!dragState||e.pointerId!==dragState.id)return;e.preventDefault();const dx=e.clientX-dragState.lastX;dragState.lastX=e.clientX;dragState.acc+=dx;while(Math.abs(dragState.acc)>=7){const step=dragState.acc>0?1:-1;setMinutes(minutes()+step);dragState.acc-=step*7;ratchet();if(settings.vibrate&&navigator.vibrate)navigator.vibrate(5)}});
    const end=()=>{if(!dragState)return;dragState=null;els.top.classList.remove('dragging');els.hint.textContent='Hold the upper half and drag left / right';releaseClick();if(settings.vibrate&&navigator.vibrate)navigator.vibrate(18)};
    els.drag.addEventListener('pointerup',end);els.drag.addEventListener('pointercancel',end);els.drag.addEventListener('lostpointercapture',end);
  }

  function showToast(text){clearTimeout(toastTimer);els.toast.textContent=text;els.toast.classList.remove('hidden');toastTimer=setTimeout(()=>els.toast.classList.add('hidden'),1800)}
  function syncSettings(){['focus','short','long','sessions'].forEach(k=>inputs[k].value=settings[k]);['autoBreak','autoFocus','wake','sound','tick','vibrate','motion'].forEach(k=>inputs[k].checked=!!settings[k]);if(els.notify)els.notify.textContent=('Notification'in window&&Notification.permission==='granted')?'Notifications enabled ✓':'Enable notifications'}
  function setupSettings(){
    ['focus','short','long'].forEach(k=>inputs[k].addEventListener('change',e=>{settings[k]=clamp(parseInt(e.target.value||1,10),1,60);if(state.mode===(k==='focus'?'focus':k==='short'?'short':'long')&&!state.running){state.duration=durationFor(state.mode);state.remaining=state.duration}renderUI()}));
    inputs.sessions.addEventListener('change',e=>{settings.sessions=clamp(parseInt(e.target.value||4,10),1,12);state.focusInCycle=clamp(state.focusInCycle,0,settings.sessions-1);renderUI()});
    ['autoBreak','autoFocus','wake','sound','tick','vibrate','motion'].forEach(k=>inputs[k].addEventListener('change',e=>{settings[k]=e.target.checked;write(SETTINGS_KEY,settings);if(k==='wake'&&!settings.wake)releaseWake();renderUI()}));
  }
  function setupInstall(){window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;els.install.classList.remove('hidden')});els.install.addEventListener('click',async()=>{if(!deferredPrompt)return showToast('Use browser menu → Add to Home screen');deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;els.install.classList.add('hidden')})}
  function setupNotifications(){if(!els.notify)return;els.notify.addEventListener('click',async()=>{if(!('Notification'in window))return showToast('Notifications unavailable');const p=await Notification.requestPermission();syncSettings();showToast(p==='granted'?'Notifications enabled':'Notifications not enabled')})}
  function setupServiceWorker(){if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{})}

  buildScale();setupDrag();setupSettings();setupInstall();setupNotifications();setupServiceWorker();syncSettings();
  els.start.addEventListener('click',toggle);els.reset.addEventListener('click',reset);els.skip.addEventListener('click',()=>complete(true));document.querySelectorAll('.mode').forEach(b=>b.addEventListener('click',()=>switchMode(b.dataset.mode)));
  els.settingsBtn.addEventListener('click',()=>{syncSettings();els.scrim.classList.remove('hidden');els.sheet.classList.add('open')});els.closeSettings.addEventListener('click',()=>{els.sheet.classList.remove('open');setTimeout(()=>els.scrim.classList.add('hidden'),200)});els.scrim.addEventListener('click',()=>els.closeSettings.click());
  els.soundQuick.addEventListener('click',()=>{settings.sound=!settings.sound;write(SETTINGS_KEY,settings);syncSettings();renderUI()});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.running){state.remaining=Math.max(0,(state.endTime-Date.now())/1000);renderMechanical();acquireWake();startLoop()}else if(document.visibilityState!=='visible')releaseWake()});

  if(state.running&&state.endTime){if(state.endTime>Date.now()){state.remaining=(state.endTime-Date.now())/1000;startLoop();acquireWake()}else{state.running=false;state.remaining=0;state.endTime=null}}
  renderUI();
})();