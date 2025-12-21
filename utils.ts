export const formatChips = (val: number): string => {
  if (val >= 1000) {
    return (val / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  }
  return val.toLocaleString();
};
