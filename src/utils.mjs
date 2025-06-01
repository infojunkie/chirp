/**
 * Generate a filename.
 */
export function toFilename(title) {
  return title.toLowerCase().replace(/[/\\?%*:|"'<>\s]/g, '-');
}

/**
 * Fetch wrapper to throw an error if the response is not ok.
 */
export async function fetish(input, init) {
  const response = await fetch(input, init);
  if (!response.ok) throw new Error(response.statusText);
  return response;
}

/**
 * Yield to browser.
 * https://stackoverflow.com/a/64814589/209184
 */
export const yielder = () => new Promise((resolve) => setTimeout(() => resolve(), 0));
