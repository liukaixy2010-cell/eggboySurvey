const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'uploads', 'audio');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

// Generate 2 seconds of cute voice chime
const sampleRate = 44100;
const duration = 2.0;
const numSamples = Math.floor(sampleRate * duration);
const dataSize = numSamples * 2;
const buffer = Buffer.alloc(44 + dataSize);

buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(1, 22);
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * 2, 28);
buffer.writeUInt16LE(2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write('data', 36);
buffer.writeUInt32LE(dataSize, 40);

const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 (Egg party cheerful chime)
for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  const noteIdx = Math.min(notes.length - 1, Math.floor(t / 0.5));
  const noteT = (t % 0.5);
  const freq = notes[noteIdx];
  const envelope = Math.exp(-noteT * 5);
  const sample = Math.sin(2 * Math.PI * freq * t) * envelope * 0.4;
  const intSample = Math.floor(sample * 32767);
  buffer.writeInt16LE(intSample, 44 + i * 2);
}

fs.writeFileSync(path.join(dir, 'demo_voice_1.wav'), buffer);
console.log('Demo voice audio created successfully at uploads/audio/demo_voice_1.wav');
