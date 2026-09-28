export const VOICE_SAMPLE_RATE = 16_000;
export const VOICE_MAX_MS = 3 * 60_000;

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1)
    view.setUint8(offset + index, value.charCodeAt(index));
}

export function encodePcm16Wav(
  chunks: Float32Array[],
  sourceSampleRate: number,
  targetSampleRate = VOICE_SAMPLE_RATE,
) {
  if (!Number.isFinite(sourceSampleRate) || sourceSampleRate <= 0)
    throw new Error("Некорректная частота записи.");
  const outputRate = Math.min(sourceSampleRate, targetSampleRate);
  const inputLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  if (!inputLength) throw new Error("Запись получилась пустой.");

  const input = new Float32Array(inputLength);
  let cursor = 0;
  for (const chunk of chunks) {
    input.set(chunk, cursor);
    cursor += chunk.length;
  }

  const ratio = sourceSampleRate / outputRate;
  const sampleCount = Math.max(1, Math.floor(input.length / ratio));
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, outputRate, true);
  view.setUint32(28, outputRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, sampleCount * 2, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const from = Math.floor(index * ratio);
    const to = Math.max(from + 1, Math.min(input.length, Math.floor((index + 1) * ratio)));
    let sum = 0;
    for (let sourceIndex = from; sourceIndex < to; sourceIndex += 1)
      sum += input[sourceIndex];
    const sample = Math.max(-1, Math.min(1, sum / (to - from)));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return buffer;
}

export type PcmVoiceRecorder = {
  stop: () => Promise<File>;
  cancel: () => Promise<void>;
};

export async function startPcmVoiceRecorder(
  stream: MediaStream,
): Promise<PcmVoiceRecorder> {
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("Этот браузер не поддерживает совместимую запись звука.");
  }

  const context = new AudioContextConstructor();
  let source: MediaStreamAudioSourceNode;
  let processor: ScriptProcessorNode;
  let silentOutput: GainNode;
  try {
    await context.resume();
    source = context.createMediaStreamSource(stream);
    processor = context.createScriptProcessor(4096, 1, 1);
    silentOutput = context.createGain();
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    if (context.state !== "closed") await context.close().catch(() => {});
    throw error;
  }
  const chunks: Float32Array[] = [];
  let finished = false;

  silentOutput.gain.value = 0;
  processor.onaudioprocess = (event) => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(silentOutput);
  silentOutput.connect(context.destination);

  const close = async () => {
    processor.onaudioprocess = null;
    source.disconnect();
    processor.disconnect();
    silentOutput.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    if (context.state !== "closed") await context.close();
  };

  return {
    stop: async () => {
      if (finished) throw new Error("Запись уже остановлена.");
      finished = true;
      await close();
      const wav = encodePcm16Wav(chunks, context.sampleRate);
      if (wav.byteLength < 1_000)
        throw new Error("Запись получилась слишком короткой. Попробуйте ещё раз.");
      return new File([wav], `voice-${Date.now()}.wav`, { type: "audio/wav" });
    },
    cancel: async () => {
      if (finished) return;
      finished = true;
      await close();
    },
  };
}
