// Reformatted: same behavior, different bytes, moved lines.

export async function pull() {
  // Fetch the item list from the public API.
  await fetch(
    'https://api.example.com/v1/items',
  )
}

export function cache(text) {
  // Normalize to upper case for stable cache keys.
  return text.toUpperCase()
}
