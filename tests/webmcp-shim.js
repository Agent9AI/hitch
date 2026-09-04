/**
 * A spec-faithful WebMCP implementation, used to test Hitch's projection code.
 *
 * It exists because the WebMCP surface is what Hitch is built on, and an
 * integration you cannot execute is an integration you have not verified.
 * The shim implements only what the specification documents:
 *
 *   document.modelContext.registerTool(descriptor, { signal })  -> Promise
 *   document.modelContext.getTools()                            -> Promise<Tool[]>
 *   aborting the signal unregisters the tool
 *
 * It is deliberately strict. It rejects anything the spec does not describe as
 * valid, so that Hitch cannot pass the tests by relying on a lenient host.
 */
(() => {
  const tools = new Map();

  function assert(condition, message) {
    if (!condition) throw new TypeError(`WebMCP: ${message}`);
  }

  const modelContext = {
    async registerTool(descriptor, options = {}) {
      assert(descriptor && typeof descriptor === "object", "descriptor must be an object");
      assert(typeof descriptor.name === "string" && descriptor.name, "name must be a non-empty string");
      assert(typeof descriptor.description === "string", "description must be a string");
      assert(
        descriptor.inputSchema && typeof descriptor.inputSchema === "object",
        "inputSchema must be a JSON Schema object",
      );
      assert(typeof descriptor.execute === "function", "execute must be a function");
      assert(!tools.has(descriptor.name), `tool "${descriptor.name}" is already registered`);

      const signal = options.signal;
      if (signal) {
        assert(typeof signal.addEventListener === "function", "signal must be an AbortSignal");
        if (signal.aborted) return;
        signal.addEventListener("abort", () => tools.delete(descriptor.name), { once: true });
      }

      tools.set(descriptor.name, descriptor);
    },

    async getTools() {
      return [...tools.values()].map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        origin: location.origin,
      }));
    },
  };

  Object.defineProperty(document, "modelContext", {
    value: modelContext,
    configurable: true,
    writable: false,
  });

  /**
   * Test-only affordance: invoke a registered tool the way an agent would, and
   * validate the response against the shape the specification requires.
   */
  window.__webmcpCall = async (name, args) => {
    const tool = tools.get(name);
    if (!tool) throw new Error(`no such tool: ${name}`);
    const result = await tool.execute(args);

    if (!result || typeof result !== "object") {
      throw new Error(`execute() must return an object, got ${typeof result}`);
    }
    if (!Array.isArray(result.content)) {
      throw new Error("execute() must return a `content` array");
    }
    for (const block of result.content) {
      if (!block || typeof block.type !== "string") {
        throw new Error("each content block needs a string `type`");
      }
      if (block.type === "text" && typeof block.text !== "string") {
        throw new Error("a text block needs a string `text`");
      }
    }
    return result;
  };
})();
