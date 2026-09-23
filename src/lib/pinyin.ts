const TONE_MARKS: Record<string, number> = {
  ā: 1, ē: 1, ī: 1, ō: 1, ū: 1, ǖ: 1,
  á: 2, é: 2, í: 2, ó: 2, ú: 2, ǘ: 2,
  ǎ: 3, ě: 3, ǐ: 3, ǒ: 3, ǔ: 3, ǚ: 3,
  à: 4, è: 4, ì: 4, ò: 4, ù: 4, ǜ: 4,
}

const MARKS = ['', 'āēīōūǖ', 'áéíóúǘ', 'ǎěǐǒǔǚ', 'àèìòùǜ']
const BASE = 'aeiouü'

export function toneOf(syllable: string): number {
  for (const ch of syllable) {
    const tone = TONE_MARKS[ch]
    if (tone) return tone
  }
  return 5
}

function bareVowel(ch: string): string {
  const groups = ['aāáǎà', 'eēéěè', 'iīíǐì', 'oōóǒò', 'uūúǔù', 'üǖǘǚǜ']
  for (const g of groups) if (g.includes(ch)) return g[0]
  return ch
}

function placeTone(vowel: string, tone: number): string {
  if (tone < 1 || tone > 4) return vowel
  const i = BASE.indexOf(vowel)
  if (i < 0) return vowel
  return MARKS[tone][i]
}

/** Слог без тона (ni, nü, lv) и цифра 1–5 → слог со знаком. */
export function applyTone(raw: string, tone: number): string {
  let s = raw.replace(/u:/g, 'ü').replace(/v/g, 'ü')
  if (tone < 1 || tone > 4) return s
  const chars = [...s]
  const vowels = chars
    .map((ch, i) => ({ ch: bareVowel(ch), i }))
    .filter((v) => BASE.includes(v.ch))
  if (!vowels.length) return s
  let idx = vowels[vowels.length - 1].i
  const letters = vowels.map((v) => v.ch).join('')
  if (letters.includes('a')) idx = vowels.find((v) => v.ch === 'a')!.i
  else if (letters.includes('e')) idx = vowels.find((v) => v.ch === 'e')!.i
  else if (letters.includes('ou')) idx = vowels.find((v) => v.ch === 'o')!.i
  else if (letters === 'iu') idx = vowels.find((v) => v.ch === 'u')!.i
  else if (letters === 'ui') idx = vowels.find((v) => v.ch === 'i')!.i
  chars[idx] = placeTone(bareVowel(chars[idx]), tone)
  return chars.join('')
}

export function normalizePinyin(input: string): string {
  const cleaned = input
    .trim()
    .replace(/[’']/g, ' ')
    .replace(/([a-zA-Züv:]+)([1-5])/g, '$1$2 ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  return cleaned
    .split(' ')
    .map((token) => {
      const m = token.match(/^([a-zA-Zü:v]+)([1-5])$/)
      if (!m) return token
      return applyTone(m[1].toLowerCase(), Number(m[2]))
    })
    .join(' ')
}

export function syllables(pinyin: string): string[] {
  return pinyin.split(/\s+/).filter(Boolean)
}
