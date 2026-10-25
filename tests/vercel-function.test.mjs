import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { after, test } from 'node:test'
import { build, transform } from 'esbuild'

const root = process.cwd()
const tempDir = await mkdtemp(path.join(root, 'node_modules', '.vercel-function-'))
after(() => rm(tempDir, { recursive: true, force: true }))

async function getTypeScriptFiles(directory, files = []) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true })
  for (const entry of entries) {
    const relativePath = path.join(directory, entry.name)
    if (entry.isDirectory()) await getTypeScriptFiles(relativePath, files)
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(relativePath)
  }
  return files
}

const apiFiles = await getTypeScriptFiles('api')
const sourceServerModules = await getTypeScriptFiles('server')
const tempPackage = path.join(tempDir, 'package.json')
await writeFile(tempPackage, JSON.stringify({ type: 'module' }))

for (const sourceFile of [...apiFiles, ...sourceServerModules]) {
  const source = await readFile(path.join(root, sourceFile), 'utf8')
  for (const match of source.matchAll(/\b(?:from\s*|import\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
    assert.match(match[1], /\.js$/, `${sourceFile} must use explicit .js ESM imports`)
  }

  const emitted = await transform(source, { loader: 'ts', format: 'esm', target: 'node20' })
  const outputFile = path.join(tempDir, sourceFile.replace(/\.ts$/, '.js'))
  await mkdir(path.dirname(outputFile), { recursive: true })
  await writeFile(outputFile, emitted.code)
}

const { default: emittedHandler } = await import(pathToFileURL(path.join(tempDir, 'api/index.js')).href)

const result = await build({
  absWorkingDir: root,
  bundle: true,
  entryPoints: ['api/index.ts'],
  format: 'esm',
  metafile: true,
  packages: 'external',
  platform: 'node',
  target: 'node20',
  write: false,
})
assert.equal(result.outputFiles.length, 1, 'the shared API must remain one function bundle')

const bundledServerModules = new Set(
  Object.keys(result.metafile.inputs).filter((file) => file.startsWith('server/')),
)
assert.deepEqual(
  sourceServerModules.filter((file) => !bundledServerModules.has(file)),
  [],
  'every server module must be included in the shared function bundle',
)

const bundlePath = path.join(tempDir, 'index.mjs')
await writeFile(bundlePath, result.outputFiles[0].contents)
const { default: handler } = await import(pathToFileURL(bundlePath).href)

function createResponse() {
  const result = { headers: {}, statusCode: 200, body: undefined }
  return {
    result,
    status(code) {
      result.statusCode = code
      return this
    },
    json(value) {
      result.body = value
      result.headers['content-type'] = 'application/json; charset=utf-8'
    },
    setHeader(name, value) {
      result.headers[name.toLowerCase()] = value
    },
  }
}

async function assertLoginMethodResponse(handler) {
  const res = createResponse()

  await handler(
    { method: 'GET', url: '/api?_apiPath=auth/login', headers: { host: 'studio.example' } },
    res,
  )

  assert.equal(res.result.statusCode, 405)
  assert.deepEqual(res.result.body, { error: 'Method not allowed.' })
  assert.match(res.result.headers['content-type'], /^application\/json/)
}

test('emitted Node ESM function resolves every server module and dispatches routes', async () => {
  await assertLoginMethodResponse(emittedHandler)
})

test('production function bundle contains every server module and dispatches routes', async () => {
  await assertLoginMethodResponse(handler)
})
