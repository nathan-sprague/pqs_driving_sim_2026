export function publicUrl(path = '') {
  const value = String(path);
  if (value.startsWith(import.meta.env.BASE_URL)) return value;
  return `${import.meta.env.BASE_URL}${value.replace(/^\//, '')}`;
}
