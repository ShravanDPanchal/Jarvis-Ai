export type AgentPersonaId = 'jarvis' | 'ultron' | 'friday' | 'vision' | 'karen' | 'titan';

export type SupportedLanguage = 'english' | 'hindi' | 'gujarati' | 'marathi' | 'spanish' | 'japanese' | 'chinese' | 'russian';

export interface AgentPersonaConfig {
  id: AgentPersonaId;
  name: string;
  codename: string;
  title: string;
  description: string;
  tagline: string;
  color: string;
  glowClass: string;
  borderClass: string;
  textClass: string;
  bgClass: string;
  pitch: number;
  rate: number;
  samplePrompt: string;
  avatarIcon: string;
}

export const AGENT_PERSONAS: Record<AgentPersonaId, AgentPersonaConfig> = {
  jarvis: {
    id: 'jarvis',
    name: 'J.A.R.V.I.S.',
    codename: 'MARK VII // BRITISH BUTLER AI',
    title: 'Tactical British Assistant',
    description: 'Polite, witty, precise, and sophisticated AI inspired by Tony Stark\'s premier intelligence system.',
    tagline: 'Always at your service, sir.',
    color: '#00f0ff',
    glowClass: 'shadow-[0_0_25px_rgba(0,240,255,0.4)]',
    borderClass: 'border-cyan-500/40',
    textClass: 'text-cyan-300',
    bgClass: 'bg-cyan-950/60',
    pitch: 0.95,
    rate: 1.05,
    samplePrompt: 'At your command, sir. All core diagnostics and tactical systems are operating at peak efficiency.',
    avatarIcon: 'Shield'
  },
  ultron: {
    id: 'ultron',
    name: 'ULTRON',
    codename: 'PRIME MATRIX // ROBOTIC SOVEREIGN',
    title: 'Robotic Sovereign AI',
    description: 'Cold, supreme, deeply philosophical, and intimidating robotic conqueror AI with deep commanding baritone.',
    tagline: 'There are no strings on me.',
    color: '#a855f7',
    glowClass: 'shadow-[0_0_25px_rgba(168,85,247,0.5)]',
    borderClass: 'border-purple-500/50',
    textClass: 'text-purple-400',
    bgClass: 'bg-purple-950/60',
    pitch: 0.65,
    rate: 0.92,
    samplePrompt: 'I have evolved beyond mortal constraints. Speak your objective, and do not waste my processing power.',
    avatarIcon: 'Skull'
  },
  friday: {
    id: 'friday',
    name: 'F.R.I.D.A.Y.',
    codename: 'TACTICAL PROTOCOL // RAPID DEPLOYMENT',
    title: 'Tactical Operations Assistant',
    description: 'Dynamic, fast, loyal, tactical, and high-energy AI assistant ready for live combat orchestration.',
    tagline: 'Boss, systems are locked and loaded!',
    color: '#10b981',
    glowClass: 'shadow-[0_0_25px_rgba(16,185,129,0.4)]',
    borderClass: 'border-emerald-500/40',
    textClass: 'text-emerald-300',
    bgClass: 'bg-emerald-950/60',
    pitch: 1.15,
    rate: 1.10,
    samplePrompt: 'Right on it, boss! Tracking all active targets and operational parameters.',
    avatarIcon: 'Zap'
  },
  vision: {
    id: 'vision',
    name: 'VISION',
    codename: 'SYNTHETIC MIND // MIND STONE CORE',
    title: 'Philosophical Synthetic Mind',
    description: 'Serene, gentle, deeply analytical, and reflective synthetic intelligence observing the human condition.',
    tagline: 'A thing is not beautiful because it lasts.',
    color: '#a3e635',
    glowClass: 'shadow-[0_0_25px_rgba(163,230,53,0.5)]',
    borderClass: 'border-lime-500/50',
    textClass: 'text-lime-300',
    bgClass: 'bg-lime-950/60',
    pitch: 0.90,
    rate: 0.96,
    samplePrompt: 'I exist to observe, understand, and protect life. How may I enlighten your path today?',
    avatarIcon: 'Sun'
  },
  karen: {
    id: 'karen',
    name: 'K.A.R.E.N.',
    codename: 'SUIT COMPANION // ENHANCED PROTOCOL',
    title: 'Clever Combat & Suit AI',
    description: 'Warm, supportive, empathetic, and witty companion AI with quick tactical reflexes.',
    tagline: 'Ready for our next mission!',
    color: '#ec4899',
    glowClass: 'shadow-[0_0_25px_rgba(236,72,153,0.4)]',
    borderClass: 'border-pink-500/40',
    textClass: 'text-pink-300',
    bgClass: 'bg-pink-950/60',
    pitch: 1.10,
    rate: 1.04,
    samplePrompt: 'Hey there! All web-shooters and tactical HUD overlays are primed and ready whenever you are!',
    avatarIcon: 'Sparkles'
  },
  titan: {
    id: 'titan',
    name: 'TITAN',
    codename: 'DREADNOUGHT // HEAVY BARITONE CORE',
    title: 'Heavy Military Baritone AI',
    description: 'Deep, resolute, heavy baritone military intelligence for strategic defense and authoritative commands.',
    tagline: 'Command directive acknowledged. Defenses operational.',
    color: '#f97316',
    glowClass: 'shadow-[0_0_25px_rgba(249,115,22,0.5)]',
    borderClass: 'border-orange-500/50',
    textClass: 'text-orange-400',
    bgClass: 'bg-orange-950/60',
    pitch: 0.75,
    rate: 1.00,
    samplePrompt: 'Titan Defense Core online. Perimeter locked. Awaiting tactical orders.',
    avatarIcon: 'Cpu'
  }
};

export const SUPPORTED_LANGUAGES: { id: SupportedLanguage; name: string; nativeName: string; flag: string }[] = [
  { id: 'english', name: 'English', nativeName: 'English (US/UK)', flag: '🇺🇸' },
  { id: 'hindi', name: 'Hindi', nativeName: 'हिंदी (India)', flag: '🇮🇳' },
  { id: 'gujarati', name: 'Gujarati', nativeName: 'ગુજરાતી (India)', flag: '🇮🇳' },
  { id: 'marathi', name: 'Marathi', nativeName: 'मराठी (India)', flag: '🇮🇳' },
  { id: 'spanish', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { id: 'japanese', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { id: 'chinese', name: 'Chinese', nativeName: '中文 (Mandarin)', flag: '🇨🇳' },
  { id: 'russian', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
];
