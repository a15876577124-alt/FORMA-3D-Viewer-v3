// Opt-in subprocess instrumentation used only by quality-performance.mjs.
process.on('message',m=>{if(m==='forma-perf')process.send?.({memory:process.memoryUsage(),maxRssKiB:process.resourceUsage().maxRSS});});
