export async function apiFetch(path, init) {
    const response = await fetch(`/api${path}`, {
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
        ...init
    });
    const json = (await response.json());
    if (!response.ok || !json.ok) {
        throw new Error(json.ok ? "Unknown API error" : json.error);
    }
    return json.data;
}
