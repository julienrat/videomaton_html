(() => {
  /** State **/
  let mediaStream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let directoryHandle = null; // File System Access API handle
  let audioContext = null;
  let analyser = null;
  let audioSource = null;
  let silenceThreshold = 0.04; // 0..1 RMS
  let silenceDurationMs = 2000; // stocké en ms, affiché en secondes
  let silenceStartAt = null;
  let isRecording = false;
  let countdownSeconds = 3;
  let isCountingDown = false;
  let hotkey = null;
  let lastRms = 0;
  let lastToggleAt = 0;
  let toggleCooldownMs = 600;
  let isMirrored = false;

  /** Elements **/
  const el = (id) => document.getElementById(id);
  const preview = el('preview');
  const cameraSelect = el('cameraSelect');
  const questionInput = el('questionInput');
  const questionText = el('questionText');
  const startBtn = el('startBtn');
  const stopBtn = el('stopBtn');
  const countdownEl = el('countdown');
  const videoWrapper = el('videoWrapper');
  const recordingBorder = el('recordingBorder');
  const audioLevel = el('audioLevel');
  const audioLevelSettings = el('audioLevelSettings');
  const audioThresholdMarker = document.getElementById('audioThresholdMarker');
  const silenceThresholdNumber = document.getElementById('silenceThresholdNumber');
  const calibrateThresholdBtn = document.getElementById('calibrateThresholdBtn');
  const bgColorInput = el('bgColorInput');
  const bgImageInput = el('bgImageInput');
  const bgImageFileInput = document.getElementById('bgImageFileInput');
  const clearBgImageBtn = document.getElementById('clearBgImageBtn');
  const chooseDirBtn = el('chooseDirBtn');
  const chosenDirLabel = el('chosenDirLabel');
  const statusEl = el('status');
  const hotkeyInput = el('hotkeyInput');
  const clearHotkeyBtn = el('clearHotkeyBtn');
  const countdownInput = el('countdownInput');
  const silenceThresholdInput = el('silenceThresholdInput');
  const silenceDurationInput = el('silenceDurationInput');
  const stage = el('stage');
  const openSettingsBtn = el('openSettingsBtn');
  const settingsDialog = el('settingsDialog');
  const closeSettingsBtn = el('closeSettingsBtn');
  const controlsAside = document.querySelector('aside.controls');
  const layout = document.querySelector('.layout');
  const cooldownInput = document.getElementById('cooldownInput');
  const mirrorInput = document.getElementById('mirrorInput');

  /** Utils **/
  const fmtTime = () => new Date().toISOString().replaceAll(':', '-').replace('T', '_').split('.')[0];
  const setStatus = (msg) => { statusEl.textContent = msg; };
  const saveSettings = () => {
    const settings = {
      hotkey,
      countdownSeconds,
      question: questionInput.value || '',
      bgColor: bgColorInput.value || '#101317',
      bgImage: bgImageInput.value || '',
      silenceThreshold,
      silenceDurationMs,
      toggleCooldownMs,
      isMirrored
    };
    localStorage.setItem('videomaton_settings', JSON.stringify(settings));
  };
  const loadSettings = () => {
    try{
      const raw = localStorage.getItem('videomaton_settings');
      if(!raw) return;
      const s = JSON.parse(raw);
      hotkey = s.hotkey ?? hotkey;
      countdownSeconds = Number.isFinite(s.countdownSeconds) ? s.countdownSeconds : countdownSeconds;
      if(typeof s.question === 'string') questionInput.value = s.question;
      if(typeof s.bgColor === 'string') bgColorInput.value = s.bgColor;
      if(typeof s.bgImage === 'string') bgImageInput.value = s.bgImage;
      if(Number.isFinite(s.silenceThreshold)) silenceThreshold = s.silenceThreshold;
      if(Number.isFinite(s.silenceDurationMs)) silenceDurationMs = s.silenceDurationMs; // toujours stocké en ms
      if(Number.isFinite(s.toggleCooldownMs)) toggleCooldownMs = s.toggleCooldownMs;
      if(typeof s.isMirrored === 'boolean') isMirrored = s.isMirrored;
    }catch{}
  };

  const applyUIFromSettings = () => {
    questionText.textContent = questionInput.value || '';
    stage.style.backgroundColor = bgColorInput.value || '#101317';
    const bgUrl = bgImageInput.value?.trim();
    stage.style.backgroundImage = bgUrl ? `url("${bgUrl}")` : 'none';
    stage.style.backgroundSize = 'cover';
    stage.style.backgroundPosition = 'center';
    hotkeyInput.value = hotkey ? hotkey.toUpperCase() : '';
    countdownInput.value = String(countdownSeconds);
    silenceThresholdInput.value = String(silenceThreshold);
    if(silenceThresholdNumber) silenceThresholdNumber.value = String(silenceThreshold);
    silenceDurationInput.value = String(silenceDurationMs / 1000); // afficher en secondes
    if(cooldownInput) cooldownInput.value = String(toggleCooldownMs);
    if(mirrorInput) mirrorInput.checked = isMirrored;
    if(preview) preview.style.transform = isMirrored ? 'scaleX(-1)' : 'scaleX(1)';
  };

  /** Media setup **/
  async function enumerateCameras(){
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videos = devices.filter(d => d.kind === 'videoinput');
    const selectedId = cameraSelect.value;
    cameraSelect.innerHTML = '';
    for(const d of videos){
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Caméra ${cameraSelect.length+1}`;
      cameraSelect.appendChild(opt);
    }
    if(videos.length && selectedId){
      const exists = videos.some(v => v.deviceId === selectedId);
      if(exists) cameraSelect.value = selectedId;
    }
  }

  async function startPreview(){
    try{
      await enumerateCameras();
      const constraints = {
        audio: true,
        video: cameraSelect.value ? { deviceId: { exact: cameraSelect.value } } : { width: { ideal: 1920 }, height: { ideal: 1080 } }
      };
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      preview.srcObject = mediaStream;
      setupAudioAnalysis(mediaStream);
      setStatus('Aperçu lancé');
    }catch(err){
      console.error(err);
      setStatus('Erreur accès caméra/micro - vérifiez les permissions');
    }
  }

  async function switchCamera(){
    if(mediaStream){
      mediaStream.getTracks().forEach(t => t.stop());
    }
    await startPreview();
  }

  function setupAudioAnalysis(stream){
    try{
      if(audioContext){
        audioContext.close().catch(()=>{});
      }
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioSource = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      audioSource.connect(analyser);
      monitorAudioLevel();
    }catch(err){
      console.warn('AudioContext error', err);
    }
  }

  function monitorAudioLevel(){
    if(!analyser) return;
    const buffer = new Uint8Array(analyser.fftSize);
    const step = () => {
      analyser.getByteTimeDomainData(buffer);
      // Compute RMS from time-domain samples
      let sum = 0;
      for(let i=0;i<buffer.length;i++){
        const v = (buffer[i] - 128) / 128;
        sum += v*v;
      }
      const rms = Math.sqrt(sum / buffer.length);
      lastRms = rms;
      const pct = Math.min(1, rms * 4) * 100;
      audioLevel.style.width = `${pct}%`;
      if(audioLevelSettings){ audioLevelSettings.style.width = `${pct}%`; }
      if(audioThresholdMarker){
        const markerPct = Math.min(1, (Number(silenceThreshold) || 0) * 4) * 100;
        audioThresholdMarker.style.left = `calc(${markerPct}% - 1px)`;
      }

      if(isRecording){
        const now = performance.now();
        if(rms < silenceThreshold){
          if(silenceStartAt == null) silenceStartAt = now;
          const elapsed = now - silenceStartAt;
          if(elapsed >= silenceDurationMs){
            stopRecording(/*reason*/'Silence détecté');
          }
        } else {
          silenceStartAt = null;
        }
      } else {
        silenceStartAt = null;
      }

      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** Recording **/
  async function startRecordingFlow(){
    if(isRecording || isCountingDown) return;
    const secs = Math.max(0, Math.floor(Number(countdownInput.value) || 0));
    countdownSeconds = secs;
    saveSettings();
    if(secs > 0){
      await runCountdown(secs);
    }
    await startRecording();
  }

  function runCountdown(secs){
    return new Promise((resolve) => {
      let n = secs;
      isCountingDown = true;
      countdownEl.classList.add('show');
      countdownEl.textContent = String(n);
      const tick = () => {
        n -= 1;
        if(n <= 0){
          countdownEl.textContent = 'Go';
          setTimeout(() => { countdownEl.classList.remove('show'); countdownEl.textContent = ''; isCountingDown = false; resolve(); }, 300);
        } else {
          countdownEl.textContent = String(n);
          setTimeout(tick, 1000);
        }
      };
      setTimeout(tick, 1000);
    });
  }

  async function startRecording(){
    if(!mediaStream){
      await startPreview();
      if(!mediaStream) return;
    }
    recordedChunks = [];
    try{
      mediaRecorder = new MediaRecorder(mediaStream, { mimeType: pickSupportedMimeType() });
    }catch{
      mediaRecorder = new MediaRecorder(mediaStream);
    }
    mediaRecorder.ondataavailable = (e) => {
      if(e.data && e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
      await saveRecording(blob);
    };
    mediaRecorder.start();
    isRecording = true;
    videoWrapper.classList.add('recording');
    startBtn.disabled = true;
    stopBtn.disabled = false;
    setStatus('Enregistrement en cours…');
  }

  function stopRecording(reason){
    if(!isRecording) return;
    try{ mediaRecorder?.stop(); }catch{}
    isRecording = false;
    videoWrapper.classList.remove('recording');
    startBtn.disabled = false;
    stopBtn.disabled = true;
    if(reason) setStatus(`Arrêté: ${reason}`); else setStatus('Enregistrement arrêté');
  }

  function pickSupportedMimeType(){
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4;codecs=h264,aac' // souvent non supporté par MediaRecorder dans Chromium
    ];
    for(const t of candidates){
      if(MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
  }

  async function saveRecording(blob){
    const name = `videomaton_${fmtTime()}.webm`;
    if(directoryHandle && 'showDirectoryPicker' in window){
      try{
        const fileHandle = await directoryHandle.getFileHandle(name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        setStatus(`Enregistré dans le dossier: ${name}`);
        return;
      }catch(err){
        console.warn('Écriture dossier échouée, fallback download', err);
      }
    }
    // Fallback: téléchargement
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus('Téléchargement du fichier lancé');
  }

  /** Directory selection (File System Access API) **/
  async function chooseDirectory(){
    if(!('showDirectoryPicker' in window)){
      alert('Votre navigateur ne supporte pas le choix d’un dossier. Le fichier sera téléchargé.');
      return;
    }
    try{
      directoryHandle = await window.showDirectoryPicker();
      chosenDirLabel.textContent = 'Dossier choisi';
    }catch(err){
      if(err && err.name === 'AbortError') return; // annulé par l’utilisateur
      console.warn(err);
      alert('Impossible de choisir le dossier.');
    }
  }

  /** Hotkey **/
  function bindHotkeyCapture(){
    hotkeyInput.addEventListener('focus', () => {
      hotkeyInput.value = 'Appuyez…';
    });
    hotkeyInput.addEventListener('blur', () => {
      applyUIFromSettings();
    });
    hotkeyInput.addEventListener('keydown', (e) => {
      e.preventDefault();
      const key = e.key;
      if(key === 'Escape'){
        hotkey = null;
      }else{
        // Pas de modificateurs, on enregistre la touche simple
        if(!e.ctrlKey && !e.altKey && !e.metaKey){
          const lower = key.toLowerCase();
          // Interdire 'm' car réservé pour le toggle du menu
          if(lower === 'm'){
            alert('La touche "m" est réservée pour afficher/masquer le menu. Choisissez une autre touche.');
            return;
          }
          hotkey = lower;
        }
      }
      saveSettings();
      applyUIFromSettings();
    });
    clearHotkeyBtn.addEventListener('click', () => {
      hotkey = null;
      saveSettings();
      applyUIFromSettings();
    });
    document.addEventListener('keydown', (e) => {
      const key = e.key?.toLowerCase();
      const noMods = !e.ctrlKey && !e.altKey && !e.metaKey;
      if(!key) return;

      // Vérifier si un champ de saisie a le focus
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');

      // Toggle menu with 'm' (prioritaire, évite conflit avec la touche d'enregistrement)
      // Ignorer si un champ de saisie a le focus
      if(key === 'm' && noMods && !isInputFocused){
        if(e.repeat) return;
        e.preventDefault();
        if(controlsAside){ controlsAside.classList.toggle('is-hidden'); }
        if(layout){ layout.classList.toggle('no-controls'); }
        return; // ne pas propager au toggle d'enregistrement
      }

      // Toggle enregistrement via touche personnalisée
      if(!hotkey) return;
      if(key === hotkey && noMods){
        if(e.repeat) return; // ignore auto-repeat
        e.preventDefault();
        if(isCountingDown) return; // ne pas toggler pendant le compte à rebours
        const now = performance.now();
        if(now - lastToggleAt < toggleCooldownMs) return;
        lastToggleAt = now;
        if(isRecording) stopRecording(); else startRecordingFlow();
      }
    });
  }

  /** Wire UI **/
  function wireUI(){
    questionInput.addEventListener('input', () => { questionText.textContent = questionInput.value; saveSettings(); });
    bgColorInput.addEventListener('input', () => { stage.style.backgroundColor = bgColorInput.value; saveSettings(); });
    bgImageInput.addEventListener('input', () => { const v = bgImageInput.value?.trim(); stage.style.backgroundImage = v?`url("${v}")`:'none'; saveSettings(); });
    if(bgImageFileInput){
      bgImageFileInput.addEventListener('change', () => {
        const file = bgImageFileInput.files && bgImageFileInput.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          bgImageInput.value = typeof dataUrl === 'string' ? dataUrl : '';
          stage.style.backgroundImage = bgImageInput.value ? `url("${bgImageInput.value}")` : 'none';
          saveSettings();
        };
        reader.readAsDataURL(file);
      });
    }
    if(clearBgImageBtn){
      clearBgImageBtn.addEventListener('click', () => {
        stage.style.backgroundImage = 'none';
        bgImageInput.value = '';
        if(bgImageFileInput) bgImageFileInput.value = '';
        saveSettings();
      });
    }
    cameraSelect.addEventListener('change', switchCamera);
    startBtn.addEventListener('click', () => {
      const now = performance.now();
      if(now - lastToggleAt < toggleCooldownMs) return;
      lastToggleAt = now;
      startRecordingFlow();
    });
    stopBtn.addEventListener('click', () => {
      const now = performance.now();
      if(now - lastToggleAt < toggleCooldownMs) return;
      lastToggleAt = now;
      stopRecording();
    });
    chooseDirBtn.addEventListener('click', chooseDirectory);
    countdownInput.addEventListener('change', () => { countdownSeconds = Math.max(0, Math.floor(Number(countdownInput.value)||0)); saveSettings(); });
    silenceThresholdInput.addEventListener('input', () => {
      silenceThreshold = Number(silenceThresholdInput.value)||0;
      if(silenceThresholdNumber) silenceThresholdNumber.value = String(silenceThreshold);
      saveSettings();
    });
    if(silenceThresholdNumber){
      silenceThresholdNumber.addEventListener('input', () => {
        const v = Number(silenceThresholdNumber.value);
        if(Number.isFinite(v)){
          silenceThreshold = Math.min(1, Math.max(0, v));
          silenceThresholdInput.value = String(silenceThreshold);
          saveSettings();
        }
      });
    }
    if(calibrateThresholdBtn){
      calibrateThresholdBtn.addEventListener('click', () => {
        const margin = 1.3; // +30%
        const next = Math.min(1, lastRms * margin);
        silenceThreshold = next;
        silenceThresholdInput.value = String(silenceThreshold);
        if(silenceThresholdNumber) silenceThresholdNumber.value = String(silenceThreshold);
        saveSettings();
      });
    }
    if(cooldownInput){
      cooldownInput.addEventListener('change', () => {
        const v = Math.max(0, Math.floor(Number(cooldownInput.value) || 0));
        toggleCooldownMs = v;
        saveSettings();
      });
    }
    if(mirrorInput){
      mirrorInput.addEventListener('change', () => {
        isMirrored = mirrorInput.checked;
        preview.style.transform = isMirrored ? 'scaleX(-1)' : 'scaleX(1)';
        saveSettings();
      });
    }
    silenceDurationInput.addEventListener('change', () => { silenceDurationMs = Math.max(0, Math.round((Number(silenceDurationInput.value)||0) * 1000)); saveSettings(); }); // convertir secondes vers ms
    openSettingsBtn.addEventListener('click', () => settingsDialog.showModal());
    closeSettingsBtn.addEventListener('click', () => settingsDialog.close());
  }

  /** Init **/
  async function init(){
    loadSettings();
    applyUIFromSettings();
    bindHotkeyCapture();
    wireUI();
    await ensurePermissionsThenStart();
  }

  async function ensurePermissionsThenStart(){
    try{
      await startPreview();
      // si labels vides, ré-énumérer après permission pour obtenir labels
      setTimeout(enumerateCameras, 300);
    }catch(err){
      console.warn(err);
    }
  }

  window.addEventListener('load', init);
})();


