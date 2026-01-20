const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

export async function apiRequest(path, options = {}) {
  const { headers: requestHeaders, ...rest } = options;
  const isFormData = typeof FormData !== 'undefined' && rest.body instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(requestHeaders || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    let message = data.error || data.message;
    if (!message) {
      const fallback = await response.text().catch(() => '');
      message = fallback || 'Request failed';
    }
    throw new Error(`${message} (status ${response.status})`);
  }
  return data;
}
