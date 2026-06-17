/** 聚合搜索源优先级：酷狗 → 网易 → QQ → 酷我 */
export const AGGREGATE_SOURCES = ['kg', 'wy', 'tx', 'kw']

/** lxserver 搜索返回的单条结果 */
export interface LxserverSearchResult {
  id?: string
  name: string
  singer: string
  source: string          // kg, kw, tx, wy, mg
  songmid?: string | number
  hash?: string           // kg 专用：歌曲 hash，定位播放 URL 必需
  albumName?: string
  albumId?: string
  interval?: string       // "03:45"
  img?: string
  types?: Array<{ type: string; size: string; hash?: string }>
  lrc?: string | null
}

export class LxserverClient {
  constructor(
    private baseUrl: string,
    private token: string,
    private username: string = ''
  ) {}

  /** 搜索音乐，source 可指定平台（kg/kw/tx/wy/mg）或留空走聚合 */
  async search(keyword: string, page = 1, limit = 5, source?: string): Promise<LxserverSearchResult[]> {
    let url = `${this.baseUrl}/api/music/search?name=${encodeURIComponent(keyword)}&page=${page}&limit=${limit}`
    if (source && source !== 'all') {
      url += `&source=${source}`
    }

    const resp = await fetch(url, {
      method: 'GET',
      headers: this.buildHeaders()
    })

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${await resp.text()}`)
    }

    const data = await resp.json()
    return Array.isArray(data) ? data : []
  }

  /**
   * 聚合搜索：并行查询多个音源，按优先级合并去重。
   * 优先级由 AGGREGATE_SOURCES 定义：酷狗 → 网易 → QQ → 酷我
   */
  async searchAggregated(keyword: string, page = 1, perSourceLimit = 5): Promise<LxserverSearchResult[]> {
    const searches = AGGREGATE_SOURCES.map(async (source, priority) => {
      try {
        const results = await this.search(keyword, page, perSourceLimit, source)
        return results.map(r => ({ ...r, _sourcePriority: priority }))
      } catch (e) {
        console.error(`[LxBridge] Search failed for source ${source}:`, String(e))
        return []
      }
    })

    const allResults = await Promise.all(searches)
    const seen = new Set<string>()
    const merged: Array<LxserverSearchResult & { _sourcePriority: number }> = []

    for (const results of allResults) {
      for (const r of results) {
        const key = `${r.name.toLowerCase().trim()}|${r.singer.toLowerCase().trim()}`
        if (!seen.has(key)) {
          seen.add(key)
          merged.push(r)
        }
      }
    }

    merged.sort((a, b) => (a._sourcePriority ?? 99) - (b._sourcePriority ?? 99))
    return merged
  }

  /** 获取播放 URL */
  async getPlayUrl(
    songInfo: { name: string; singer: string; source: string; songmid?: string | number; hash?: string; types?: unknown[] },
    quality: string
  ): Promise<string | null> {
    const resp = await fetch(`${this.baseUrl}/api/music/url`, {
      method: 'POST',
      headers: {
        ...this.buildHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ songInfo, quality })
    })

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${await resp.text()}`)
    }

    const data = await resp.json()
    if (data.code === 500 || data.error) return null
    return data.url || null
  }

  /** 测试连接 */
  async testConnection(): Promise<boolean> {
    try {
      await this.search('test', 1, 1)
      return true
    } catch {
      return false
    }
  }

  private buildHeaders(): Record<string, string> {
    const h: Record<string, string> = {}
    if (this.token) h['x-user-token'] = this.token
    if (this.username) h['x-user-name'] = this.username
    return h
  }
}
