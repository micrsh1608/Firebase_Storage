// Let the browser save the HTTP attachment itself, without a Blob/Object URL.
// The ID token travels in the POST body, never in a URL or a public Storage link.
export function submitBrowserDownload(endpoint, token, onError = () => {}) {
  const frame = document.createElement("iframe");
  frame.name = "filespace-download-" + crypto.randomUUID();
  frame.hidden = true;
  frame.setAttribute("aria-hidden", "true");
  const form = document.createElement("form");
  form.method = "POST";
  form.action = endpoint;
  form.target = frame.name;
  form.enctype = "application/x-www-form-urlencoded";
  form.hidden = true;
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "idToken";
  input.value = token;
  form.append(input);
  // Attachment responses have no load event; error JSON does. Keep the frame
  // alive while the server verifies auth/permissions and prepares the response.
  const timer = setTimeout(() => frame.remove(), 120000);
  frame.addEventListener("load", () => {
    const text = frame.contentDocument?.body?.textContent?.trim();
    if (!text) return; // Initial about:blank, or a successful attachment.
    clearTimeout(timer);
    frame.remove();
    let body;
    try { body = JSON.parse(text); } catch { /* Generic error below. */ }
    onError(body);
  });
  document.body.append(frame, form);
  try {
    form.submit();
  } catch (error) {
    clearTimeout(timer);
    frame.remove();
    throw error;
  } finally {
    input.value = "";
    form.remove();
  }
}
