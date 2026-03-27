// GA4 Data Streams — auto-populated by fetchAndWriteStreams() in ga4Client.js
// Maps brand → market → streamId
export let GA4_STREAMS = {};

export function setGA4Streams(streams) {
  GA4_STREAMS = streams;
}
