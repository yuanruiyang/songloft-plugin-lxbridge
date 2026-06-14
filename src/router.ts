import { createRouter, jsonResponse, createSearchHandler, createMusicUrlHandler } from '@songloft/plugin-sdk'
import type { HTTPRequest } from '@songloft/plugin-sdk'
import { getConfig, saveConfig } from './config'
import type { LxBridgeConfig } from './config'
import { LxserverClient } from './lxserver'
import { toSearchResultItem, buildSourceData, toMiotResponse, miotError } from './transformer'

const router = createRouter()

/** 安全解析请求体 */
function parseBody(req: HTTPRequest): Record<string, unknown> {
  if (!req.body) return {}
  try {
    const str = typeof req.body === 'string'
      ? req.body
      : String.fromCharCode.apply(null, Array.from(req.body as Uint8Array))
    return JSON.parse(str)
  } catch {
    return {}
  }
}

/** 从当前配置创建 LxserverClient */
async function createClient(): Promise<LxserverClient> {
  const config = await getConfig()
  return new LxserverClient(config.lxserverUrl, config.lxserverToken, config.lxserverUsername)
}

// ===== 标准音源端点（Songloft 主程序调用） =====

// POST /api/search — 搜索 lxserver，返回标准 SearchResultItem[]
router.post('/api/search', createSearchHandler({
  search: async (keyword, page, pageSize) => {
    const client = await createClient()
    const config = await getConfig()
    const results = await client.search(keyword, page || 1, pageSize || 5, config.defaultPlatform)
    return results.map(toSearchResultItem)
  }
}))

// POST /api/music/url — 用 source_data 解析真实播放 URL
router.post('/api/music/url', createMusicUrlHandler({
  resolveUrl: async (sourceData) => {
    const client = await createClient()
    const config = await getConfig()
    const url = await client.getPlayUrl(
      {
        name: sourceData.name as string,
        singer: sourceData.singer as string,
        source: sourceData.source as string,
        songmid: sourceData.songmid as string,
        types: (sourceData.types as unknown[]) || []
      },
      config.defaultQuality
    )
    if (!url) throw new Error('Failed to resolve play URL')
    return url
  },
  // resolveUrl 失败时，用宿主提供的 title/artist 重新搜索 lxserver
  fallbackSearch: async (hint) => {
    if (!hint.enabled) return null
    const client = await createClient()
    const results = await client.search(`${hint.title} ${hint.artist}`, 1, 3)
    if (results.length === 0) return null
    const best = results[0]
    return {
      source_data: buildSourceData(best),
      title: best.name,
      artist: best.singer
    }
  }
}))

// ===== MIoT 外部搜索兼容端点 =====
// MIoT 插件要求一次返回就包含播放 URL，超时 6 秒
// POST body: { keyword, hint?: {title, artist, duration}, quality? }

router.post('/api/miot/search', async (req: HTTPRequest) => {
  const body = parseBody(req)
  const keyword = (body.keyword as string || '').trim()
  if (!keyword) {
    return jsonResponse(miotError(400, 'keyword is required'))
  }

  const config = await getConfig()
  const quality = config.defaultQuality

  try {
    const client = new LxserverClient(config.lxserverUrl, config.lxserverToken, config.lxserverUsername)

    // 搜索 lxserver（limit 5，取第一条）
    const results = await client.search(keyword, 1, 5, config.defaultPlatform)
    if (results.length === 0) {
      return jsonResponse(miotError(404, 'No results found'))
    }

    // 遍历结果，尝试获取播放 URL，取第一个成功的
    for (const result of results) {
      const playUrl = await client.getPlayUrl(
        {
          name: result.name,
          singer: result.singer,
          source: result.source,
          songmid: result.songmid,
          types: result.types
        },
        quality
      )

      if (playUrl) {
        console.log(`[LxBridge] MIoT search: "${keyword}" → ${result.name} - ${result.singer} (${result.source})`)
        return jsonResponse(toMiotResponse(result, playUrl, quality))
      }
    }

    return jsonResponse(miotError(500, 'Failed to get play URL for any result'))
  } catch (e) {
    console.error('[LxBridge] MIoT search error:', String(e))
    return jsonResponse(miotError(500, `Search failed: ${String(e)}`))
  }
})

// ===== 管理端点（前端配置页使用） =====

// GET /api/config — 读取当前配置（脱敏 token）
router.get('/api/config', async () => {
  const config = await getConfig()
  return jsonResponse({
    ...config,
    lxserverToken: config.lxserverToken ? '***' : ''
  })
})

// POST /api/config — 更新配置
router.post('/api/config', async (req: HTTPRequest) => {
  const data = parseBody(req)
  const current = await getConfig()

  const updated: LxBridgeConfig = {
    lxserverUrl: (data.lxserverUrl as string) || current.lxserverUrl,
    lxserverToken: (data.lxserverToken as string) || current.lxserverToken,
    lxserverUsername: (data.lxserverUsername as string) || current.lxserverUsername,
    defaultQuality: (data.defaultQuality as string) || current.defaultQuality,
    defaultPlatform: (data.defaultPlatform as string) || current.defaultPlatform
  }

  await saveConfig(updated)
  console.log('[LxBridge] Config updated')
  return jsonResponse({ success: true })
})

// GET /api/health — lxserver 连接测试
router.get('/api/health', async () => {
  try {
    const client = await createClient()
    const ok = await client.testConnection()
    return jsonResponse({ connected: ok })
  } catch (e) {
    return jsonResponse({ connected: false, error: String(e) })
  }
})

export default router
