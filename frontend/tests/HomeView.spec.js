import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import HomeView from '../src/views/HomeView.vue'
import api from '../src/api'

// 数据镜像 seed：北岸(甲) 与 南坞(乙) 都有卷码 R-01，树脂不同（28.5 vs 22），
// 且南坞那条浸渍更近 —— 专门复现"面板近次闪成甲间那卷的树脂"。
vi.mock('../src/api', () => {
  const lofts = [
    { id: 1, name: '北岸帆布间', location: '港区二号库', notes: '', rollCount: 2 },
    { id: 2, name: '南坞帆布间', location: '对岸料棚', notes: '', rollCount: 2 },
  ]
  const rolls = [
    { id: 11, loftId: 1, loftName: '北岸帆布间', rollCode: 'R-01', status: 'dipping', fabricWeightGsm: 420, notes: '' },
    { id: 12, loftId: 1, loftName: '北岸帆布间', rollCode: 'R-02', status: 'raw', fabricWeightGsm: 380, notes: '' },
    { id: 21, loftId: 2, loftName: '南坞帆布间', rollCode: 'R-01', status: 'raw', fabricWeightGsm: 390, notes: '' },
    { id: 22, loftId: 2, loftName: '南坞帆布间', rollCode: 'R-04', status: 'dipping', fabricWeightGsm: 410, notes: '' },
  ]
  const dips = [
    { id: 101, rollId: 11, rollCode: 'R-01', loftName: '北岸帆布间', startedAt: '2026-10-04T00:00:00Z', resinPct: '28.50', cureHours: null, notes: '北岸 R-01' },
    { id: 102, rollId: 21, rollCode: 'R-01', loftName: '南坞帆布间', startedAt: '2026-10-04T05:00:00Z', resinPct: '22.00', cureHours: '8.00', notes: '南坞同码 R-01' },
    { id: 103, rollId: 22, rollCode: 'R-04', loftName: '南坞帆布间', startedAt: '2026-10-04T04:00:00Z', resinPct: '27.00', cureHours: null, notes: '' },
  ]
  return {
    default: {
      get: vi.fn(async (url) => {
        if (url === '/lofts/') return { data: lofts }
        if (url === '/rolls/') return { data: rolls }
        if (url === '/dips/') return { data: dips }
        throw new Error('unexpected GET ' + url)
      }),
      patch: vi.fn(async () => ({ data: {} })),
      post: vi.fn(async () => ({ data: {} })),
    },
  }
})

async function mountRack() {
  const wrapper = mount(HomeView)
  await flushPromises()
  return wrapper
}

function loftChip(wrapper, name) {
  return wrapper
    .findAll('.loft-chips button')
    .find((b) => b.text() === name)
}

async function clickLoft(wrapper, name) {
  await loftChip(wrapper, name).trigger('click')
  await flushPromises()
}

function bayNames(wrapper) {
  return wrapper.findAll('.loft-bay .bay-name').map((b) => b.text())
}

function pegCodes(wrapper) {
  return wrapper.findAll('.roll-chip .chip-code').map((c) => c.text())
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('晾晒架换间', () => {
  it('默认只挂第一间（北岸）的卷', async () => {
    const w = await mountRack()
    expect(bayNames(w)).toEqual(['北岸帆布间'])
    expect(pegCodes(w)).toEqual(['R-01', 'R-02'])
  })

  it('点乙间名字后：间名点亮、挂签行只剩乙间，甲间卷码消失', async () => {
    const w = await mountRack()
    await clickLoft(w, '南坞帆布间')

    const selected = w.findAll('.loft-chips button.is-selected')
    expect(selected).toHaveLength(1)
    expect(selected[0].text()).toBe('南坞帆布间')

    expect(bayNames(w)).toEqual(['南坞帆布间'])
    expect(pegCodes(w).sort()).toEqual(['R-01', 'R-04'])
    expect(pegCodes(w)).not.toContain('R-02') // 甲间独有的卷码必须消失
  })

  it('乙间同码卷的面板近次只认本卷，不闪甲间树脂', async () => {
    const w = await mountRack()
    await clickLoft(w, '南坞帆布间')

    const chip = w.findAll('.roll-chip').find((c) => c.text().includes('R-01'))
    await chip.trigger('click')
    await flushPromises()

    const history = w.find('.drawer-history')
    expect(history.exists()).toBe(true)
    expect(history.text()).toContain('22.00') // 乙间 R-01 自己的树脂
    expect(history.text()).not.toContain('28.5') // 甲间同码卷的树脂不得混入
  })

  it('点刷新按钮与只换间名，两边对齐', async () => {
    const w = await mountRack()
    await clickLoft(w, '南坞帆布间')

    const refresh = w.findAll('button').find((b) => b.text() === '刷新架面')
    await refresh.trigger('click')
    await flushPromises()

    expect(bayNames(w)).toEqual(['南坞帆布间'])
    expect(pegCodes(w).sort()).toEqual(['R-01', 'R-04'])
  })

  it('交叉连点两间名，架面最后只停在点成功的那一间', async () => {
    const w = await mountRack()
    await clickLoft(w, '南坞帆布间')
    await clickLoft(w, '北岸帆布间')
    await clickLoft(w, '南坞帆布间')
    await clickLoft(w, '北岸帆布间')

    expect(bayNames(w)).toEqual(['北岸帆布间'])
    expect(pegCodes(w).sort()).toEqual(['R-01', 'R-02'])
    expect(pegCodes(w)).not.toContain('R-04') // 甲乙挂签不得掺在一起
  })

  it('换间时别间的面板连同近次一起消失', async () => {
    const w = await mountRack()
    const chip = w.findAll('.roll-chip').find((c) => c.text().includes('R-02'))
    await chip.trigger('click')
    await flushPromises()
    expect(w.find('.roll-drawer').exists()).toBe(true)

    await clickLoft(w, '南坞帆布间')
    expect(w.find('.roll-drawer').exists()).toBe(false)
  })

  it('换间不碰网络、不清登录', async () => {
    localStorage.setItem('sail_access', 'ACCESS')
    localStorage.setItem('sail_refresh', 'REFRESH')
    const w = await mountRack()
    const callsAfterMount = api.get.mock.calls.length

    await clickLoft(w, '南坞帆布间')

    expect(api.get.mock.calls.length).toBe(callsAfterMount) // 纯本地切换，无 401 登出路径
    expect(localStorage.getItem('sail_access')).toBe('ACCESS')
    expect(localStorage.getItem('sail_refresh')).toBe('REFRESH')
  })
})
