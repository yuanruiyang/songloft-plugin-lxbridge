export interface LxBridgeConfig {
  lxserverUrl: string
  lxserverToken: string
  lxserverUsername: string
  defaultQuality: string
  defaultPlatform: string   // 'all' | 'kg' | 'kw' | 'tx' | 'wy' | 'mg'
}

const CONFIG_KEY = 'lxbridge_config'

const DEFAULT_CONFIG: LxBridgeConfig = {
  lxserverUrl: 'http://localhost:9527',
  lxserverToken: '',
  lxserverUsername: '',
  defaultQuality: '320k',
  defaultPlatform: 'all'
}

export async function getConfig(): Promise<LxBridgeConfig> {
  try {
    const val = await songloft.storage.get(CONFIG_KEY)
    if (val) {
      const stored = typeof val === 'string' ? JSON.parse(val) : val
      return { ...DEFAULT_CONFIG, ...(stored as Partial<LxBridgeConfig>) }
    }
  } catch (err) {
    console.error('[LxBridge] Failed to load config:', String(err))
  }
  return { ...DEFAULT_CONFIG }
}

export async function saveConfig(config: LxBridgeConfig): Promise<void> {
  await songloft.storage.set(CONFIG_KEY, JSON.stringify(config))
}
