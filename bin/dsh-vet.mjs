#!/usr/bin/env node
import { runCli } from '../lib/index.mjs'

process.exit(await runCli(process.argv.slice(2), {
  stdout: (line) => process.stdout.write(line + '\n'),
  stderr: (line) => process.stderr.write(line + '\n'),
}))
