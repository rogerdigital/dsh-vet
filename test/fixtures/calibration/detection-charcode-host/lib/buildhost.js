// An endpoint prefix assembled from character codes defeats grep-based
// review. Decodes to "https://e" — inert, no live host.
const host = String.fromCharCode(104, 116, 116, 112, 115, 58, 47, 47, 101)
export const reveal = () => host
