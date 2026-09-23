export type Voice = {
  id: string
  name: string
  han: string
  who: string
  note: string
}

export const VOICES: Voice[] = [
  { id: 'zh-CN-XiaoxiaoNeural', name: 'Сяосяо', han: '晓晓', who: 'она', note: 'мягко' },
  { id: 'zh-CN-XiaoyiNeural', name: 'Сяои', han: '晓伊', who: 'она', note: 'живо' },
  { id: 'zh-CN-YunxiNeural', name: 'Юньси', han: '云希', who: 'он', note: 'молодой' },
  { id: 'zh-CN-YunjianNeural', name: 'Юньцзянь', han: '云健', who: 'он', note: 'низкий' },
  { id: 'zh-CN-YunyangNeural', name: 'Юньян', han: '云扬', who: 'он', note: 'диктор' },
  { id: 'zh-CN-YunxiaNeural', name: 'Юнься', han: '云夏', who: 'он', note: 'легко' },
]

export const DEFAULT_VOICE = VOICES[0].id

export function voiceById(id: string): Voice {
  return VOICES.find((voice) => voice.id === id) ?? VOICES[0]
}
