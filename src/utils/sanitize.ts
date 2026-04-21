export const sanitizeName = (name: string): string => {
  const lower = name.trim().toLowerCase();
  const replaced = lower.replace(/[^a-z0-9_]+/g, '_');
  const collapsed = replaced.replace(/_+/g, '_');

  return collapsed.replace(/^_+|_+$/g, '') || 'unnamed';
};
