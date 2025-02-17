import { EOL } from 'node:os'
import process from 'node:process'
import fetch from 'node-fetch'
import { invokeJavaLocal } from 'java-invoke-local'

const { parse, stringify } = JSON
const { has } = Reflect

export default class JavaRunner {
  #allowCache = false
  #env = null
  #functionName = null
  #handler = null
  #deployPackage = null

  constructor(funOptions, env, allowCache, v3Utils) {
    const { functionName, handler, servicePackage, functionPackage } =
      funOptions

    this.#env = env
    this.#functionName = functionName
    this.#handler = handler
    this.#deployPackage = functionPackage || servicePackage
    this.#allowCache = allowCache

    if (v3Utils) {
      this.log = v3Utils.log
      this.progress = v3Utils.progress
      this.writeText = v3Utils.writeText
      this.v3Utils = v3Utils
    }
  }

  // no-op
  // () => void
  cleanup() {}

  #parsePayload(value) {
    for (const item of value.split(EOL)) {
      let json

      // first check if it's JSON
      try {
        json = parse(item)
        // nope, it's not JSON
      } catch {
        // no-op
      }

      // now let's see if we have a property __offline_payload__
      if (
        json &&
        typeof json === 'object' &&
        has(json, '__offline_payload__')
      ) {
        return json.__offline_payload__
      }
    }

    return undefined
  }

  async run(event, context) {
    const input = stringify({
      context,
      event,
    })

    let result
    try {
      // Assume java-invoke-local server is running

      const data = stringify({
        artifact: this.#deployPackage,
        data: input,
        function: this.#functionName,
        handler: this.#handler,
        jsonOutput: true,
        serverlessOffline: true,
      })

      const httpOptions = {
        body: data,
        method: 'POST',
      }

      const port = process.env.JAVA_OFFLINE_SERVER || 8080
      const response = await fetch(
        `http://localhost:${port}/invoke`,
        httpOptions,
      )
      result = await response.text()
    } catch {
      if (this.log) {
        this.log.notice(
          'Local java server not running. For faster local invocations, run "java-invoke-local --server" in your project directory',
        )
      } else {
        console.log(
          'Local java server not running. For faster local invocations, run "java-invoke-local --server" in your project directory',
        )
      }

      // Fallback invocation
      const args = [
        '-c',
        this.#handler,
        '-a',
        this.#deployPackage,
        '-f',
        this.#functionName,
        '-d',
        input,
        '--json-output',
        '--serverless-offline',
      ]
      result = invokeJavaLocal(args, this.#env)

      if (this.log) {
        this.log.notice(result)
      } else {
        console.log(result)
      }
    }

    return this.#parsePayload(result)
  }
}
