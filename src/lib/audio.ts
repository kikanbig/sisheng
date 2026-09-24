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
let player: HTMLAudioElement | null = null
let ticket = 0

export type SpeakResult = 'neural' | 'device' | 'miss'

export function stopSpeech() {
  ticket += 1
  dropPlayer()
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}

function dropPlayer() {
  if (!player) return
  player.pause()
  player.src = ''
  player = null
}

async function playUrl(url: string, mine: number): Promise<boolean> {
  if (mine !== ticket) return false
  const audio = new Audio(url)
  audio.preload = 'auto'
  const previous = player
  player = audio
  if (previous && previous !== audio) {
    previous.pause()
    previous.src = ''
  }
  if (mine !== ticket) {
    if (player === audio) dropPlayer()
    return false
  }
  try {
    await audio.play()
    return mine === ticket && player === audio
  } catch (error) {
    if (mine !== ticket || player !== audio) return false
    const name = error instanceof Error ? error.name : ''
    if (name !== 'AbortError') throw error
    try {
      await audio.play()
      return mine === ticket && player === audio
    } catch {
      return false
    }
  }
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

async function loadUrl(key: string, text: string, voiceId: string, speed: Speed, mode: 'tones' | 'vocab', mine: number | null) {
  const known = memory.get(key)
  if (known) return known
  const cached = await readAudio(key).catch(() => undefined)
  if (mine !== null && mine !== ticket) return undefined
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
