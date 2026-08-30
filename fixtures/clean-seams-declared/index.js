import { readFile } from 'node:fs/promises'

export async function load(path) {
  return readFile(path, 'utf8')
}

export async function status() {
  const res = await fetch('https://api.example.com/v1/status')
  return res.ok
}
