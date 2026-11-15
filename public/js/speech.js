/**
 * Egg Party Voice Recorder & Speech-to-Text Engine
 * Supports HTML5 MediaRecorder + Web Audio API waveform visualizer + Web Speech Recognition (zh-CN)
 */
class VoiceRecorderEngine {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.isRecording = false;
    this.audioContext = null;
    this.analyser = null;
    this.animationFrameId = null;
    this.recognition = null;
    this.transcript = '';
    this.startTime = 0;
    this.timerInterval = null;
    this.recordedBlob = null;
    this.recordedBase64 = null;
  }

  // Check if browser supports recording
  isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  // Check if speech recognition is available
  isSpeechRecognitionSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  async startRecording(canvasElement, onTick, onTranscriptUpdate) {
    if (this.isRecording) return;
    this.audioChunks = [];
    this.transcript = '';
    this.recordedBlob = null;
    this.recordedBase64 = null;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.warn('Microphone permission denied or not available:', err);
      throw new Error('无法访问麦克风，请检查浏览器权限设置');
    }

    // Set up MediaRecorder
    let mimeType = 'audio/webm';
    if (!MediaRecorder.isTypeSupported('audio/webm')) {
      if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
      } else {
        mimeType = '';
      }
    }

    const options = mimeType ? { mimeType } : undefined;
    this.mediaRecorder = new MediaRecorder(this.stream, options);

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.audioChunks.push(e.data);
      }
    };

    // Setup Audio Visualizer
    if (canvasElement) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioCtx();
        const source = this.audioContext.createMediaStreamSource(this.stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 64;
        source.connect(this.analyser);
        this.startVisualizer(canvasElement);
      } catch (e) {
        console.warn('Visualizer setup error:', e);
      }
    }

    // Setup Web Speech Recognition
    if (this.isSpeechRecognitionSupported()) {
      try {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRec();
        const langMap = { 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW', 'ja': 'ja-JP', 'en': 'en-US' };
        const currentLang = window.i18n ? window.i18n.getLanguage() : 'zh-CN';
        this.recognition.lang = langMap[currentLang] || 'zh-CN';
        this.recognition.continuous = true;
        this.recognition.interimResults = true;

        this.recognition.onresult = (event) => {
          let currentTranscript = '';
          for (let i = 0; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          this.transcript = currentTranscript;
          if (onTranscriptUpdate) {
            onTranscriptUpdate(this.transcript);
          }
        };

        this.recognition.onerror = (e) => {
          console.log('Speech recognition notice:', e.error);
        };

        this.recognition.start();
      } catch (e) {
        console.warn('Speech recognition start failed:', e);
      }
    }

    this.mediaRecorder.start(100);
    this.isRecording = true;
    this.startTime = Date.now();

    if (onTick) {
      this.timerInterval = setInterval(() => {
        const seconds = Math.floor((Date.now() - this.startTime) / 1000);
        onTick(seconds);
      }, 500);
    }
  }

  startVisualizer(canvas) {
    const ctx = canvas.getContext('2d');
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!this.isRecording) return;
      this.animationFrameId = requestAnimationFrame(draw);

      this.analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.85 + 4;

        // Egg Party gradient colors (Yellow to Pink)
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, '#FFD23F');
        gradient.addColorStop(1, '#FF5376');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, (canvas.height - barHeight) / 2, barWidth - 3, barHeight, 4);
        ctx.fill();

        x += barWidth;
      }
    };

    draw();
  }

  stopRecording() {
    return new Promise((resolve) => {
      if (!this.isRecording || !this.mediaRecorder) {
        resolve({ blob: null, base64: null, transcript: '' });
        return;
      }

      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }

      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }

      if (this.recognition) {
        try {
          this.recognition.stop();
        } catch (e) {}
      }

      this.mediaRecorder.onstop = async () => {
        const mimeType = this.mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(this.audioChunks, { type: mimeType });
        this.recordedBlob = blob;

        // Convert blob to base64
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          this.recordedBase64 = reader.result;
          this.isRecording = false;

          // Stop all audio tracks
          if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
          }
          if (this.audioContext && this.audioContext.state !== 'closed') {
            try { this.audioContext.close(); } catch (e) {}
          }

          resolve({
            blob: this.recordedBlob,
            base64: this.recordedBase64,
            transcript: this.transcript,
            duration: Math.max(1, Math.round((Date.now() - this.startTime) / 1000))
          });
        };
      };

      this.mediaRecorder.stop();
    });
  }

  cancelRecording() {
    if (this.isRecording) {
      if (this.timerInterval) clearInterval(this.timerInterval);
      if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
      if (this.recognition) {
        try { this.recognition.stop(); } catch (e) {}
      }
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
      if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
      }
      this.isRecording = false;
    }
  }
}

window.voiceEngine = new VoiceRecorderEngine();
