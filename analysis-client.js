(function initializeAnalysisClient(root, factory) {
  const api = factory(root.chrome);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.QswappAnalysisClient = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createAnalysisClient(
  chromeObject
) {
  "use strict";

  function correctText(text, options = {}) {
    return new Promise((resolve, reject) => {
      if (!chromeObject?.runtime?.sendMessage) {
        reject(new Error("The analyzer service worker is unavailable"));
        return;
      }

      chromeObject.runtime.sendMessage(
        {
          type: "qswapp:correct-text",
          text: String(text),
          options
        },
        (response) => {
          const runtimeError = chromeObject.runtime.lastError;

          if (runtimeError) {
            reject(new Error(runtimeError.message));
            return;
          }

          if (!response?.ok) {
            reject(
              new Error(response?.error || "The analyzer returned no result")
            );
            return;
          }

          resolve(String(response.correctedText));
        }
      );
    });
  }

  return { correctText };
});
