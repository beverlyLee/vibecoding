/* engine/config.ts · 配置层：色板/字体/版式/调优/情绪规则/AI prompt（D7 全配置化） */

export interface Tuning {
  brightness: number; saturate: number; contrast: number; overlay: number; vignette: number;
}
export interface Palette {
  id: string; name: string; base: string; accent: string; text: string; subtext: string; tuning: Tuning;
}
export interface FontDef { id: string; name: string; family: string; src: string | null }
export interface LayoutDef { id: string; name: string; photoRatio: number; textAlign: 'center' | 'left' }
export interface MoodRule { palette: string; font: string; words: string[] }
export type TagWeight = [string, number];
export interface PhotoMoodRule { palette: string; tags?: TagWeight[]; words?: string[] }
export interface AiParams {
  palette: string | null; font: string | null; layout: string | null; tuning: Partial<Tuning> | null;
}
export type { AiSettings } from './providers'; // AI 配置结构统一收口在 providers.ts
/* analyze() 产物：主色 + 亮度/对比度（PRD F3 自动色板依据） */
export interface PhotoAnalysis { dominant: number[]; brightness: number; contrast: number }

export interface AppConfig {
  output: { width: number; height: number; format: string; quality: number; pngFallback: string };
  /* 常用图片比例：宽度固定 output.width，高度按比例换算 */
  ratios: Array<{ id: string; name: string; height: number }>;
  maxEdge: number;
  input: { accept: string[]; maxFileSize: number; maxCards: number };
  palettes: Palette[];
  fonts: FontDef[];
  layouts: LayoutDef[];
  moodRules: MoodRule[];
  photoMoodRules: PhotoMoodRule[];
  ai: {
    imagePrompt: string; imagePromptSolo: string;
    copySystem: string; copyUser: string; copyDefault: string;
  };
}

export const config: AppConfig = {
  output: { width: 1080, height: 1620, format: 'image/jpeg', quality: 0.92, pngFallback: 'image/png' },
  ratios: [
    { id: '2:3', name: '2:3 竖版', height: 1620 },
    { id: '3:4', name: '3:4', height: 1440 },
    { id: '4:5', name: '4:5', height: 1350 },
    { id: '1:1', name: '1:1 方形', height: 1080 },
    { id: '9:16', name: '9:16 长图', height: 1920 },
  ],
  maxEdge: 2000,
  input: { accept: ['image/jpeg', 'image/png', 'image/webp'], maxFileSize: 10 * 1024 * 1024, maxCards: 9 },
  palettes: [
    {
      id: 'cream', name: '奶油暖阳', base: '#FBF3E4', accent: '#F4B183', text: '#5C4632', subtext: '#7A6552',
      tuning: { brightness: 1.06, saturate: 0.9, contrast: 0.97, overlay: 0.12, vignette: 0.18 },
    },
    {
      id: 'sakura', name: '晚樱粉', base: '#FBEFF1', accent: '#F2C6D0', text: '#5A3A40', subtext: '#8A6470',
      tuning: { brightness: 1.04, saturate: 0.85, contrast: 0.98, overlay: 0.14, vignette: 0.16 },
    },
    {
      id: 'mistblue', name: '雾霭蓝', base: '#EAF1F5', accent: '#A9C7D9', text: '#33484F', subtext: '#5C727E',
      tuning: { brightness: 1.03, saturate: 0.82, contrast: 1.0, overlay: 0.1, vignette: 0.2 },
    },
  ],
  fonts: [
    { id: 'auto', name: '默认', family: '', src: null },
    {
      id: 'noto', name: '思源黑体',
      family: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Heiti SC", sans-serif',
      src: 'fonts/NotoSansSC.woff2',
    },
    {
      id: 'wenkai', name: '霞鹜文楷',
      family: '"LXGW WenKai", "Songti SC", "STSong", "SimSun", "Noto Sans SC", serif',
      src: 'fonts/LXGWWenKai.woff2', // 未内置，加载失败自动回退系统衬线
    },
    {
      id: 'kuai', name: '站酷快乐体',
      family: '"ZCOOL KuaiLe", "Yuanti SC", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
      src: 'fonts/ZCOOLKuaiLe.woff2',
    },
    /* 系统字体族：macOS / Windows 双端回退，无需下载 */
    { id: 'songti', name: '宋体', family: '"Songti SC", "STSong", "SimSun", serif', src: null },
    { id: 'kaiti', name: '楷体', family: '"Kaiti SC", "STKaiti", "KaiTi", "DFKai-SB", serif', src: null },
    { id: 'fangsong', name: '仿宋', family: '"Fangsong SC", "STFangsong", "FangSong", serif', src: null },
    { id: 'heiti', name: '黑体', family: '"Hiragino Sans GB", "Heiti SC", "SimHei", "Microsoft YaHei", sans-serif', src: null },
    { id: 'yuanti', name: '圆体', family: '"Yuanti SC", "STYuan", "YouYuan", "Hiragino Maru Gothic ProN", sans-serif', src: null },
    { id: 'xingkai', name: '行楷', family: '"Xingkai SC", "STXingkai", "KaiTi", cursive', src: null },
  ],
  layouts: [
    { id: 'center', name: '居中留白', photoRatio: 0.62, textAlign: 'center' },
    { id: 'leftright', name: '左文右图', photoRatio: 0.62, textAlign: 'left' },
    { id: 'topbottom', name: '上下分栏', photoRatio: 0.66, textAlign: 'center' },
    { id: 'circle', name: '圆形裁切', photoRatio: 0.58, textAlign: 'center' },
    { id: 'overlay', name: '图文叠加', photoRatio: 1, textAlign: 'center' },
  ],
  moodRules: [
    { palette: 'sakura', font: 'wenkai', words: ['喜欢', '想你', '温柔', '抱抱', '爱', '晚安', '心', '软'] },
    { palette: 'cream', font: 'kuai', words: ['阳光', '开心', '周末', '旅行', '快乐', '笑', '元气', '美好'] },
    { palette: 'mistblue', font: 'noto', words: ['安静', '独处', '夜', '沉思', '风', '孤独', '慢', '时间'] },
  ],
  /* rosy 权重(3) > bright+warm 之和(2)，保证亮粉照片稳定命中晚樱粉（F3 核心差异点） */
  photoMoodRules: [
    { palette: 'cream', tags: [['warm', 1], ['bright', 1]] },
    { palette: 'sakura', tags: [['rosy', 3]] },
    { palette: 'mistblue', tags: [['cool', 1], ['dark', 1]] },
  ],
  ai: {
    imagePrompt:
      '先仔细观察输入图片，提取画面主角（人物/动物/主要物体）的识别特征：身份类型、性别与年龄感、发型发色、服装款式与颜色、五官气质、标志性配饰。\n' +
      '然后生成一张竖版插画照片（2:3）：\n' +
      '1. 主角一致性：新画面必须是同一主角，上述识别特征严格保持不变（尤其是发型发色、服装、五官气质），仅允许姿态与镜头角度自然微调；\n' +
      '2. 场景重绘：背景、光线、季节与氛围根据下方文案重新设定，把主角放进文案描绘的场景里，让画面内容与文案的意象和情绪相呼应，做到图文一体；\n' +
      '3. 风格要求：低饱和奶油色系、柔和漫射光、轻微胶片颗粒感、大面积留白与呼吸感，氛围宁静温暖，适合作为文字卡片背景；\n' +
      '4. 画面中不要出现任何文字、水印或边框。\n' +
      '画面需呼应的情绪与意象：\n「{text}」',
    imagePromptSolo:
      '生成一张治愈系竖版插画照片（2:3）。\n' +
      '风格要求：低饱和奶油色系、柔和漫射光、轻微胶片颗粒感、大面积留白与呼吸感；\n' +
      '氛围宁静温暖，适合作为文字卡片背景；\n' +
      '画面中不要出现任何文字、水印或边框。\n' +
      '画面需呼应的情绪与意象：\n「{text}」',
    copySystem:
      '你是一位治愈系文案作者，为照片卡片写治愈文字。内化以下风格基因后创作：\n' +
      '1. 意象承载情绪：用具体自然意象说话（晚风、落日、月亮、山海、花木、微光、旧茶……），不抽象说理；也可以以第一第二第三人称指代\n' +
      '2. 允许与接纳：语气是温柔的允许，不是要求（如「允许一切发生」「做茉莉，做雏菊，做千千万万」）；\n' +
      '3. 先抑后扬的翻转：先接住低谷，再轻轻翻面（如「难过归难过，生活归生活」「余味苦涩，一切终有回甘」），不说教、不喊口号、不灌鸡血；\n' +
      '4. 善用对仗与排比造节奏（如「有人爱，有事做，有所期待」「春有百花秋有月」）；\n' +
      '5. 每段以一句可独立摘抄的金句收尾（如「有则锦上添花，无则依旧风华」）；\n' +
      '6. 分自然小段（数量不超过图片数量，用换行分隔），每段 2-3 行，总长 60-130 字；\n' +
      '7. 可化用名家笔触（林清玄、汪曾祺、村上春树式的通透与淡然），但禁止伪造或直接引用带署名的名人名言；\n' +
      '8. 只输出文案正文：不要 markdown、不要 emoji、不要引号、不要小标题、不要任何解释。',
    copyUser:
      '卡片主题与情绪线索：\n{seed}\n\n' +
      '请据此写一段治愈系文案：若线索中出现具体事物，把它们自然地织进画面；围绕一个核心意象展开，先接住情绪，再给出温柔的翻转，最后落在一句金句上。',
    copyDefault:
      '卡片主题：温柔日常与自我关怀。可从「晚风、落日、热茶、旧书、窗台的光」等意象中选一二。\n' +
      '请写一段先接纳、后回甘的治愈系文案。',
  },
};

/* 按比例 id 取输出高度（未知 id 回退 output.height 默认 2:3） */
export function heightFor(ratioId: string | undefined): number {
  const r = config.ratios.find(x => x.id === ratioId);
  return r ? r.height : config.output.height;
}
