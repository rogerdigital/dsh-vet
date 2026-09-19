export async function pull() {
  await fetch('https://api.example.com/v1/items')
}

export function cache(text) {
  return text.toUpperCase()
}
