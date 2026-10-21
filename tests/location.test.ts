import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatFragment, parseFragment } from '../src/lib/location.ts'

test('fragment parameters support page routes and parameter-only links', () => {
  for (const hash of ['#connections?hostname=router.test&secret=a%26b%2Bc%23d', '#hostname=router.test&secret=a%26b%2Bc%23d', '#?hostname=router.test&secret=a%26b%2Bc%23d']) {
    const { page, params } = parseFragment(hash)
    assert.equal(page, hash.startsWith('#connections') ? 'connections' : '')
    assert.equal(params.get('hostname'), 'router.test')
    assert.equal(params.get('secret'), 'a&b+c#d')
  }
  assert.equal(parseFragment('#settings').page, 'settings')
  assert.equal(parseFragment('').page, '')
})

test('changing the fragment page preserves demo and unrelated parameters', () => {
  const { params } = parseFragment('#overview?demo=1&keep=some%20value')
  assert.equal(formatFragment('connections', params), 'connections?demo=1&keep=some+value')
  assert.equal(formatFragment('settings', new URLSearchParams()), 'settings')
  assert.equal(formatFragment('', new URLSearchParams()), '')
})
