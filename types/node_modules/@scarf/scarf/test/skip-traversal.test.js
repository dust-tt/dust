const report = require('../report')

describe('Skip Traversal Flag', () => {
  test('Can skip npm ls when skipTraversal is enabled', async () => {
    const depInfo = await report.getDependencyInfo('./test/skip-traversal-package.json')
    expect(depInfo.skippedTraversal).toBe(true)
    try {
      await report.getDependencyInfo()
      fail('Should fail after parsing the real dependency tree and not seeing a parent')
    } catch {}
  })
})
