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

export function stopSpeech() {
  ticket += 1
  silence()
}

function silence() {
  if (player) {
    player.pause()
    player.src = ''
    player = null
  }
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}

async function playUrl(url: string, mine: number) {
  if (mine !== ticket) return
  silence()
  if (mine !== ticket) return
  const audio = new Audio(url)
  player = audio
  audio.preload = 'auto'
  try {
    await audio.play()
  } catch (error) {
    if (mine !== ticket) return
    const name = error instanceof Error ? error.name : ''
    if (name === 'AbortError') return
    throw error
  }
}

function deviceSpeak(text: string, speed: Speed, phrase: boolean, mine: number) {
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
    utter.rate = Math.max(0.55, DEVICE_RATE[speed] - (phrase ? 0.14 : 0))
    utter.onend = () => resolve()
    utter.onerror = () => reject(new Error('speech-error'))
    speechSynthesis.cancel()
    speechSynthesis.speak(utter)
  })
}

export async function speak(
  text: string,
  voiceId: string,
  speed: Speed,
  mode: 'tones' | 'vocab' = 'vocab',
): Promise<'neural' | 'device'> {
  const clean = text.trim()
  if (!clean) return 'neural'
  const mine = ++ticket
  const phrase = mode !== 'tones' && isPhrase(clean)
  const key = `${voiceId}|${speed}|${phrase ? 'line' : mode}|${clean}`
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
      body: JSON.stringify({ text: clean, voice: voiceId, speed, mode }),
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
    await deviceSpeak(clean, speed, phrase, mine)
    return 'device'
  }
}

export function pickVoice(preferred: string, mix: boolean): string {
  if (!mix) return voiceById(preferred).id
  const pool = VOICES.map((voice) => voice.id)
  return pool[Math.floor(Math.random() * pool.length)]
}
