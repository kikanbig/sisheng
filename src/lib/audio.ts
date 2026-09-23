import { cacheAudio, readAudio } from './db'
import { VOICES, voiceById } from './voices'

const memory = new Map<string, string>()
let player: HTMLAudioElement | null = null
let ticket = 0

export function stopSpeech() {
  ticket += 1
  if (player) {
    player.pause()
    player.src = ''
    player = null
  }
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}

async function playUrl(url: string, mine: number) {
  if (mine !== ticket) return
  if (player) {
    player.pause()
    player.src = ''
  }
  const audio = new Audio(url)
  player = audio
  audio.preload = 'auto'
  await audio.play()
}

function deviceSpeak(text: string, slow: boolean, mine: number) {
  return new Promise<void>((resolve, reject) => {
    if (mine !== ticket) {
      resolve()
      return
    }
    if (typeof speechSynthesis === 'undefined') {
      reject(new Error('no-speech'))
      return
    }
    const utter = new SpeechSynthesisUtterance(text)
    const voices = speechSynthesis.getVoices()
    const voice = voices.find((item) => item.lang.toLowerCase().startsWith('zh'))
    if (voice) utter.voice = voice
    utter.lang = 'zh-CN'
    utter.rate = slow ? 0.72 : 0.88
    utter.onend = () => resolve()
    utter.onerror = () => reject(new Error('speech-error'))
    speechSynthesis.cancel()
    speechSynthesis.speak(utter)
  })
}

export async function speak(
  text: string,
  voiceId: string,
  slow: boolean,
  mode: 'tones' | 'vocab' = 'vocab',
): Promise<'neural' | 'device'> {
  const clean = text.trim()
  if (!clean) return 'neural'
  const mine = ++ticket
  const key = `${voiceId}|${slow ? 's' : 'n'}|${mode}|${clean}`
  const known = memory.get(key)
  if (known) {
    await playUrl(known, mine)
    return 'neural'
  }
  const cached = await readAudio(key).catch(() => undefined)
  if (mine !== ticket) return 'neural'
  if (cached) {
    const url = URL.createObjectURL(cached)
    memory.set(key, url)
    await playUrl(url, mine)
    return 'neural'
  }
  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: clean, voice: voiceId, slow, mode }),
    })
    if (mine !== ticket) return 'neural'
    if (!response.ok) throw new Error(String(response.status))
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    memory.set(key, url)
    void cacheAudio(key, blob).catch(() => undefined)
    await playUrl(url, mine)
    return 'neural'
  } catch {
    if (mine !== ticket) return 'neural'
    await deviceSpeak(clean, slow, mine)
    return 'device'
  }
}

export function pickVoice(preferred: string, mix: boolean): string {
  if (!mix) return voiceById(preferred).id
  const pool = VOICES.map((voice) => voice.id)
  return pool[Math.floor(Math.random() * pool.length)]
}
