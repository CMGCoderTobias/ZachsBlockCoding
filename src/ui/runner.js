export function runJavaScript(code, { timeoutMs = 3000, signal } = {}) {
  return new Promise(resolve => {
    const logs = [];
    const source = `self.onmessage = async ({data}) => {
      const send = self.postMessage.bind(self);
      for (const level of ['log','info','warn','error']) console[level] = (...args) => send({log: '['+level+'] '+args.map(value => { try { return typeof value === 'string' ? value : JSON.stringify(value); } catch { return String(value); } }).join(' ')});
      try { await new (Object.getPrototypeOf(async function(){}).constructor)(data)(); send({done:true}); }
      catch(error) { send({error:String(error.stack || error)}); }
    };`;
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const worker = new Worker(url);
    let finished = false;
    function finish(error) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      worker.terminate(); URL.revokeObjectURL(url);
      resolve({ logs, error });
    }
    const stop = () => finish("Stopped");
    const timer = setTimeout(() => finish(`Stopped after ${timeoutMs}ms`), timeoutMs);
    worker.onmessage = ({ data }) => {
      if (typeof data.log === "string") {
        if (logs.length >= 500) { finish("Output limit reached"); return; }
        logs.push(data.log.slice(0, 4000));
      }
      if (data.done || data.error) finish(data.error || null);
    };
    worker.onerror = event => finish(event.message);
    signal?.addEventListener("abort", stop, { once: true });
    if (signal?.aborted) stop(); else worker.postMessage(code);
  });
}
