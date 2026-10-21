export function parseFragment(hash: string): { page: string; params: URLSearchParams } {
  const fragment = hash.replace(/^#/, '')
  const separator = fragment.indexOf('?')
  if (separator >= 0) return { page: fragment.slice(0, separator), params: new URLSearchParams(fragment.slice(separator + 1)) }
  if (fragment.includes('=')) return { page: '', params: new URLSearchParams(fragment) }
  return { page: fragment, params: new URLSearchParams() }
}

export function formatFragment(page: string, params: URLSearchParams): string {
  const query = params.toString()
  return `${page}${query ? `?${query}` : ''}`
}
