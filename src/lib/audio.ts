import type { Speed } from '../types'
import { cacheAudio, readAudio } from './db'
import { VOICES, voiceById } from './voices'

export function isPhrase(text: string) {
  const han = [...text].filter((char) => /\p{Script=Han}/u.test(char)).length
  return han >= 5 || /[。！？!?…]/.test(text)
}

const DEVICE_RATE: Record<Speed, number> = {
  slow: 0.62,
  steady: 0.78,
  clear: 0.9,
  brisk: 1.02,
}

const memory = new Map<string, string>()
const loading = new Map<string, Promise<string | undefined>>()
let player: HTMLAudioElement | null = null
let ticket = 0

export type SpeakResult = 'neural' | 'device' | 'miss'

function element() {
  if (!player) {
    player = new Audio()
    player.preload = 'auto'
    player.setAttribute('playsinline', 'true')
  }
  return player
}

let silence: string | null = null

function silentUrl() {
  if (silence) return silence
  const rate = 8000
  const samples = 800
  const buffer = new ArrayBuffer(44 + samples)
  const view = new DataView(buffer)
  const tag = (at: number, text: string) => [...text].forEach((char, index) => view.setUint8(at + index, char.charCodeAt(0)))
  tag(0, 'RIFF')
  view.setUint32(4, 36 + samples, true)
  tag(8, 'WAVE')
  tag(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  tag(36, 'data')
  view.setUint32(40, samples, true)
  new Uint8Array(buffer, 44).fill(128)
  silence = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
  return silence
}

export function unlockAudio() {
  const audio = element()
  if (!audio.paused) return
  audio.src = silentUrl()
  void audio.play().catch(() => undefined)
}

export function stopSpeech() {
  ticket += 1
  player?.pause()
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}

function playUrl(url: string, mine: number): Promise<boolean> {
  if (mine !== ticket) return Promise.resolve(false)
  const audio = element()
  audio.src = url
  try {
    audio.currentTime = 0
  } catch {
    // адрес ещё не открылся — play всё равно стартует с начала
  }
  const pending = audio.play()
  if (!pending) return Promise.resolve(mine === ticket)
  return pending.then(
    () => mine === ticket,
    async (error: unknown) => {
      if (mine !== ticket) return false
      const name = error instanceof Error ? error.name : ''
      if (name !== 'AbortError' && name !== 'NotAllowedError') return false
      try {
        await audio.play()
        return mine === ticket
      } catch {
        return false
      }
    },
  )
}

function deviceSpeak(text: string, speed: Speed, phrase: boolean, mine: number) {
  return new Promise<boolean>((resolve, reject) => {
    if (mine !== ticket || typeof speechSynthesis === 'undefined') {
      resolve(false)
      return
    }
    const utter = new SpeechSynthesisUtterance(text)
    const voices = speechSynthesis.getVoices()
    const voice = voices.find((item) => item.lang.toLowerCase().startsWith('zh'))
    if (voice) utter.voice = voice
    utter.lang = 'zh-CN'
    utter.rate = Math.max(0.55, DEVICE_RATE[speed] - (phrase ? 0.14 : 0))
    utter.onend = () => resolve(mine === ticket)
    utter.onerror = () => reject(new Error('speech-error'))
    window.setTimeout(() => {
      if (mine !== ticket) {
        resolve(false)
        return
      }
      speechSynthesis.speak(utter)
    }, 40)
  })
}

function cacheKey(text: string, voiceId: string, speed: Speed, mode: 'tones' | 'vocab') {
  const phrase = mode !== 'tones' && isPhrase(text)
  return { phrase, key: `${voiceId}|${speed}|${phrase ? 'line' : mode}|${text}` }
}

function loadUrl(key: string, text: string, voiceId: string, speed: Speed, mode: 'tones' | 'vocab', mine: number | null) {
  const known = memory.get(key)
  if (known) return Promise.resolve(known)
  const existing = loading.get(key)
  if (existing) {
    return existing.then((url) => (mine !== null && mine !== ticket ? undefined : url))
  }
  const job = (async () => {
    const cached = await readAudio(key).catch(() => undefined)
    if (cached) {
      const url = URL.createObjectURL(cached)
      memory.set(key, url)
      return url
    }
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, voice: voiceId, speed, mode }),
    })
    if (!response.ok) throw new Error(String(response.status))
    const blob = await response.blob()
    if (memory.has(key)) return memory.get(key)
    const url = URL.createObjectURL(blob)
    memory.set(key, url)
    void cacheAudio(key, blob).catch(() => undefined)
    return url
  })().finally(() => loading.delete(key))
  loading.set(key, job)
  return job.then((url) => (mine !== null && mine !== ticket ? undefined : url))
}

export function prefetch(text: string, voiceId: string, speed: Speed, mode: 'tones' | 'vocab' = 'vocab') {
  const clean = text.trim()
  if (!clean) return
  const { key } = cacheKey(clean, voiceId, speed, mode)
  if (memory.has(key)) return
  void loadUrl(key, clean, voiceId, speed, mode, null).catch(() => undefined)
}

export async function speak(
  text: string,
  voiceId: string,
  speed: Speed,
  mode: 'tones' | 'vocab' = 'vocab',
): Promise<SpeakResult> {
  const clean = text.trim()
  if (!clean) return 'miss'
  const mine = ++ticket
  const { phrase, key } = cacheKey(clean, voiceId, speed, mode)
  const known = memory.get(key)
  if (known) {
    const played = await playUrl(known, mine)
    return played ? 'neural' : 'miss'
  }
  // iOS пускает звук только из касания, а загрузка его прерывает: будим плеер тишиной сразу
  unlockAudio()
  try {
    const url = await loadUrl(key, clean, voiceId, speed, mode, mine)
    if (mine !== ticket || !url) return 'miss'
    const played = await playUrl(url, mine)
    return played ? 'neural' : 'miss'
  } catch {
    if (mine !== ticket) return 'miss'
    const played = await deviceSpeak(clean, speed, phrase, mine).catch(() => false)
    return played ? 'device' : 'miss'
  }
}

export function pickVoice(preferred: string, mix: boolean): string {
  if (!mix) return voiceById(preferred).id
  const pool = VOICES.map((voice) => voice.id)
  return pool[Math.floor(Math.random() * pool.length)]
}
