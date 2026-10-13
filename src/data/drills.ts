export type ToneWord = {
  id: string
  page: number
  hanzi: string
  pinyin: string
  bare: string[]
  tones: number[]
}

export type PinyinPick = {
  id: string
  page: number
  hanzi: string
  options: string[]
  answer: number
}

export type HanziChoice = {
  id: string
  page: number
  before: string
  after: string
  options: string[]
  answer: number
}

export type PhraseBuild = {
  id: string
  page: number
  pinyin: string
  words: string[]
}

export type LessonDrills = {
  tones: ToneWord[]
  picks: PinyinPick[]
  choices: HanziChoice[]
  builds: PhraseBuild[]
}

function tone(lesson: number, page: number, n: number, hanzi: string, pinyin: string, bare: string[], tones: number[]): ToneWord {
  return { id: `w${lesson}-t${String(n).padStart(2, '0')}`, page, hanzi, pinyin, bare, tones }
}

function pick(lesson: number, page: number, n: number, hanzi: string, options: string[], answer: number): PinyinPick {
  return { id: `w${lesson}-y${String(n).padStart(2, '0')}`, page, hanzi, options, answer }
}

function choice(lesson: number, page: number, n: number, before: string, after: string, options: string[], answer: number): HanziChoice {
  return { id: `w${lesson}-c${String(n).padStart(2, '0')}`, page, before, after, options, answer }
}

function build(lesson: number, page: number, n: number, pinyin: string, words: string[]): PhraseBuild {
  return { id: `w${lesson}-b${String(n).padStart(2, '0')}`, page, pinyin, words }
}

export const lessonDrills: Record<string, LessonDrills> = {
  wb1: {
    tones: [
      tone(1, 2, 1, '什么', 'shénme', ['shen', 'me'], [2, 0]),
      tone(1, 2, 2, '名字', 'míngzi', ['ming', 'zi'], [2, 0]),
      tone(1, 2, 3, '认识', 'rènshi', ['ren', 'shi'], [4, 0]),
      tone(1, 2, 4, '高兴', 'gāoxìng', ['gao', 'xing'], [1, 4]),
      tone(1, 3, 5, '请进', 'qǐng jìn', ['qing', 'jin'], [3, 4]),
      tone(1, 3, 6, '谢谢', 'xièxie', ['xie', 'xie'], [4, 0]),
      tone(1, 3, 7, '最近', 'zuìjìn', ['zui', 'jin'], [4, 4]),
      tone(1, 3, 8, '怎么样', 'zěnmeyàng', ['zen', 'me', 'yang'], [3, 0, 4]),
      tone(1, 3, 9, '很好', 'hěn hǎo', ['hen', 'hao'], [3, 3]),
      tone(1, 3, 10, '不太忙', 'bú tài máng', ['bu', 'tai', 'mang'], [2, 4, 2]),
    ],
    picks: [],
    choices: [
      choice(1, 4, 1, '', '姓宋。', ['找', '我'], 1),
      choice(1, 4, 2, '认', '你很高兴。', ['识', '只'], 0),
      choice(1, 4, 3, '他', '很忙。', ['也', '乜'], 0),
      choice(1, 4, 4, '你最近', '么样？', ['怎', '乍'], 0),
      choice(1, 4, 5, '我不太忙。你', '？', ['呢', '吗'], 0),
    ],
    builds: [
      build(1, 6, 1, 'Nǐ jiào shénme míngzi?', ['你', '叫', '什么', '名字']),
      build(1, 6, 2, 'Rènshi nǐ wǒ yě hěn gāoxìng.', ['认识', '你', '我', '也', '很', '高兴']),
      build(1, 6, 3, 'Lín Nà zuìjìn zěnmeyàng?', ['林娜', '最近', '怎么样']),
      build(1, 6, 4, 'Lìbō bú tài lèi.', ['力波', '不', '太', '累']),
      build(1, 6, 5, 'Tā xìng Sòng, jiào Sòng Huá.', ['他', '姓', '宋', '叫', '宋华']),
    ],
  },
  wb2: {
    tones: [
      tone(2, 10, 1, '早上', 'zǎoshang', ['zao', 'shang'], [3, 0]),
      tone(2, 10, 2, '朋友', 'péngyou', ['peng', 'you'], [2, 0]),
      tone(2, 10, 3, '学习', 'xuéxí', ['xue', 'xi'], [2, 2]),
      tone(2, 10, 4, '再见', 'zàijiàn', ['zai', 'jian'], [4, 4]),
      tone(2, 11, 5, '面条', 'miàntiáo', ['mian', 'tiao'], [4, 2]),
      tone(2, 11, 6, '好吃', 'hǎochī', ['hao', 'chi'], [3, 1]),
      tone(2, 11, 7, '喜欢', 'xǐhuan', ['xi', 'huan'], [3, 0]),
      tone(2, 11, 8, '米饭', 'mǐfàn', ['mi', 'fan'], [3, 4]),
      tone(2, 11, 9, '点心', 'diǎnxīn', ['dian', 'xin'], [3, 1]),
      tone(2, 11, 10, '饺子', 'jiǎozi', ['jiao', 'zi'], [3, 0]),
    ],
    picks: [],
    choices: [
      choice(2, 12, 1, '您好！', '师。', ['老', '考'], 0),
      choice(2, 12, 2, '你是', '国人？', ['哪', '那'], 0),
      choice(2, 12, 3, '我是', '国人。', ['姜', '美'], 1),
      choice(2, 12, 4, '马大为学', '汉语。', ['习', '刁'], 0),
      choice(2, 12, 5, '你', '，那是饺子。', ['看', '有'], 0),
    ],
    builds: [
      build(2, 14, 1, 'Mǎ Dàwéi shì wǒ péngyou.', ['马大为', '是', '我', '朋友']),
      build(2, 14, 2, 'Tā yě xuéxí Hànyǔ.', ['他', '也', '学习', '汉语']),
      build(2, 14, 3, 'Wǒ bàba shì Běijīngrén.', ['我', '爸爸', '是', '北京人']),
      build(2, 14, 4, 'Wǒ xǐhuan chī jiǎozi hé bāozi.', ['我', '喜欢', '吃', '饺子', '和', '包子']),
      build(2, 14, 5, 'Miàntiáo hé diǎnxīn dōu hěn hǎochī.', ['面条', '和', '点心', '都', '很', '好吃']),
    ],
  },
  wb3: {
    tones: [
      tone(3, 20, 1, '照片', 'zhàopiàn', ['zhao', 'pian'], [4, 4]),
      tone(3, 20, 2, '医生', 'yīshēng', ['yi', 'sheng'], [1, 1]),
      tone(3, 20, 3, '哥哥', 'gēge', ['ge', 'ge'], [1, 0]),
      tone(3, 20, 4, '姐姐', 'jiějie', ['jie', 'jie'], [3, 0]),
      tone(3, 20, 5, '小狗', 'xiǎo gǒu', ['xiao', 'gou'], [3, 3]),
      tone(3, 21, 6, '漂亮', 'piàoliang', ['piao', 'liang'], [4, 0]),
      tone(3, 21, 7, '女儿', 'nǚ\'ér', ['nü', 'er'], [3, 2]),
      tone(3, 21, 8, '钢琴', 'gāngqín', ['gang', 'qin'], [1, 2]),
      tone(3, 21, 9, '晚上', 'wǎnshang', ['wan', 'shang'], [3, 0]),
      tone(3, 21, 10, '孩子', 'háizi', ['hai', 'zi'], [2, 0]),
    ],
    picks: [],
    choices: [
      choice(3, 22, 1, '你们家有', '口人？', ['儿', '几'], 1),
      choice(3, 22, 2, '这是我们家的', '片。', ['昭', '照'], 1),
      choice(3, 22, 3, '我爸爸是医', '。', ['生', '主'], 0),
      choice(3, 22, 4, '我们家有', '和咖啡。', ['余', '茶'], 1),
      choice(3, 22, 5, '今', '我们有英语课。', ['天', '大'], 0),
    ],
    builds: [
      build(3, 24, 1, 'Lù Yǔpíng jiā yǒu sān kǒu rén.', ['陆雨平', '家', '有', '三', '口', '人']),
      build(3, 24, 2, 'Nǐ gēge zuò shénme gōngzuò?', ['你', '哥哥', '做', '什么', '工作']),
      build(3, 24, 3, 'Wǒ yígòng yǒu shí zhāng zhàopiàn.', ['我', '一共', '有', '十', '张', '照片']),
      build(3, 24, 4, 'Nǐ nǚ\'ér jīnnián jǐ suì?', ['你', '女儿', '今年', '几', '岁']),
      build(3, 24, 5, 'Tā wǎnshang hái yǒu gāngqín kè.', ['她', '晚上', '还', '有', '钢琴课']),
    ],
  },
  wb4: {
    tones: [
      tone(4, 31, 1, '明天', 'míngtiān', ['ming', 'tian'], [2, 1]),
      tone(4, 31, 2, '特别', 'tèbié', ['te', 'bie'], [4, 2]),
      tone(4, 31, 3, '电影', 'diànyǐng', ['dian', 'ying'], [4, 3]),
      tone(4, 31, 4, '上午', 'shàngwǔ', ['shang', 'wu'], [4, 3]),
      tone(4, 31, 5, '语法', 'yǔfǎ', ['yu', 'fa'], [3, 3]),
      tone(4, 31, 6, '学校', 'xuéxiào', ['xue', 'xiao'], [2, 4]),
      tone(4, 31, 7, '多少', 'duōshao', ['duo', 'shao'], [1, 0]),
      tone(4, 31, 8, '有意思', 'yǒu yìsi', ['you', 'yi', 'si'], [3, 4, 0]),
      tone(4, 31, 9, '学生', 'xuésheng', ['xue', 'sheng'], [2, 0]),
      tone(4, 31, 10, '注意', 'zhùyì', ['zhu', 'yi'], [4, 4]),
    ],
    picks: [],
    choices: [
      choice(4, 32, 1, '明天', '午两点我有汉字课。', ['下', '卞'], 0),
      choice(4, 32, 2, '五点', '我回学校。', ['来', '半'], 1),
      choice(4, 32, 3, '现在', '十分六点。', ['羞', '差'], 1),
      choice(4, 32, 4, '我们班男生多，女生', '。', ['少', '小'], 0),
      choice(4, 32, 5, '我们一起', '习口语吧。', ['练', '炼'], 0),
    ],
    builds: [
      build(4, 34, 1, 'Lín Nà lèi bu lèi?', ['林娜', '累', '不', '累']),
      build(4, 34, 2, 'Wǒ shàngwǔ bā diǎn yǒu kǒuyǔ kè.', ['我', '上午', '八点', '有', '口语课']),
      build(4, 34, 3, 'Wǒmen bān míngtiān zhōngwǔ yǒu huódòng.', ['我们班', '明天', '中午', '有', '活动']),
      build(4, 34, 4, 'Tāmen bān yǒu duōshao ge xuéshēng?', ['他们班', '有', '多少', '个', '学生']),
      build(4, 34, 5, 'Wǎnshang shí diǎn wǒ huí jiā.', ['晚上', '十点', '我', '回家']),
    ],
  },
  wb5: {
    tones: [
      tone(5, 42, 1, '生日', 'shēngrì', ['sheng', 'ri'], [1, 4]),
      tone(5, 42, 2, '唱歌', 'chàng gē', ['chang', 'ge'], [4, 1]),
      tone(5, 42, 3, '参加', 'cānjiā', ['can', 'jia'], [1, 1]),
      tone(5, 42, 4, '聚会', 'jùhuì', ['ju', 'hui'], [4, 4]),
      tone(5, 42, 5, '出生', 'chūshēng', ['chu', 'sheng'], [1, 1]),
      tone(5, 43, 6, '快乐', 'kuàilè', ['kuai', 'le'], [4, 4]),
      tone(5, 43, 7, '亲爱', 'qīn\'ài', ['qin', 'ai'], [1, 4]),
      tone(5, 43, 8, '常常', 'chángcháng', ['chang', 'chang'], [2, 2]),
      tone(5, 43, 9, '昨天', 'zuótiān', ['zuo', 'tian'], [2, 1]),
      tone(5, 43, 10, '咱们', 'zánmen', ['zan', 'men'], [2, 0]),
    ],
    picks: [],
    choices: [
      choice(5, 44, 1, '明天是你的', '日。', ['主', '生'], 1),
      choice(5, 44, 2, '我们一起唱', '。', ['歌', '骨'], 0),
      choice(5, 44, 3, '我送他一', '巧克力。', ['盒', '合'], 0),
      choice(5, 44, 4, '你们好，', '迎！', ['吹', '欢'], 1),
      choice(5, 44, 5, '来，咱们干', '！', ['杯', '怀'], 0),
    ],
    builds: [
      build(5, 46, 1, 'Míngtiān Shíyuè sānshíyī hào.', ['明天', '十月', '三十一', '号']),
      build(5, 46, 2, 'Wǒ sòng tā yí ge shēngrì dàngāo.', ['我', '送', '她', '一个', '生日', '蛋糕']),
      build(5, 46, 3, 'Tā yī jiǔ bā wǔ nián chūshēng.', ['她', '一九八五', '年', '出生']),
      build(5, 46, 4, 'Tā jiù shì wǒ gēge.', ['他', '就', '是', '我', '哥哥']),
      build(5, 46, 5, 'Chén lǎoshī jiāo wǒmen yǔfǎ.', ['陈老师', '教', '我们', '语法']),
    ],
  },
  wb6: {
    tones: [],
    picks: [
      pick(6, 53, 1, '着急', ['zháojí', 'zhejí'], 0),
      pick(6, 53, 2, '地方', ['defāng', 'dìfang'], 1),
      pick(6, 53, 3, '胡同', ['hútóng', 'hútòng'], 1),
      pick(6, 53, 4, '教学', ['jiāoxué', 'jiàoxué'], 1),
    ],
    choices: [
      choice(6, 54, 1, '图书馆在', '公楼旁边。', ['为', '办', '力'], 1),
      choice(6, 54, 2, '', '边的楼是宿舍楼。', ['右', '友', '有'], 0),
      choice(6, 54, 3, '这儿有一', '胡同。', ['条', '支', '本'], 0),
      choice(6, 54, 4, '请问，', '育馆在哪儿？', ['休', '本', '体'], 2),
      choice(6, 54, 5, '你家', '边有商店吗？', ['北', '比', '匕'], 0),
    ],
    builds: [
      build(6, 56, 1, 'Wǒ jiā duìmiàn yǒu yí ge dà chāoshì.', ['我家', '对面', '有', '一个', '大', '超市']),
      build(6, 56, 2, 'Qǐngwèn shítáng zài nǎr?', ['请问', '食堂', '在', '哪儿']),
      build(6, 56, 3, 'Nǐmen xiànzài zài nǎr?', ['你们', '现在', '在', '哪儿']),
      build(6, 56, 4, 'Yínháng jiù zài dàxué de yòubian.', ['银行', '就', '在', '大学的', '右边']),
      build(6, 56, 5, 'Nǐ gěi wǒ jièshào yíxià, hǎo ma?', ['你', '给', '我', '介绍', '一下', '好吗']),
      build(6, 56, 6, 'Mǎlù duìmiàn yǒu méi yǒu shāngdiàn?', ['马路', '对面', '有没有', '商店']),
    ],
  },
  wb7: {
    tones: [],
    picks: [
      pick(7, 63, 1, '便宜', ['biànyi', 'piányi'], 1),
      pick(7, 63, 2, '合适', ['héshì', 'hésì'], 0),
      pick(7, 63, 3, '打折', ['dǎshé', 'dǎzhé'], 1),
      pick(7, 63, 4, '不错', ['búcuò', 'bùcuò'], 0),
      pick(7, 63, 5, '2000', ['èrqiān', 'liǎngqiān'], 1),
    ],
    choices: [
      choice(7, 64, 1, '草莓', '么卖？', ['想', '怎', '急'], 1),
      choice(7, 64, 2, '我', '你十块。', ['给', '恰', '洽'], 0),
      choice(7, 64, 3, '', '便一点儿吧。', ['审', '宜', '宣'], 1),
      choice(7, 64, 4, '这件大号的衣服很', '适。', ['介', '和', '合'], 2),
      choice(7, 64, 5, '这件衬衫不', '。', ['借', '错', '措'], 1),
      choice(7, 64, 6, '您看那', '绿色的可以吗？', ['牛', '件', '价'], 1),
      choice(7, 64, 7, '太', '了！', ['员', '贵', '货'], 1),
    ],
    builds: [
      build(7, 66, 1, 'Kěyǐ piányi yìdiǎnr ma?', ['可以', '便宜', '一点儿', '吗']),
      build(7, 66, 2, 'Lín Nà xiǎng qù lǎo Běijīng de hútòng.', ['林娜', '想', '去', '老北京', '的', '胡同']),
      build(7, 66, 3, 'Nín kěyǐ gěi wǒ jièshào yíxià ma?', ['您', '可以', '给', '我', '介绍', '一下', '吗']),
      build(7, 66, 4, 'Zhè jiàn chènshān tài xiǎo, yǒu dàhào de ma?', ['这件', '衬衫', '太', '小', '有', '大号', '的', '吗']),
      build(7, 66, 5, 'Nǎlǐ, wǒ de Hànyǔ bú tài hǎo.', ['哪里', '我的', '汉语', '不', '太', '好']),
    ],
  },
  wb8: {
    tones: [],
    picks: [
      pick(8, 73, 1, '休息', ['xiūxi', 'xiāoxī', 'xiūxī'], 0),
      pick(8, 73, 2, '睡觉', ['suìjiào', 'shuìjiào', 'shuìjué'], 1),
      pick(8, 73, 3, '起床', ['qíchuáng', 'qǐchuáng', 'qǐchuǎng'], 1),
      pick(8, 73, 4, '中药', ['zhōngyào', 'zōngyào', 'zhōnghào'], 0),
      pick(8, 73, 5, '大夫', ['dàifū', 'dàifu', 'tàifu'], 1),
      pick(8, 73, 6, '挂号', ['kuàhào', 'guàhào', 'guàháo'], 1),
    ],
    choices: [
      choice(8, 74, 1, '我', '身都不舒服。', ['合', '全', '会'], 1),
      choice(8, 74, 2, '今天天气很冷，你要', '穿点儿衣服。', ['少', '不', '多'], 2),
      choice(8, 74, 3, '我嗓子有点儿', '。', ['疼', '病', '症'], 0),
      choice(8, 74, 4, '先', '一下体温吧。', ['量', '凉', '艮'], 0),
      choice(8, 74, 5, '我', '天都去锻炼身体。', ['没', '每', '妹'], 1),
      choice(8, 74, 6, '我', '你一起去医院吧。', ['跟', '根', '很'], 0),
    ],
    builds: [
      build(8, 76, 1, 'Jīntiān nǐ wèi shénme jiǔ diǎn hái bu qǐchuáng?', ['今天', '你', '为什么', '九点', '还', '不', '起床']),
      build(8, 76, 2, 'Wǒ qù gěi nǐ guàhào.', ['我', '去', '给', '你', '挂号']),
      build(8, 76, 3, 'Dàifu shuō kěyǐ xiān chī yìdiǎnr zhōngyào.', ['大夫', '说', '可以', '先', '吃', '一点儿', '中药']),
      build(8, 76, 4, 'Xiān liáng yíxià tǐwēn ba.', ['先', '量', '一下', '体温', '吧']),
      build(8, 76, 5, 'Nǐ de sǎngzi yǒudiǎnr fāyán.', ['你的', '嗓子', '有点儿', '发炎']),
    ],
  },
  wb9: {
    tones: [
      tone(9, 82, 1, '热', 'rè', ['re'], [4]),
      tone(9, 82, 2, '凉快', 'liángkuai', ['liang', 'kuai'], [2, 0]),
      tone(9, 82, 3, '暖和', 'nuǎnhuo', ['nuan', 'huo'], [3, 0]),
      tone(9, 82, 4, '刮风', 'guā fēng', ['gua', 'feng'], [1, 1]),
    ],
    picks: [],
    choices: [
      choice(9, 84, 1, '现在路', '堵车。', ['下', '上', '里'], 1),
      choice(9, 84, 2, '咱们能', '车去吗？', ['干', '并', '开'], 2),
      choice(9, 84, 3, '我们', '点到？', ['儿', '几', '凡'], 1),
      choice(9, 84, 4, '今天天气', '好啊！', ['真', '太', '没'], 0),
      choice(9, 84, 5, '今年冬天你', '国吗？', ['来', '回', '去'], 1),
      choice(9, 84, 6, '咱们', '地铁吧。', ['走', '坐', '去'], 1),
    ],
    builds: [
      build(9, 86, 1, 'Zánmen kāi chē qù bówùguǎn ba.', ['咱们', '开车', '去', '博物馆', '吧']),
      build(9, 86, 2, 'Zánmen kěyǐ xiān chī diǎnr diǎnxīn.', ['咱们', '可以', '先', '吃', '点儿', '点心']),
      build(9, 86, 3, 'Xiànzài shì qiūtiān le, tiānqì liángkuai le.', ['现在', '是', '秋天', '了', '天气', '凉快', '了']),
      build(9, 86, 4, 'Chūntiān hěn nuǎnhuo, kěshì chángcháng guā fēng.', ['春天', '很', '暖和', '可是', '常常', '刮风']),
    ],
  },
  wb10: {
    tones: [
      tone(10, 95, 1, '好久不见', 'hǎo jiǔ bú jiàn', ['hao', 'jiu', 'bu', 'jian'], [3, 3, 2, 4]),
      tone(10, 95, 2, '报告', 'bàogào', ['bao', 'gao'], [4, 4]),
      tone(10, 95, 3, '旅行', 'lǚxíng', ['lü', 'xing'], [3, 2]),
      tone(10, 95, 4, '年轻', 'niánqīng', ['nian', 'qing'], [2, 1]),
      tone(10, 95, 5, '决定', 'juédìng', ['jue', 'ding'], [2, 4]),
    ],
    picks: [],
    choices: [
      choice(10, 97, 1, '妈妈', '我打电话了。', ['拾', '给', '合'], 1),
      choice(10, 97, 2, '你', '他一个小汽车吧。', ['送', '关', '寄'], 0),
      choice(10, 97, 3, '他', '我给妈妈打电话。', ['讨', '让', '记'], 1),
      choice(10, 97, 4, '我想', '王府井。', ['来', '去', '走'], 1),
      choice(10, 97, 5, '我现在会', '汉语词典了。', ['几', '月', '用'], 2),
      choice(10, 97, 6, '外婆的身', '很好。', ['体', '本', '休'], 0),
    ],
    builds: [
      build(10, 99, 1, 'Nǐ yào duō bāng wàipó zuò diǎnr shìr.', ['你', '要', '多', '帮', '外婆', '做', '点儿', '事儿']),
      build(10, 100, 2, 'Nǐmen lái Běijīng, shì wǒmen zuì xiǎng yào de lǐwù.', ['你们', '来', '北京', '是', '我们', '最', '想要', '的', '礼物']),
      build(10, 100, 3, 'Nín hé māma zuìjìn zěnmeyàng?', ['您', '和', '妈妈', '最近', '怎么样']),
      build(10, 100, 4, 'Dìdi gēn wǒ wàipó yìqǐ zhù.', ['弟弟', '跟', '我', '外婆', '一起', '住']),
      build(10, 100, 5, 'Tā ràng wǒ gěi māma dǎ diànhuà.', ['他', '让', '我', '给', '妈妈', '打', '电话']),
      build(10, 100, 6, 'Wǒ xiànzài huì yòng Hànyǔ cídiǎn le.', ['我', '现在', '会', '用', '汉语', '词典', '了']),
    ],
  },
}

export function drillIds(pack: LessonDrills) {
  return [...pack.tones, ...pack.picks, ...pack.choices, ...pack.builds].map((item) => item.id)
}
