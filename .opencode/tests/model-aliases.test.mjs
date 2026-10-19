import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const configRoot = fileURLToPath(new URL('../', import.meta.url))
const config = JSON.parse(readFileSync(join(configRoot, 'opencode.json'), 'utf8'))
const expectedInstructions = readdirSync(join(configRoot, 'rules'), { withFileTypes: true })
  .flatMap((directory) => directory.isDirectory()
    ? readdirSync(join(configRoot, 'rules', directory.name), { withFileTypes: true })
      .filter((file) => file.isFile() && file.name.endsWith('.md'))
      .map((file) => resolve(configRoot, 'rules', directory.name, file.name))
    : [])
  .sort()

test('uses the easy alias by default and loads every rule by explicit path', () => {
  assert.equal(config.model, 'openai/easy')
  assert.deepEqual(config.instructions, expectedInstructions)
  assert.ok(config.instructions.every((instruction) => existsSync(instruction)))
  assert.ok(config.instructions.every((instruction) => !['*', '?', '[', ']'].some((marker) => instruction.includes(marker))))
})

test('defines high-default aliases with valid OpenAI catalogue metadata', () => {
  const models = config.providers?.openai?.models

  assert.ok(models, 'OpenAI native model aliases are configured')
  assert.ok(models.easy && models.hard, 'both aliases are configured')
  const aliases = [models.easy, models.hard]

  assert.ok(aliases.every((model) => typeof model.modelID === 'string' && model.modelID.length > 0))
  assert.notEqual(models.easy.modelID, models.hard.modelID)

  for (const model of aliases) {
    assert.equal(model.package, '@opencode/ai/providers/openai')
    assert.equal(model.settings.reasoningEffort, 'high')
    assert.equal(model.capabilities.tools, true)
    assert.ok(['text', 'image', 'pdf'].every((input) => model.capabilities.input.includes(input)))
    assert.ok(model.capabilities.output.includes('text'))
    assert.equal(model.capabilities.reasoning.supported, true)
    assert.ok(model.capabilities.reasoning.effort.includes('high'))
    assert.ok(typeof model.name === 'string' && model.name.trim().length > 0)
    assert.ok(typeof model.family === 'string' && model.family.trim().length > 0)

    const { context, input, output } = model.limit
    assert.ok(Number.isFinite(context) && context > 0)
    assert.ok(Number.isFinite(input) && input > 0 && input <= context)
    assert.ok(Number.isFinite(output) && output > 0 && output <= context)
    assert.ok(input + output <= context)

    assert.ok(Array.isArray(model.cost) && model.cost.length > 0)
    for (const rate of model.cost) {
      assert.ok(Number.isFinite(rate.input) && rate.input >= 0)
      assert.ok(Number.isFinite(rate.output) && rate.output >= 0)
      assert.ok(Number.isFinite(rate.cache?.read) && rate.cache.read >= 0)
      assert.ok(Number.isFinite(rate.cache?.write) && rate.cache.write >= 0)
      if (rate.tier) {
        assert.equal(rate.tier.type, 'context')
        assert.ok(Number.isFinite(rate.tier.size) && rate.tier.size > 0)
      }
    }
  }
})

test('preserves the local llama.cpp provider and its existing models', () => {
  const provider = config.providers?.['llama.cpp']

  assert.ok(provider, 'llama.cpp is present in the native provider map')

  assert.equal(provider.package, 'aisdk:@ai-sdk/openai-compatible')
  assert.equal(provider.name, 'LM Studio')
  assert.equal(provider.settings.baseURL, 'http://localhost:1234/v1')
  assert.deepEqual(Object.keys(provider.models).sort(), [
    'google/gemma-4-e4b',
    'qwen/qwen3.6-35b-a3b',
    'qwen/qwythos-9b-claude-mythos-5-1m',
  ])
  assert.equal(provider.models['google/gemma-4-e4b'].name, 'Gemma 4 E4B 131k')
  assert.deepEqual(provider.models['google/gemma-4-e4b'].limit, { context: 131072, output: 8192 })
  assert.equal(provider.models['qwen/qwen3.6-35b-a3b'].name, 'Qwen 3.6 35B')
  assert.deepEqual(provider.models['qwen/qwen3.6-35b-a3b'].limit, { context: 262144, output: 4096 })
  assert.equal(provider.models['qwen/qwythos-9b-claude-mythos-5-1m'].name, 'Qwen Mythos 5 1M')
})

test('preserves MCP servers, the config reference, and permissions', () => {
  assert.deepEqual(config.mcp.playwright, {
    type: 'local',
    command: ['npx', '@playwright/mcp@latest'],
    enabled: true,
  })
  assert.deepEqual(config.mcp['codebase-memory-mcp'], {
    enabled: true,
    type: 'local',
    command: ['/Users/jose.romero/.local/bin/codebase-memory-mcp'],
  })
  assert.deepEqual(config.references['opencode-config'], {
    path: '~/.config/opencode',
    description: 'Global opencode agents, skills, and rule files',
  })
  assert.equal(config.permission.external_directory['~/.config/opencode/rules/**'], 'allow')
  assert.equal(config.permission.edit['~/.config/opencode/rules/**'], 'ask')
  assert.equal(config.permission.read['~/.config/opencode/rules/**'], 'allow')
  assert.equal(config.permission.read['~/.config/opencode/data/cognitive-profile/profile.json'], 'allow')
})
