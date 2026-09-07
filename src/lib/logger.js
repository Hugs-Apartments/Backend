// Minimal structured logger. Emits single-line JSON so booking/payment events
// are easy to grep and ship to a log aggregator later.

function emit(level, event, meta = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...meta,
  })
  if (level === 'error') console.error(line)
  else console.log(line)
}

export const logger = {
  info: (event, meta) => emit('info', event, meta),
  warn: (event, meta) => emit('warn', event, meta),
  error: (event, meta) => emit('error', event, meta),
}
