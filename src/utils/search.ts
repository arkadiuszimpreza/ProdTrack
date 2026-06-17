/**
 * Splits a search string into individual terms using space or asterisk as delimiters.
 * Removes empty terms and converts to lowercase for case-insensitive comparison.
 */
export function parseSearchTerms(searchInput: string): string[] {
  if (!searchInput) return [];
  return searchInput.split(/[\s\*]+/).filter(Boolean).map(s => s.toLowerCase());
}

/**
 * Checks if all search terms are present in the text to search.
 * @param textToSearch The combined string of all searchable fields
 * @param searchTerms The array of parsed search terms
 */
export function matchesAllTerms(textToSearch: string, searchTerms: string[]): boolean {
  if (searchTerms.length === 0) return true;
  const lowerText = textToSearch.toLowerCase();
  return searchTerms.every(term => lowerText.includes(term));
}
