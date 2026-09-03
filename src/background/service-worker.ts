// Service worker: the only place that will ever hold the GitHub token or talk to api.github.com.
// M1 scope: a ping handler so the message channel can be exercised.

type PingMessage = { type: "ping" };
type Message = PingMessage;

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  switch (message.type) {
    case "ping":
      sendResponse({ ok: true, at: Date.now() });
      return false;
    default:
      return false;
  }
});
